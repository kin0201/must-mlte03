# Copyright (c) 2026 Dr Ken Lai (黎子健).
# Licensed under CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
# MLTE03 — Flight Dynamics and Intelligent Control Technologies, MUST.
"""Week 10 workshop: fly your controller on your team's hidden "realistic" plant.

Two flights of the same take-off -> 4 waypoints -> land mission, same controller,
same estimator, same seed:

    1. on the nominal model you have used since Week 4 (the numbers you know), then
    2. on your team's `TeamPlant` — motor lag, drag, gusts, GPS latency and a
       vehicle that does not weigh what you think (the numbers you do NOT know).

The difference between the two is your reality gap. The case-study report is a
mechanistic explanation of that gap (see assignments/team-case-study.html).

    python examples/08_team_mission.py --team T3
    python examples/08_team_mission.py --team T3 --controller student --plot

The plant's hidden values are never printed here. `--salt` is an instructor
knob (re-draws every hidden value; see quadsim/realistic.py).
"""
import argparse
import sys

import numpy as np

from quadsim import Simulator, QuadParams
from quadsim.controllers import CascadePID, StudentController
from quadsim.dynamics import hover_state
from quadsim.estimators import EstimatedStateController, INSGPS
from quadsim.realistic import team_plant
from quadsim import trajectories as traj

# The mission: take off to 1.5 m, a 2 m x 2 m square, come home, land.
WAYPOINTS = np.array([
    [0.0, 0.0, 0.0],
    [0.0, 0.0, 1.5],
    [2.0, 0.0, 1.5],
    [2.0, 2.0, 1.5],
    [0.0, 2.0, 1.5],
    [0.0, 0.0, 1.5],
    [0.0, 0.0, 0.05],
])
SPEED = 0.5      # m/s
HOLD = 1.0       # s at each waypoint
T_FINAL = 32.0   # s (mission itself takes ~29 s)


def make_base(name: str, p: QuadParams):
    base = CascadePID(p) if name == "cascade" else StudentController(p)
    if isinstance(base, EstimatedStateController):
        sys.exit("Hand in the *bare* controller: the runner wraps it in the estimator itself "
                 "(so the IMU/GPS models match the plant). Do not pre-wrap it.")
    return base


def metrics(log) -> dict:
    err = log.position - log.ref
    dev = np.sqrt(np.sum(err ** 2, axis=1))
    land_xy = float(np.linalg.norm(log.position[-1, 0:2] - WAYPOINTS[-1, 0:2]))
    land_z = float(abs(log.position[-1, 2] - WAYPOINTS[-1, 2]))
    tilt = np.degrees(np.max(np.abs(log.euler[:, 0:2])))
    crashed = bool(np.any(~np.isfinite(log.x)) or np.min(log.position[:, 2]) < -0.2 or tilt > 80)
    return dict(rmse=float(np.sqrt(np.nanmean(dev ** 2))), max_dev=float(np.nanmax(dev)),
                land_xy=land_xy, land_z=land_z, max_tilt=float(tilt), crashed=crashed)


def fly(controller_name: str, plant, seed: int = 0):
    p = QuadParams()                       # what the controller believes
    base = make_base(controller_name, p)
    if plant is None:
        est = INSGPS(p=p, seed=seed)
    else:
        est = INSGPS(p=p, imu=plant.make_imu(p), gps=plant.make_gps(), seed=seed)
    ctrl = EstimatedStateController(base, p, estimator=est)
    ref = traj.waypoints(WAYPOINTS, speed=SPEED, hold=HOLD)
    log = Simulator(p).run(hover_state(position=WAYPOINTS[0]), ctrl, reference=ref,
                           t_final=T_FINAL, plant=plant)
    return log, metrics(log)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--team", required=True, help="your team id, e.g. T3 — use the same string every time")
    ap.add_argument("--controller", choices=["cascade", "student"], default="cascade")
    ap.add_argument("--seed", type=int, default=0, help="estimator noise seed (does not move the plant)")
    ap.add_argument("--plot", action="store_true")
    ap.add_argument("--dry-run", action="store_true",
                    help="Week-9 rehearsal: fly the nominal model only (the team plant is not touched)")
    ap.add_argument("--salt", default="", help=argparse.SUPPRESS)
    args = ap.parse_args()

    log_n, m_n = fly(args.controller, None, args.seed)
    if args.dry_run:
        print(f"team = {args.team}   DRY RUN (nominal model only)   controller = {args.controller}")
        for key, label in [("rmse", "tracking RMSE [m]"), ("max_dev", "max deviation [m]"),
                           ("land_xy", "landing xy err [m]"), ("land_z", "landing z err [m]")]:
            print(f"{label:18s}{m_n[key]:10.3f}")
        print("Environment OK. Next week the same command without --dry-run flies your team's plant.")
        return
    plant = team_plant(args.team, salt=args.salt)
    log_r, m_r = fly(args.controller, plant, args.seed)

    print(f"team = {args.team}   plant fingerprint = {plant.fingerprint()}   controller = {args.controller}")
    print(f"{'':18s}{'nominal':>10s}{'realistic':>12s}")
    for key, label in [("rmse", "tracking RMSE [m]"), ("max_dev", "max deviation [m]"),
                       ("land_xy", "landing xy err [m]"), ("land_z", "landing z err [m]"),
                       ("max_tilt", "max tilt [deg]")]:
        print(f"{label:18s}{m_n[key]:10.3f}{m_r[key]:12.3f}")
    print(f"{'crashed':18s}{str(m_n['crashed']):>10s}{str(m_r['crashed']):>12s}")
    print(f"reality gap (RMSE ratio): x{m_r['rmse'] / max(m_n['rmse'], 1e-9):.1f}")
    print("\nThe plant's parameters are hidden. Explain the gap from the flight data:")
    print("  log_r.x / log_r.u / log_r.f (applied) vs log_r.f_cmd (commanded) are all there.")

    if args.plot:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        fig, ax = plt.subplots(1, 2, figsize=(10, 4.5))
        for a, (log, title) in zip(ax, [(log_n, "nominal model"), (log_r, f"team plant {args.team}")]):
            a.plot(log.ref[:, 0], log.ref[:, 1], "k--", lw=1, label="reference")
            a.plot(log.position[:, 0], log.position[:, 1], lw=1.5, label="flown")
            a.set_title(title); a.set_xlabel("x [m]"); a.set_ylabel("y [m]"); a.set_aspect("equal"); a.grid(alpha=.3)
        ax[0].legend()
        out = f"team_mission_{args.team}.png"
        fig.tight_layout(); fig.savefig(out, dpi=130)
        print(f"saved {out}")


if __name__ == "__main__":
    main()
