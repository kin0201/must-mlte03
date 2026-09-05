#!/bin/bash
# export_pdf.sh — render slide deck(s) to PDF via headless Chrome + reveal ?print-pdf.
#   ./export_pdf.sh week01        # one deck (prefix match on slides/*.html)
#   ./export_pdf.sh all           # all 14 decks
#   ./export_pdf.sh assignments   # the 8 assignment briefs (portrait A4)
# Needs: Google Chrome; a local server on :8123 serving the PROJECT ROOT
# (auto-started if not running). Output: pdf/MLTE03_WeekNN_slides.pdf
set -euo pipefail
cd "$(dirname "$0")"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
# Use PLAIN --headless, not --headless=new. With a desktop Chrome session running,
# --headless=new intermittently prints a blank 1-page PDF no matter how many times
# it is retried (weeks 10/11/13/14 all reproduced it on 2026-08-25); plain --headless
# with the same isolated profile renders correctly first time.
PORT=8123
# isolated profile — REQUIRED: without it headless attaches to a running Chrome
# and silently prints a blank 1-page PDF
PROFILE=$(mktemp -d)
trap 'rm -rf "$PROFILE"' EXIT
mkdir -p pdf

# serve the project root (course-site's parent), matching .claude/launch.json
if ! curl -sf "http://localhost:$PORT/course-site/index.html" >/dev/null 2>&1; then
  # NOTE: launch in THIS shell, not a subshell — `(... &)` leaves $! unset in the
  # parent, and under `set -u` the old `STARTED=$!` aborted the whole script the
  # moment it had to start its own server. It only ever worked when a server was
  # already listening on $PORT, which made the failure look intermittent.
  ( cd .. && exec python3 -m http.server $PORT >/dev/null 2>&1 ) &
  STARTED=$!
  # wait for it to actually accept connections rather than hoping 1s is enough
  for _ in $(seq 1 20); do
    curl -sf "http://localhost:$PORT/course-site/index.html" >/dev/null 2>&1 && break
    sleep 0.5
  done
fi

sel="${1:-all}"

