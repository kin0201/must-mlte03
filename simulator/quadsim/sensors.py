# Copyright (c) 2026 Dr Ken Lai (黎子健).
# Licensed under CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
# MLTE03 — Flight Dynamics and Intelligent Control Technologies, MUST.
"""Simple noisy sensor models for the state-estimation lab (Week 8).

Real flight controllers never see the true state — they see an IMU (gyro +
accelerometer) at high rate and a GPS/motion-capture position at low rate, all
corrupted by bias and noise. These models let students build and test a
complementary filter / Kalman filter against ground truth.
"""
from __future__ import annotations

import numpy as np

from .params import QuadParams, DEFAULT
from .dynamics import rotation_matrix, state_derivative


class IMU:
    """Body-frame gyro + accelerometer with Gaussian noise and constant bias."""

    def __init__(self, gyro_noise=0.01, acc_noise=0.1, gyro_bias=0.0, p: QuadParams = DEFAULT):
        self.gyro_noise = gyro_noise
        self.acc_noise = acc_noise
        self.gyro_bias = gyro_bias
        self.p = p

    def read(self, x: np.ndarray, u: np.ndarray, rng: np.random.Generator) -> dict:
        omega = x[9:12]
        # Specific force measured by an accelerometer = (a_world - g) in body frame.
        a_world = state_derivative(x, u, self.p)[3:6]
        R = rotation_matrix(x[6], x[7], x[8])
        f_body = R.T @ (a_world - np.array([0.0, 0.0, -self.p.g]))
        gyro = omega + self.gyro_bias + self.gyro_noise * rng.standard_normal(3)
        acc = f_body + self.acc_noise * rng.standard_normal(3)
        return {"gyro": gyro, "acc": acc}


class GPS:
    """Low-rate, noisy world-position fix (stand-in for GPS or motion capture)."""

    def __init__(self, pos_noise=0.05, rate_hz=5.0):
        self.pos_noise = pos_noise
        self.rate_hz = rate_hz
        self._next_t = 0.0

    def read(self, t: float, x: np.ndarray, rng: np.random.Generator):
        if t + 1e-9 >= self._next_t:
            self._next_t = t + 1.0 / self.rate_hz
            return x[0:3] + self.pos_noise * rng.standard_normal(3)
        return None       # no new fix this step
