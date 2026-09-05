# Copyright (c) 2026 Dr Ken Lai (黎子健).
# Licensed under CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
# MLTE03 — Flight Dynamics and Intelligent Control Technologies, MUST.
"""Linear Model Predictive Control — fully readable, pure NumPy (Week 12).

Receding-horizon control on the hover-linearized model: at every step we predict
the next N states as a function of the planned input sequence, minimize a quadratic
tracking cost subject to **input limits**, apply only the first move, and repeat.

No CasADi / do-mpc / OSQP. The quadratic program is *condensed* (decision variable
= the stacked input sequence). The Hessian is badly conditioned, so we don't use
plain gradient descent: we take the exact unconstrained move H^-1(-g) — optimal when
no limit is active — and refine it with a few sweeps of box-constrained coordinate
descent when the limits bite. The terminal cost uses the LQR Riccati matrix
(`analysis.care`) so a short horizon still behaves like infinite-horizon LQR away
from the constraints — the standard trick.

The teaching point (vs Week-7 LQR): LQR ignores actuator limits and just clips;
MPC *plans around* them. See `examples/05_mpc.py`.

Conventions: ../CONVENTIONS.md (z-up, wrench u=[T,tau_x,tau_y,tau_z]).
"""
from __future__ import annotations

import numpy as np

from .base import Controller
from ..params import QuadParams, DEFAULT
from .. import analysis as an


class LinearMPC(Controller):
    def __init__(self, p: QuadParams = DEFAULT, horizon: int = 25, dt_mpc: float = 0.05,
                 q_pos: float = 12.0, q_att: float = 6.0, q_vel: float = 1.0, q_rate: float = 0.5,
                 r_thrust: float = 0.5, r_torque: float = 4.0,
                 dT_max: float = None, tau_max: float = None, sweeps: int = 30,
                 ref_fn=None):
        self.p = p
        self.N = horizon
        self.dt = dt_mpc
        # Optional reference *preview*: a t -> dict trajectory the MPC can look ahead
        # along the horizon (vs holding the current setpoint constant). This is one of
        # MPC's real advantages — feedforward without hand-derived derivatives.
        self.ref_fn = ref_fn

        # --- Linear model about hover, Euler-discretized at the MPC step ---
        self.x_eq, self.u_eq = an.hover_equilibrium(p)
        A, B = an.linearize(p, self.x_eq, self.u_eq)
        n, m = A.shape[0], B.shape[1]
        self.n, self.m = n, m
        Ad = np.eye(n) + A * self.dt
        Bd = B * self.dt

        # --- Cost weights ---
        Q = np.diag([q_pos, q_pos, q_pos, q_vel, q_vel, q_vel,
                     q_att, q_att, q_att, q_rate, q_rate, q_rate])
        R = np.diag([r_thrust, r_torque, r_torque, r_torque])
        # Terminal cost = continuous-time LQR Riccati solution (infinite-horizon tail).
        P = an.care(A, B, Q, R)

        # --- Condensed prediction matrices: X = Sx x0 + Su U ---
        Sx = np.zeros((n * self.N, n))
        Su = np.zeros((n * self.N, m * self.N))
        Apow = np.eye(n)
        for k in range(self.N):
            Apow = Ad @ Apow if k > 0 else np.eye(n)
            Sx[k * n:(k + 1) * n, :] = np.linalg.matrix_power(Ad, k + 1)
            for j in range(k + 1):
                Su[k * n:(k + 1) * n, j * m:(j + 1) * m] = np.linalg.matrix_power(Ad, k - j) @ Bd

        Qbar = np.kron(np.eye(self.N), Q)
        Qbar[(self.N - 1) * n:, (self.N - 1) * n:] = P     # terminal weight
        Rbar = np.kron(np.eye(self.N), R)

        self.Sx, self.Su = Sx, Su
        self.H = Su.T @ Qbar @ Su + Rbar                   # PD Hessian (of U'HU + 2g'U)
        self.SuQ = Su.T @ Qbar
        self.Hinv = np.linalg.inv(self.H)                  # exact unconstrained solve
        self.Hdiag = np.diag(self.H).copy()
        self.sweeps = sweeps

        # --- Input box (deviations from hover trim) ---
        n_rot, f_max = p.n_rotors, p.f_max
        self.dT_hi = (n_rot * f_max - p.weight) if dT_max is None else dT_max
        self.dT_lo = (0.1 * p.weight - p.weight)
        self.tau_max = (p.arm * f_max) if tau_max is None else tau_max
        self.lb = np.tile([self.dT_lo, -self.tau_max, -self.tau_max, -self.tau_max], self.N)
        self.ub = np.tile([self.dT_hi, self.tau_max, self.tau_max, self.tau_max], self.N)

        self.reset()

    def reset(self) -> None:
        self._U = np.zeros(self.m * self.N)   # warm start

    def _ref_dev(self, ref: dict) -> np.ndarray:
        """One reference state deviation: reach ref position & yaw, at rest and level."""
        dxr = np.zeros(self.n)
        dxr[0:3] = np.asarray(ref.get("pos", [0.0, 0.0, 0.0]), float) - self.x_eq[0:3]
        dxr[8] = float(ref.get("yaw", 0.0)) - self.x_eq[8]
        return dxr

    def _horizon_ref(self, t: float, ref: dict) -> np.ndarray:
        """Stacked reference over the horizon: previewed from ref_fn if given,
        else the current setpoint held constant."""
        if self.ref_fn is None:
            return np.tile(self._ref_dev(ref), self.N)
        return np.concatenate([self._ref_dev(self.ref_fn(t + (k + 1) * self.dt)) for k in range(self.N)])

    def control(self, t: float, x: np.ndarray, ref: dict) -> np.ndarray:
        dx0 = np.asarray(x, float) - self.x_eq
        Xref = self._horizon_ref(t, ref)
        # J(U) = U'H U + 2 g'U  with  g = Su'Qbar (Sx dx0 - Xref)
        g = self.SuQ @ (self.Sx @ dx0 - Xref)

        # Exact unconstrained optimum, clipped into the box = an excellent warm start
        # (and the *exact* answer whenever no limit is active).
        U = np.clip(self.Hinv @ (-g), self.lb, self.ub)
        # Refine for active constraints by box-constrained coordinate descent.
        # Residual r = H U + g; coordinate min of U_i is U_i - r_i / H_ii, then clip.
        r = self.H @ U + g
        for _ in range(self.sweeps):
            moved = 0.0
            for i in range(U.size):
                ui = min(max(U[i] - r[i] / self.Hdiag[i], self.lb[i]), self.ub[i])
                d = ui - U[i]
                if d != 0.0:
                    r += self.H[:, i] * d
                    U[i] = ui
                    moved += abs(d)
            if moved < 1e-9:
                break
        self._U = U
        return self.u_eq + U[:self.m]
