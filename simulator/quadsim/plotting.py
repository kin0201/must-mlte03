# Copyright (c) 2026 Dr Ken Lai (黎子健).
# Licensed under CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
# MLTE03 — Flight Dynamics and Intelligent Control Technologies, MUST.
"""Plotting helpers (optional — needs matplotlib).

Kept separate so the core simulator depends only on numpy. Import these only
when you actually want a figure.
"""
from __future__ import annotations

import numpy as np


def plot_states(log, save=None, show=True):
    """Time histories of position (vs reference), attitude, and motor thrusts."""
    import matplotlib.pyplot as plt

    fig, axes = plt.subplots(3, 1, figsize=(9, 9), sharex=True)
    labels = ["x", "y", "z"]
    for i in range(3):
        axes[0].plot(log.t, log.position[:, i], label=labels[i])
        if not np.all(np.isnan(log.ref[:, i])):
            axes[0].plot(log.t, log.ref[:, i], "--", color=f"C{i}", alpha=0.5)
    axes[0].set_ylabel("position [m]")
    axes[0].legend(loc="upper right")
    axes[0].set_title("Quadcopter response (dashed = reference)")

    for i, name in enumerate(["roll", "pitch", "yaw"]):
        axes[1].plot(log.t, np.rad2deg(log.euler[:, i]), label=name)
    axes[1].set_ylabel("attitude [deg]")
    axes[1].legend(loc="upper right")

    for i in range(log.f.shape[1]):
        axes[2].plot(log.t, log.f[:, i], label=f"motor {i + 1}")
    axes[2].set_ylabel("thrust [N]")
    axes[2].set_xlabel("time [s]")
    axes[2].legend(loc="upper right")

    fig.tight_layout()
    if save:
        fig.savefig(save, dpi=120)
    if show:
        plt.show()
    return fig


def plot_trajectory_3d(log, save=None, show=True):
    """3-D flight path with reference overlaid."""
    import matplotlib.pyplot as plt
    from mpl_toolkits.mplot3d import Axes3D  # noqa: F401

    fig = plt.figure(figsize=(7, 6))
    ax = fig.add_subplot(111, projection="3d")
    p = log.position
    ax.plot(p[:, 0], p[:, 1], p[:, 2], label="flown", lw=2)
    if not np.all(np.isnan(log.ref)):
        ax.plot(log.ref[:, 0], log.ref[:, 1], log.ref[:, 2], "--", alpha=0.6, label="reference")
    ax.scatter(*p[0], c="g", s=40, label="start")
    ax.scatter(*p[-1], c="r", s=40, label="end")
    ax.set_xlabel("x [m]"); ax.set_ylabel("y [m]"); ax.set_zlabel("z [m]")
    ax.legend()
    fig.tight_layout()
    if save:
        fig.savefig(save, dpi=120)
    if show:
        plt.show()
    return fig


# ---------------------------------------------------------------------------
# Analysis & "impressive" visualizations (Weeks 4, 7, 9, 10) — all matplotlib.
# ---------------------------------------------------------------------------

def _quad_arms(p_world, R, arm=0.17):
    """Two X-frame arm segments (4 rotor tips) given a body->world rotation R."""
    tips_body = arm * np.array([[1, 1, 0], [-1, -1, 0], [1, -1, 0], [-1, 1, 0]], float)
    return [p_world + R @ t for t in tips_body]


def plot_pose_strobe(log, n=14, arm=0.17, save=None, show=True):
    """3-D flight path with the quad's X-frame drawn at intervals — a single
    static PNG that reads like a long-exposure 'strobe' photo of the flight.
    Robust everywhere (no animation writer needed)."""
    import matplotlib.pyplot as plt
    from mpl_toolkits.mplot3d import Axes3D  # noqa: F401
    from .dynamics import rotation_matrix

    fig = plt.figure(figsize=(8, 6.5))
    ax = fig.add_subplot(111, projection="3d")
    P = log.position
    ax.plot(P[:, 0], P[:, 1], P[:, 2], color="0.6", lw=1.2, label="path")
    if not np.all(np.isnan(log.ref)):
        ax.plot(log.ref[:, 0], log.ref[:, 1], log.ref[:, 2], "--", color="C1", alpha=0.7, label="reference")

    idx = np.linspace(0, len(P) - 1, n).astype(int)
    for k, i in enumerate(idx):
        R = rotation_matrix(*log.euler[i])
        t1, t2, t3, t4 = _quad_arms(P[i], R, arm)
        col = plt.cm.viridis(k / max(n - 1, 1))
        ax.plot(*zip(t1, t2), color=col, lw=2)
        ax.plot(*zip(t3, t4), color=col, lw=2)
        ax.scatter(*P[i], color=col, s=12)
    ax.scatter(*P[0], c="g", s=45, label="start")
    ax.scatter(*P[-1], c="r", s=45, label="end")
    ax.set_xlabel("x [m]"); ax.set_ylabel("y [m]"); ax.set_zlabel("z [m]")
    ax.set_title("Flight strobe (colour = time)")
    ax.legend(loc="upper left")
    _equal_aspect_3d(ax, P)
    fig.tight_layout()
    if save:
        fig.savefig(save, dpi=120)
    if show:
        plt.show()
    return fig


