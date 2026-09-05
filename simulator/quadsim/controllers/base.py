# Copyright (c) 2026 Dr Ken Lai (黎子健).
# Licensed under CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
# MLTE03 — Flight Dynamics and Intelligent Control Technologies, MUST.
"""Controller interface — everything the simulator needs from a controller."""
from __future__ import annotations

import numpy as np


class Controller:
    """Base class. Students subclass this and implement `control`.

    The simulator calls `control` once per step and expects a 4-vector wrench
    `[T, tau_x, tau_y, tau_z]` (total thrust [N] and body torques [N·m]). The
    simulator handles motor mixing and saturation, so a controller only ever
    reasons about thrust and torque.
    """

    def reset(self) -> None:
        """Clear any internal state (integrators, filters) before a run."""

    def control(self, t: float, x: np.ndarray, ref: dict) -> np.ndarray:
        raise NotImplementedError
