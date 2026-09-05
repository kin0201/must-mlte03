# Copyright (c) 2026 Dr Ken Lai (黎子健).
# Licensed under CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
# MLTE03 — Flight Dynamics and Intelligent Control Technologies, MUST.
"""Linear analysis & optimal control on the quadrotor model (Weeks 4, 7).

Everything here is built *from the same nonlinear model the students fly* —
`dynamics.state_derivative` — so the linear model is never a separate black box:
we linearize it numerically about hover, read off the open-loop poles (and watch
them be unstable), then design an LQR gain on that linear model and confirm it
stabilizes the closed loop.

Pure NumPy. The continuous-time Riccati equation is solved via the Hamiltonian
eigenvector method (no SciPy needed), which is itself a nice thing to show.

Conventions: see ../CONVENTIONS.md (z-up, ZYX Euler, wrench u=[T, tau_x,tau_y,tau_z]).
"""
from __future__ import annotations

import numpy as np

from .params import QuadParams, DEFAULT
from .dynamics import state_derivative, hover_state


def hover_equilibrium(p: QuadParams = DEFAULT, position=(0.0, 0.0, 1.0), yaw: float = 0.0):
    """The trim point: level, at rest, thrust = weight, zero torque.

    Returns (x_eq[12], u_eq[4]).  By construction state_derivative(x_eq,u_eq)=0.
    """
    x_eq = hover_state(position=position, yaw=yaw)
    u_eq = np.array([p.weight, 0.0, 0.0, 0.0])
    return x_eq, u_eq


def linearize(p: QuadParams = DEFAULT, x_eq=None, u_eq=None, eps: float = 1e-6):
    """Numerically linearize x_dot = f(x,u) about (x_eq,u_eq): returns (A, B).

    Central finite differences of the *actual* nonlinear dynamics. A is 12x12,
    B is 12x4 (the input is the control wrench, before motor mixing/saturation).
    """
    if x_eq is None or u_eq is None:
        x_eq, u_eq = hover_equilibrium(p)
    x_eq = np.asarray(x_eq, float)
    u_eq = np.asarray(u_eq, float)
    n, m = x_eq.size, u_eq.size

    A = np.zeros((n, n))
    for i in range(n):
        dx = np.zeros(n); dx[i] = eps
        A[:, i] = (state_derivative(x_eq + dx, u_eq, p) - state_derivative(x_eq - dx, u_eq, p)) / (2 * eps)

    B = np.zeros((n, m))
    for j in range(m):
        du = np.zeros(m); du[j] = eps
        B[:, j] = (state_derivative(x_eq, u_eq + du, p) - state_derivative(x_eq, u_eq - du, p)) / (2 * eps)
    return A, B


def poles(A: np.ndarray) -> np.ndarray:
    """Open-loop eigenvalues (system poles). For hover, several sit at the origin
    (pure integrators: position/velocity) — the system is not asymptotically stable,
    which is exactly why we need feedback."""
    return np.linalg.eigvals(A)


def controllability(A: np.ndarray, B: np.ndarray):
    """Controllability matrix [B AB A^2B ...] and its rank. Full rank (=12) means
    every state can be steered by the four controls — a prerequisite for LQR."""
    n = A.shape[0]
    C = np.hstack([np.linalg.matrix_power(A, k) @ B for k in range(n)])
    rank = int(np.linalg.matrix_rank(C, tol=1e-6))
    return C, rank


def care(A: np.ndarray, B: np.ndarray, Q: np.ndarray, R: np.ndarray) -> np.ndarray:
    """Solve the continuous-time algebraic Riccati equation

        A^T P + P A - P B R^-1 B^T P + Q = 0

    via the stable invariant subspace of the Hamiltonian matrix
    H = [[A, -B R^-1 B^T], [-Q, -A^T]].  Returns the symmetric PSD P.
    """
    n = A.shape[0]
    R_inv = np.linalg.inv(R)
    H = np.block([[A, -B @ R_inv @ B.T],
                  [-Q, -A.T]])
    w, V = np.linalg.eig(H)
    # The n eigenvalues with negative real part span the stabilizing subspace.
    order = np.argsort(w.real)
    stable = order[:n]
    U = V[:, stable]
    U11, U21 = U[:n, :], U[n:, :]
    P = (U21 @ np.linalg.inv(U11)).real
    return 0.5 * (P + P.T)


def lqr(A: np.ndarray, B: np.ndarray, Q: np.ndarray, R: np.ndarray):
    """Continuous-time LQR. Returns (K, P, closed_loop_poles) for u = -K x.

    Minimizes J = ∫ x^T Q x + u^T R u dt.  Closed-loop poles eig(A - B K) all have
    negative real part when (A,B) is stabilizable and Q,R are sensible."""
    P = care(A, B, Q, R)
    K = np.linalg.inv(R) @ B.T @ P
    cl = np.linalg.eigvals(A - B @ K)
    return K, P, cl
