# Copyright (c) 2026 Dr Ken Lai (黎子健).
# Licensed under CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
# MLTE03 — Flight Dynamics and Intelligent Control Technologies, MUST.
"""State estimation & sensor fusion — pure NumPy (Week 8).

Real flight controllers never see the true state. They get a high-rate, noisy,
biased IMU and a low-rate noisy GPS, and must *fuse* them. We build the standard
teaching cascade:

  * `ComplementaryFilter` — attitude (roll/pitch) from gyro integration corrected
    by the accelerometer's gravity direction. One line of intuition: trust the gyro
    fast, trust the accelerometer slow.
  * `PositionKF` — a linear Kalman filter on [position, velocity], driven by the
    IMU's world-frame acceleration (a *prediction* input) and corrected by GPS
    position *measurements* when they arrive. This is the loosely-coupled INS/GPS
    estimator used on real vehicles.

Together (`INSGPS`) they output a full 12-state estimate you can close the loop on.
A single monolithic 15-state EKF (à la PX4 EKF2) is the production version; this
cascade is the readable one that exposes every Kalman equation.

Conventions: ../CONVENTIONS.md (z-up; gravity vector g_vec = [0,0,-g]).
"""
from __future__ import annotations

import numpy as np

from .params import QuadParams, DEFAULT
from .dynamics import rotation_matrix, euler_rate_matrix
from .sensors import IMU, GPS
from .controllers.base import Controller


class ComplementaryFilter:
    """Roll/pitch from a gyro+accelerometer complementary blend; yaw from the gyro."""

    def __init__(self, alpha=0.999, p: QuadParams = DEFAULT):
        # alpha = weight on the gyro (fast) vs accelerometer (slow). The crossover
        # time constant is tau = dt/(1-alpha); at 200 Hz, alpha=0.999 -> tau=5 s, so
        # the accelerometer only corrects slow drift and is NOT fooled by the
        # vehicle's own maneuver acceleration (a low alpha destabilizes the loop).
        self.alpha = alpha
        self.p = p
        self.euler = np.zeros(3)

    def update(self, gyro, acc, dt):
        # Predict: integrate the gyro through the Euler kinematics.
        W = euler_rate_matrix(self.euler[0], self.euler[1])
        euler_gyro = self.euler + W @ gyro * dt
        # Correct roll/pitch from the measured gravity direction (specific force).
        ax, ay, az = acc
        phi_acc = np.arctan2(ay, az)
        theta_acc = np.arctan2(-ax, np.hypot(ay, az))
        self.euler[0] = self.alpha * euler_gyro[0] + (1 - self.alpha) * phi_acc
        self.euler[1] = self.alpha * euler_gyro[1] + (1 - self.alpha) * theta_acc
        self.euler[2] = euler_gyro[2]   # yaw: gyro only (no magnetometer here)
        return self.euler.copy()


class PositionKF:
    """Linear KF on x=[p(3), v(3)] with world-accel input and GPS position updates."""

    def __init__(self, acc_var=0.5, gps_var=0.05 ** 2, p0=1.0):
        self.x = np.zeros(6)
        self.P = np.eye(6) * p0
        self.acc_var = acc_var
        self.R = np.eye(3) * gps_var
        self.H = np.hstack([np.eye(3), np.zeros((3, 3))])

    def predict(self, a_world, dt):
        F = np.eye(6)
        F[0:3, 3:6] = np.eye(3) * dt
        # Process noise from acceleration uncertainty (constant-accel model).
        G = np.vstack([0.5 * dt ** 2 * np.eye(3), dt * np.eye(3)])
        Q = G @ G.T * self.acc_var
        self.x = F @ self.x + np.hstack([0.5 * dt ** 2 * a_world, dt * a_world])
        self.P = F @ self.P @ F.T + Q

    def update(self, gps_pos):
        y = gps_pos - self.H @ self.x
        S = self.H @ self.P @ self.H.T + self.R
        K = self.P @ self.H.T @ np.linalg.inv(S)
        self.x = self.x + K @ y
        self.P = (np.eye(6) - K @ self.H) @ self.P
        return self.x.copy()


class INSGPS:
    """Full-state estimator: complementary filter (attitude) + position KF, fed by
    an IMU and a GPS. Returns a 12-state estimate matching the simulator layout."""

    def __init__(self, p: QuadParams = DEFAULT, imu: IMU = None, gps: GPS = None,
                 alpha=0.999, seed=0):
        self.p = p
        self.imu = imu or IMU(p=p)
        self.gps = gps or GPS()
        self.att = ComplementaryFilter(alpha=alpha, p=p)
        self.pos = PositionKF()
        self.rng = np.random.default_rng(seed)
        self._gyro = np.zeros(3)
        self._init = False

    def initialize(self, position, euler=(0, 0, 0)):
        """Seed the filters from the known launch pose (you know where the drone took off)."""
        self.pos.x[0:3] = np.asarray(position, float)
        self.att.euler = np.asarray(euler, float).copy()
        self._init = True

    def step(self, t, x_true, u, dt):
        """Generate sensor readings from the truth, fuse them, return the 12-state estimate.
        (x_true is used only to synthesize the measurements — the estimator output never
        peeks at it, apart from a one-time launch-pose initialization.)"""
        if not self._init:
            self.initialize(x_true[0:3], x_true[6:9])
        imu = self.imu.read(x_true, u, self.rng)
        self._gyro = imu["gyro"]
        euler = self.att.update(imu["gyro"], imu["acc"], dt)

        # Reconstruct world acceleration from specific force + estimated attitude:
        # acc_body = R^T (a_world - g_vec)  ->  a_world = R acc_body + g_vec.
        R = rotation_matrix(euler[0], euler[1], euler[2])
        a_world = R @ imu["acc"] + np.array([0.0, 0.0, -self.p.g])
        self.pos.predict(a_world, dt)
        fix = self.gps.read(t, x_true, self.rng)
        if fix is not None:
            self.pos.update(fix)

        x_hat = np.zeros(12)
        x_hat[0:3] = self.pos.x[0:3]
        x_hat[3:6] = self.pos.x[3:6]
        x_hat[6:9] = euler
        x_hat[9:12] = self._gyro
        return x_hat


class EstimatedStateController(Controller):
    """Wrap a controller so it acts on the *estimate*, not the truth — the realistic
    closed loop for Week 8. Reads sensors each step (using last applied wrench for the
    IMU), fuses with `INSGPS`, then calls the base controller on the estimated state."""

    def __init__(self, base: Controller, p: QuadParams = DEFAULT, estimator: INSGPS = None):
        self.base = base
        self.p = p
        self.est = estimator or INSGPS(p=p)
        self._t_prev = None
        self._u_prev = np.array([p.weight, 0.0, 0.0, 0.0])
        self.est_log = []      # (t, x_hat) for plotting estimation error

    def reset(self):
        if hasattr(self.base, "reset"):
            self.base.reset()
        self._t_prev = None
        self._u_prev = np.array([self.p.weight, 0.0, 0.0, 0.0])
        self.est_log = []

    def control(self, t, x, ref):
        dt = self.p.dt if self._t_prev is None else max(t - self._t_prev, 1e-6)
        self._t_prev = t
        x_hat = self.est.step(t, x, self._u_prev, dt)
        self.est_log.append((t, x_hat.copy()))
        u = np.asarray(self.base.control(t, x_hat, ref), float)
        self._u_prev = u
        return u
