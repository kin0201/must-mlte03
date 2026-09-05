#!/usr/bin/env python3
# Copyright (c) 2026 Dr Ken Lai (黎子健).
# Licensed under CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
# MLTE03 — Flight Dynamics and Intelligent Control Technologies, MUST.
"""certify.py — the final-project certification harness.

Runs a submitted controller against one mission's written specification
(see CERTIFICATION.md) and prints a pass/fail report naming every requirement
by ID. This is what "submit for certification" means concretely: the same
script, the same thresholds, run once per STUDENT, producing evidence rather
than a live-demo impression.

The final project is INDIVIDUAL. Pass --student <your ID> and every mission
runs against YOUR OWN vehicle — a different mass, arm length, k_torque and
inertia, derived deterministically from your ID (quadsim/student_params.py).
The same ID always reproduces the same vehicle; a different ID never does.
Two students can discuss MPC theory and even read each other's code, but a
controller tuned against one student's numbers does not just drop into
another's.

Usage
-----
    # the graded command for the final project — mission M3, YOUR vehicle, estimator seed 0
    python certify.py --controller quadsim.controllers.student:StudentController --student S12345678 --mission M3

    python certify.py --controller quadsim.controllers.student:StudentController --student S12345678 --mission M4   # warm-up
    python certify.py --controller quadsim.controllers.student:StudentController --student S12345678 --mission M3 --seeds 0,1,2
    python certify.py --controller quadsim.controllers.cascade_pid:CascadePID --mission M3 --json out.json   # course default vehicle, no --student

M3 is the project mission and M4 an ungraded warm-up. M1 and M2 still run, but
their bars are NOT achievable by any controller (REQ-M2-1 asks for 0.15 m
tracking RMSE against a 0.147 m estimation floor) — they exist as the Week-11
requirements-review example. See CERTIFICATION.md section 2.

--controller takes "module.path:ClassName", importable from this directory
(matches how the rest of the course names things — see examples/02_hover_pid.py).
The class is instantiated with the default QuadParams and must implement the
standard Controller interface (control(t, x, ref) -> wrench[4]; see
quadsim/controllers/base.py). Flight is always closed on the ESTIMATED state
(quadsim.estimators.EstimatedStateController wraps whatever you submit) —
matching the Week 8 "fly on your own estimate" rule; there is no ground-truth
shortcut here.

Exit code 0 = every requirement for the selected mission(s) passed; 1 = at
least one failed. Use that in a script; read the report for *why*.
"""
from __future__ import annotations

import argparse
import importlib
import inspect
import json
import sys
from dataclasses import dataclass, field
from typing import Callable

import numpy as np

from quadsim import Simulator, QuadParams
from quadsim import trajectories as traj
from quadsim.dynamics import hover_state
from quadsim.estimators import EstimatedStateController, INSGPS
from quadsim.student_params import student_vehicle
from quadsim.sim import SimLog


def load_controller(spec: str, params: QuadParams, ref_fn: Callable = None):
    """spec = 'module.path:ClassName' -> an instantiated Controller.

    On a moving-reference mission (M2, M4), `ref_fn` is the mission's own
    t -> {"pos", "yaw"} function. If the controller's constructor declares a
    `ref_fn` parameter (the course's existing convention — see
    quadsim/controllers/mpc.py's LinearMPC), it is handed the REAL mission
    trajectory so the controller can preview it, exactly as a team's own
    submission would when built for that mission. Without this, ANY
    preview-capable controller (MPC above all) is silently evaluated with no
    lookahead — its main structural advantage over PID — which does not
    measure "the controller," it measures "the controller minus the one
    thing that makes it the right tool for a moving-target mission." A
    controller with no `ref_fn` parameter (PID, a plain RL policy) is
    unaffected either way — it never had a lookahead channel to lose.
    """
    if ":" not in spec:
        raise SystemExit(f"--controller must be 'module.path:ClassName', got {spec!r}")
    module_name, cls_name = spec.split(":", 1)
    mod = importlib.import_module(module_name)
    cls = getattr(mod, cls_name)
    if ref_fn is not None and "ref_fn" in inspect.signature(cls.__init__).parameters:
        return cls(params, ref_fn=ref_fn)
    return cls(params)


