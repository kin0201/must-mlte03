# Copyright (c) 2026 Dr Ken Lai (黎子健).
# Licensed under CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
# MLTE03 — Flight Dynamics and Intelligent Control Technologies, MUST.
"""Nonlinear 12-state rigid-body model of the quadcopter.

State vector (length 12), all in SI units:

    x[0:3]   position in the world frame   p = (x, y, z)        [m]
    x[3:6]   velocity in the world frame    v = (vx, vy, vz)     [m/s]
    x[6:9]   Euler angles (ZYX)             (phi, theta, psi)    [rad]
    x[9:12]  body angular rates             (p, q, r)            [rad/s]

Control input (length 4):

    u = [T, tau_x, tau_y, tau_z]   total thrust [N] along body +z, body torques [N·m]

This is the single source of truth the students *control*; in Week 2 they
re-derive `state_derivative` themselves and check it against this reference.
"""
from __future__ import annotations

import numpy as np

from .params import QuadParams, DEFAULT


def rotation_matrix(phi: float, theta: float, psi: float) -> np.ndarray:
    """Body->world rotation for ZYX (yaw-pitch-roll) Euler angles."""
    cphi, sphi = np.cos(phi), np.sin(phi)
    cth, sth = np.cos(theta), np.sin(theta)
    cpsi, spsi = np.cos(psi), np.sin(psi)
    return np.array(
        [
            [cpsi * cth, cpsi * sth * sphi - spsi * cphi, cpsi * sth * cphi + spsi * sphi],
            [spsi * cth, spsi * sth * sphi + cpsi * cphi, spsi * sth * cphi - cpsi * sphi],
            [-sth, cth * sphi, cth * cphi],
        ]
    )


def euler_rate_matrix(phi: float, theta: float) -> np.ndarray:
    """W maps body rates (p, q, r) -> Euler-angle rates (phi_dot, theta_dot, psi_dot)."""
    tth = np.tan(theta)
    cth = np.cos(theta)
    return np.array(
        [
            [1.0, np.sin(phi) * tth, np.cos(phi) * tth],
            [0.0, np.cos(phi), -np.sin(phi)],
            [0.0, np.sin(phi) / cth, np.cos(phi) / cth],
        ]
    )


def state_derivative(x: np.ndarray, u: np.ndarray, p: QuadParams = DEFAULT) -> np.ndarray:
    """Continuous-time dynamics: returns dx/dt for state x under control u."""
    phi, theta, psi = x[6], x[7], x[8]
    omega = x[9:12]
    T, tau = u[0], u[1:4]

    R = rotation_matrix(phi, theta, psi)

    # Translational: gravity + body-z thrust resolved into the world frame.
    accel = np.array([0.0, 0.0, -p.g]) + (R @ np.array([0.0, 0.0, T])) / p.mass

    # Rotational kinematics + Euler's equations.
    euler_dot = euler_rate_matrix(phi, theta) @ omega
    omega_dot = p.I_inv @ (tau - np.cross(omega, p.I @ omega))

    dx = np.empty(12)
    dx[0:3] = x[3:6]
    dx[3:6] = accel
    dx[6:9] = euler_dot
    dx[9:12] = omega_dot
    return dx


def rk4_step(x: np.ndarray, u: np.ndarray, dt: float, p: QuadParams = DEFAULT) -> np.ndarray:
    """One fixed-step classical Runge-Kutta (RK4) integration of the dynamics."""
    k1 = state_derivative(x, u, p)
    k2 = state_derivative(x + 0.5 * dt * k1, u, p)
    k3 = state_derivative(x + 0.5 * dt * k2, u, p)
    k4 = state_derivative(x + dt * k3, u, p)
    return x + (dt / 6.0) * (k1 + 2 * k2 + 2 * k3 + k4)


def motor_forces_to_wrench(f: np.ndarray, p: QuadParams = DEFAULT) -> np.ndarray:
    """4 motor thrusts -> control wrench [T, tau_x, tau_y, tau_z]."""
    return p.mixer_matrix() @ f


def wrench_to_motor_forces(u: np.ndarray, p: QuadParams = DEFAULT, clip: bool = True) -> np.ndarray:
    """Control wrench -> 4 motor thrusts (with optional saturation)."""
    f = p.allocation_matrix() @ u
    if clip:
        f = np.clip(f, p.f_min, p.f_max)
    return f


def hover_state(position=(0.0, 0.0, 1.0), yaw: float = 0.0) -> np.ndarray:
    """A convenient initial condition: at rest, level, at a given position/yaw."""
    x = np.zeros(12)
    x[0:3] = position
    x[8] = yaw
    return x