def animate_3d(log, arm=0.17, stride=4, save=None, show=True, fps=30):
    """Live 3-D animation of the quad flying. Returns a FuncAnimation.
    If `save` ends in .gif/.mp4 it tries to write it (needs pillow/ffmpeg)."""
    import matplotlib.pyplot as plt
    from matplotlib.animation import FuncAnimation
    from mpl_toolkits.mplot3d import Axes3D  # noqa: F401
    from .dynamics import rotation_matrix

    P = log.position
    fig = plt.figure(figsize=(7, 6))
    ax = fig.add_subplot(111, projection="3d")
    ax.set_xlabel("x [m]"); ax.set_ylabel("y [m]"); ax.set_zlabel("z [m]")
    _equal_aspect_3d(ax, P)
    trace, = ax.plot([], [], [], color="0.6", lw=1)
    arm1, = ax.plot([], [], [], color="C0", lw=3)
    arm2, = ax.plot([], [], [], color="C0", lw=3)
    frames = range(0, len(P), stride)

    def update(i):
        trace.set_data(P[:i + 1, 0], P[:i + 1, 1]); trace.set_3d_properties(P[:i + 1, 2])
        R = rotation_matrix(*log.euler[i])
        t1, t2, t3, t4 = _quad_arms(P[i], R, arm)
        arm1.set_data([t1[0], t2[0]], [t1[1], t2[1]]); arm1.set_3d_properties([t1[2], t2[2]])
        arm2.set_data([t3[0], t4[0]], [t3[1], t4[1]]); arm2.set_3d_properties([t3[2], t4[2]])
        return trace, arm1, arm2

    anim = FuncAnimation(fig, update, frames=frames, interval=1000 / fps, blit=False)
    if save:
        if save.endswith(".gif"):
            from matplotlib.animation import PillowWriter
            anim.save(save, writer=PillowWriter(fps=fps))
        else:
            anim.save(save, fps=fps)
    if show:
        plt.show()
    return anim


def plot_tracking_error(log, target=None, save=None, show=True):
    """Per-axis tracking error and its Euclidean norm over time, with the RMSE."""
    import matplotlib.pyplot as plt

    ref = np.asarray(target, float) if target is not None else log.ref
    err = log.position - ref
    norm = np.sqrt(np.nansum(err ** 2, axis=1))
    rmse = float(np.sqrt(np.nanmean(norm ** 2)))

    fig, axes = plt.subplots(2, 1, figsize=(9, 6), sharex=True)
    for i, name in enumerate(["x", "y", "z"]):
        axes[0].plot(log.t, err[:, i], label=f"e_{name}")
    axes[0].axhline(0, color="0.7", lw=0.8)
    axes[0].set_ylabel("error [m]"); axes[0].legend(loc="upper right")
    axes[0].set_title(f"Tracking error (RMSE = {rmse:.3f} m)")
    axes[1].plot(log.t, norm, color="C3", label="norm of error")
    axes[1].axhline(rmse, color="C3", ls="--", alpha=0.6, label="RMSE")
    axes[1].set_ylabel("‖error‖ [m]"); axes[1].set_xlabel("time [s]"); axes[1].legend(loc="upper right")
    fig.tight_layout()
    if save:
        fig.savefig(save, dpi=120)
    if show:
        plt.show()
    return fig


def plot_phase_portrait(log, axis="roll", save=None, show=True):
    """Angle vs angular-rate phase portrait for one attitude axis — the classic
    second-order-system picture (spiral in to the origin = damped stabilization)."""
    import matplotlib.pyplot as plt

    j = {"roll": 0, "pitch": 1, "yaw": 2}[axis]
    ang = np.rad2deg(log.euler[:, j])
    rate = np.rad2deg(log.x[:, 9 + j])
    fig, ax = plt.subplots(figsize=(6.5, 6))
    sc = ax.scatter(ang, rate, c=log.t, cmap="viridis", s=8)
    ax.plot(ang, rate, color="0.8", lw=0.6, zorder=0)
    ax.scatter([ang[0]], [rate[0]], c="g", s=50, label="start")
    ax.scatter([0], [0], marker="*", c="r", s=120, label="target")
    ax.set_xlabel(f"{axis} [deg]"); ax.set_ylabel(f"{axis} rate [deg/s]")
    ax.set_title(f"Phase portrait — {axis}")
    fig.colorbar(sc, ax=ax, label="time [s]"); ax.legend()
    fig.tight_layout()
    if save:
        fig.savefig(save, dpi=120)
    if show:
        plt.show()
    return fig


