#!/usr/bin/env python3
"""verify_snippets.py — QA gate for the MLTE03 lab sheets and slide decks.

The lab sheets are *sequential*: block N builds on names defined in blocks
1..N-1 (that is how students work through them), and some blocks are the
full content of a file the student creates (first line ``# examples/wkN_x.py``).
So verification is per-file and cumulative:

* **script** blocks (self-contained Python) are executed *in order* in one
  shared namespace per lab/deck, headless (Agg, ``plt.show`` disabled), inside
  the simulator venv with the real ``quadsim`` importable. A block importing
  an optional heavy dep (do-mpc / casadi / gym / sb3 / torch) is only
  compile+API-checked (``skip-dep``).
* **fragment** blocks (paste-into-``student.py`` snippets) are byte-compiled;
  their ``quadsim`` API references are resolved against the live package; and
  any name they *load* must be bound by an earlier block, be a documented
  context name (``self``, ``x``, ``ref``…), or be a public ``quadsim`` name.
* **shell** blocks: every ``python <file>`` line must reference a file that
  exists in ``../simulator`` — or one the lab itself had the student create.
  ``--run-shell`` additionally executes ``python examples/…`` lines.
* **text** blocks (ASCII diagrams, pseudo-code): ignored.

Usage:
    cd course-site && ../simulator/.venv/bin/python verify_snippets.py [-v] [--only week05] [--run-shell]

Exit 0 = all verified; 1 = failures (listed).
"""
from __future__ import annotations

import argparse
import ast
import html
import json
import os
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SIM = HERE.parent / "simulator"
sys.path.insert(0, str(SIM))

PRE_RE = re.compile(r"<pre[^>]*>(.*?)</pre>", re.S)
TAG_RE = re.compile(r"<[^>]+>")
STUDENT_FILE_RE = re.compile(r"^\s*#\s*([\w./-]+\.py)\b")
LAB_TIMEOUT = 900  # RL training blocks are slow

OPTIONAL_DEPS = ("do_mpc", "casadi", "gymnasium", "gym", "stable_baselines3", "torch")

# Names a fragment may get from its student.py / lecture context.
CONTEXT_NAMES = {
    "self", "t", "x", "ref", "u", "np", "plt",
    "euler", "omega", "pos", "vel", "e_att", "att_des", "T", "tau",
    "dt", "p", "params", "x_hat", "z", "e", "err", "g", "m",
    "imu", "gps",  # sensor-reading dicts, quoted from quadsim source internals
    # lecture-board fragments (Wks 2, 4, 6, 7): symbols defined on the preceding slide
    "I", "I_inv", "alloc", "controller", "log", "mixer", "n_steps",
    "clamp", "clamp_if_not_saturated", "cos", "sin", "scipy",
    # Wk-13 evidence figure: the two certify runs whose logs feed the plot
    "t_base", "z_base", "t_mpc", "z_mpc",
}


def known_quadsim_names() -> set[str]:
    """Public names of quadsim + its submodules (incl. common aliases)."""
    import importlib

    names: set[str] = {"quadsim", "traj", "viz", "an"}  # documented aliases
    qs = importlib.import_module("quadsim")
    names |= {n for n in dir(qs) if not n.startswith("_")}
    for sub in ("dynamics", "controllers", "controllers.rl", "trajectories",
                "analysis", "plotting", "sensors", "estimators", "params", "sim"):
        try:
            mod = importlib.import_module(f"quadsim.{sub}")
        except ImportError:
            continue
        names |= {n for n in dir(mod) if not n.startswith("_")}
    return names


def strip_block(raw: str) -> str:
    txt = TAG_RE.sub("", raw)
    txt = html.unescape(txt).replace(" ", " ")
    return txt.strip("\n")


SHELL_LINE = re.compile(
    r"^\s*(\$ )?(python3?|pip3?|export|cd|source|git|mkdir|unzip|curl|wget)\b"
)


