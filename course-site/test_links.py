#!/usr/bin/env python3
# Copyright (c) 2026 Dr Ken Lai (黎子健).
# Licensed under CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
# MLTE03 — Flight Dynamics and Intelligent Control Technologies, MUST.
"""
Check every slides/ and labs/ link declared in index.html.
Prints a clear PASS/FAIL table and exits non-zero if any file is missing.
"""
import os, re, sys

SITE = os.path.dirname(os.path.abspath(__file__))
INDEX = os.path.join(SITE, "index.html")

# Extract all href values from the week data block
with open(INDEX) as f:
    src = f.read()

# Grab the WEEKS array block
block_match = re.search(r'const WEEKS\s*=\s*\[(.*?)\];', src, re.DOTALL)
if not block_match:
    print("ERROR: could not find WEEKS array in index.html")
    sys.exit(2)

block = block_match.group(1)

# Find all quoted path values (slides and lab hrefs)
paths = re.findall(r'"((?:slides|labs)/[^"]+)"', block)

# Also check the anchor hrefs in the hero / other sections
hero_hrefs = re.findall(r'href="((?!http|mailto|#|\[|\$)[^"]+)"', src)

# strip query strings (cache-busters like site.css?v=4, schedule.js?v=1)
all_links = sorted({l.split("?")[0] for l in paths + hero_hrefs})

results = []
for rel in all_links:
    full = os.path.join(SITE, rel.split('?', 1)[0])   # strip cache-buster query strings
    exists = os.path.isfile(full)
    results.append((rel, exists))

# Print table
col = max(len(r) for r, _ in results) + 2
print(f"\n{'PATH':<{col}}  STATUS")
print("-" * (col + 10))
fails = 0
for rel, ok in results:
    status = "PASS ✓" if ok else "FAIL ✗  (file missing)"
    print(f"{rel:<{col}}  {status}")
    if not ok:
        fails += 1

print()
print(f"{len(results) - fails}/{len(results)} links OK", end="")
if fails:
    print(f"  — {fails} missing")
    sys.exit(1)
else:
    print(" — all present")
