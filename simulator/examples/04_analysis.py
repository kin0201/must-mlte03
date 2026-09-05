# Copyright (c) 2026 Dr Ken Lai (黎子健).
# Licensed under CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
# MLTE03 — Flight Dynamics and Intelligent Control Technologies, MUST.
"""Weeks 4 & 7 lab: linear analysis + LQR, with the 'impressive' visualizations.

Linearize the real nonlinear model about hover, look at the (unstable) open-loop
poles, design an LQR gain, confirm it moves the poles into the left half-plane,
then fly a figure-eight and render the analysis/animation plots.

    export PYTHONPATH=.
    python examples/04_analysis.py            # saves PNGs (no window)
    python examples/04_analysis.py --show     # also pop up windows
"""
import argparse

import numpy as np

from quadsim import Simulator, QuadParams, analysis as an
from quadsim.dynamics import hover_state
from quadsim.controllers import CascadePID
from quadsim import trajectories as traj


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--show", action="store_true")
    args = ap.parse_args()

    p = QuadParams()

    # --- Linear analysis about hover (Week 4) ---
    A, B = an.linearize(p)
    ol = an.poles(A)
    _, rank = an.controllability(A, B)
    print(f"open-loop: {np.sum(np.abs(ol.real) < 1e-6)} poles at the origin "
          f"(marginally stable) · controllability rank {rank}/12")

    # --- LQR design (Week 7) ---
    Q = np.diag([10, 10, 10, 1, 1, 1, 10, 10, 10, 1, 1, 1.0])
    R = np.diag([1.0, 10, 10, 10])
    K, _, cl = an.lqr(A, B, Q, R)
    print(f"LQR closed-loop: max Re(pole) = {cl.real.max():.3f}  (stable: {np.all(cl.real < 0)})")

    # --- Fly a trajectory and visualize (Week 9) ---
    sim = Simulator(p)
    log = sim.run(x0=hover_state(position=(0, 0, 1.0)),
                  controller=CascadePID(p),
                  reference=traj.figure_eight(period=10.0),
                  t_final=20.0, wind=lambda t: np.array([0.4, 0.0, 0.0]))
    print(f"figure-eight tracking RMSE: {log.position_rmse():.3f} m")

    from quadsim import plotting as viz
    viz.plot_poles([ol, cl], labels=["open loop", "LQR closed loop"],
                   save="analysis_poles.png", show=args.show)
    viz.plot_pose_strobe(log, save="analysis_strobe.png", show=args.show)
    viz.plot_tracking_error(log, save="analysis_tracking.png", show=args.show)
    viz.plot_phase_portrait(log, axis="roll", save="analysis_phase.png", show=args.show)
    print("saved: analysis_poles.png, analysis_strobe.png, analysis_tracking.png, analysis_phase.png")


if __name__ == "__main__":
    main()