def concat_logs(a: SimLog, b: SimLog) -> SimLog:
    """Stitch two SimLogs end to end (b's clock is shifted to continue a's)."""
    dt = a.t[1] - a.t[0] if len(a.t) > 1 else b.t[1] - b.t[0]
    return SimLog(
        t=np.concatenate([a.t, b.t + a.t[-1] + dt]),
        x=np.concatenate([a.x, b.x]),
        u=np.concatenate([a.u, b.u]),
        ref=np.concatenate([a.ref, b.ref]),
        f=np.concatenate([a.f, b.f]),
    )


@dataclass
class Req:
    id: str
    desc: str
    passed: bool
    detail: str


@dataclass
class MissionResult:
    mission: str
    reqs: list = field(default_factory=list)
    seed: int = 0
    seeds: list = None          # set when the result folds a multi-seed sweep

    @property
    def passed(self) -> bool:
        return all(r.passed for r in self.reqs)


def check(req_id, desc, cond, detail):
    return Req(req_id, desc, bool(cond), detail)


# --------------------------------------------------------------------------- M1
def run_m1(controller_spec: str, seed: int = 0, vehicle=None) -> MissionResult:
    """Disturbance-rejection hold: 20s hover under a time-varying gust."""
    p = vehicle.p_heavy if vehicle else QuadParams()
    ctrl = EstimatedStateController(load_controller(controller_spec, p), p,
                                   estimator=INSGPS(p=p, seed=seed))
    target = np.array([0.0, 0.0, 1.5])

    def ref(t):
        return {"pos": target, "yaw": 0.0}

    def gust(t):
        return np.array([0.4 * np.sin(0.3 * t), 0.3 * np.cos(0.2 * t), 0.0])

    log = Simulator(p).run(hover_state(target), ctrl, reference=ref, t_final=20.0, wind=gust)
    err = np.linalg.norm(log.position - target, axis=1)
    rmse = log.position_rmse(target)
    max_err = float(np.max(err))
    max_tilt = float(np.max(np.abs(np.degrees(log.euler[:, :2]))))

    r = MissionResult("M1", seed=seed)
    r.reqs = [
        check("REQ-M1-1", "Position RMSE under gust < 0.25 m", rmse < 0.25, f"rmse = {rmse:.3f} m"),
        check("REQ-M1-2", "Max instantaneous error < 0.60 m", max_err < 0.60, f"max = {max_err:.3f} m"),
        check("REQ-M1-3", "Max tilt < 30 deg (never near inversion)", max_tilt < 30.0, f"max tilt = {max_tilt:.1f} deg"),
    ]
    return r


# --------------------------------------------------------------------------- M2
def run_m2(controller_spec: str, seed: int = 0, vehicle=None) -> MissionResult:
    """Aggressive trajectory tracking: tight, fast figure-eight."""
    p = vehicle.p_heavy if vehicle else QuadParams()
    ref_fn = traj.figure_eight(a=1.5, b=1.0, height=1.5, period=6.0)
    ctrl = EstimatedStateController(load_controller(controller_spec, p, ref_fn=ref_fn), p,
                                   estimator=INSGPS(p=p, seed=seed))
    log = Simulator(p).run(hover_state([0, 0, 1.5]), ctrl, reference=ref_fn, t_final=12.0)

    err = np.linalg.norm(log.position - log.ref, axis=1)
    rmse = float(np.sqrt(np.nanmean(err ** 2)))
    max_err = float(np.nanmax(err))

    r = MissionResult("M2", seed=seed)
    r.reqs = [
        check("REQ-M2-1", "Tracking RMSE < 0.15 m over 2 periods", rmse < 0.15, f"rmse = {rmse:.3f} m"),
        check("REQ-M2-2", "No excursion > 2.0 m (bounded, no divergence)", max_err < 2.0, f"max = {max_err:.3f} m"),
    ]
    return r


