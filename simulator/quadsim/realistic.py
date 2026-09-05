# Copyright (c) 2026 Dr Ken Lai (黎子健).
# Licensed under CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
# MLTE03 — Flight Dynamics and Intelligent Control Technologies, MUST.
"""A hidden-parameter "realistic" plant for the Week-10 reality-gap workshop.

Everything you tuned in Weeks 4-9 assumed the nominal `QuadParams` model:
instant motors, no air resistance, GPS fixes that arrive the moment they are
taken, a vehicle that weighs exactly what the datasheet says. Real aircraft
do none of that. `TeamPlant` puts five of those effects back:

  * **motor lag** — each rotor's thrust follows the command through a
    first-order filter with time constant `tau_motor`;
  * **aerodynamic drag** — a body-frame force `-(c_lin v_b + c_quad |v_b| v_b)`;
  * **gusts** — a world-frame force: a constant mean plus an Ornstein-Uhlenbeck
    (coloured-noise) component, so the wind wanders instead of holding still;
  * **GPS latency** — every fix is delivered `gps_latency` seconds after it was
    taken (the IMU is not delayed);
  * **mass / inertia / yaw-ratio offsets** — the plant flies `p_true`; your
    controller keeps believing `QuadParams()`;
  * **a ground** — z cannot go below 0 (the nominal model has no floor; a
    heavier-than-believed vehicle would otherwise "fall through the pad").

The values are derived deterministically from a *team id* (same sha256 idiom
as `student_params.py`), so every run of the same team id gets the same
aircraft — but the numbers are NOT printed anywhere on the student path. Your
job in Week 10 is to diagnose which effects are hurting you from the flight
data, exactly as a flight-test engineer would.

About hiding
------------
You can, of course, read this file and call `team_plant(id)._spec`. Nothing
stops you and nothing in the grading rewards it: the case-study deliverable is
a gap analysis of the controller you *already had*, not a controller re-tuned
to a plant you peeked at. The instructor can re-run any submission with a
different `salt`, which changes every hidden value while keeping the same
effect classes; a controller that only works on the un-salted plant is its own
confession. So spend the time on the diagnosis — that is the skill being built.

Conventions: ../CONVENTIONS.md (z-up; the 12-state layout is untouched — the
motor-lag state lives inside the plant, not in `x`).
"""
from __future__ import annotations

import hashlib
from collections import deque
from dataclasses import dataclass

import numpy as np

from .params import QuadParams, DEFAULT
from .dynamics import rotation_matrix, state_derivative, motor_forces_to_wrench
from .sensors import IMU, GPS
from .student_params import _rng_for, _NOMINAL_INERTIA

# ---------------------------------------------------------------------------
# Draw ranges (severity = 1.0). Calibrated so the reference CascadePID, tuned
# on the nominal model, still completes the Week-10 waypoint mission on every
# team's plant but with a clearly degraded track (see
# solutions/verify_team_plant.py for the sweep that pins these down). Do not
# change without re-running that sweep.
# ---------------------------------------------------------------------------
_MASS_OFFSET_RANGE = (0.04, 0.14)        # heavier only: the z integrator has to work
_INERTIA_SCALE_RANGE = (-0.15, 0.20)     # multiplicative offset on all three axes
_K_TORQUE_OFFSET_RANGE = (-0.10, 0.10)
_TAU_MOTOR_RANGE = (0.05, 0.12)          # s
_C_LIN_RANGE = (0.06, 0.18)              # N per m/s
_C_QUAD_RANGE = (0.03, 0.08)             # N per (m/s)^2
_GUST_MEAN_RANGE = (0.60, 0.85)          # N, horizontal, random heading
_GUST_SIGMA_RANGE = (0.4, 0.8)           # N, OU stationary std per axis
_GUST_TAU_RANGE = (1.0, 2.0)             # s, OU correlation time
_GPS_LATENCY_RANGE = (0.12, 0.30)        # s

_GUST_SEED_MASK = 0x67757374             # "gust"


@dataclass(frozen=True)
class PlantSpec:
    """The hidden truth. Instructor-facing; never printed on the student path."""
    p_true: QuadParams
    tau_motor: float
    c_lin: float
    c_quad: float
    gust_mean: np.ndarray          # (3,) world-frame N, z component 0
    gust_sigma: float
    gust_tau: float
    gps_latency: float

    def table(self, p_nominal: QuadParams = DEFAULT) -> str:
        dm = self.p_true.mass / p_nominal.mass - 1
        si = float(self.p_true.inertia[0] / p_nominal.inertia[0]) - 1
        dk = self.p_true.k_torque / p_nominal.k_torque - 1
        return (
            f"  mass offset     : {dm*100:+.1f} %  ({self.p_true.mass:.4f} kg)\n"
            f"  inertia scale   : {si*100:+.1f} %\n"
            f"  k_torque offset : {dk*100:+.1f} %\n"
            f"  motor tau       : {self.tau_motor*1000:.0f} ms\n"
            f"  drag c_lin      : {self.c_lin:.3f} N/(m/s)\n"
            f"  drag c_quad     : {self.c_quad:.3f} N/(m/s)^2\n"
            f"  gust mean       : {np.linalg.norm(self.gust_mean):.2f} N at "
            f"{np.degrees(np.arctan2(self.gust_mean[1], self.gust_mean[0])):.0f} deg\n"
            f"  gust sigma/tau  : {self.gust_sigma:.2f} N / {self.gust_tau:.2f} s\n"
            f"  GPS latency     : {self.gps_latency*1000:.0f} ms"
        )