if [ "$sel" = "assignments" ]; then
  for f in assignments/*.html; do
    base=$(basename "$f" .html)
    out="pdf/MLTE03_Assignment_${base}.pdf"
    rm -f "$out"
    "$CHROME" --headless --disable-gpu --no-first-run --no-default-browser-check \
      --disable-sync --no-pdf-header-footer --user-data-dir="$PROFILE" \
      --virtual-time-budget=15000 --print-to-pdf="$out" \
      "http://localhost:$PORT/course-site/$f" >/dev/null 2>&1 &
    CPID=$!
    for _ in $(seq 1 60); do [ -s "$out" ] && sleep 1 && break; sleep 1; done
    # `|| true` on the kill too: if Chrome already exited (a fast render), kill
    # returns non-zero, and as a standalone statement under `set -e` that killed
    # the whole script. Timing-dependent, so it looked like random mid-batch death.
    kill "$CPID" 2>/dev/null || true; wait "$CPID" 2>/dev/null || true
    [ -s "$out" ] && echo "✓ $out ($(du -h "$out" | cut -f1))" || { echo "✗ $base FAILED" >&2; exit 1; }
  done
  exit 0
fi

# Check a rendered PDF for real, instead of trusting a non-empty file.
# Returns "pages,footer_hits" — both matter, see below.
pdf_check() {
  python3 - "$1" <<'PY' 2>/dev/null || echo "-1,-1"
import sys, re
try:
    from pypdf import PdfReader
except ImportError:
    from PyPDF2 import PdfReader
r = PdfReader(sys.argv[1])
txt = "".join(re.sub(r"\s+", "", (p.extract_text() or "")) for p in r.pages)
print(f"{len(r.pages)},{txt.count('©2026DrKenLai')}")
PY
}

# Plain string, not an array: macOS ships bash 3.2, where ${ARR[*]} on an EMPTY
# array is an 'unbound variable' error under `set -u` — i.e. the script would
# have crashed at the end of a fully SUCCESSFUL run.
FAILED=""
FAILED_N=0
for f in slides/week*.html; do
  base=$(basename "$f" .html)
  [ "$sel" != "all" ] && [[ "$base" != "$sel"* ]] && continue
  wk=$(echo "$base" | sed -E 's/^week([0-9]+).*/\1/')
  out="pdf/MLTE03_Week${wk}_slides.pdf"
  want=$(grep -c "<section" "$f")
  want_cr=$((want + 1))   # footer copyright on every page + one extra on the titlepage

  # `--print-to-pdf` + `--virtual-time-budget` races deck.css's Google Fonts
  # @import (STIX Two Text, Inter) against Chrome's virtual clock, in a cold
  # isolated --user-data-dir that always needs a live fetch. This produces
  # THREE distinct silent failures, none of which raise an error or leave an
  # empty file:
  #   * a 1-page blank PDF        — layout was not ready when time was frozen
  #   * a page-inflated PDF       — fallback-font metrics made a tall slide split
  #   * CORRECT page count, but the .footer's copyright mark missing on every
  #     page but the titlepage (found 2026-08-25, week11: 45/45 pages, only
  #     2 of 46 expected copyright hits) — the page count alone does not
  #     prove the render is actually correct.
  # pdfSeparateFragments=false is still required (without it every .derive/
  # .fragment step becomes its own page — week13 rendered 60 for 47 slides),
  # but it does not fix the font race, so it is not sufficient on its own.
  #
  # cdp_print_pdf.py drives the real DevTools Protocol instead: it waits on
  # document.fonts.ready and the live .pdf-page count before asking Chrome to
  # print, so there is nothing left to race. It is the ONLY method that has
  # reliably produced a fully-correct render, so it is the primary path here
  # — the CLI attempt below is kept only as a fast opportunistic first try.
  ok=0
  for attempt in 1 2; do
    rm -f "$out"
    "$CHROME" --headless --disable-gpu --no-first-run --no-default-browser-check \
      --disable-sync --no-pdf-header-footer --user-data-dir="$PROFILE" \
      --virtual-time-budget=20000 --print-to-pdf="$out" \
      "http://localhost:$PORT/course-site/$f?print-pdf&pdfSeparateFragments=false" >/dev/null 2>&1 &
    CPID=$!
    for _ in $(seq 1 60); do [ -s "$out" ] && sleep 1 && break; sleep 1; done
    # `|| true` on the kill too: if Chrome already exited (a fast render), kill
    # returns non-zero, and as a standalone statement under `set -e` that killed
    # the whole script. Timing-dependent, so it looked like random mid-batch death.
    kill "$CPID" 2>/dev/null || true; wait "$CPID" 2>/dev/null || true
    IFS=',' read -r got got_cr <<< "$(pdf_check "$out")"
    if [ "$got" = "$want" ] && [ "$got_cr" = "$want_cr" ]; then ok=1; break; fi
    echo "  … $base CLI attempt $attempt: pages=${got}/${want} copyright=${got_cr}/${want_cr} — retrying" >&2
  done

  if [ "$ok" != 1 ]; then
    echo "  … $base: CLI export did not verify cleanly — using CDP" >&2
    # Retry CDP too. It is reliable standalone, but launching it immediately
    # after killing the CLI Chrome instances can hit transient contention
    # (observed once on week14, 2026-08-25: failed in-script, then rendered
    # 26/26 with 27 marks on the very next standalone run). Give it 3 goes
    # with a short pause so a shutdown race cannot condemn a good deck.
    for cdp_try in 1 2 3; do
      sleep 2
      if python3 cdp_print_pdf.py "http://localhost:$PORT/course-site/$f?print-pdf&pdfSeparateFragments=false" "$out" "$want" 2>&1; then
        IFS=',' read -r got got_cr <<< "$(pdf_check "$out")"
        if [ "$got" = "$want" ] && [ "$got_cr" = "$want_cr" ]; then ok=1; break; fi
      fi
      echo "  … $base CDP attempt $cdp_try did not verify — retrying" >&2
    done
  fi

  if [ "$ok" = 1 ]; then
    echo "✓ $out ($(du -h "$out" | cut -f1), ${want} pages, footer verified)"
  else
    # Collect and continue rather than exit 1 here. On a 14-deck `all` run a
    # single flaky render used to abort the whole batch, discarding every deck
    # still queued behind it — which is exactly what happened repeatedly on
    # 2026-08-25. Report every failure together at the end instead.
    echo "✗ $base FAILED — could not verify ${want} pages + ${want_cr} copyright marks via CLI or CDP" >&2
    FAILED="$FAILED $base"
    FAILED_N=$((FAILED_N + 1))
  fi
done

[ -n "${STARTED:-}" ] && kill $STARTED 2>/dev/null || true

if [ "$FAILED_N" -gt 0 ]; then
  echo "" >&2
  echo "✗ ${FAILED_N} deck(s) failed verification:${FAILED}" >&2
  exit 1
fi
echo ""
echo "✓ all requested decks rendered and verified"