# --------------------------------------------------------------------------- M3
def run_m3(controller_spec: str, seed: int = 0, vehicle=None) -> MissionResult:
    """Payload drop: mass steps from 0.65 kg to 0.45 kg at t=5s.

    The controller is constructed ONCE, with the pre-drop mass (0.65 kg) as
    its onboard estimate, and that same instance flies both segments with no
    reset in between — a real flight controller never gets reconstructed
    mid-flight with a freshly-updated mass, and doesn't get told the payload
    left. It has to notice via position/velocity error, the same way it
    would notice any other unmodeled disturbance. Only the SIMULATOR's
    physics uses the true post-drop mass for segment 2 (p_light) — the
    controller's own p.mass / p.weight, if it reads them, stays stale at the
    heavy value throughout, exactly as a real controller's mass estimate
    would. A controller with no real feedback (fixed thrust = its own
    p.weight, no position/velocity correction) now over-thrusts by
    (0.65-0.45)*g =~ 2 N after the drop and climbs away unrecovered; a
    controller that actually senses and corrects position/velocity error
    rejects the disturbance regardless of what it believes the mass is.
    """
    if vehicle:
        p_heavy, p_light = vehicle.p_heavy, vehicle.p_light
    else:
        p_heavy = QuadParams(mass=0.65)
        p_light = QuadParams(mass=0.45)
    target = np.array([0.0, 0.0, 1.5])

    def ref(t):
        return {"pos": target, "yaw": 0.0}

    ctrl = EstimatedStateController(load_controller(controller_spec, p_heavy), p_heavy,
                                   estimator=INSGPS(p=p_heavy, seed=seed))
    seg1 = Simulator(p_heavy).run(hover_state(target), ctrl, reference=ref, t_final=5.0)

    # Simulator.run() always starts ITS OWN local clock at t=0 on every call, so
    # segment 2 would otherwise hand EstimatedStateController a first step where
    # t=0 but ctrl._t_prev is still ~5.0 (segment 1's local end time), computing
    # dt = max(0 - 5.0, 1e-6) — a corrupted near-zero dt right at the disturbance
    # boundary. Clear ONLY that stale timing bookkeeping — not a full reset(),
    # which would also wipe the estimator's belief state and the base
    # controller's integrators, defeating the point of a continuous flight.
    ctrl._t_prev = None

    # IMU.read() (quadsim/sensors.py) synthesizes the accelerometer reading via
    # state_derivative(x, u, self.p) — i.e. from the *model*, using whatever p
    # the estimator was built with, not from the simulator's true resulting
    # dynamics. A real accelerometer has no such dependency: it measures actual
    # specific force regardless of what the flight computer believes its own
    # mass is. Left uncorrected, the "sensor" inherits the controller's stale
    # mass belief too, so it silently under-reports the post-drop acceleration
    # and every controller — however good — looks equally, catastrophically
    # blind (verified: CascadePID, LinearMPC and the RL policy all diverged to
    # z=50-90m identically before this fix, which was itself the tell that the
    # bug was upstream of any individual controller's logic). Point the sensor
    # model at the TRUE post-drop mass; leave ctrl.base's own self.p (the
    # controller's belief, used by e.g. CascadePID's T = p.mass*(...) law)
    # untouched at p_heavy — that staleness is the actual, intended test.
    ctrl.est.p = p_light
    ctrl.est.imu.p = p_light

    seg2 = Simulator(p_light).run(seg1.x[-1], ctrl, reference=ref, t_final=10.0)
    log = concat_logs(seg1, seg2)

    post = log.t >= 5.0
    err_post = np.linalg.norm(log.position[post] - target, axis=1)
    t_post = log.t[post] - 5.0

    # REQ-M3-1 used to be a "last moment above tolerance" recovery-time metric.
    # That framing assumes a controller that oscillates settles monotonically
    # towards the tolerance band; a controller correcting a permanent, un-modeled
    # ~30% mass mismatch with no a-priori knowledge of it instead tends to reach
    # a bounded limit-cycle-like oscillation that keeps grazing back above a tight
    # band, making "the last crossing" read as "never recovered" even when the
    # response is small and controlled throughout. A straightforward bound on
    # the worst deviation anywhere in the post-drop window is a more robust
    # test of the same thing (does it stay under control) and doesn't have that
    # failure mode.
    max_transient = float(np.max(err_post[t_post < 3.0])) if np.any(t_post < 3.0) else float("inf")
    max_post_drop = float(np.max(err_post)) if len(err_post) else float("inf")
    tail = err_post[t_post >= 5.0]
    tail_rmse = float(np.sqrt(np.mean(tail ** 2))) if len(tail) else float("inf")

    r = MissionResult("M3", seed=seed)
    r.reqs = [
        check("REQ-M3-1", "Max deviation across the full post-drop window < 0.50 m", max_post_drop < 0.50, f"max = {max_post_drop:.3f} m"),
        check("REQ-M3-2", "Transient deviation < 0.50 m in the first 3 s", max_transient < 0.50, f"max transient = {max_transient:.3f} m"),
        check("REQ-M3-3", "Post-recovery RMSE < 0.50 m (last 5 s)", tail_rmse < 0.50, f"tail rmse = {tail_rmse:.3f} m"),
    ]
    return r


