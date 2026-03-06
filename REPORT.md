# Hackathon Report — [Your Name]

**Date:** 06 March 2026  
**Coding:** 17:13–18:40 
**Report writing:** 18:40–19:10  
**Tasks completed:** *(e.g. Task 1, partial Task 2)*

---

## Overview

I implemented a DICOM study selector (Task 1) that loads CT image series and displays them in Cornerstone3D viewer. I also began Task 2 to load ground truth annotations from LIDC XML files, implementing namespace-aware XML parsing and pixel-to-world coordinate conversion. My overall strategy was to follow the hints provided in the documentation and generate prompts based on the materials to systematically build each feature step by step.

![alt text](/image.png)
---

## Tasks

### Task 1 — Study Selector
- Implemented `handleSelectStudy()` callback to fetch and load DICOM images from the selected study
### Task 2 — Load Ground Truth
- Fetched the LIDC XML annotation file for the active study
**Current issue:**
- `getElementsByTagNameNS()` returns 0 sessions, suggesting either:
  - Namespace declaration/query mismatch
  - DOM parser not handling the default namespace correctly

### Task 3 — Run AI Segmentation

### Task 4 — Display AI Segmentation

### Bonus

---

## Reflection

*Answer any or all of the questions below — or raise your own.*

- What was the hardest part of the challenge?
- What would you do differently if you had more time?
- Was there anything about the codebase or tooling that surprised you?

**What was the hardest part of the challenge?**

The hardest part was debugging the XML namespace issue in Task 2. The distinction between elements with namespace prefixes versus elements in a default namespace is subtle in XML but critical in DOM APIs. The hints in the documentation mentioned using `getElementsByTagNameNS()`, but determining whether my XML actually required it versus using `getElementsByTagName()` required careful inspection of the file structure and testing both approaches.

**What would you do differently if you had more time?**

Write a helper function to validate XML structure before processing (check for expected elements, count ROIs, etc.)

**Was there anything about the codebase or tooling that surprised you?**

Yes — the Cornerstone3D library is quite powerful but has a steep learning curve. The coordinate system (pixel vs. world coordinates in medical imaging) and the different tool APIs (annotation state management, rendering engine, viewport) require understanding multiple abstractions simultaneously. 

---

## AI Usage

*Which tools did you use, and how did you use them? What did you have to verify or correct?*

Copilot Claude Haiku 4.5
I provided prompts to the AI agent and let it generate code, then reviewed the output for correctness and alignment with requirements.
