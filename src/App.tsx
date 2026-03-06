// =============================================================================
// DICOM Annotation Viewer — Main Application
// Atomorphic Mini Hackathon
// =============================================================================
//
// This viewer is ALREADY WORKING (load DICOM, scroll, W/L, draw annotations).
// Your four hackathon tasks are to ADD NEW FEATURES using the skeleton
// functions below — look for the TODO markers!
//
// Tasks summary:
//   Task 1 — Study Selector          → handleSelectStudy()
//   Task 2 — Load Ground Truth        → handleLoadGT()
//   Task 3 — Run AI Segmentation      → handleRunAI()
//   Task 4 — Show AI Segmentation     → handleShowAISeg()
//   Bonus A — AI-Assisted Segmentation → handleAIAssist()
//   Bonus B — UI Polish / Extra Tools
//
// See HACKATHON_TASKS.md for full specifications and hints.
// =============================================================================

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  initCornerstone,
  initViewport,
  initTools,
  setActiveTool,
  getRenderingEngine,
  setupResizeObserver,
  VIEWPORT_ID,
} from './core/init'
import { loadDicomFiles, loadStudy, getImageIds, LIDC_STUDIES } from './core/loader'
import {
  WindowLevelTool,
  PanTool,
  ZoomTool,
  LengthTool,
  RectangleROITool,
  PlanarFreehandROITool,
  annotation,
} from '@cornerstonejs/tools'
import { Enums as CoreEnums } from '@cornerstonejs/core'
import { Enums as ToolEnums } from '@cornerstonejs/tools'

// ─── Types ────────────────────────────────────────────────────────────────────
type NavTool  = 'WindowLevel' | 'Pan' | 'Zoom'
type DrawTool = 'Length' | 'RectangleROI' | 'Freehand'
type ActiveTool = NavTool | DrawTool

interface SegmentEntry { index: number; label: string; color: number[] }
interface AnnotationEntry { uid: string; type: string }
interface Info { slice: string; total: string; wl: string }

