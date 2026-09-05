# Copyright (c) 2026 Dr Ken Lai (黎子健).
# Licensed under CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
# MLTE03 — Flight Dynamics and Intelligent Control Technologies, MUST.
"""quadsim — a minimal, fully readable quadcopter flight simulator for MLTE03.

Pure-numpy 12-state nonlinear model + RK4 integrator + a closed-loop runner.
Designed so a master's student can read every line, re-derive the dynamics, and
build their own controller on top of it.

Quick start
-----------
    from quadsim import Simulator, QuadParams
    from quadsim.dynamics import hover_state
    from quadsim.controllers import CascadePID
    from quadsim import trajectories as traj

    sim = Simulator(QuadParams())
    log = sim.run(hover_state(position=(0, 0, 0)),
                  CascadePID(sim.params),
                  reference=traj.figure_eight(),
                  t_final=12.0)
    print("tracking RMSE:", log.position_rmse())
"""
from .params import QuadParams, DEFAULT
from .sim import Simulator, SimLog
from . import dynamics, trajectories, sensors, analysis, estimators, realistic

__all__ = [
    "QuadParams",
    "DEFAULT",
    "Simulator",
    "SimLog",
    "dynamics",
    "trajectories",
    "sensors",
    "analysis",
    "estimators",
    "realistic",
]

__version__ = "0.1.0"