def plot_poles(eig_sets, labels=None, save=None, show=True):
    """Pole map in the complex plane. Pass a list of eigenvalue arrays (e.g.
    [open_loop, closed_loop]) to compare; the imaginary axis is the stability
    boundary — poles must lie strictly left of it."""
    import matplotlib.pyplot as plt

    if isinstance(eig_sets, np.ndarray):
        eig_sets = [eig_sets]
    labels = labels or [f"set {i}" for i in range(len(eig_sets))]
    fig, ax = plt.subplots(figsize=(7, 6))
    markers = ["x", "o", "s", "^"]
    for k, ev in enumerate(eig_sets):
        ax.scatter(ev.real, ev.imag, marker=markers[k % len(markers)], s=70,
                   label=labels[k], color=f"C{k}")
    ax.axvline(0, color="0.5", lw=1)
    ax.axhline(0, color="0.85", lw=0.8)
    allr = np.concatenate([e.real for e in eig_sets]); alli = np.concatenate([e.imag for e in eig_sets])
    mr = max(1.0, np.abs(allr).max() * 1.2); mi = max(1.0, np.abs(alli).max() * 1.2)
    ax.axvspan(0, mr, color="red", alpha=0.04)  # unstable half-plane
    ax.set_xlim(-mr, mr * 0.4); ax.set_ylim(-mi, mi)
    ax.set_xlabel("Re(lambda)  [1/s]"); ax.set_ylabel("Im(lambda)")
    ax.set_title("Pole map (shaded = unstable, Re > 0)")
    ax.legend(loc="upper left")
    fig.tight_layout()
    if save:
        fig.savefig(save, dpi=120)
    if show:
        plt.show()
    return fig


def _equal_aspect_3d(ax, P):
    """Give a 3-D axis equal aspect so the quad isn't visually distorted."""
    xyz = P[~np.isnan(P).any(axis=1)]
    if len(xyz) == 0:
        return
    centers = xyz.mean(axis=0)
    span = max(np.ptp(xyz, axis=0).max(), 1.0) / 2
    ax.set_xlim(centers[0] - span, centers[0] + span)
    ax.set_ylim(centers[1] - span, centers[1] + span)
    ax.set_zlim(centers[2] - span, centers[2] + span)


# ---------------------------------------------------------------------------
# Estimation (Week 8) & learning (Weeks 13-14) visualizations.
# ---------------------------------------------------------------------------

def plot_estimation_error(t, x_true, x_est, save=None, show=True):
    """Estimate vs truth: position-error norm and attitude-error over time."""
    import matplotlib.pyplot as plt

    pe = np.linalg.norm(x_est[:, 0:3] - x_true[:, 0:3], axis=1)
    ae = np.rad2deg(np.linalg.norm(x_est[:, 6:9] - x_true[:, 6:9], axis=1))
    fig, axes = plt.subplots(2, 1, figsize=(9, 6), sharex=True)
    axes[0].plot(t, pe, color="C0"); axes[0].set_ylabel("‖pos error‖ [m]")
    axes[0].set_title(f"Estimation error (pos RMSE {np.sqrt(np.mean(pe**2)):.3f} m, "
                      f"att RMSE {np.sqrt(np.mean(ae**2)):.2f}°)")
    axes[1].plot(t, ae, color="C3"); axes[1].set_ylabel("attitude error [deg]")
    axes[1].set_xlabel("time [s]")
    fig.tight_layout()
    if save:
        fig.savefig(save, dpi=120)
    if show:
        plt.show()
    return fig


def plot_covariance_ellipse(mean2d, cov2d, n_std=2.0, ax=None, save=None, show=True, **kw):
    """Draw an n-sigma covariance ellipse (the classic Kalman-filter uncertainty
    picture) for a 2-D mean/cov. Eigen-decompose cov for the axes/orientation."""
    import matplotlib.pyplot as plt
    from matplotlib.patches import Ellipse

    made = ax is None
    if made:
        fig, ax = plt.subplots(figsize=(6, 6))
    else:
        fig = ax.figure
    vals, vecs = np.linalg.eigh(np.asarray(cov2d))
    order = vals.argsort()[::-1]
    vals, vecs = vals[order], vecs[:, order]
    angle = np.degrees(np.arctan2(vecs[1, 0], vecs[0, 0]))
    w, h = 2 * n_std * np.sqrt(np.maximum(vals, 0))
    ax.add_patch(Ellipse(xy=mean2d, width=w, height=h, angle=angle,
                         fill=False, lw=2, **kw))
    ax.scatter(*mean2d, s=20)
    if made:
        ax.set_aspect("equal"); ax.set_xlabel("x [m]"); ax.set_ylabel("y [m]")
        ax.set_title(f"{n_std}σ covariance ellipse")
    if save:
        fig.savefig(save, dpi=120)
    if show:
        plt.show()
    return fig


def plot_learning_curve(history, save=None, show=True):
    """RL training curve: elite reward vs CEM iteration."""
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=(8, 5))
    ax.plot(range(1, len(history) + 1), history, "-o", color="C2")
    ax.set_xlabel("CEM iteration"); ax.set_ylabel("elite mean reward")
    ax.set_title("Policy search — learning curve (higher = better)")
    ax.grid(alpha=0.3)
    fig.tight_layout()
    if save:
        fig.savefig(save, dpi=120)
    if show:
        plt.show()
    return fig
