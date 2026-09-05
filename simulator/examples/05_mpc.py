# Copyright (c) 2026 Dr Ken Lai (黎子健).
# Licensed under CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
# MLTE03 — Flight Dynamics and Intelligent Control Technologies, MUST.
"""Week 12 lab: linear MPC on the quadrotor (pure NumPy, no do-mpc/CasADi).

Three things to see:
  1. With reference *preview*, MPC tracks a moving trajectory better than feedback-only.
  2. MPC *respects actuator limits by planning*, where a fixed-gain controller just
     saturates. Cap the available thrust and watch MPC still reach the target cleanly.
  3. It is the same nonlinear plant — only the controller changed.

    export PYTHONPATH=.
    python examples/05_mpc.py            # prints metrics, saves a comparison PNG
    python examples/05_mpc.py --show
"""
import argparse

import numpy as np

from quadsim import Simulator, QuadParams
from quadsim.dynamics import hover_state
from quadsim.controllers import LinearMPC, CascadePID
from quadsim import trajectories as traj


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--show", action="store_true")
    args = ap.parse_args()

    p = QuadParams()
    sim = Simulator(p)
    fe = traj.figure_eight(period=10.0)

    # 1) Trajectory tracking: preview vs feedback-only, against the PID baseline.
    mpc_prev = sim.run(hover_state(position=(0, 0, 1.5)), LinearMPC(p, ref_fn=fe), reference=fe, t_final=20.0)
    mpc_fb = sim.run(hover_state(position=(0, 0, 1.5)), LinearMPC(p), reference=fe, t_final=20.0)
    pid = sim.run(hover_state(position=(0, 0, 1.5)), CascadePID(p), reference=fe, t_final=20.0)
    print("figure-eight tracking RMSE [m]:")
    print(f"  MPC + preview : {mpc_prev.position_rmse():.3f}")
    print(f"  MPC feedback  : {mpc_fb.position_rmse():.3f}   (lag — no preview)")
    print(f"  Cascade PID   : {pid.position_rmse():.3f}")

    # 2) Constraint handling: only a small thrust margin above hover is allowed.
    climb = traj.step(position=[0, 0, 3.0], start=(0, 0, 1.0), t_step=0.5)
    mpc_tight = sim.run(hover_state(position=(0, 0, 1.0)), LinearMPC(p, dT_max=1.0),
                        reference=climb, t_final=10.0)
    print(f"\nthrust-limited climb to z=3.0: final z = {mpc_tight.position[-1, 2]:.2f} m, "
          f"max motor = {mpc_tight.f.max():.2f} N (limit {p.f_max}) -> "
          f"{'within limits' if mpc_tight.f.max() <= p.f_max + 1e-6 else 'VIOLATED'}")

    from quadsim import plotting as viz
    viz.plot_pose_strobe(mpc_prev, save="mpc_strobe.png", show=args.show)
    viz.plot_tracking_error(mpc_prev, save="mpc_tracking.png", show=args.show)
    print("saved mpc_strobe.png, mpc_tracking.png")


if __name__ == "__main__":
    main()