def classify(code: str) -> str:
    lines = [l for l in code.splitlines() if l.strip()]
    if not lines:
        return "text"
    sh = sum(bool(SHELL_LINE.match(l) or l.strip().startswith("#")) for l in lines)
    if sh == len(lines):
        return "shell"
    if re.search(r"[─│┌┐└┘├┤►▲═║╔╗]", code):
        return "text"
    try:
        compile(code, "<block>", "exec")
    except SyntaxError:
        return "shell" if sh > 0 else "text"
    if re.search(r"^\s*(import|from)\s+\w", code, re.M):
        return "script"
    return "fragment"


def names_of(code: str) -> tuple[set[str], set[str]]:
    """(bound, loaded) names of a Python block."""
    import builtins

    tree = ast.parse(code)
    bound: set[str] = set()
    loaded: set[str] = set()

    class V(ast.NodeVisitor):
        def visit_Name(self, node):
            (bound if isinstance(node.ctx, (ast.Store, ast.Del)) else loaded).add(node.id)

        def visit_FunctionDef(self, node):
            bound.add(node.name)
            for a in node.args.args + node.args.kwonlyargs:
                bound.add(a.arg)
            if node.args.vararg:
                bound.add(node.args.vararg.arg)
            if node.args.kwarg:
                bound.add(node.args.kwarg.arg)
            self.generic_visit(node)

        visit_AsyncFunctionDef = visit_FunctionDef

        def visit_ClassDef(self, node):
            bound.add(node.name)
            self.generic_visit(node)

        def visit_Import(self, node):
            for al in node.names:
                bound.add((al.asname or al.name).split(".")[0])

        def visit_ImportFrom(self, node):
            for al in node.names:
                bound.add(al.asname or al.name)

        def visit_ExceptHandler(self, node):
            if node.name:
                bound.add(node.name)
            self.generic_visit(node)

        def visit_comprehension(self, node):
            for n in ast.walk(node.target):
                if isinstance(n, ast.Name):
                    bound.add(n.id)
            self.generic_visit(node)

        def visit_Lambda(self, node):
            for a in node.args.args:
                bound.add(a.arg)
            self.generic_visit(node)

    V().visit(tree)
    return bound, loaded - set(dir(builtins))


def check_quadsim_refs(code: str) -> list[str]:
    """Resolve explicit quadsim API references against the live package."""
    import importlib

    errs: list[str] = []
    qs = importlib.import_module("quadsim")

    for m in re.finditer(r"from\s+(quadsim(?:\.\w+)*)\s+import\s+([\w ,]+)", code):
        modname, names = m.group(1), m.group(2)
        try:
            mod = importlib.import_module(modname)
        except ImportError as e:
            errs.append(f"import {modname}: {e}")
            continue
        for item in names.split(","):
            name = item.split(" as ")[0].strip()
            if name and not hasattr(mod, name):
                try:
                    importlib.import_module(f"{modname}.{name}")
                except ImportError:
                    errs.append(f"{modname} has no '{name}'")

    for m in re.finditer(r"\bquadsim((?:\.\w+)+)", code):
        parts = m.group(1).lstrip(".").split(".")
        obj = qs
        for i, part in enumerate(parts):
            if hasattr(obj, part):
                obj = getattr(obj, part)
            else:
                try:
                    obj = importlib.import_module("quadsim." + ".".join(parts[: i + 1]))
                except ImportError:
                    errs.append("quadsim." + ".".join(parts[: i + 1]) + " not found")
                    break

    from quadsim.params import QuadParams

    qp = QuadParams()
    for m in re.finditer(r"\bself\.p\.(\w+)", code):
        if not hasattr(qp, m.group(1)):
            errs.append(f"QuadParams has no '.{m.group(1)}'")
    return sorted(set(errs))


