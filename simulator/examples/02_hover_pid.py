# Copyright (c) 2026 Dr Ken Lai (黎子健).
# Licensed under CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
# MLTE03 — Flight Dynamics and Intelligent Control Technologies, MUST.
"""Weeks 5-6 lab: close the loop and hold a hover setpoint.

Compare the reference CascadePID with your own StudentController:

    python examples/02_hover_pid.py                 # reference solution
    python examples/02_hover_pid.py --controller student
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
    args = ap.parse_args()

    sim = Simulator(QuadParams())
    ctrl = CascadePID(sim.params) if args.controller == "cascade" else StudentController(sim.params)

    target = [1.0, 1.0, 1.5]
    log = sim.run(
        x0=hover_state(position=(0, 0, 1.0)),
        controller=ctrl,
        reference=traj.step(position=target, start=(0, 0, 1.0), t_step=0.5),
        t_final=8.0,
    )
    print(f"controller = {args.controller}")
    print(f"position RMSE vs target {target}: {log.position_rmse(target):.3f} m")
    print(f"final position: {log.position[-1].round(3)}")

    if args.plot:
        from quadsim.plotting import plot_states
        plot_states(log, save=f"hover_{args.controller}.png", show=False)
        print(f"saved hover_{args.controller}.png")


if __name__ == "__main__":
    main()
