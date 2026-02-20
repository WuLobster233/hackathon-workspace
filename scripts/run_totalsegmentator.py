#!/usr/bin/env python3
"""
TotalSegmentator Runner
=======================
Runs TotalSegmentator on a NIfTI CT scan and outputs a segmentation NIfTI.

Usage:
    python run_totalsegmentator.py <input_nifti> <output_nifti> [--fast]

Example:
    python run_totalsegmentator.py data/LIDC-IDRI-0001/ct.nii.gz data/LIDC-IDRI-0001/seg.nii.gz --fast

Requirements:
    pip install TotalSegmentator torch

Note: First run downloads model weights (~1.5 GB).
"""

import sys
import tempfile
from pathlib import Path

try:
    import numpy as np
    import nibabel as nib
except ImportError:
    print("ERROR: numpy/nibabel not installed. Run: pip install numpy nibabel")
    sys.exit(1)


# TotalSegmentator lung_nodules task label names
LUNG_NODULE_LABELS = {
    1: "lung",
    2: "lung_nodule",
}


def _has_cuda() -> bool:
    """Check if CUDA is available."""
    try:
        import torch
        return torch.cuda.is_available()
    except ImportError:
        return False


def run_totalsegmentator(input_path: str, output_path: str, fast: bool = False) -> bool:
    """
    Run TotalSegmentator (lung_nodules task) on input NIfTI and save segmentation.

    Args:
        input_path: Path to input NIfTI file (CT scan)
        output_path: Path for output segmentation NIfTI
        fast: Use fast mode (lower resolution, ~3x faster)

    Returns:
        True if successful, False otherwise
    """
    try:
        from totalsegmentator.python_api import totalsegmentator
    except ImportError:
        print("ERROR: TotalSegmentator not installed.")
        print("Install with: pip install TotalSegmentator")
        print("Note: Requires PyTorch — install from https://pytorch.org first")
        return False

    input_file = Path(input_path)
    if not input_file.exists():
        print(f"ERROR: Input file not found: {input_path}")
        return False

    print(f"Input:  {input_path}")
    print(f"Output: {output_path}")
    print(f"Task:   lung_nodules")
    print(f"Fast:   {fast}")
    print(f"Device: {'gpu' if _has_cuda() else 'cpu'}")
    print()

    # TotalSegmentator writes output files to a directory.
    # We use a temp dir and then merge into a single NIfTI.
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)

        print("Running TotalSegmentator...")
        print("(First run will download model weights — this may take a few minutes)")
        print()

        try:
            totalsegmentator(
                input=input_file,
                output=tmp_path,
                task="lung_nodules",
                fast=fast,
                ml=True,          # multi-label: single output file with all labels
                device="gpu" if _has_cuda() else "cpu",
                quiet=False,
            )
        except Exception as e:
            print(f"ERROR: TotalSegmentator failed: {e}")
            return False

        # With ml=True, output is a single file: <tmp_dir>/lung_nodules.nii.gz
        seg_file = tmp_path / "lung_nodules.nii.gz"
        if not seg_file.exists():
            # Fall back: look for any .nii.gz in the output dir
            candidates = list(tmp_path.glob("*.nii.gz"))
            if not candidates:
                print("ERROR: No segmentation output found in temp directory")
                return False
            seg_file = candidates[0]

        # Copy to requested output path
        output_img = nib.load(str(seg_file))
        nib.save(output_img, output_path)

    data = output_img.get_fdata()
    unique_labels = np.unique(data).astype(int)
    print()
    print(f"SUCCESS: Segmentation saved to {output_path}")
    print(f"Structures found (excluding background):")
    for label in unique_labels:
        if label == 0:
            continue
        name = LUNG_NODULE_LABELS.get(label, f"label_{label}")
        voxel_count = int(np.sum(data == label))
        print(f"  {label}: {name} ({voxel_count} voxels)")

    return True


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]
    fast = "--fast" in sys.argv

    success = run_totalsegmentator(input_path, output_path, fast)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