RUNNER = r"""
import json, sys, traceback
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
plt.show = lambda *a, **k: None
ns = {"__name__": "__main__"}

def attempt(i, code, elsewhere, final):
    print(f"@@RUN {i}", flush=True)
    try:
        exec(compile(code, f"<block {i}>", "exec"), ns)
        print(f"@@OK {i}", flush=True)
        return None
    except SystemExit:
        print(f"@@OK {i}", flush=True)
        return None
    except NameError as e:
        name = getattr(e, "name", None)
        if name and name in elsewhere:
            if final:
                # A step snippet whose context lives in the assembled
                # checkpoint block — statically coherent, accept.
                print(f"@@STEP {i} needs '{name}' (bound elsewhere in this lab)", flush=True)
            return (i, code, elsewhere)
        line = traceback.format_exc().strip().splitlines()[-1]
        print(f"@@FAIL {i} {line}", flush=True)
        return None
    except Exception:
        line = traceback.format_exc().strip().splitlines()[-1]
        print(f"@@FAIL {i} {line}", flush=True)
        return None

deferred = []
for i, code, elsewhere in json.load(sys.stdin):
    r = attempt(i, code, elsewhere, final=False)
    if r:
        deferred.append(r)
# Retry the deferred steps now that the assembled checkpoint has populated ns.
for i, code, elsewhere in deferred:
    attempt(i, code, elsewhere, final=True)
print("@@DONE", flush=True)
"""


