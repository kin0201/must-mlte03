# Copyright (c) 2026 Dr Ken Lai (黎子健).
# Licensed under CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
# MLTE03 — Flight Dynamics and Intelligent Control Technologies, MUST.
"""STUDENT TEMPLATE — your controller goes here.

This is the file you edit in the labs. Start in Week 5 with attitude control,
add the outer position loop in Week 6, and keep extending the same class through
the term until it flies the final-project mission.

Run it with:   python examples/02_hover_pid.py --controller student
"""
from __future__ import annotations

import numpy as np

from .base import Controller
from ..params import QuadParams, DEFAULT


class StudentController(Controller):
    def __init__(self, p: QuadParams = DEFAULT):
        self.p = p
        # TODO (Week 5): pick your attitude-loop gains.
        # TODO (Week 6): pick your position-loop gains.
        self.reset()

    def reset(self) -> None:
        # TODO: reset any integrators / filters you add.
        pass

    def control(self, t: float, x: np.ndarray, ref: dict) -> np.ndarray:
        """Return the control wrench [T, tau_x, tau_y, tau_z].

        `x` is the 12-state (pos, vel, euler, body-rates); `ref` is a dict with
        keys 'pos' (= [x, y, z]) and 'yaw'. The simulator does motor mixing and
        saturation for you, so just return thrust + torques.
        """
        p = self.p

        # ---- A safe starting point: hold thrust = weight, no torque. ----
        # The quad will hover *if dropped level*, but drift/tip otherwise.
        # Replace the lines below with your cascade controller.
        T = p.weight
        tau = np.zeros(3)

        # TODO Week 5: inner loop — drive attitude to a desired (phi, theta, yaw).
        # TODO Week 6: outer loop — turn position error into desired attitude + thrust.

        return np.array([T, tau[0], tau[1], tau[2]])