// =============================================================================
export default function App() {
  const viewportRef  = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [ready,       setReady]       = useState(false)
  const [status,      setStatus]      = useState('Initialising...')
  const [activeTool,  setActiveToolUI] = useState<ActiveTool>('WindowLevel')
  const [activeStudy, setActiveStudy] = useState<string | null>(null)
  const [info,        setInfo]        = useState<Info>({ slice: '--', total: '--', wl: '--' })
  const [segments,    setSegments]    = useState<SegmentEntry[]>([])
  const [annotations, setAnnotations] = useState<AnnotationEntry[]>([])

  // ── Initialise Cornerstone once the viewport div is mounted ────────────────
  useEffect(() => {
    if (!viewportRef.current) return
    const el = viewportRef.current

    let cleanupResize: (() => void) | undefined

    ;(async () => {
      try {
        setStatus('Initialising Cornerstone3D…')
        await initCornerstone()
        initViewport(el)
        initTools()
        cleanupResize = setupResizeObserver(el)
        setReady(true)
        setStatus('Ready — select a study from the panel to begin')
      } catch (err) {
        setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`)
      }
    })()

    return () => { cleanupResize?.() }
  }, [])

  // ── Slice change listener ──────────────────────────────────────────────────
  useEffect(() => {
    if (!ready || !viewportRef.current) return
    const el = viewportRef.current

    const handleSlice = () => {
      const re = getRenderingEngine()
      if (!re) return
      const vp = re.getViewport(VIEWPORT_ID) as any
      const idx = vp?.getCurrentImageIdIndex?.() ?? 0
      setInfo(prev => ({ ...prev, slice: String(idx + 1), total: String(getImageIds().length) }))
    }

    el.addEventListener(CoreEnums.Events.STACK_VIEWPORT_SCROLL, handleSlice)
    return () => el.removeEventListener(CoreEnums.Events.STACK_VIEWPORT_SCROLL, handleSlice)
  }, [ready])

  // ── W/L change listener ────────────────────────────────────────────────────
  useEffect(() => {
    if (!ready || !viewportRef.current) return
    const el = viewportRef.current

    const handleVOI = (evt: Event) => {
      const { range } = (evt as CustomEvent).detail ?? {}
      if (!range) return
      const W = Math.round(range.upper - range.lower)
      const L = Math.round((range.upper + range.lower) / 2)
      setInfo(prev => ({ ...prev, wl: `${W} / ${L}` }))
    }

    el.addEventListener(CoreEnums.Events.VOI_MODIFIED, handleVOI)
    return () => el.removeEventListener(CoreEnums.Events.VOI_MODIFIED, handleVOI)
  }, [ready])

  // ── Annotation change listener ─────────────────────────────────────────────
  useEffect(() => {
    if (!ready || !viewportRef.current) return
    const el = viewportRef.current

    const refresh = () => {
      const all = annotation.state.getAllAnnotations()
      setAnnotations(all.map(a => ({ uid: a.annotationUID ?? '', type: a.metadata?.toolName ?? '' })))
    }

    el.addEventListener(ToolEnums.Events.ANNOTATION_COMPLETED, refresh)
    el.addEventListener(ToolEnums.Events.ANNOTATION_REMOVED,   refresh)
    return () => {
      el.removeEventListener(ToolEnums.Events.ANNOTATION_COMPLETED, refresh)
      el.removeEventListener(ToolEnums.Events.ANNOTATION_REMOVED,   refresh)
    }
  }, [ready])

  // ── File loading ───────────────────────────────────────────────────────────
  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setStatus(`Loading ${files.length} file(s)…`)
    const n = await loadDicomFiles(Array.from(files), (loaded, total) =>
      setStatus(`Loading… ${loaded}/${total}`)
    )
    if (n === 0) { setStatus('No DICOM files found'); return }
    setInfo(prev => ({ ...prev, slice: String(Math.floor(n / 2) + 1), total: String(n) }))
    setStatus(`Loaded ${n} image${n !== 1 ? 's' : ''}`)
  }, [])

  // ── Navigation tool switch ─────────────────────────────────────────────────
  const handleNavTool = useCallback((tool: NavTool) => {
    const name = tool === 'WindowLevel' ? WindowLevelTool.toolName
               : tool === 'Pan'         ? PanTool.toolName
                                        : ZoomTool.toolName
    setActiveTool(name)
    setActiveToolUI(tool)
  }, [])

  // ── Annotation tool switch ─────────────────────────────────────────────────
  const handleDrawTool = useCallback((tool: DrawTool) => {
    const name = tool === 'Length'       ? LengthTool.toolName
               : tool === 'RectangleROI' ? RectangleROITool.toolName
                                         : PlanarFreehandROITool.toolName
    setActiveTool(name)
    setActiveToolUI(tool)
  }, [])

  // ── Reset view ─────────────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    const re = getRenderingEngine()
    if (!re) return
    const vp = re.getViewport(VIEWPORT_ID) as any
    vp?.resetCamera?.()
    vp?.render?.()
    setStatus('View reset')
  }, [])

  // ── Export JSON (built-in utility) ─────────────────────────────────────────
  const handleExportJSON = useCallback(() => {
    const all = annotation.state.getAllAnnotations()
    const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'annotations.json'; a.click()
    URL.revokeObjectURL(url)
    setStatus('Exported annotations.json')
  }, [])

  // ===========================================================================
  // HACKATHON TASKS — implement the functions below
  // ===========================================================================

  // ---------------------------------------------------------------------------
  // TASK 1 — Study Selector
  // ---------------------------------------------------------------------------
  // Build a data panel that lists the available LIDC studies and loads the
  // selected study's CT slices into the viewer.
  //
  // LIDC_STUDIES (imported from ./core/loader) is an array of study metadata.
  // loadStudy(caseId) (also in ./core/loader) fetches and loads the CT slices.
  //
  // See HACKATHON_TASKS.md § Task 1 for hints.
  //
  const handleSelectStudy = useCallback(async (caseId: string) => {
    try {
      setStatus(`Loading study ${caseId}…`)
      const numImages = await loadStudy(caseId)
      setActiveStudy(caseId)
      setInfo(prev => ({ ...prev, slice: '1', total: String(numImages) }))
      setStatus(`Loaded study ${caseId} — ${numImages} slice${numImages !== 1 ? 's' : ''}`)
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`)
      setActiveStudy(null)
    }
  }, [])

  // ---------------------------------------------------------------------------
  // TASK 2 — Load Ground Truth Annotations
  // ---------------------------------------------------------------------------
  // Load the LIDC XML file for the active study and render the
  // radiologist-drawn nodule contours as PlanarFreehandROI annotations
  // on the correct slices.
  //
  // See HACKATHON_TASKS.md § Task 2 for hints.
  //
  const handleLoadGT = useCallback(async () => {
    if (!activeStudy) {
      setStatus('Error: No study selected')
      return
    }

    try {
      setStatus(`Loading ground truth for ${activeStudy}…`)

      // Find the study metadata
      const study = LIDC_STUDIES.find(s => s.id === activeStudy)
      if (!study) throw new Error('Study not found')

      console.log('Loading XML from:', `/data/${activeStudy}/${study.xml}`)

      // Fetch the XML annotation file
      const xmlResponse = await fetch(`/data/${activeStudy}/${study.xml}`)
      if (!xmlResponse.ok) throw new Error(`Failed to load XML: ${xmlResponse.statusText}`)
      const xmlText = await xmlResponse.text()

      console.log('XML fetched successfully, length:', xmlText.length)

      // Parse XML with DOMParser
      const parser = new DOMParser()
      const xmlDoc = parser.parseFromString(xmlText, 'application/xml')
      
      // Check for parse errors
      if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
        throw new Error('XML parse error')
      }

      // Define the LIDC default namespace
      const NS = 'http://www.nih.gov'
      
      // Query all reading sessions using namespace-aware method
      const sessions = xmlDoc.getElementsByTagNameNS(NS, 'readingSession')
      console.log('Reading sessions found:', sessions.length)

      let annotationCount = 0

      // Import Cornerstone3D utilities for coordinate conversion
      const { utilities } = await import('@cornerstonejs/core')
      const re = getRenderingEngine()
      const viewport = re.getViewport(VIEWPORT_ID) as any
      if (!viewport) throw new Error('Viewport not found')

      // Get all loaded image IDs
      const imageIds = getImageIds()
      console.log('Total images available:', imageIds.length)
      
      // Build a map of imageSOP_UID to imageId index for accurate matching
      const sopUidToImageIndex: { [key: string]: number } = {}

      // Iterate through each reading session
      Array.from(sessions).forEach((session, sessionIdx) => {
        // Query unblinded nodules within this session
        const nodules = session.getElementsByTagNameNS(NS, 'unblindedReadNodule')
        console.log(`Session ${sessionIdx}: ${nodules.length} nodules found`)

        // Iterate through each nodule
        Array.from(nodules).forEach((nodule, noduleIdx) => {
          // Query all ROIs (regions of interest) within this nodule
          const rois = nodule.getElementsByTagNameNS(NS, 'roi')
          console.log(`Nodule ${noduleIdx}: ${rois.length} ROIs found`)

          // Iterate through each ROI
          Array.from(rois).forEach((roi, roiIdx) => {
            // Get the Z position (depth) of this ROI in millimeters
            const zPosEl = roi.getElementsByTagNameNS(NS, 'imageZposition')[0]
            if (!zPosEl) {
              console.log(`ROI ${roiIdx}: imageZposition not found`)
              return
            }

            const zPosMm = parseFloat(zPosEl.textContent?.trim() || '0')
            
            // Get the SOP UID to match with image
            const sopUidEl = roi.getElementsByTagNameNS(NS, 'imageSOP_UID')[0]
            const sopUid = sopUidEl?.textContent?.trim() || ''
            
            // Get all edge map points for this ROI contour
            const edgeMaps = roi.getElementsByTagNameNS(NS, 'edgeMap')

            console.log(`ROI ${roiIdx}: Z=${zPosMm}, edgeMap count=${edgeMaps.length}, SOP_UID=${sopUid}`)

            if (edgeMaps.length === 0) {
              console.log(`ROI ${roiIdx}: no edgeMaps`)
              return
            }

            // Find the image index based on Z position or SOP UID
            // First try to estimate from Z position: convert mm to slice index
            // Z range appears to be approximately -250 to 0, with ~2.5mm spacing
            let sliceIdx = Math.round((zPosMm - (-250)) / 2.5)
            if (sliceIdx < 0) sliceIdx = 0
            if (sliceIdx >= imageIds.length) sliceIdx = imageIds.length - 1

            const imageId = imageIds[sliceIdx]
            if (!imageId) {
              console.log(`ROI ${roiIdx}: imageId not found, sliceIdx=${sliceIdx}`)
              return
            }

            console.log(`ROI ${roiIdx}: mapped to imageId at index ${sliceIdx}`)

            // Collect all world coordinate points for this ROI
            const points: Array<[number, number, number]> = []
            
            Array.from(edgeMaps).forEach((edgeMap, edgeIdx) => {
              // Get pixel coordinates from XML
              const xEl = edgeMap.getElementsByTagNameNS(NS, 'xCoord')[0]
              const yEl = edgeMap.getElementsByTagNameNS(NS, 'yCoord')[0]
              
              if (xEl && yEl) {
                const xCoord = parseFloat(xEl.textContent?.trim() || '0')
                const yCoord = parseFloat(yEl.textContent?.trim() || '0')
                
                // Convert pixel coordinates [x, y] to world coordinates [x, y, z] in mm
                // Note: imageToWorldCoords expects [col, row] = [xCoord, yCoord]
                const worldCoord = utilities.imageToWorldCoords(imageId, [xCoord, yCoord])
                
                if (worldCoord) {
                  console.log(
                    `  Edge ${edgeIdx}: pixel(${xCoord}, ${yCoord}) → world(${worldCoord[0].toFixed(2)}, ${worldCoord[1].toFixed(2)}, ${worldCoord[2].toFixed(2)})`
                  )
                  points.push(worldCoord as [number, number, number])
                } else {
                  console.log(`  Edge ${edgeIdx}: coordinate conversion failed`)
                }
              }
            })

            console.log(`ROI ${roiIdx}: collected ${points.length} world coordinate points`)

            // PlanarFreehandROI requires at least 3 points to form a closed contour
            if (points.length < 3) {
              console.log(`ROI ${roiIdx}: insufficient points (need ≥3), skipped`)
              return
            }

            try {
              // Create and add annotation to Cornerstone3D state
              annotation.state.addAnnotation(
                {
                  annotationUID: crypto.randomUUID(),
                  metadata: {
                    toolName: PlanarFreehandROITool.toolName,
                    referencedImageId: imageId,
                    FrameOfReferenceUID: viewport.getFrameOfReferenceUID(),
                  },
                  data: {
                    handles: {
                      points: points,
                    },
                  },
                } as any,
                {
                  viewportId: VIEWPORT_ID,
                } as any
              )
              annotationCount++
              console.log(`ROI ${roiIdx}: annotation added successfully`)
            } catch (err) {
              console.warn(`Failed to add annotation ${roiIdx}:`, err)
            }
          })
        })
      })

      // Trigger viewport re-render to display all annotations
      const re2 = getRenderingEngine()
      re2?.render()

      setStatus(`Loaded ${annotationCount} ground truth annotation${annotationCount !== 1 ? 's' : ''}`)
      console.log(`Total annotations loaded: ${annotationCount}`)
    } catch (err) {
      setStatus(`Error loading GT: ${err instanceof Error ? err.message : String(err)}`)
      console.error('Detailed error:', err)
    }
  }, [activeStudy])

  // ---------------------------------------------------------------------------
  // TASK 3 — Run AI Segmentation Model
  // ---------------------------------------------------------------------------
  // Trigger TotalSegmentator or MONAI Label on the active study's CT data and
  // retrieve the segmentation result so Task 4 can display it.
  //
  // See HACKATHON_TASKS.md § Task 3 for hints and available scripts.
  //
  const handleRunAI = useCallback(async () => {
    // TODO Task 3 — implement handleRunAI()
    console.warn('Task 3 not yet implemented')
    setStatus('Task 3: Run AI Segmentation — not yet implemented')
  }, [activeStudy])

  // ---------------------------------------------------------------------------
  // TASK 4 — Display AI Segmentation Overlay
  // ---------------------------------------------------------------------------
  // Load a DICOM SEG file (from Task 3, or the pre-computed fallback in
  // data/<activeStudy>/annotations/) and display it as a coloured labelmap
  // overlay using Cornerstone3D's segmentation API.
  //
  // See HACKATHON_TASKS.md § Task 4 for hints.
  //
  const handleShowAISeg = useCallback(async () => {
    // TODO Task 4 — implement handleShowAISeg()
    console.warn('Task 4 not yet implemented')
    setStatus('Task 4: Show AI Segmentation — not yet implemented')
  }, [activeStudy])

  // ---------------------------------------------------------------------------
  // BONUS A — AI-Assisted Segmentation
  // ---------------------------------------------------------------------------
  // POST the active study ID to a local segmentation API at localhost:8000,
  // receive the resulting DICOM SEG path, and display it as a labelmap overlay.
  // Show loading feedback while the model runs and handle errors gracefully.
  //
  // API: POST http://localhost:8000/segment  { case_id: string }
  //      → { seg_path: string }
  //
  // See HACKATHON_TASKS.md § Bonus A for hints.
  //
  const handleAIAssist = useCallback(async () => {
    // TODO Bonus A — implement handleAIAssist()
    console.warn('Bonus A not yet implemented')
    setStatus('Bonus A: AI-Assisted Segmentation — not yet implemented')
  }, [activeStudy])

  // ==========================================================================
  return (
    <div id="app">

      {/* Header */}
      <header className="header">
        <h1>DICOM Annotation Viewer</h1>
        <span className="subtitle">Atomorphic Mini Hackathon</span>
      </header>

      {/* Toolbar */}
      <div className="toolbar">

        {/* File loading */}
        <div className="tool-group">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".dcm"
            style={{ display: 'none' }}
            onChange={e => handleFiles(e.target.files)}
          />
          <button disabled={!ready} onClick={() => fileInputRef.current?.click()}>
            Load DICOM
          </button>
        </div>

        <div className="divider" />

        {/* Navigation tools */}
        <div className="tool-group">
          {(['WindowLevel', 'Pan', 'Zoom'] as NavTool[]).map(tool => (
            <button
              key={tool}
              disabled={!ready}
              className={activeTool === tool ? 'active' : ''}
              onClick={() => handleNavTool(tool)}
            >
              {tool === 'WindowLevel' ? 'W/L' : tool}
            </button>
          ))}
        </div>

        <div className="divider" />

        {/* Annotation drawing tools */}
        <div className="tool-group">
          {([
            ['Length',       'Length'],
            ['RectangleROI', 'Rect'],
            ['Freehand',     'Freehand'],
          ] as [DrawTool, string][]).map(([tool, label]) => (
            <button
              key={tool}
              disabled={!ready}
              className={activeTool === tool ? 'active' : ''}
              onClick={() => handleDrawTool(tool)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="divider" />

        {/* Utility */}
        <div className="tool-group">
          <button disabled={!ready} onClick={handleReset}>Reset</button>
          <button disabled={!ready} onClick={handleExportJSON}>Export JSON</button>
        </div>

        <div className="divider" />

        {/* ── HACKATHON TASK BUTTONS ── */}
        <div className="tool-group hackathon-tasks">
          <button disabled={!ready} onClick={handleLoadGT}>
            Load GT
          </button>
          <button disabled={!ready} onClick={handleRunAI}>
            Run AI
          </button>
          <button disabled={!ready} onClick={handleShowAISeg}>
            Show AI Seg
          </button>
          <button disabled={!ready} onClick={handleAIAssist}>
            AI Assist
          </button>
        </div>

      </div>

      {/* Main content */}
      <div className="main-content">

        {/* Left panel — image info + study selector */}
        <div className="panel">
          <h3>Image Info</h3>
          <div className="list-content">
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <tbody>
                {[
                  ['Slice',  `${info.slice} / ${info.total}`],
                  ['W / L',  info.wl],
                ].map(([label, value]) => (
                  <tr key={label}>
                    <td style={{ color: 'var(--text-dim)', paddingBottom: 6 }}>{label}</td>
                    <td style={{ paddingBottom: 6 }}>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── TASK 1: Study Selector — implement handleSelectStudy() ── */}
          <h3 style={{ borderTop: '1px solid var(--border)' }}>Studies</h3>
          <div className="list-content">
            {LIDC_STUDIES.map(study => (
              <button
                key={study.id}
                onClick={() => handleSelectStudy(study.id)}
                className={activeStudy === study.id ? 'active' : ''}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  marginBottom: '4px',
                  textAlign: 'left',
                  border: '1px solid var(--border)',
                  background: activeStudy === study.id ? 'var(--accent)' : 'var(--bg-panel)',
                  color: activeStudy === study.id ? 'var(--text-light)' : 'var(--text)',
                  cursor: 'pointer',
                  borderRadius: '4px',
                  fontSize: '12px',
                }}
              >
                <strong>{study.id}</strong>
                <div style={{ fontSize: '10px', opacity: 0.7 }}>{study.slices} slices</div>
              </button>
            ))}
          </div>
        </div>

        {/* Viewport */}
        <div className="viewport-container">
          <div className="viewport">
            <div ref={viewportRef} style={{ width: '100%', height: '100%' }} />
          </div>
        </div>

        {/* Right panel — annotations + segments */}
        <div className="panel right-panel">
          <h3>Annotations</h3>
          <div className="list-content">
            {annotations.length === 0
              ? <p className="empty">No annotations</p>
              : annotations.map(a => (
                  <div key={a.uid} className="annotation-item">
                    <span className="annotation-type">{a.type}</span>
                  </div>
                ))
            }
          </div>

          <h3 style={{ borderTop: '1px solid var(--border)' }}>Segments</h3>
          <div className="list-content">
            {segments.length === 0
              ? <p className="empty">No segmentation loaded</p>
              : segments.map(s => (
                  <div key={s.index} className="segment-item">
                    <span
                      className="segment-color"
                      style={{ background: `rgb(${s.color[0]},${s.color[1]},${s.color[2]})` }}
                    />
                    <span className="segment-label">{s.label}</span>
                  </div>
                ))
            }
          </div>
        </div>

      </div>

      {/* Status bar */}
      <footer className="status-bar">{status}</footer>

    </div>
  )
}
