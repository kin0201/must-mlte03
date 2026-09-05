# Copyright (c) 2026 Dr Ken Lai (黎子健).
# Licensed under CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
# MLTE03 — Flight Dynamics and Intelligent Control Technologies, MUST.
"""Reference generators used across the labs.

Each returns a function `ref(t) -> dict(pos=[x,y,z], yaw=psi)` so it can be
handed straight to `Simulator.run(..., reference=ref)`.
"""
from __future__ import annotations

import numpy as np


def hover(position=(0.0, 0.0, 1.0), yaw=0.0):
    pos = np.asarray(position, float)

    def ref(t):
        return {"pos": pos, "yaw": yaw}

    return ref


def step(position=(1.0, 1.0, 1.5), yaw=0.0, t_step=1.0, start=(0.0, 0.0, 1.0)):
    """Hold `start`, then jump to `position` at t = t_step (a step response test)."""
    p0, p1 = np.asarray(start, float), np.asarray(position, float)

    def ref(t):
        return {"pos": p1 if t >= t_step else p0, "yaw": yaw}

    return ref


def figure_eight(a=1.0, b=0.5, height=1.5, period=10.0, yaw_follow=False):
    """A smooth figure-of-eight in the horizontal plane — the classic tracking test.

    Provides position **and** its velocity/acceleration so a controller can use
    feedforward (Week 10): tracking a moving target with feedback alone always lags.
    """
    w = 2 * np.pi / period

    def ref(t):
        pos = np.array([a * np.sin(w * t), b * np.sin(2 * w * t), height])
        vel = np.array([a * w * np.cos(w * t), 2 * b * w * np.cos(2 * w * t), 0.0])
        acc = np.array([-a * w**2 * np.sin(w * t), -4 * b * w**2 * np.sin(2 * w * t), 0.0])
        yaw = np.arctan2(vel[1], vel[0]) if yaw_follow else 0.0
        return {"pos": pos, "vel": vel, "acc": acc, "yaw": yaw}

    return ref


def waypoints(points, speed=0.5, yaw=0.0, hold=1.0):
    """Fly a list of waypoints at roughly constant speed, pausing `hold` s at each.

    `points` is an (M, 3) array. Returns a reference that linearly interpolates
    between consecutive waypoints — enough to exercise a guidance/nav loop.
    """
    pts = np.asarray(points, float)
    seg_len = np.linalg.norm(np.diff(pts, axis=0), axis=1)
    seg_time = seg_len / max(speed, 1e-6)
    # timeline: arrive at wp i, hold, then travel to i+1
    arrive = np.zeros(len(pts))
    for i in range(1, len(pts)):
        arrive[i] = arrive[i - 1] + hold + seg_time[i - 1]
    total = arrive[-1] + hold

    def ref(t):
        tt = min(t, total)
        i = int(np.searchsorted(arrive, tt, side="right") - 1)
        i = max(0, min(i, len(pts) - 1))
        if i >= len(pts) - 1:
            return {"pos": pts[-1], "yaw": yaw}
        t_leave = arrive[i] + hold
        if tt <= t_leave:                       # holding at waypoint i
            return {"pos": pts[i], "yaw": yaw}
        frac = (tt - t_leave) / max(seg_time[i], 1e-6)
        frac = np.clip(frac, 0.0, 1.0)
        return {"pos": (1 - frac) * pts[i] + frac * pts[i + 1], "yaw": yaw}

    return ref
