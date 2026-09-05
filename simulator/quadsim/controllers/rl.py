# Copyright (c) 2026 Dr Ken Lai (黎子健).
# Licensed under CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
# MLTE03 — Flight Dynamics and Intelligent Control Technologies, MUST.
"""Learning-based control by policy search — pure NumPy.

RETIRED (Plan 2, 2026-08-25): not taught, not on any lab sheet, carries no marks.
Kept as an unlisted reference; the scripts that used it live in legacy-plan1/.

We treat controller design as *reinforcement learning*: define a reward, a policy
with tunable parameters, and let the agent improve the policy from rollouts — no
model gradients, no hand-tuning. The method here is the **Cross-Entropy Method
(CEM)**, a simple, reliable evolutionary/black-box RL algorithm:

    repeat:
      sample a population of parameter vectors from a Gaussian
      run an episode for each, score it with the reward
      keep the top-k "elites", refit the Gaussian to them

CEM needs no GPU and no deep-RL framework, so it runs anywhere — perfect for a
2 GB teaching box. (PPO / SAC with Stable-Baselines3 + gym-pybullet-drones is the
"production" path; we point at it in the slides but don't require it.)

The policy reuses the **cascade control law** the students already know, but its
8 gains are *learned from reward* instead of designed. Week 14 adds **domain
randomization** (random mass + wind per episode) — the standard first step toward
closing the sim-to-real gap.
"""
from __future__ import annotations

import numpy as np

from .base import Controller
from ..params import QuadParams, DEFAULT
from ..sim import Simulator
from ..dynamics import hover_state
from .. import trajectories as traj


# Reasonable parameter scale (so CEM searches in a sensible range). Order:
# [kp_xy, kp_z, kd_xy, kd_z, kp_rp, kp_yaw, kd_rp, kd_yaw]
PARAM_NAMES = ["kp_xy", "kp_z", "kd_xy", "kd_z", "kp_rp", "kp_yaw", "kd_rp", "kd_yaw"]
PARAM_SCALE = np.array([6.0, 12.0, 4.0, 8.0, 180.0, 80.0, 28.0, 20.0])
N_PARAMS = len(PARAM_SCALE)


class GainPolicy(Controller):
    """A cascade position/attitude controller whose 8 gains are the policy params.
    `theta` is in *normalized* units (1.0 == PARAM_SCALE); kept non-negative."""

    def __init__(self, theta, p: QuadParams = DEFAULT):
        self.p = p
        self.set_theta(theta)
        self.max_tilt = np.deg2rad(30.0)

    def set_theta(self, theta):
        g = np.maximum(np.asarray(theta, float), 0.0) * PARAM_SCALE
        (self.kp_xy, self.kp_z, self.kd_xy, self.kd_z,
         self.kp_rp, self.kp_yaw, self.kd_rp, self.kd_yaw) = g

    def control(self, t, x, ref):
        p = self.p
        pos, vel, euler, omega = x[0:3], x[3:6], x[6:9], x[9:12]
        pos_ref = np.asarray(ref.get("pos", [0, 0, 0]), float)
        yaw_ref = float(ref.get("yaw", 0.0))

        kp_pos = np.array([self.kp_xy, self.kp_xy, self.kp_z])
        kd_pos = np.array([self.kd_xy, self.kd_xy, self.kd_z])
        a_des = kp_pos * (pos_ref - pos) + kd_pos * (-vel)

        T = p.mass * (p.g + a_des[2])
        T = max(T, 0.1 * p.weight)
        phi_des = np.clip((1.0 / p.g) * (a_des[0] * np.sin(yaw_ref) - a_des[1] * np.cos(yaw_ref)),
                          -self.max_tilt, self.max_tilt)
        theta_des = np.clip((1.0 / p.g) * (a_des[0] * np.cos(yaw_ref) + a_des[1] * np.sin(yaw_ref)),
                            -self.max_tilt, self.max_tilt)
        att_des = np.array([phi_des, theta_des, yaw_ref])

        kp_att = np.array([self.kp_rp, self.kp_rp, self.kp_yaw])
        kd_att = np.array([self.kd_rp, self.kd_rp, self.kd_yaw])
        e_att = att_des - euler
        e_att[2] = (e_att[2] + np.pi) % (2 * np.pi) - np.pi
        tau = p.inertia * (kp_att * e_att + kd_att * (-omega))
        return np.array([T, tau[0], tau[1], tau[2]])


def episode_reward(theta, p: QuadParams = DEFAULT, t_final=6.0, seed=None,
                   domain_rand=False):
    """Run one hover-recovery episode and return a scalar reward (higher = better).

    Start displaced + tilted; reward = -(tracking cost + small control effort),
    with a big penalty for diverging. With `domain_rand`, mass and a wind gust are
    randomized per episode (Week 14, sim-to-real)."""
    rng = np.random.default_rng(seed)
    pp = p
    wind = None
    if domain_rand:
        pp = QuadParams(mass=float(p.mass * rng.uniform(0.8, 1.3)))
        w = rng.normal(0, 0.6, 3); w[2] = 0.0
        wind = lambda t: w
    sim = Simulator(pp)
    x0 = hover_state(position=(0.6, -0.5, 1.0))
    x0[6] = np.deg2rad(15.0); x0[7] = np.deg2rad(-12.0)
    target = [0.0, 0.0, 1.5]
    try:
        log = sim.run(x0, GainPolicy(theta, pp),
                      reference=traj.step(position=target, start=(0, 0, 1.0), t_step=0.0),
                      t_final=t_final, wind=wind)
    except Exception:
        return -1e6
    P = log.position
    if not np.all(np.isfinite(P)) or np.max(np.abs(P)) > 50:
        return -1e6
    err = P - np.asarray(target)
    track = np.mean(np.sum(err ** 2, axis=1))
    effort = 1e-4 * np.mean(np.sum(log.u[:, 1:] ** 2, axis=1))
    return -(track + effort)


def train_cem(reward_fn=None, iters=25, pop=40, elite_frac=0.25, seed=0,
              init_mean=None, init_std=0.5, domain_rand=False, verbose=False):
    """Cross-Entropy Method over the 8 policy gains. Returns (best_theta, history)
    where history is the per-iteration mean elite reward (the learning curve)."""
    reward_fn = reward_fn or (lambda th, s: episode_reward(th, seed=s, domain_rand=domain_rand))
    rng = np.random.default_rng(seed)
    mean = np.full(N_PARAMS, 0.6) if init_mean is None else np.asarray(init_mean, float)
    std = np.full(N_PARAMS, init_std)
    n_elite = max(2, int(pop * elite_frac))
    history = []
    best_theta, best_r = mean.copy(), -np.inf

    for it in range(iters):
        samples = np.clip(rng.normal(mean, std, size=(pop, N_PARAMS)), 0.02, 3.0)
        # Same episode seed within an iteration => fair comparison across the population.
        ep_seed = int(rng.integers(1 << 30))
        rewards = np.array([reward_fn(s, ep_seed) for s in samples])
        order = np.argsort(rewards)[::-1]
        elites = samples[order[:n_elite]]
        mean = elites.mean(axis=0)
        std = elites.std(axis=0) + 1e-3
        history.append(float(rewards[order[:n_elite]].mean()))
        if rewards[order[0]] > best_r:
            best_r, best_theta = float(rewards[order[0]]), samples[order[0]].copy()
        if verbose:
            print(f"  iter {it:2d}: elite reward {history[-1]:.4f}  best {best_r:.4f}")
    return best_theta, history
