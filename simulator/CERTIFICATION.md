# MLTE03 — Final Project: Certification Specification

> How the final project is verified, and — new this term — **why it's done this
> way**: this document is itself the course's worked example of specification-based
> certification, the practice that decides whether a real flight-control system is
> allowed to fly. Companion to [[course-outline]], [[lab-plan]], and
> `final-project-assessment.md` (the grade composition and viva). Published to
> students at the Week 10 kickoff.

---

## 1. The concept: certification, not demonstration

Two different questions sound similar and are not:

- **"Does it work?"** — you ran it once, it looked fine, you believe it.
- **"Is it certified?"** — it was run against a written specification, by a
  procedure anyone can repeat, and every requirement has a recorded pass/fail
  with evidence.

Real flight software is never accepted on the first kind of answer. DO-178C
(civil avionics software), ISO 26262 (automotive), MIL-STD test plans — different
industries, same shape: a **requirement** (what must be true), a **verification
method** (how you check it — test, analysis, inspection, or demonstration), and
**evidence** (the record that it passed). The chain from requirement to evidence
is called **traceability**, and it is the entire discipline in one word: every
requirement traces to a test, every test produces evidence, and nothing ships on
"it worked when I ran it."

This project puts you on the other side of that process for the first time. You
will not fly live in front of the room hoping it goes well. You will **submit**
your controller, it will be run **once, by the same script, against your own
vehicle** (§2a — every student's numbers are different), and the result is a
certification report — PASS or FAIL, per requirement, by ID. That report is not
a formality bolted onto the grade; it *is* the primary evidence your project
report analyses.

**What this changes, concretely:**
- No live in-class flight demo. Your controller is tested by `certify.py`
  (§3) before Week 15; the report is generated once, automatically, from your
  submitted code, against your own vehicle (§2a).
- **The final project is individual, not team.** (Week 10's team case study —
  the reality-gap workshop on a hidden `TeamPlant` — stays team-based.) Everyone
  builds their own MPC upgrade, on their own vehicle, and is graded on their
  own certification report.
- The certification report's PASS/FAIL table is a **required section** of your
  written report — not a courtesy appendix. You are expected to discuss *why*
  a requirement failed if one did, not just report the number.
- Week 15 becomes individual vivas only (§4) — the certification evidence has
  already been produced by the time the session starts.

## 2. The mission

**Your project mission is M3 — the payload drop.** One mission, and everyone
flies it — but not the same vehicle (§2a). You are not choosing a research
problem; you are learning to run a process, and the mission is deliberately
small enough that the process is the hard part.

**M3 — Payload drop.** The quadrotor holds position at `[0, 0, 1.5]`. At t = 5 s
its mass steps from 0.65 kg to 0.45 kg — a package released. **Your controller is
never told.** It has one continuous instance for the whole flight and has to
notice and correct the resulting climb through feedback alone, exactly as a real
flight computer would. 15 s total, three requirements (§4).

Here is the entire project, in one before-and-after:

```
BASELINE — your Week-9 cascade PID                UPGRADE — the same loop with MPC
=== M3 (seed 0) — NOT CERTIFIED ===               === M3 (seed 0) — CERTIFIED ===
  [FAIL] REQ-M3-1  max dev < 0.50 m                 [PASS] REQ-M3-1  max dev < 0.50 m
         max = 0.540 m                                     max = 0.473 m
  [PASS] REQ-M3-2  transient < 0.50 m               [PASS] REQ-M3-2  transient < 0.50 m
  [PASS] REQ-M3-3  tail RMSE < 0.50 m               [PASS] REQ-M3-3  tail RMSE < 0.50 m
```

Those are real numbers from the course's own reference controllers. The classical
baseline fails **exactly one** requirement — it recovers from the mass step, just
not tightly enough — and the MPC upgrade fixes that one and holds the other two.
Your job is to walk that loop yourself: certify your baseline, see the red line,
change the controller, certify again, and explain *why* the number moved.

### 2a. Your vehicle is not your neighbour's

`certify.py --student <your ID>` derives a **unique quadcopter** for you —
mass, arm length, yaw-torque ratio, inertia — deterministically from your
student ID (`quadsim/student_params.py`). Same ID, same vehicle, every time,
on any machine; a different ID never produces the same numbers. Two students
can compare MPC theory, even read each other's code, but a controller tuned
to close REQ-M3-1 on one student's vehicle does not simply drop into
another's and pass — the mass step that made the baseline marginal for you is
not the mass step that made it marginal for them.

```bash
python -m quadsim.student_params S12345678     # see YOUR numbers before you fly
python certify.py --controller quadsim.controllers.student:StudentController \
    --student S12345678 --mission M3
```

The numbers in the before-and-after table above are the **course default
vehicle** (`QuadParams()`, no `--student` flag) — the one used in lectures and
demos so everyone sees the same worked example. **Your own report must use
your own numbers**, from a run with your own `--student` flag. They will not
match the table above exactly, and they are not supposed to: your baseline
still fails REQ-M3-1, your MPC upgrade still fixes it, but the margins are
yours.

*(The parameter ranges were swept against 200 synthetic student IDs before
this went live — every one produces exactly this teaching loop: the reference
`CascadePID` fails REQ-M3-1, the reference `LinearMPC` certifies fully. If
your run doesn't fit that pattern with either reference controller, something
is wrong with your setup — flag it, don't just report it as-is.)*

### The other missions in the harness

`certify.py` also runs **M4** (constrained corridor), **M1** (gust hold) and
**M2** (aggressive figure-eight). None is a project mission.

- **M4 is your warm-up.** Your Week-9 controller should already certify it. Run it
  in Week 11 to see a green report before you go looking for a red one.
- **M1 and M2 cannot be certified by anyone**, and that is deliberate. REQ-M2-1
  demands tracking RMSE below 0.15 m, but the loop closes on the **estimated**
  state and the estimator's own position error on that trajectory is **0.147 m
  RMSE** — a controller tracking its estimate perfectly would still miss the truth
  by about that much. The requirement asks you to fly more accurately than you can
  perceive. That is a defect in the *requirement*, not in any controller:

  | | M2 tracking RMSE | vs the 0.15 m bar |
  |---|---|---|
  | **Estimation noise floor** | **0.147 m** | the hard physical limit |
  | Best tuned `LinearMPC` | 0.258 m | 1.7× over |
  | `CascadePID` baseline | 0.464 m | 3.1× over |

  Requirements review — checking that a requirement is *verifiable at all* before
  anyone writes a test for it — is part of certification, not a preliminary to it.
  M1 and M2 are your worked example, and viva question B8 asks you to make this
  argument yourself.

  *(Found on 2026-08-25 while adding the `--seed` flag. The bars were set so the
  classical baseline would fail them, which they do, but were never checked
  against what any controller could achieve on estimated state. Documented rather
  than quietly deleted, because the mistake teaches more than its absence.)*

## 3. The certification harness — `certify.py`

```bash
# from the simulator/ directory — --student is required for the graded run (see §2a)
python certify.py --controller quadsim.controllers.student:StudentController --student S12345678 --mission M1
python certify.py --controller quadsim.controllers.student:StudentController --student S12345678 --mission all
python certify.py --controller quadsim.controllers.student:StudentController --student S12345678 --mission M3 --seed 4

# explore how much the sensor-noise draw matters (section 6) — not graded
python certify.py --controller quadsim.controllers.student:StudentController --student S12345678 --mission M3 --seeds 0,1,2
```

`--controller` is `module.path:ClassName` — wherever your submitted controller
lives, importable from the `simulator/` directory. Every mission closes the loop
on the **estimated** state (`EstimatedStateController` wraps your submission —
the Week 8 rule still applies: no ground-truth shortcut), runs on **your own vehicle**
(`--student <ID>`, §2a), and prints a report naming every requirement by ID.

`--seed` (default 0) sets the estimator's sensor-noise sequence. It is not a
cosmetic knob — **the seed is part of the experiment**, and one run is one
sample. §6 shows the reference controller's M3 verdict flipping between
CERTIFIED and NOT CERTIFIED on seed alone; read it before you report any single
result. Example report:

```
=== M1 (seed 0) — NOT CERTIFIED ===
  [FAIL] REQ-M1-1  Position RMSE under gust < 0.25 m
         rmse = 0.466 m
  [FAIL] REQ-M1-2  Max instantaneous error < 0.60 m
         max = 0.774 m
  [PASS] REQ-M1-3  Max tilt < 30 deg (never near inversion)
         max tilt = 12.1 deg
```

This is the actual reference-controller (`CascadePID`) output on M1 — included
here deliberately — it is what a report you have to *act on* actually looks
like. On the project mission **M3** the same baseline fails exactly one
requirement (REQ-M3-1) and passes the other two, which is the gap your MPC
upgrade closes (§2). On **M4** it certifies outright — run that one first for a
green report. M1 and M2 it cannot certify, and neither can anything else (§2).

**Run it against your own baseline before you build anything new.** Knowing
exactly which requirements your classical controller fails — and by how much —
is the first entry in your report's evidence chain, and it is free: the same
command that certifies your final submission also certifies your Week 4–9
baseline. `--json out.json` writes the same result as structured data if you
want to script your own comparison tables.

**Accept a `ref_fn` parameter if you want preview.** On the two
moving-target missions (M2, M4), `certify.py` inspects your controller's
constructor and — if it declares a `ref_fn` parameter, the same convention
`quadsim.controllers.mpc.LinearMPC` already uses — hands it the mission's real
`t -> {"pos", "yaw"}` reference function, exactly as you would wire it for
that mission yourself. A controller with no `ref_fn` parameter (your PID baseline,
for instance) is unaffected either way. This matters: **MPC's whole structural
advantage over PID on a moving target is anticipating where the reference is
going**, and a controller built without a lookahead channel is being tested
with that advantage switched off. Course numbers, to make the size of the
effect concrete — same `LinearMPC`, same M2, only the presence of `ref_fn`
changes:

| | Tracking RMSE (REQ-M2-1, bar &lt; 0.15 m) |
|---|---|
| `LinearMPC(p)` — no preview | 1.317 m |
| `LinearMPC(p, ref_fn=...)` — with preview | 0.364 m (beats the PID baseline's 0.464 m) |

If your MPC controller's `__init__` doesn't already take `ref_fn`, add it —
otherwise you are certifying a controller with its main technique disabled.

## 4. Full requirements list (as implemented in `certify.py`)

> **M3 is the project mission; M4 is the ungraded warm-up.** M1 and M2 are listed for completeness and
> for the Week-11 requirements-review exercise — their bars are not achievable (§2).

### M1 — Disturbance-rejection hold *(demonstration only — bar unreachable, §2)*
20 s hover at `[0, 0, 1.5]` under a gust `wind(t) = [0.4 sin(0.3t), 0.3 cos(0.2t), 0]` N.

| ID | Requirement | Threshold |
|---|---|---|
| REQ-M1-1 | Position RMSE over the full run | < 0.25 m |
| REQ-M1-2 | Max instantaneous position error at any timestep | < 0.60 m |
| REQ-M1-3 | Max tilt angle throughout (never near inversion) | < 30° |

### M2 — Aggressive trajectory tracking *(demonstration only — bar below the estimation floor, §2)*
Figure-eight, `a=1.5 m, b=1.0 m, height=1.5 m, period=6 s` (tighter and faster
than the Week 9 course-standard figure-eight), 2 full periods.

| ID | Requirement | Threshold |
|---|---|---|
| REQ-M2-1 | Tracking RMSE over 2 periods | < 0.15 m |
| REQ-M2-2 | Max tracking error at any timestep (bounded, no divergence) | < 2.0 m |

### M3 — Payload drop *(project mission)*
Hover at `[0, 0, 1.5]`; mass steps 0.65 kg → 0.45 kg at t = 5 s; 15 s total.
**Your controller is never told the mass changed** — it has one continuous
instance for the whole flight, and has to notice and correct the resulting
error via feedback, the same way a real flight computer would (it doesn't get
handed an updated mass model mid-air). A controller with no real feedback
loop — fixed thrust, no position/velocity correction — over-thrusts by
`(0.65-0.45)*g ≈ 2 N` after the drop and climbs away unrecovered.

| ID | Requirement | Threshold |
|---|---|---|
| REQ-M3-1 | Max deviation across the entire post-drop window | < 0.50 m |
| REQ-M3-2 | Max transient deviation in the first 3 s after the drop | < 0.50 m |
| REQ-M3-3 | Position RMSE in the last 5 s of the run | < 0.50 m |

### M4 — Constrained corridor *(ungraded warm-up)*
Rectangular route `(0,0)→(2,0)→(2,2)→(0,2)` at 1.5 m altitude, 0.5 m/s.

| ID | Requirement | Threshold |
|---|---|---|
| REQ-M4-1 | Max lateral deviation from the nearest route segment, at every timestep | < 0.30 m |
| REQ-M4-2 | Final position error from the last waypoint | < 0.20 m |

## 5. What "improvement over baseline" adds on top

Certification is binary — PASS or FAIL against a fixed bar, the same for every
student on the same vehicle. It is not a comparison. Your report's central
claim is comparative: *"our baseline fails REQ-M3-1 at 0.540 m; our MPC
upgrade certifies at 0.473 m, because [mechanism]."* Run `certify.py --student
<your ID>` on **both** your frozen baseline (Week 12) and your final
submission, on the same mission, and report both numbers side by side — the
certification report is the raw material; the comparison is the argument you
build from it.

## 6. One PASS is not evidence — the seed is part of the experiment

Your controller does not fly on the truth. `certify.py` closes the loop on the
**estimated** state, and that estimate comes from simulated sensors driven by a
seeded noise generator. Change the seed and you change the disturbance history
your controller actually faced. **A single run is a single sample.**

This is not a hypothetical, and it is not a problem that only afflicts fancy
methods. Here is the course's own reference `CascadePID` — no learning, no
randomness anywhere in the controller itself, fully deterministic given its
input — run against **M3** on eight different estimator seeds:

| Seed | REQ-M3-1 (max deviation, bar &lt; 0.50 m) | M3 overall |
|---|---|---|
| **0** *(the graded seed)* | **0.540 m** | **NOT CERTIFIED** |
| 1 | 0.721 m | **NOT CERTIFIED** |
| 2 | 0.211 m | CERTIFIED |
| 3 | 0.278 m | CERTIFIED |
| 4 | 0.255 m | CERTIFIED |
| 5 | 0.388 m | CERTIFIED |
| 6 | 0.277 m | CERTIFIED |
| 7 | 0.306 m | CERTIFIED |

Read that table carefully, because it contains three lessons and one warning:

1. **The verdict flips.** Same controller, same mission, same threshold — seed 1
   misses by 44%, seed 2 passes with room to spare. Anyone reporting a single run
   has reported a coin toss, not a result.
2. **The spread is 3.4×.** 0.211 m to 0.721 m. A controller is characterized by
   its distribution, not its best day.
3. **The typical case can hide the bad case.** The baseline certifies on 6 of
   these 8 seeds. If you sampled three at random you would probably conclude it
   passes comfortably — and you would be wrong about the tail that matters.

⚠️ **The warning, stated plainly because it applies to your own project:** seed 0
is one of the two seeds the baseline fails. Your Week-9 controller is therefore
graded on a draw that is harder than typical for it. That is a deliberate choice
— a fixed seed keeps the process identical for every student and keeps the project
about the process — but it means "our baseline failed" is a claim about *this
seed*, and your report should say so rather than concluding your controller is
worse than it is.

**What this means for your project.** You are **graded on seed 0** — one
command, one report, run against your own vehicle:

```bash
python certify.py --controller mypkg:MyController --student <your ID> --mission M3
```

Keeping grading on a single fixed seed is a deliberate simplification: it makes
the bar identical for everyone and keeps the project about the *process*. But it
does not make the variance go away, so your report must acknowledge it. Run the
sweep once and say what you found:

```bash
python certify.py --controller mypkg:MyController --student <your ID> --mission M3 --seeds 0,1,2
```

One sentence in the report — *"our margin on REQ-M3-1 is 0.47 m on the graded
seed, but ranges 0.21–0.72 m across seeds 0–2, so we would not claim a robust
pass"* — is worth more than a page of tuning narrative, and it is the honest
version of the claim.

Report the **spread**, not the best and not the first — `final-project-assessment.md`
§3 grades on seed 0 and requires one sentence reporting the spread over seeds 0–2
for exactly this reason. "Certifies on the graded seed at 0.47 m, worst case 0.72 m across
seeds 0-2" is a stronger and more honest claim than "CERTIFIED", and it is the
claim a real certification authority would ask you for. "It certified" — on the one run
you happened to submit — is the §1 failure mode with a different costume on: a
demonstration that happened to succeed.

> **Instructor's note, in the interest of practising what this section preaches:**
> the M3 thresholds in §4 were calibrated against seed-0 runs. Seed 0 turns out
> to be an unfavourable draw, so those thresholds are slightly more forgiving of
> typical behaviour than they look. This was found by running the experiment this
> section tells you to run — which is the point.

## 7. Reference: DR/quality-of-evidence checklist

Before you submit, `certify.py --student <your ID> --mission all` should have run cleanly (no
crashes — a crashed run is not evidence of anything) and its output pasted
verbatim into your report's evidence section, not paraphrased or summarised.
If a requirement fails, say so and explain why — a well-diagnosed failure is
worth more than a silently-omitted one; see `final-project-assessment.md` for
how failed-but-understood results are marked.

---

© 2026 Dr Ken Lai（黎子健）. Licensed under [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) — free to use and adapt for non-commercial teaching, with attribution.
