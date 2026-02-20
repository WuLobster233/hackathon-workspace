#!/usr/bin/env python3
"""
LIDC-IDRI XML Annotation Parser
================================
Parses LIDC-IDRI XML annotation files and extracts nodule contours.

This script is provided as a reference to help you understand the XML
structure before implementing the browser-side parsing in Task 2.

Usage:
    python parse_lidc_xml.py <xml_file> [--output <format>]

Example:
    python parse_lidc_xml.py data/LIDC-IDRI-0001/annotations/069.xml
    python parse_lidc_xml.py data/LIDC-IDRI-0001/annotations/069.xml --output json

Output formats: summary (default), json, csv

Requirements:
    Standard library only (xml.etree.ElementTree)
"""

import sys
import json
import csv
import io
from pathlib import Path
from xml.etree import ElementTree as ET
from typing import Optional

# The LIDC XML uses a default namespace — every tag must be prefixed.
NS = 'http://www.nih.gov'


def tag(name: str) -> str:
    return f'{{{NS}}}{name}'


def parse_lidc_xml(xml_path: str) -> dict:
    """
    Parse an LIDC-IDRI XML file and return structured data.

    Returns a dict with keys:
        file, reading_sessions (list), total_nodules, total_rois
    """
    tree = ET.parse(xml_path)
    root = tree.getroot()

    result: dict = {
        'file': str(xml_path),
        'reading_sessions': [],
        'total_nodules': 0,
        'total_rois': 0,
    }

    for session_elem in root.findall(f'.//{tag("readingSession")}'):
        session = parse_reading_session(session_elem)
        result['reading_sessions'].append(session)
        result['total_nodules'] += len(session['nodules'])
        for nodule in session['nodules']:
            result['total_rois'] += len(nodule['rois'])

    return result


def parse_reading_session(session_elem: ET.Element) -> dict:
    session: dict = {'nodules': []}
    for nodule_elem in session_elem.findall(tag('unblindedReadNodule')):
        nodule = parse_nodule(nodule_elem)
        if nodule['rois']:
            session['nodules'].append(nodule)
    return session


def parse_nodule(nodule_elem: ET.Element) -> dict:
    nodule: dict = {'nodule_id': '', 'characteristics': {}, 'rois': []}

    id_elem = nodule_elem.find(tag('noduleID'))
    if id_elem is not None and id_elem.text:
        nodule['nodule_id'] = id_elem.text

    chars_elem = nodule_elem.find(tag('characteristics'))
    if chars_elem is not None:
        nodule['characteristics'] = {
            child.tag.split('}')[-1]: child.text
            for child in chars_elem
        }

    for roi_elem in nodule_elem.findall(tag('roi')):
        roi = parse_roi(roi_elem)
        if roi['contour_points']:
            nodule['rois'].append(roi)

    return nodule


def parse_roi(roi_elem: ET.Element) -> dict:
    roi: dict = {
        'image_z_position': None,
        'image_sop_uid': '',
        'inclusion': True,
        'contour_points': [],
    }

    z_elem = roi_elem.find(tag('imageZposition'))
    if z_elem is not None and z_elem.text:
        roi['image_z_position'] = float(z_elem.text)

    sop_elem = roi_elem.find(tag('imageSOP_UID'))
    if sop_elem is not None and sop_elem.text:
        roi['image_sop_uid'] = sop_elem.text

    inc_elem = roi_elem.find(tag('inclusion'))
    if inc_elem is not None and inc_elem.text:
        roi['inclusion'] = inc_elem.text.strip().upper() == 'TRUE'

    for edge_elem in roi_elem.findall(tag('edgeMap')):
        point = parse_edge_point(edge_elem)
        if point is not None:
            roi['contour_points'].append(point)

    return roi


def parse_edge_point(edge_elem: ET.Element) -> Optional[tuple]:
    x_elem = edge_elem.find(tag('xCoord'))
    y_elem = edge_elem.find(tag('yCoord'))
    if (x_elem is not None and x_elem.text and
            y_elem is not None and y_elem.text):
        return (float(x_elem.text), float(y_elem.text))
    return None


def print_summary(data: dict) -> None:
    print('=' * 60)
    print('LIDC-IDRI Annotation Summary')
    print('=' * 60)
    print(f"File:             {data['file']}")
    print(f"Reading sessions: {len(data['reading_sessions'])}")
    print(f"Total nodules:    {data['total_nodules']}")
    print(f"Total ROIs:       {data['total_rois']}")
    print()
    for i, session in enumerate(data['reading_sessions']):
        print(f"Session {i + 1}: {len(session['nodules'])} nodule(s)")
        for nodule in session['nodules']:
            z_vals = [r['image_z_position'] for r in nodule['rois']
                      if r['image_z_position'] is not None]
            z_range = (f"{min(z_vals):.1f} to {max(z_vals):.1f} mm"
                       if z_vals else 'n/a')
            total_pts = sum(len(r['contour_points']) for r in nodule['rois'])
            malignancy = nodule['characteristics'].get('malignancy', 'n/a')
            print(f"  {nodule['nodule_id']}: "
                  f"{len(nodule['rois'])} slices, "
                  f"Z {z_range}, "
                  f"{total_pts} points, "
                  f"malignancy={malignancy}")
        print()


def to_csv(data: dict) -> str:
    output = io.StringIO()
    headers = ['session', 'nodule_id', 'roi_index', 'z_position',
               'sop_uid', 'point_index', 'x', 'y']
    writer = csv.DictWriter(output, fieldnames=headers)
    writer.writeheader()
    for si, session in enumerate(data['reading_sessions']):
        for nodule in session['nodules']:
            for ri, roi in enumerate(nodule['rois']):
                for pi, (x, y) in enumerate(roi['contour_points']):
                    writer.writerow({
                        'session': si,
                        'nodule_id': nodule['nodule_id'],
                        'roi_index': ri,
                        'z_position': roi['image_z_position'],
                        'sop_uid': roi['image_sop_uid'],
                        'point_index': pi,
                        'x': x,
                        'y': y,
                    })
    return output.getvalue()


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    xml_path = sys.argv[1]
    output_format = 'summary'
    if '--output' in sys.argv:
        idx = sys.argv.index('--output')
        if idx + 1 < len(sys.argv):
            output_format = sys.argv[idx + 1].lower()

    if not Path(xml_path).exists():
        print(f"ERROR: File not found: {xml_path}")
        sys.exit(1)

    try:
        data = parse_lidc_xml(xml_path)
        if output_format == 'json':
            print(json.dumps(data, indent=2))
        elif output_format == 'csv':
            print(to_csv(data))
        else:
            print_summary(data)
    except ET.ParseError as e:
        print(f"ERROR: Failed to parse XML: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()
