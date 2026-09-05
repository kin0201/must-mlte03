# Copyright (c) 2026 Dr Ken Lai (黎子健).
# Licensed under CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
# MLTE03 — Flight Dynamics and Intelligent Control Technologies, MUST.
"""Per-student vehicle dynamics for the individual final project.

Every student certifies against a DIFFERENT quadcopter — a different mass,
arm length, yaw-torque ratio and inertia, all derived deterministically from
their student ID. Two students can compare notes, discuss MPC theory, even
read each other's code, but a controller tuned against one student's vehicle
does not simply drop into another's: the numbers that make REQ-M3-1 marginal
for you are not the numbers that make it marginal for your neighbour.

Deterministic, not random: the SAME student ID always produces the SAME
vehicle, on any machine, forever — `certify.py --student <id>` reproduces
exactly what that student saw. This is a seeded derivation, not a save file.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass

import numpy as np

from quadsim.params import QuadParams

# Nominal course values (== QuadParams() defaults) that every student's
# vehicle is drawn AROUND. The M3 requirement thresholds (CERTIFICATION.md
# §4) were calibrated at the nominal 0.65 -> 0.45 kg (0.20 kg) drop, and
# that calibration already leaves the reference LinearMPC only ~0.03 m of
# margin against the 0.50 m REQ-M3-1 bar. THE ABSOLUTE MASS DELTA IS THE
# LOAD-BEARING QUANTITY: a Monte-Carlo sweep of 35 synthetic students
# (2026-08-25) found MPC failing to certify for ~23% of students whenever
# the absolute delta drifted above nominal — every failure had delta_mass
# > 0.21 kg, every pass had delta_mass < 0.19 kg, cleanly separated. So the
# delta is drawn directly, capped AT OR BELOW nominal, never above; do not
# change this range without re-running `verify_student_range.py`.
_NOMINAL_MASS = 0.65
_NOMINAL_DELTA_MASS = 0.20          # the original 0.65 -> 0.45 kg drop
_NOMINAL_ARM = 0.17
_NOMINAL_K_TORQUE = 0.016
_NOMINAL_INERTIA = np.array([2.3e-3, 2.3e-3, 4.0e-3])

# Bounds are intentionally tight: wide enough that no two students' vehicles
# behave identically, tight enough that the SAME controller design (and the
# same fixed certification thresholds) work for every student in the range.
_MASS_RANGE = (0.57, 0.73)             # nominal 0.65 +/- ~12%
_DELTA_MASS_RANGE = (0.15, 0.20)       # capped AT nominal, never above — see note
_ARM_RANGE = (0.15, 0.19)              # nominal 0.17 +/- ~12%
_K_TORQUE_RANGE = (0.0135, 0.0185)     # nominal 0.016 +/- ~15%
_INERTIA_SCALE_RANGE = (0.88, 1.12)    # applied uniformly to all three axes


@dataclass
class StudentVehicle:
    student_id: str
    p_heavy: QuadParams     # pre-drop params (also the M1/M2/M4 params)
    p_light: QuadParams     # post-drop params (M3 segment 2 only)
    mass_heavy: float
    mass_light: float
    drop_fraction: float

    def summary(self) -> str:
        return (
            f"student={self.student_id!r}\n"
            f"  mass:      {self.mass_heavy:.4f} kg -> {self.mass_light:.4f} kg "
            f"(drop {self.drop_fraction*100:.1f}%)\n"
            f"  arm:       {self.p_heavy.arm:.4f} m\n"
            f"  k_torque:  {self.p_heavy.k_torque:.5f}\n"
            f"  inertia:   {np.array2string(self.p_heavy.inertia, precision=5)}"
        )


def _rng_for(student_id: str) -> np.random.Generator:
    """A student ID -> a stable 64-bit seed -> a reproducible generator.

    sha256, not Python's built-in hash(): hash() is salted per-process
    (PYTHONHASHSEED) specifically so it is NOT stable across runs — exactly
    the property we need here, so it is the wrong tool. sha256 gives the
    same digest for the same string on any machine, always.
    """
    digest = hashlib.sha256(student_id.strip().lower().encode("utf-8")).digest()
    seed = int.from_bytes(digest[:8], "big")
    return np.random.default_rng(seed)


def student_vehicle(student_id: str) -> StudentVehicle:
    """Derive this student's unique, reproducible quadcopter.

    `student_id` should be something stable and personal — a student number
    works well. Changing it (even by whitespace or case) changes the vehicle,
    so use the exact same string every time you certify.
    """
    if not student_id or not student_id.strip():
        raise ValueError("student_id must be a non-empty string")

    rng = _rng_for(student_id)
    mass = float(rng.uniform(*_MASS_RANGE))
    delta_mass = float(rng.uniform(*_DELTA_MASS_RANGE))
    arm = float(rng.uniform(*_ARM_RANGE))
    k_torque = float(rng.uniform(*_K_TORQUE_RANGE))
    inertia_scale = float(rng.uniform(*_INERTIA_SCALE_RANGE))

    mass_light = mass - delta_mass
    drop_frac = delta_mass / mass
    inertia = _NOMINAL_INERTIA * inertia_scale

    p_heavy = QuadParams(mass=mass, arm=arm, k_torque=k_torque, inertia=inertia)
    p_light = QuadParams(mass=mass_light, arm=arm, k_torque=k_torque, inertia=inertia)

    return StudentVehicle(
        student_id=student_id, p_heavy=p_heavy, p_light=p_light,
        mass_heavy=mass, mass_light=mass_light, drop_fraction=drop_frac,
    )


if __name__ == "__main__":
    import sys
    if len(sys.argv) != 2:
        raise SystemExit("usage: python -m quadsim.student_params <student_id>")
    print(student_vehicle(sys.argv[1]).summary())