def run_scripts(blocks: list[tuple[int, str, list[str]]]) -> dict[int, str]:
    """Execute script blocks sequentially in one shared-namespace subprocess.

    Returns {block_index: error} for failures ('' = ok). On a hang, the block
    running at the timeout is reported and later blocks marked not-run.
    """
    if not blocks:
        return {}
    env = dict(os.environ, PYTHONPATH=str(SIM), MPLBACKEND="Agg")
    try:
        r = subprocess.run(
            [sys.executable, "-c", RUNNER],
            input=json.dumps(blocks), capture_output=True, text=True,
            timeout=LAB_TIMEOUT, env=env, cwd=str(SIM),
        )
        out = r.stdout
        timed_out = False
    except subprocess.TimeoutExpired as e:
        out = (e.stdout or b"").decode() if isinstance(e.stdout, bytes) else (e.stdout or "")
        timed_out = True

    results: dict[int, str] = {}
    running = None
    for line in out.splitlines():
        if line.startswith("@@RUN "):
            running = int(line.split()[1])
        elif line.startswith("@@OK "):
            results[int(line.split()[1])] = ""
            running = None
        elif line.startswith("@@STEP "):
            results[int(line.split()[1])] = ""
            running = None
        elif line.startswith("@@FAIL "):
            _, idx, *msg = line.split(maxsplit=2)
            results[int(idx)] = msg[0] if msg else "failed"
            running = None
    if timed_out and running is not None:
        results[running] = f"still running at the {LAB_TIMEOUT}s lab timeout"
    for i, _, _e in blocks:
        results.setdefault(i, "not run (earlier block hung)" if timed_out else "no result")
    return results


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run-shell", action="store_true")
    ap.add_argument("-v", "--verbose", action="store_true")
    ap.add_argument("--only", help="substring filter on file names")
    args = ap.parse_args()

    qs_names = known_quadsim_names()
    files = sorted((HERE / "labs").glob("*.html")) + sorted((HERE / "slides").glob("*.html"))
    if args.only:
        files = [f for f in files if args.only in f.name]

    failures: list[str] = []
    counts = {"shell": 0, "script": 0, "fragment": 0, "text": 0,
              "skip-dep": 0, "ok": 0, "fail": 0}

    # Names bound by any python block of each file, keyed by weekNN — a slide
    # deck may use a helper its lab sheet defines (e.g. hover_err), and vice
    # versa, so the two files of one week share static context.
    week_bound: dict[str, set[str]] = {}
    for f in files:
        wk = f.name[:6]
        for raw in PRE_RE.findall(f.read_text()):
            code = strip_block(raw)
            if classify(code) in ("script", "fragment"):
                try:
                    b, _ = names_of(code)
                    week_bound.setdefault(wk, set()).update(b)
                except SyntaxError:
                    pass

    for f in files:
        rel = str(f.relative_to(HERE))
        blocks = [strip_block(b) for b in PRE_RE.findall(f.read_text())]
        kinds = [classify(c) for c in blocks]

        # Pass 1 — collect per-file context. Labs are written as incremental
        # step snippets followed by an assembled checkpoint block, so a name a
        # step loads may be bound in a *later* block: collect names bound by
        # ANY python block of the file, plus files the lab has the student
        # create.
        bound_all: set[str] = set(week_bound.get(f.name[:6], set()))
        created_files: set[str] = set()
        for code, kind in zip(blocks, kinds):
            if kind in ("script", "fragment"):
                try:
                    b, _ = names_of(code)
                    bound_all |= b
                except SyntaxError:
                    pass
                m = STUDENT_FILE_RE.match(code)
                if m:
                    created_files.add(m.group(1))

        # Pass 2 — run script blocks (cumulative), skipping heavy-dep ones.
        runnable, skipdep = [], set()
        for i, (code, kind) in enumerate(zip(blocks, kinds), 1):
            if kind != "script":
                continue
            if any(re.search(rf"\b{d}\b", code) for d in OPTIONAL_DEPS):
                skipdep.add(i)
            else:
                runnable.append((i, code, sorted(bound_all)))
        script_results = run_scripts(runnable)

        # Pass 3 — judge every block.
        for i, (code, kind) in enumerate(zip(blocks, kinds), 1):
            counts[kind] += 1
            tag = f"{rel}#{i}"
            errs: list[str] = []

            if kind == "text":
                continue
            elif kind == "shell":
                for line in code.splitlines():
                    line = line.strip().lstrip("$ ").strip()
                    m = re.match(r"python3?\s+([\w./-]+\.py)", line)
                    if not m:
                        continue
                    path = m.group(1)
                    if (SIM / path).exists() or (HERE / path).exists() or path in created_files:
                        if args.run_shell and (SIM / path).exists():
                            env = dict(os.environ, PYTHONPATH=str(SIM), MPLBACKEND="Agg")
                            try:
                                r = subprocess.run(
                                    [sys.executable, path, *line.split()[2:]],
                                    capture_output=True, text=True, timeout=300,
                                    env=env, cwd=str(SIM))
                                if r.returncode != 0:
                                    errs.append(f"`{line}` exited {r.returncode}")
                            except subprocess.TimeoutExpired:
                                errs.append(f"`{line}` timed out")
                    else:
                        errs.append(f"referenced file missing: {path}")
            elif kind == "fragment":
                errs = check_quadsim_refs(code)
                _, loaded = names_of(code)
                missing = loaded - bound_all - CONTEXT_NAMES - qs_names
                if missing:
                    errs.append(f"undefined context names: {sorted(missing)}")
            elif kind == "script":
                if i in skipdep:
                    counts["skip-dep"] += 1
                    errs = check_quadsim_refs(code)
                else:
                    msg = script_results.get(i, "")
                    if msg:
                        errs = [msg]

            if errs:
                counts["fail"] += 1
                failures.append(tag)
                print(f"✗ {tag} [{kind}]")
                for e in errs:
                    print(f"    - {e}")
            else:
                counts["ok"] += 1
                if args.verbose:
                    print(f"✓ {tag} [{kind}]")

    print(
        f"\nblocks: shell={counts['shell']} script={counts['script']} "
        f"(skip-dep={counts['skip-dep']}) fragment={counts['fragment']} "
        f"text={counts['text']} → ok={counts['ok']} fail={counts['fail']}"
    )
    if failures:
        print(f"\n{len(failures)} failing block(s).")
        return 1
    print("all verified ✅")
    return 0


if __name__ == "__main__":
    sys.exit(main())