# --------------------------------------------------------------------------- M4
def run_m4(controller_spec: str, seed: int = 0, vehicle=None) -> MissionResult:
    """Constrained corridor: rectangular route, hard lateral-deviation bound."""
    p = vehicle.p_heavy if vehicle else QuadParams()
    corners = [[0, 0, 1.5], [2, 0, 1.5], [2, 2, 1.5], [0, 2, 1.5]]
    ref_fn = traj.waypoints(corners, speed=0.5, hold=0.5)
    ctrl = EstimatedStateController(load_controller(controller_spec, p, ref_fn=ref_fn), p,
                                   estimator=INSGPS(p=p, seed=seed))
    log = Simulator(p).run(hover_state(corners[0]), ctrl, reference=ref_fn, t_final=40.0)

    def lateral_deviation(pos, segs):
        segs = np.asarray(segs, float)
        best = np.full(len(pos), np.inf)
        for i in range(len(segs) - 1):
            a, b = segs[i], segs[i + 1]
            ab = b - a
            L2 = np.dot(ab, ab)
            if L2 < 1e-9:
                continue
            t = np.clip(((pos - a) @ ab) / L2, 0.0, 1.0)
            proj = a + np.outer(t, ab)
            d = np.linalg.norm(pos - proj, axis=1)
            best = np.minimum(best, d)
        return best

    valid = ~np.isnan(log.ref[:, 0])
    dev = lateral_deviation(log.position[valid], corners)
    max_dev = float(np.max(dev)) if len(dev) else float("nan")
    final_err = float(np.linalg.norm(log.position[-1] - np.array(corners[-1])))

    r = MissionResult("M4", seed=seed)
    r.reqs = [
        check("REQ-M4-1", "Never exceeds 0.30 m lateral deviation from the corridor", max_dev < 0.30, f"max deviation = {max_dev:.3f} m"),
        check("REQ-M4-2", "Reaches within 0.20 m of the final waypoint", final_err < 0.20, f"final error = {final_err:.3f} m"),
    ]
    return r


MISSIONS: dict[str, Callable[..., MissionResult]] = {"M1": run_m1, "M2": run_m2, "M3": run_m3, "M4": run_m4}


