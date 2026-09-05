# Copyright (c) 2026 Dr Ken Lai (黎子健).
# Licensed under CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
# MLTE03 — Flight Dynamics and Intelligent Control Technologies, MUST.
"""The closed-loop simulator: fly a controller and record the result.

Usage
-----
    from quadsim import Simulator, QuadParams
    from quadsim.dynamics import hover_state
    from quadsim.controllers import CascadePID

    sim = Simulator(QuadParams())
    ctrl = CascadePID(sim.params)
    log = sim.run(x0=hover_state(position=(0, 0, 0)),
                  controller=ctrl,
                  reference=lambda t: dict(pos=[1, 1, 1.5], yaw=0.0),
                  t_final=10.0)
    print(log.position_rmse([1, 1, 1.5]))
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Optional

import numpy as np

from .params import QuadParams, DEFAULT
from .dynamics import rk4_step, wrench_to_motor_forces, motor_forces_to_wrench


@dataclass
class SimLog:
    """Time history of a run; everything a student needs to plot or grade."""
    t: np.ndarray
    x: np.ndarray            # (N, 12) state history
    u: np.ndarray            # (N, 4)  control wrench actually applied
    ref: np.ndarray          # (N, 3)  position reference (NaN if none)
    f: np.ndarray            # (N, 4)  per-motor thrusts (applied)
    f_cmd: Optional[np.ndarray] = None   # (N, 4) commanded thrusts; only set when a plant is used

    @property
    def position(self) -> np.ndarray:
        return self.x[:, 0:3]

    @property
    def velocity(self) -> np.ndarray:
        return self.x[:, 3:6]

    @property
    def euler(self) -> np.ndarray:
        return self.x[:, 6:9]

    def position_rmse(self, target=None) -> float:
        """RMS position error against a constant target or the logged reference."""
        ref = np.asarray(target, float) if target is not None else self.ref
        err = self.position - ref
        return float(np.sqrt(np.nanmean(np.sum(err ** 2, axis=1))))


class Simulator:
    """Integrates the plant while a controller closes the loop at each step."""

    def __init__(self, params: QuadParams = DEFAULT):
        self.params = params

    def run(
        self,
        x0: np.ndarray,
        controller,
        reference: Optional[Callable[[float], dict]] = None,
        t_final: float = 10.0,
        dt: Optional[float] = None,
        wind: Optional[Callable[[float], np.ndarray]] = None,
        plant=None,
    ) -> SimLog:
        """Simulate a closed loop.

        Parameters
        ----------
        x0          : initial 12-state
        controller  : object with `.control(t, x, ref) -> wrench[4]`
                      (a wrench [T, tau_x, tau_y, tau_z]); motor saturation is
                      applied by the simulator so limits are always enforced.
        reference   : t -> dict(pos=[x,y,z], yaw=psi); None => hold a zero ref
        t_final     : sim duration [s]
        dt          : step [s] (defaults to params.dt)
        wind        : t -> extra world-frame force [N] added as a disturbance
        plant       : optional `quadsim.realistic.TeamPlant`. When given, the
                      plant integrates the true (hidden) dynamics — motor lag,
                      drag, gusts, parameter offsets — while `self.params` stays
                      the nominal model the controller was built on. With
                      plant=None the loop below is exactly the classic one.
        """
        p = self.params
        dt = dt or p.dt
        n = int(round(t_final / dt)) + 1

        x = np.asarray(x0, float).copy()
        if hasattr(controller, "reset"):
            controller.reset()

        T = np.zeros(n)
        X = np.zeros((n, 12))
        U = np.zeros((n, 4))
        REF = np.full((n, 3), np.nan)
        F = np.zeros((n, 4))
        FCMD = np.zeros((n, 4)) if plant is not None else None
        if plant is not None:
            plant.reset(dt)

        for k in range(n):
            t = k * dt
            ref = reference(t) if reference is not None else {}

            if plant is not None:
                plant.observe(x, t)          # what the IMU feels right now

            wrench = np.asarray(controller.control(t, x, ref), float)
            # The simulator owns actuator reality: wrench -> saturated motors -> wrench.
            f = wrench_to_motor_forces(wrench, p, clip=True)

            if plant is None:
                applied = motor_forces_to_wrench(f, p)
                T[k], X[k], U[k], F[k] = t, x, applied, f
                if "pos" in ref:
                    REF[k] = ref["pos"]

                # Optional world-frame disturbance (e.g. a wind gust) as extra accel.
                if wind is not None:
                    dist = np.zeros(12)
                    dist[3:6] = wind(t) / p.mass
                    x = rk4_step(x, applied, dt, p) + dist * dt
                else:
                    x = rk4_step(x, applied, dt, p)
            else:
                x_next, f_app, applied = plant.step(x, f, t, dt)
                T[k], X[k], U[k], F[k], FCMD[k] = t, x, applied, f_app, f
                if "pos" in ref:
                    REF[k] = ref["pos"]
                x = x_next

        return SimLog(t=T, x=X, u=U, ref=REF, f=F, f_cmd=FCMD)
