#!/usr/bin/env python3
"""
NIfTI Segmentation → DICOM SEG Converter
==========================================
Converts a NIfTI segmentation file (output of TotalSegmentator) into a
DICOM SEG file that Cornerstone3D can load and display.

Usage:
    python nifti_to_dicom_seg.py <seg_nifti> <ct_dicom_dir> <output_dcm>

Example:
    python nifti_to_dicom_seg.py \\
        data/LIDC-IDRI-0001/seg.nii.gz \\
        data/LIDC-IDRI-0001/ct \\
        data/LIDC-IDRI-0001/annotations/output_seg.dcm

Arguments:
    seg_nifti    : NIfTI segmentation file produced by TotalSegmentator
    ct_dicom_dir : Directory of the source CT DICOM slices (used for geometry metadata)
    output_dcm   : Output DICOM SEG file path

Requirements:
    pip install SimpleITK highdicom numpy pydicom
"""

import sys
from pathlib import Path

try:
    import numpy as np
    import SimpleITK as sitk
    import highdicom as hd
    import pydicom
except ImportError as e:
    print(f"ERROR: Missing dependency — {e}")
    print("Install with: pip install SimpleITK highdicom numpy pydicom")
    sys.exit(1)


# Label names for TotalSegmentator lung_nodules task
LUNG_NODULE_LABELS = {
    1: "lung",
    2: "lung_nodule",
}


def load_ct_series(dicom_dir: str) -> list:
    """Load and sort CT DICOM slices from a directory."""
    reader = sitk.ImageSeriesReader()
    series_ids = reader.GetGDCMSeriesIDs(dicom_dir)
    if not series_ids:
        raise ValueError(f"No DICOM series found in {dicom_dir}")
    file_names = reader.GetGDCMSeriesFileNames(dicom_dir, series_ids[0])
    return [pydicom.dcmread(f) for f in sorted(file_names)]


def nifti_to_dicom_seg(seg_nifti_path: str, ct_dicom_dir: str, output_path: str) -> bool:
    """
    Convert a NIfTI segmentation to DICOM SEG.

    Args:
        seg_nifti_path : Path to input NIfTI segmentation
        ct_dicom_dir   : Directory of source CT DICOM slices
        output_path    : Output DICOM SEG path

    Returns:
        True on success, False otherwise
    """
    print(f"Loading segmentation: {seg_nifti_path}")
    seg_img = sitk.ReadImage(seg_nifti_path)
    seg_array = sitk.GetArrayFromImage(seg_img)  # shape: (slices, rows, cols)

    print(f"Loading CT DICOM series from: {ct_dicom_dir}")
    ct_slices = load_ct_series(ct_dicom_dir)
    print(f"  Loaded {len(ct_slices)} CT slices")

    unique_labels = [int(v) for v in np.unique(seg_array) if v != 0]
    if not unique_labels:
        print("ERROR: Segmentation contains no non-zero labels")
        return False

    print(f"Labels found: {unique_labels}")

    # Build one SegmentDescription per label
    segment_descriptions = []
    for label_idx in unique_labels:
        name = LUNG_NODULE_LABELS.get(label_idx, f"label_{label_idx}")
        segment_descriptions.append(
            hd.seg.SegmentDescription(
                segment_number=label_idx,
                segment_label=name,
                segmented_property_category=hd.sr.CodedConcept(
                    value="123037004",
                    scheme_designator="SCT",
                    meaning="Anatomical Structure",
                ),
                segmented_property_type=hd.sr.CodedConcept(
                    value="39607008",
                    scheme_designator="SCT",
                    meaning=name,
                ),
                algorithm_type=hd.seg.SegmentAlgorithmTypeValues.AUTOMATIC,
            )
        )

    # Build per-slice binary mask arrays, one per label.
    # highdicom Segmentation expects pixel_array shape: (slices, rows, cols, segments)
    # — segments stacked on the LAST axis, slices on axis 0.
    frames_per_segment = []
    for label_idx in unique_labels:
        mask = (seg_array == label_idx).astype(np.uint8)  # (slices, rows, cols)
        frames_per_segment.append(mask)

    # Stack segments on the last axis → (slices, rows, cols, n_segments)
    pixel_array_4d = np.stack(frames_per_segment, axis=-1)

    print("Creating DICOM SEG object...")
    seg = hd.seg.Segmentation(
        source_images=ct_slices,
        pixel_array=pixel_array_4d,
        segmentation_type=hd.seg.SegmentationTypeValues.BINARY,
        segment_descriptions=segment_descriptions,
        series_instance_uid=hd.UID(),
        series_number=100,
        sop_instance_uid=hd.UID(),
        instance_number=1,
        manufacturer="Atomorphic",
        manufacturer_model_name="TotalSegmentator",
        software_versions="1.0",
        device_serial_number="1",
    )

    output_file = Path(output_path)
    output_file.parent.mkdir(parents=True, exist_ok=True)
    seg.save_as(str(output_file))
    print(f"SUCCESS: DICOM SEG saved to {output_path}")
    return True


def main() -> None:
    if len(sys.argv) != 4:
        print(__doc__)
        sys.exit(1)

    seg_nifti = sys.argv[1]
    ct_dir = sys.argv[2]
    output_dcm = sys.argv[3]

    if not Path(seg_nifti).exists():
        print(f"ERROR: Segmentation file not found: {seg_nifti}")
        sys.exit(1)
    if not Path(ct_dir).exists():
        print(f"ERROR: CT directory not found: {ct_dir}")
        sys.exit(1)

    success = nifti_to_dicom_seg(seg_nifti, ct_dir, output_dcm)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