def run_mission_over_seeds(mission: str, controller_spec: str, seeds: list[int], vehicle=None) -> MissionResult:
    """Run one mission across several estimator seeds and fold the runs into a
    single WORST-CASE result.

    The loop closes on estimated state, so the sensor-noise seed is part of the
    experiment: one run is one sample (CERTIFICATION.md section 6 — the reference
    CascadePID certifies M3 on 7 of 8 seeds and fails the eighth). A requirement
    therefore counts as met only if it holds on EVERY seed tried; a single
    favourable draw does not certify anything.
    """
    runs = [MISSIONS[mission](controller_spec, seed=s, vehicle=vehicle) for s in seeds]
    folded = MissionResult(mission, seed=seeds[0])
    folded.seeds = list(seeds)
    for i, proto in enumerate(runs[0].reqs):
        per_seed = [(s, r.reqs[i]) for s, r in zip(seeds, runs)]
        failed = [(s, q) for s, q in per_seed if not q.passed]
        detail = " · ".join(f"seed {s}: {q.detail}" for s, q in per_seed)
        if failed:
            detail += f"  <- FAILS on seed(s) {', '.join(str(s) for s, _ in failed)}"
        folded.reqs.append(Req(proto.id, proto.desc, not failed, detail))
    return folded


def report(results: list[MissionResult]) -> bool:
    all_pass = True
    for r in results:
        seeds = getattr(r, "seeds", None)
        tag = f"seeds {','.join(str(x) for x in seeds)}, worst case" if seeds else f"seed {r.seed}"
        print(f"\n=== {r.mission} ({tag}) — {'CERTIFIED' if r.passed else 'NOT CERTIFIED'} ===")
        for req in r.reqs:
            mark = "PASS" if req.passed else "FAIL"
            print(f"  [{mark}] {req.id}  {req.desc}")
            print(f"         {req.detail}")
            all_pass = all_pass and req.passed
    return all_pass


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--controller", required=True, help="module.path:ClassName")
    ap.add_argument("--student", default=None,
                    help="your student ID. When given, every mission runs against YOUR "
                         "own vehicle dynamics (mass, arm, k_torque, inertia), derived "
                         "deterministically from this ID — see quadsim/student_params.py. "
                         "Required for the final project; omit to use the shared course "
                         "default vehicle (labs, and the M4 warm-up before you have an ID).")
    ap.add_argument("--mission", required=True, choices=[*MISSIONS, "all"])
    ap.add_argument("--json", help="also write the report to this path as JSON")
    ap.add_argument("--seeds", default=None,
                    help="comma-separated estimator seeds, e.g. 0,1,2 — runs each mission on "
                         "every seed and reports the WORST case. NOT the graded mode: the final "
                         "project is graded on seed 0 alone (--mission M3). Use this to measure "
                         "the spread your report must state — see CERTIFICATION.md section 6.")
    ap.add_argument("--seed", type=int, default=0,
                    help="estimator noise seed (default 0). The loop closes on ESTIMATED state, "
                         "so the sensor-noise sequence is part of the experiment: a single run is a "
                         "single sample. Re-run across several seeds and report the spread — see "
                         "CERTIFICATION.md section 6.")
    args = ap.parse_args()

    vehicle = student_vehicle(args.student) if args.student else None
    if vehicle:
        print(f"# {vehicle.summary()}\n", file=sys.stderr)
    missions = list(MISSIONS) if args.mission == "all" else [args.mission]
    if args.seeds:
        seeds = [int(x) for x in args.seeds.split(",") if x.strip() != ""]
        if not seeds:
            raise SystemExit("--seeds given but empty")
        results = [run_mission_over_seeds(m, args.controller, seeds, vehicle=vehicle) for m in missions]
    else:
        results = [MISSIONS[m](args.controller, seed=args.seed, vehicle=vehicle) for m in missions]
    ok = report(results)

    if args.json:
        payload = [
            {"mission": r.mission, "passed": r.passed,
             "seeds": r.seeds if r.seeds else [r.seed],
             "student": args.student,
             "requirements": [{"id": q.id, "desc": q.desc, "passed": q.passed, "detail": q.detail} for q in r.reqs]}
            for r in results
        ]
        with open(args.json, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)
        print(f"\nwrote {args.json}")

    print(f"\n{'ALL MISSIONS CERTIFIED' if ok else 'CERTIFICATION FAILED — see FAIL lines above'}")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
