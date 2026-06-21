# Learn diagrams — install types & frame profiles

The Learn section ("Install Types & Frame Profiles") shows one diagram per topic.
The renderer prefers a **raster image** here and automatically falls back to the
old inline SVG if the image file is missing — so you can drop these in one at a
time with no code changes.

## Drop-in filenames (exact)

Save each generated image at these paths (PNG or, better, WebP — if you use WebP,
change the extension in `anchor-learn.json` too):

| Topic | File |
|---|---|
| Nail Fin (Nailing Flange) | `learn-img/install-nail-fin.png` |
| Florida Flange / Replacement | `learn-img/install-florida-flange.png` |
| Equal Leg vs Unequal Leg | `learn-img/install-equal-unequal-leg.png` |
| Block Frame & Flush Fin | `learn-img/install-block-flush-fin.png` |
| New construction vs replacement | `learn-img/install-new-vs-replacement.png` |

Until a file exists, the page shows the existing SVG fallback (no broken image).

## Specs

- **Aspect:** landscape ~4:3 (e.g. 1600×1200). Renders up to 360px tall in a card.
- **Background:** clean **white** (reads like a spec sheet in both light & dark UI).
- **One set:** keep all five visually consistent — same line weight, palette, label style.

## A note on labels (important for "perfect")

AI image generators frequently garble small text. If Grok renders the labels
cleanly — great. If any come out misspelled, regenerate that one with **"no text
labels, leave clean open space beside each component"** and tell me — I'll overlay
crisp HTML/SVG labels in-app so they're always sharp and correct.

---

## SHARED STYLE (paste at the top of every prompt)

> Professional architectural construction-detail illustration, clean white
> background. Precise thin dark-slate (#1E293B) line work, flat minimal shading,
> a single warm-gold accent (#C9A558) used ONLY on the highlighted component and
> its label. Standard section conventions: wood studs shown in end-grain section,
> concrete block (CMU) with aggregate hatch, glass as thin parallel lines,
> sealant as a small bead. Clear legible sans-serif labels on thin leader lines.
> No clutter, no watermark, no logo, no border. Landscape ~4:3. Horizontal
> cross-section (plan view) cut through the window's SIDE JAMB unless noted —
> exterior wall face on the LEFT, building interior on the RIGHT. Accurate,
> to-scale proportions, technical-manual look.

---

## PROMPT 1 — Nail Fin (`install-nail-fin.png`)

> [SHARED STYLE] Cross-section of a **nail-fin** window install in a **wood
> stick-framed** wall. Left (exterior) to right (interior): vertical wood/lap
> siding, a house-wrap weather barrier, OSB/plywood wall sheathing, then a 2x4
> wood stud shown in end-grain section. The window frame jamb sits in the
> opening; a thin flat **nail fin (nailing flange)** projects from the exterior
> face of the frame and lies FLAT against the face of the sheathing. A screw
> drives **through the fin into the stud**. Self-adhesive **flashing tape** laps
> over the fin onto the sheathing, and the siding covers over it. Highlight the
> nail fin and the through-fin screw in gold. Labels: "Window frame", "Nail fin
> (nailing flange)", "Screw through fin into stud", "Wall sheathing", "Flashing
> tape over fin", "Siding", "Stud".

## PROMPT 2 — Florida Flange / Replacement (`install-florida-flange.png`)

> [SHARED STYLE] Cross-section of an **integral Florida flange** window set into
> an **existing opening** (replacement / retrofit). The wall is finished masonry
> with stucco on the exterior (left) and an existing wood buck in the opening.
> The window frame has a **one-piece flange extruded as part of the frame** (NOT
> a separate clip-on fin) that sits flat against the exterior wall face. A
> factory **pre-drilled hole** carries a #8 × 2" screw through the flange into
> the existing buck. A bead of **sealant** beds the flange to the wall. Show a
> 1/2" shim gap with a shim between frame and opening. Add a small inset in one
> corner contrasting a one-piece integral flange vs. a separate nail fin.
> Highlight the integral flange and the pre-drilled screw in gold. Labels:
> "Integral Florida flange (one-piece)", "Pre-drilled hole · #8 × 2\" screw",
> "Existing wood buck", "Sealant bed", "Shim · 1/2\" gap", "Stucco".

## PROMPT 3 — Equal Leg vs Unequal Leg (`install-equal-unequal-leg.png`)

> [SHARED STYLE] **Two panels side by side, same scale**, comparing finless
> block-frame profiles in a **concrete-block (CMU) masonry opening with stucco**.
> LEFT "Equal leg": the frame's side walls (legs) are the SAME depth on both
> faces, so the frame sits CENTERED in the opening with symmetric reveals inside
> and out. RIGHT "Unequal leg": the EXTERIOR leg is noticeably DEEPER and laps
> OVER the face of the block/stucco; the interior leg is short. In BOTH panels a
> **Tapcon through-frame anchor** drives through the frame jamb into the concrete
> block, with a shim. Show CMU section hatch and a thin stucco skim on the
> exterior. Highlight the legs and the through-frame Tapcon in gold. Labels:
> "Equal leg — centered", "Unequal leg — deep exterior leg laps the block face",
> "Tapcon through-frame anchor", "Concrete block (CMU)", "Stucco", "Shim".

## PROMPT 4 — Block Frame & Flush Fin (`install-block-flush-fin.png`)

> [SHARED STYLE] **Two panels side by side, same scale.** LEFT "Block frame": a
> finless square hollow-tube window frame seated in a prepared **wood buck**
> inside a masonry opening, anchored straight **through the frame jamb** into the
> buck/block, with a shim — draw the square tube profile clearly. RIGHT "Flush
> fin": a retrofit frame with a small **fin that laps flat against an existing
> exterior frame / stucco face that stays in place** — the new unit nests over
> the old frame to re-skin the opening without removing stucco; show the old
> frame remaining and a sealant bead at the lap. Highlight the block-frame
> through-anchor (left) and the flush-fin lap (right) in gold. Labels: "Finless
> block frame", "Anchored through the frame into buck", "Wood buck", "Flush fin
> laps existing face", "Existing frame stays", "Stucco", "Sealant".

## PROMPT 5 — New construction vs replacement (`install-new-vs-replacement.png`)

> [SHARED STYLE — but use a slight 3D CUTAWAY perspective instead of a flat plan
> section] **Two panels side by side, same scale.** LEFT "New construction": an
> OPEN wood-stud-framed wall with exposed studs and sheathing, a window being set
> with its **nail fin fastened flat to the studs** before siding/stucco goes on;
> add a prominent gold callout badge reading "~10 min / LF". RIGHT "Replacement /
> retrofit": a FINISHED wall (stucco exterior, drywall interior, trim) with a new
> finless/flanged window dropped into the **existing opening**, surfaces masked
> for protection, sealing back to finished stucco; add a prominent gold callout
> badge reading "~40 min / LF". Make the two time badges the visual focus.
> Labels: "Open framing — fin to studs", "Finished wall — retrofit into existing
> opening".
