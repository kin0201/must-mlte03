# Copyright (c) 2026 Dr Ken Lai (黎子健).
# Licensed under CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
# MLTE03 — Flight Dynamics and Intelligent Control Technologies, MUST.
"""Physical parameters of the course quadcopter (a generic small X-frame quad).

Everything the simulator needs lives in one dataclass so students can see — and
change — every number that defines the vehicle. Units are SI (kg, m, s, N, N·m).
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np


@dataclass
class QuadParams:
    # --- Body ---
    mass: float = 0.65                      # total mass [kg]
    g: float = 9.81                         # gravity [m/s^2]
    # Diagonal inertia about body axes [kg·m^2] (Ixx, Iyy, Izz)
    inertia: np.ndarray = field(
        default_factory=lambda: np.array([2.3e-3, 2.3e-3, 4.0e-3])
    )

    # --- Geometry / rotors (X configuration) ---
    arm: float = 0.17                       # motor arm length [m]
    k_torque: float = 0.016                 # yaw-torque / thrust ratio [m]
    n_rotors: int = 4

    # --- Actuator limits (per motor thrust, [N]) ---
    f_min: float = 0.0
    f_max: float = 4.0                      # ~2.5x hover-per-motor headroom

    # --- Simulation defaults ---
    dt: float = 0.005                       # integration step [s] (200 Hz)

    @property
    def weight(self) -> float:
        return self.mass * self.g

    @property
    def hover_thrust(self) -> float:
        """Total thrust needed to hover [N]."""
        return self.weight

    @property
    def hover_thrust_per_motor(self) -> float:
        return self.weight / self.n_rotors

    @property
    def I(self) -> np.ndarray:               # noqa: E743 - I reads naturally here
        return np.diag(self.inertia)

    @property
    def I_inv(self) -> np.ndarray:
        return np.diag(1.0 / self.inertia)

    def mixer_matrix(self) -> np.ndarray:
        """M maps the 4 motor thrusts -> [T, tau_x, tau_y, tau_z].

            [ T    ]   [  1    1    1    1 ] [ f1 ]
            [ tau_x] = [ -l   -l    l    l ] [ f2 ]
            [ tau_y]   [  l   -l   -l    l ] [ f3 ]
            [ tau_z]   [ -c    c   -c    c ] [ f4 ]

        Invert it to get the control-allocation (mixer) used by a controller.
        """
        l, c = self.arm, self.k_torque
        return np.array(
            [
                [1.0, 1.0, 1.0, 1.0],
                [-l, -l, l, l],
                [l, -l, -l, l],
                [-c, c, -c, c],
            ]
        )

    def allocation_matrix(self) -> np.ndarray:
        """Inverse mixer: [T, tau_x, tau_y, tau_z] -> 4 motor thrusts."""
        return np.linalg.inv(self.mixer_matrix())


DEFAULT = QuadParams()
