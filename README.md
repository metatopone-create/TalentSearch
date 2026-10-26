# Talent Search MVP: design

High-fidelity design for an evidence-first AI talent search tool. The canvas uses the "Talent Search" design system.

Live canvas: https://claude.ai/artifact/FznNsTAAgNPhA78LDv489C

## Contents (`project/`)

| File | What |
| --- | --- |
| `Main.dc.html` | Design tokens: core colors, status styles, score ramp, type, spacing, radius |
| `Components.dc.html` | Trace entry, result row (Pending / Verified / Lead only + transition), condition row, evidence entries, buttons, drawer loading |
| `P1-Home.dc.html` | Search home |
| `P2-Plan.dc.html` | Plan review (Must / Preferred, clarifying question, estimate) |
| `P3a-Started.dc.html`, `P3b-Progress.dc.html`, `P3c-Nearly.dc.html` | Searching: just started / in progress / nearly done (`stage` prop) |
| `P4-Complete.dc.html` | Search complete: summary, follow-ups, not-included list |
| `P5a-Drawer.dc.html`, `P5b-Gathering.dc.html` | Candidate drawer: loaded / gathering details |
| `P6-Cost.dc.html` | Cost report |
| `P7-States.dc.html` | No results, source failed, budget limit |
| `canvas.json` | Canvas layout index |
| `ds/talent-search/tokens.json` | Copy of the design-system tokens |

`.dc.html` files are Design Component pages for the Claude Design canvas.
