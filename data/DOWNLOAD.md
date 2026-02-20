# Data

All 10 LIDC-IDRI cases are pre-populated in this directory. No download is required.

## Structure

```
data/
├── LIDC-IDRI-0001/
│   ├── ct/             ← 133 DICOM slices (1-001.dcm … 1-133.dcm)
│   └── annotations/    ← 069.xml + 2 DICOM SEG files
├── LIDC-IDRI-0002/ … LIDC-IDRI-0010/   ← same structure
└── README.md
```

## Cases

| Patient | CT Slices | XML File |
|---------|-----------|----------|
| LIDC-IDRI-0001 | 133 | 069.xml |
| LIDC-IDRI-0002 | 261 | 071.xml |
| LIDC-IDRI-0003 | 140 | 072.xml |
| LIDC-IDRI-0004 | 241 | 074.xml |
| LIDC-IDRI-0005 | 133 | 076.xml |
| LIDC-IDRI-0006 | 133 | 078.xml |
| LIDC-IDRI-0007 | 145 | 081.xml |
| LIDC-IDRI-0008 | 133 | 082.xml |
| LIDC-IDRI-0009 | 256 | 085.xml |
| LIDC-IDRI-0010 | 277 | 086.xml |

If you need to re-download data, use:

```bash
pip install gdown
python scripts/download_data.py
```
