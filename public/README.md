# Public Directory

This directory contains a `data` symlink that points to `../data`, making all LIDC case files accessible to the Vite dev server at `/data/`.

## Structure

```
public/
└── data/    ← symlink to ../data
```

## How it works

Vite serves everything in `public/` at the root URL. The symlink means:

```
public/data/LIDC-IDRI-0001/ct/1-001.dcm
        ↓ served at
/data/LIDC-IDRI-0001/ct/1-001.dcm
```

So `fetch('/data/LIDC-IDRI-0001/annotations/069.xml')` in the browser will resolve to `data/LIDC-IDRI-0001/annotations/069.xml` on disk.

## If the symlink is missing

```bash
cd public
ln -s ../data data
```