class TeamPlant:
    """The plant the simulator integrates when `Simulator.run(..., plant=...)`.

    Owns: the true parameters, the per-motor thrust state (motor lag), the
    gust process, and factories for the latency-aware GPS and a physically
    consistent IMU. The simulator still owns saturation (it hands us the
    already-clipped motor commands) and the log.
    """

    def __init__(self, spec: PlantSpec, seed: int):
        self._spec = spec
        self._seed = int(seed)
        self.last_accel_world = np.zeros(3)
        self.reset(spec.p_true.dt)

    # -- lifecycle -----------------------------------------------------------
    def reset(self, dt: float) -> None:
        p = self._spec.p_true
        self._dt = dt
        self.f_act = np.full(p.n_rotors, p.hover_thrust_per_motor)
        self._ou = np.zeros(3)
        self._gust = self._spec.gust_mean.copy()
        self._rng = np.random.default_rng(self._seed ^ _GUST_SEED_MASK)
        self.last_accel_world = np.zeros(3)

    # -- physics --------------------------------------------------------------
    def _drag_world(self, x: np.ndarray) -> np.ndarray:
        s = self._spec
        R = rotation_matrix(x[6], x[7], x[8])
        v_b = R.T @ x[3:6]
        f_b = -(s.c_lin * v_b + s.c_quad * np.linalg.norm(v_b) * v_b)
        return R @ f_b

    def derivative(self, x: np.ndarray, u: np.ndarray, F_ext: np.ndarray) -> np.ndarray:
        """Nominal-structure dynamics on p_true, plus drag and an external force."""
        p = self._spec.p_true
        dx = state_derivative(x, u, p)
        dx[3:6] += (self._drag_world(x) + F_ext) / p.mass
        return dx

    def observe(self, x: np.ndarray, t: float) -> None:
        """Compute what an accelerometer would feel *now*, before the controller acts.

        Uses the current (lagged) motor thrusts and the current gust, so the
        IMU reports the true plant's acceleration — not the nominal model's.
        """
        u_act = motor_forces_to_wrench(self.f_act, self._spec.p_true)
        self.last_accel_world = self.derivative(x, u_act, self._gust)[3:6]

    def step(self, x: np.ndarray, f_cmd: np.ndarray, t: float, dt: float):
        """Advance one step. Returns (x_next, f_applied, u_applied)."""
        s = self._spec
        # Gust: exact-variance OU update, held constant through the RK4 step.
        self._ou += (-self._ou * dt / s.gust_tau
                     + s.gust_sigma * np.sqrt(2.0 * dt / s.gust_tau) * self._rng.standard_normal(3))
        self._gust = s.gust_mean + self._ou
        # Motor lag: exact zero-order-hold discretisation (stable for any dt).
        a = 1.0 - np.exp(-dt / s.tau_motor)
        self.f_act = self.f_act + a * (f_cmd - self.f_act)
        u_app = motor_forces_to_wrench(self.f_act, s.p_true)
        F = self._gust
        # RK4 on the plant's own derivative (drag must be inside the integrator).
        k1 = self.derivative(x, u_app, F)
        k2 = self.derivative(x + 0.5 * dt * k1, u_app, F)
        k3 = self.derivative(x + 0.5 * dt * k2, u_app, F)
        k4 = self.derivative(x + dt * k3, u_app, F)
        x_next = x + (dt / 6.0) * (k1 + 2 * k2 + 2 * k3 + k4)
        # The ground exists: a vehicle that is heavier than its controller
        # believes sags at take-off; on the real thing it just sits on the pad.
        if x_next[2] < 0.0:
            x_next[2] = 0.0
            x_next[5] = max(x_next[5], 0.0)
        return x_next, self.f_act.copy(), u_app

    # -- sensors that know the truth -----------------------------------------
    def make_gps(self, pos_noise=0.05, rate_hz=5.0) -> "DelayedGPS":
        return DelayedGPS(latency=self._spec.gps_latency, pos_noise=pos_noise, rate_hz=rate_hz)

    def make_imu(self, p_nominal: QuadParams = DEFAULT, **kw) -> "PlantIMU":
        return PlantIMU(self, p=p_nominal, **kw)

    # -- identity -------------------------------------------------------------
    def fingerprint(self) -> str:
        s = self._spec
        blob = repr((round(s.p_true.mass, 6), tuple(np.round(s.p_true.inertia, 9)),
                     round(s.p_true.k_torque, 6), round(s.tau_motor, 6),
                     round(s.c_lin, 6), round(s.c_quad, 6),
                     tuple(np.round(s.gust_mean, 6)), round(s.gust_sigma, 6),
                     round(s.gust_tau, 6), round(s.gps_latency, 6)))
        return hashlib.sha256(blob.encode()).hexdigest()[:8]

    def __repr__(self) -> str:
        return f"TeamPlant(fingerprint={self.fingerprint()!r}, hidden)"


