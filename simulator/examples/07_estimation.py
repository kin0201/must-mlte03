# Copyright (c) 2026 Dr Ken Lai (黎子健).
# Licensed under CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
# MLTE03 — Flight Dynamics and Intelligent Control Technologies, MUST.
"""Week 8 lab: state estimation & sensor fusion (complementary filter + KF).

The controller never sees the true state — only a noisy IMU + low-rate GPS. We fuse
them (complementary filter for attitude, a Kalman filter for position) and *close
the loop on the estimate*. It should still fly, with estimation error a small
fraction of a metre / a fraction of a degree.

    export PYTHONPATH=.
    python examples/07_estimation.py
    python examples/07_estimation.py --show
"""
import argparse

import numpy as np

from quadsim import Simulator, QuadParams
from quadsim.controllers import CascadePID
from quadsim.estimators import EstimatedStateController
from quadsim.dynamics import hover_state
from quadsim import trajectories as traj


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--show", action="store_true")
    args = ap.parse_args()
    p = QuadParams()
    sim = Simulator(p)

    ctrl = EstimatedStateController(CascadePID(p), p)
    target = [1.0, -1.0, 1.5]
    log = sim.run(hover_state(position=(0, 0, 1.0)), ctrl,
                  reference=traj.step(position=target, start=(0, 0, 1.0), t_step=0.5), t_final=10.0)

    est = np.array([xh for _, xh in ctrl.est_log])
    true = log.x[:len(est)]
    t = log.t[:len(est)]
    pe = np.linalg.norm(est[:, 0:3] - true[:, 0:3], axis=1)
    ae = np.rad2deg(np.linalg.norm(est[:, 6:9] - true[:, 6:9], axis=1))
    print(f"flew to target on the ESTIMATE: final error {np.linalg.norm(log.position[-1] - target):.3f} m")
    print(f"position estimate RMSE: {np.sqrt(np.mean(pe**2)):.3f} m")
    print(f"attitude estimate RMSE: {np.sqrt(np.mean(ae**2)):.2f} deg")

    from quadsim import plotting as viz
    viz.plot_estimation_error(t, true, est, save="estimation_error.png", show=args.show)
    print("saved estimation_error.png")


if __name__ == "__main__":
    main()
