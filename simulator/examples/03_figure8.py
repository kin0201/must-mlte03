# Copyright (c) 2026 Dr Ken Lai (黎子健).
# Licensed under CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
# MLTE03 — Flight Dynamics and Intelligent Control Technologies, MUST.
"""Week 9 lab: track a smooth figure-eight trajectory.

This is the classic multirotor tracking benchmark and the baseline the
Week-12 MPC lab tries to beat.

    python examples/03_figure8.py --plot
"""
import argparse

from quadsim import Simulator, QuadParams
from quadsim.controllers import CascadePID, StudentController
from quadsim.dynamics import hover_state
from quadsim import trajectories as traj


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--controller", choices=["cascade", "student"], default="cascade")
    ap.add_argument("--plot", action="store_true")
    ap.add_argument("--wind", type=float, default=0.0, help="constant world-x wind force [N]")
    args = ap.parse_args()

    sim = Simulator(QuadParams())
    ctrl = CascadePID(sim.params) if args.controller == "cascade" else StudentController(sim.params)
    reference = traj.figure_eight(a=1.0, b=0.5, height=1.5, period=10.0)
    wind = (lambda t: __import__("numpy").array([args.wind, 0.0, 0.0])) if args.wind else None

    log = sim.run(
        x0=hover_state(position=(0, 0, 1.5)),
        controller=ctrl,
        reference=reference,
        t_final=20.0,
        wind=wind,
    )
    print(f"controller = {args.controller}, wind = {args.wind} N")
    print(f"trajectory tracking RMSE: {log.position_rmse():.3f} m")

    if args.plot:
        from quadsim.plotting import plot_trajectory_3d
        plot_trajectory_3d(log, save=f"figure8_{args.controller}.png", show=False)
        print(f"saved figure8_{args.controller}.png")


if __name__ == "__main__":
    main()