class DelayedGPS(GPS):
    """A GPS whose fixes arrive `latency` seconds after they were taken."""

    def __init__(self, latency: float, pos_noise=0.05, rate_hz=5.0):
        super().__init__(pos_noise=pos_noise, rate_hz=rate_hz)
        self.latency = float(latency)
        self._queue: deque = deque()

    def read(self, t: float, x: np.ndarray, rng: np.random.Generator):
        fix = super().read(t, x, rng)           # taken now, if one is due
        if fix is not None:
            self._queue.append((t, fix))
        if self._queue and t + 1e-9 >= self._queue[0][0] + self.latency:
            return self._queue.popleft()[1]     # delivered late
        return None


class PlantIMU(IMU):
    """An IMU that measures the *true* plant's acceleration.

    The stock `IMU.read` synthesises the accelerometer from the nominal model
    (`state_derivative(x, u, self.p)`). Under a plant with drag, motor lag and
    an unknown mass that would report the wrong specific force — the exact
    failure mode recorded in certify.py's M3 notes. This one asks the plant.
    """

    def __init__(self, plant: TeamPlant, gyro_noise=0.01, acc_noise=0.1,
                 gyro_bias=0.0, p: QuadParams = DEFAULT):
        super().__init__(gyro_noise=gyro_noise, acc_noise=acc_noise, gyro_bias=gyro_bias, p=p)
        self._plant = plant

    def read(self, x: np.ndarray, u: np.ndarray, rng: np.random.Generator) -> dict:
        omega = x[9:12]
        a_world = self._plant.last_accel_world
        R = rotation_matrix(x[6], x[7], x[8])
        f_body = R.T @ (a_world - np.array([0.0, 0.0, -self.p.g]))
        gyro = omega + self.gyro_bias + self.gyro_noise * rng.standard_normal(3)
        acc = f_body + self.acc_noise * rng.standard_normal(3)
        return {"gyro": gyro, "acc": acc}


def team_plant(team_id: str, severity: float = 1.0, salt: str = "",
               p_nominal: QuadParams = DEFAULT) -> TeamPlant:
    """Derive a team's hidden plant. Same id (and salt) -> same plant, always.

    `severity` scales every offset linearly (0 = the nominal model exactly,
    1 = the calibrated course setting). `salt` is an instructor knob: it
    changes every hidden value while keeping the same effect classes.
    """
    if not team_id or not team_id.strip():
        raise ValueError("team_id must be a non-empty string")
    rng = _rng_for(f"team::{team_id}::{salt}")
    sv = float(severity)

    dm = sv * rng.uniform(*_MASS_OFFSET_RANGE)
    s_i = 1.0 + sv * rng.uniform(*_INERTIA_SCALE_RANGE)
    dk = sv * rng.uniform(*_K_TORQUE_OFFSET_RANGE)
    tau_m = max(sv * rng.uniform(*_TAU_MOTOR_RANGE), 1e-4)
    c_lin = sv * rng.uniform(*_C_LIN_RANGE)
    c_quad = sv * rng.uniform(*_C_QUAD_RANGE)
    g_mag = sv * rng.uniform(*_GUST_MEAN_RANGE)
    g_head = rng.uniform(0.0, 2.0 * np.pi)
    g_sigma = sv * rng.uniform(*_GUST_SIGMA_RANGE)
    g_tau = rng.uniform(*_GUST_TAU_RANGE)
    lat = sv * rng.uniform(*_GPS_LATENCY_RANGE)
    seed = int(rng.integers(0, 2**31 - 1))

    p_true = QuadParams(
        mass=p_nominal.mass * (1.0 + dm),
        inertia=_NOMINAL_INERTIA * s_i,
        arm=p_nominal.arm,
        k_torque=p_nominal.k_torque * (1.0 + dk),
        f_min=p_nominal.f_min, f_max=p_nominal.f_max, dt=p_nominal.dt,
    )
    spec = PlantSpec(
        p_true=p_true, tau_motor=float(tau_m), c_lin=float(c_lin), c_quad=float(c_quad),
        gust_mean=np.array([g_mag * np.cos(g_head), g_mag * np.sin(g_head), 0.0]),
        gust_sigma=float(g_sigma), gust_tau=float(g_tau), gps_latency=float(lat),
    )
    return TeamPlant(spec, seed=seed)
