# Copyright (c) 2026 Dr Ken Lai (黎子健).
# Licensed under CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
# MLTE03 — Flight Dynamics and Intelligent Control Technologies, MUST.
"""Reference cascade PID autopilot (instructor solution).

Two nested loops, the workhorse architecture of every real multirotor:

    position/altitude  --(outer, slow)-->  desired thrust + desired attitude
    attitude/rate      --(inner, fast)-->  body torques

Students build their own version across Weeks 5-6; this file is the reference
they are graded against and the baseline the intelligent-control labs improve on.
The gains below fly the default `QuadParams` through hover, steps, and a
figure-eight with sub-decimeter tracking error.
"""
from __future__ import annotations

import numpy as np

from .base import Controller
from ..params import QuadParams, DEFAULT


class CascadePID(Controller):
    def __init__(self, p: QuadParams = DEFAULT):
        self.p = p
        # --- Outer loop: world-frame position PD (+ integral on z) ---
        self.kp_pos = np.array([6.0, 6.0, 12.0])
        self.kd_pos = np.array([4.0, 4.0, 8.0])
        self.ki_z = 2.0
        # --- Inner loop: attitude PD ---
        self.kp_att = np.array([180.0, 180.0, 80.0])
        self.kd_att = np.array([28.0, 28.0, 20.0])
        self.max_tilt = np.deg2rad(30.0)        # safety clamp on commanded tilt
        self.reset()

    def reset(self) -> None:
        self._iz = 0.0
        self._t_prev = None

    def control(self, t: float, x: np.ndarray, ref: dict) -> np.ndarray:
        p = self.p
        pos, vel = x[0:3], x[3:6]
        euler, omega = x[6:9], x[9:12]

        pos_ref = np.asarray(ref.get("pos", [0.0, 0.0, 0.0]), float)
        yaw_ref = float(ref.get("yaw", 0.0))
        vel_ref = np.asarray(ref.get("vel", [0.0, 0.0, 0.0]), float)
        acc_ref = np.asarray(ref.get("acc", [0.0, 0.0, 0.0]), float)

        dt = 0.0 if self._t_prev is None else t - self._t_prev
        self._t_prev = t

        # ---- Outer loop: desired world acceleration = feedforward + PD(+I on z) ----
        e_pos = pos_ref - pos
        e_vel = vel_ref - vel
        self._iz = np.clip(self._iz + e_pos[2] * dt, -2.0, 2.0)
        a_des = acc_ref + self.kp_pos * e_pos + self.kd_pos * e_vel
        a_des[2] += self.ki_z * self._iz

        # Total thrust to realise the vertical acceleration (gravity-compensated).
        T = p.mass * (p.g + a_des[2])
        T = max(T, 0.1 * p.weight)

        # Map desired horizontal acceleration -> desired roll/pitch (small angle).
        ax, ay = a_des[0], a_des[1]
        phi_des = (1.0 / p.g) * (ax * np.sin(yaw_ref) - ay * np.cos(yaw_ref))
        theta_des = (1.0 / p.g) * (ax * np.cos(yaw_ref) + ay * np.sin(yaw_ref))
        phi_des = np.clip(phi_des, -self.max_tilt, self.max_tilt)
        theta_des = np.clip(theta_des, -self.max_tilt, self.max_tilt)
        att_des = np.array([phi_des, theta_des, yaw_ref])

        # ---- Inner loop: attitude PD -> body torques ----
        e_att = att_des - euler
        e_att[2] = (e_att[2] + np.pi) % (2 * np.pi) - np.pi   # wrap yaw error
        tau = p.inertia * (self.kp_att * e_att + self.kd_att * (-omega))

        return np.array([T, tau[0], tau[1], tau[2]])
