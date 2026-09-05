# course-site — MLTE03 course home (static)

The student-facing hub for **MLTE03 — Flight Dynamics & Intelligent Control
Technologies**: the 15-week grid, interactive **slide decks**, interactive **lab
sheets**, and pointers to the `quadsim` simulator. It is a **fully static site** —
no backend, no accounts. Student work is submitted through the **MUST LMS**; this
site only delivers materials.

**Status: fully built.** All of Weeks 1–14 have a slide deck and an interactive
lab sheet (Week 5 was the pilot that locked the look & feel; the rest were
produced from its templates). Every code block in every lab/deck is verified
against the real `quadsim` API by `verify_snippets.py` (see *QA gates* below).
Week 15 (final presentations) has no deck/lab by design.

## Layout

```
course-site/
  index.html                     # course home — 15-week grid + submit/simulator/refs panels
  assets/
    css/site.css                 # one design system: home + slides override + lab sheets + widget
    js/widgets.js                # 25 interactive canvas widgets (no deps) — decks, lab sheets, digital-lab.html
    js/attitude-demo.js          # legacy 1-DOF PID demo (superseded by the `pid` widget; kept for reference)
    js/lab.js                    # lab-sheet copy-buttons, progress bar, self-check persistence, submit-box filler
    js/schedule.js               # ⭐ THE one place LMS URL + lab deadlines live (see below)
  slides/
    week01-…  …  week14-….html   # reveal.js decks (all 14 weeks)
  labs/
    week01-…  …  week14-….html   # interactive HTML lab sheets (all 14 weeks)
  assignments/
    lab1–6 · team-case-study · final-project · viva-week15.html   # graded briefs + rubrics (Week 15 = viva brief; exam card's chip)
  test_links.py                  # link checker
  verify_snippets.py             # QA gate: every code block vs the real quadsim
```

The week grid is driven by a single `WEEKS` array at the bottom of `index.html`.
A week's chip goes **live** the moment you set its `slides`/`lab` URL there.

## View locally

Serve from this directory so relative paths resolve:

```bash
cd course-site
python -m http.server 8000
# open http://localhost:8000/
```

- **Slides:** open a deck, arrow keys / Space to advance, `S` for speaker notes,
  `F` fullscreen, `?` for the help overlay.
- **Export a deck to PDF:** `./export_pdf.sh week01` (or `all`) — headless-Chrome
  automation of the reveal `?print-pdf` route; output lands in `pdf/`.
  Needs Google Chrome; the script starts its own local server if none is on :8123.
  (Manual fallback: open the deck with `?print-pdf` appended, then Print → Save as PDF.)

## The interactive widgets (the Digital Lab)

`assets/js/widgets.js` holds **25 dependency-free canvas widgets** (`<div class="widget" data-widget="NAME">`), self-mounting on page load and re-mounted by the decks on slide change. `digital-lab.html` is the catalogue: every widget with a concept line, a bilingual "try this", and the `quadsim` command that makes it real. Lab sheets embed the week's widgets before their Self-check; every deck slide that carries a widget links to its Digital-Lab card. Names: `MLTEWidgets.names()`.

## The legacy 1-DOF widget

`assets/js/attitude-demo.js` is a dependency-free 1-DOF attitude-PID simulator.
Its closed loop is `θ̈ = Kp(θ_ref−θ) − Kd·θ̇` — the same inner loop quadsim's
`CascadePID` uses, so the gains a student likes here (`Kp=180, Kd=28`) are the
gains they type in the lab. Embed it anywhere with:

```html
<div class="attitude-demo" data-kp="180" data-kd="28" data-ref="20"></div>
<script src="../assets/js/attitude-demo.js"></script>
```

Every `.attitude-demo` on the page is auto-mounted; it only animates while
on-screen. In reveal decks, call `AttitudeDemo.init()` on `slidechanged` (the
pilot deck already does).

## Add a new week (the mechanical recipe)

1. **Slides** — copy `slides/week05-attitude-control.html` to `slides/weekNN-<topic>.html`.
   Replace the slide content (keep the `<style>` block, reveal includes, and the
   KaTeX/math init). Use `\( … \)` inline and `\[ … \]` display math.
2. **Lab** — copy `labs/week05-attitude-control.html` to `labs/weekNN-<topic>.html`.
   Reuse the section skeleton (Goal → Recap → Setup → Steps → Run & verify →
   Self-check → Deliverable → Submit box). Set `<body data-lab="weekNN-…">` so the
   self-check state is stored per lab. Keep every runnable snippet **tested against
   the real `quadsim` API** before publishing.
3. **Grid** — in `index.html`, set that week's `slides:` and `lab:` URLs in `WEEKS`.
4. Verify locally (above), run the QA gates, then commit.

## QA gates (run after ANY material edit)

```bash
# every lab/deck code block, executed/checked against the real quadsim
cd course-site && ../simulator/.venv/bin/python verify_snippets.py

# internal links
cd course-site && python3 test_links.py
```

`verify_snippets.py` understands the labs' structure: blocks run sequentially
in a shared namespace, `# examples/wkN_x.py` blocks register student-created
files, and a deck may use helpers its lab defines. Expected: **0 fail**.

## Design tokens

All colours/spacing live as CSS variables in `assets/css/site.css` (`--navy`,
`--cyan`, `--amber`, …). Change them once to re-skin the whole site, decks, and
labs together.

## Filling the LMS URL & deadlines (one file: `assets/js/schedule.js`)

Every lab's submit box and the home-page LMS button read from
`assets/js/schedule.js` at load time — the 29 scattered `TO FILL` badges were
collapsed into this single config (2026-08-23):

- **`lmsUrl`** — set once; the home button links to it, every lab's
  "LMS link — TO FILL" badge becomes an *open dropbox ↗* link.
- **`dropbox.weekNN`** — optional per-week deep links (override `lmsUrl`).
- **`deadlines.weekNN`** — shown verbatim in that lab's Deadline cell.
  Weeks 1–4 are already set (dates invariant across make-up plans);
  weeks 5+ stay `null` (→ badge remains) until the faculty confirms the
  make-up slots (TEACHING-PLAN §3).

After editing, bump the cache-buster `schedule.js?v=N` in `index.html` and all
`labs/*.html` (one `sed`), or students with a cached copy may not see the change:

```bash
sed -i '' 's/schedule.js?v=1/schedule.js?v=2/' index.html labs/*.html
```

## Deployment (decide at release time — not done yet)

The site is plain static files; any of these work:

- **GitHub Pages** — push `course-site/` (most portable for students worldwide).
- **Nginx on the Lightsail box** — `root .../course-site;` behind the existing host.
- **飞书 Miaoda (妙搭)** — via the `lark-apps` skill, for a quick shareable link.

Before release, fill `assets/js/schedule.js` and decide **vendor vs CDN**
for reveal.js + KaTeX. The pilot loads both from jsDelivr; for an offline
classroom, download them into `assets/vendor/` and repoint the `<link>`/`<script>`
tags. The simulator panel links to `../simulator/` — keep `course-site/` and
`simulator/` siblings (they are in the project root).
```

---

© 2026 Dr Ken Lai（黎子健）. Licensed under [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) — free to use and adapt for non-commercial teaching, with attribution.
