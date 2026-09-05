# Copyright (c) 2026 Dr Ken Lai (黎子健).
# Licensed under CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
# MLTE03 — Flight Dynamics and Intelligent Control Technologies, MUST.
"""Smoke tests: the physics and the reference controller behave sanely.

Run with:  python -m pytest -q   (or)   python tests/test_smoke.py
"""
import numpy as np

from quadsim import Simulator, QuadParams
from quadsim.dynamics import (
    state_derivative,
    rk4_step,
    hover_state,
    motor_forces_to_wrench,
    wrench_to_motor_forces,
)
from quadsim.controllers import CascadePID
from quadsim import trajectories as traj


def test_hover_is_an_equilibrium():
    """At hover thrust, level and at rest, the state should not change."""
    p = QuadParams()
    x = hover_state(position=(0, 0, 1.0))
    u = np.array([p.weight, 0, 0, 0])
    dx = state_derivative(x, u, p)
    assert np.allclose(dx[3:], 0, atol=1e-9), dx


def test_mixer_roundtrip():
    """wrench -> motors -> wrench should be the identity (no saturation)."""
    p = QuadParams()
    u = np.array([p.weight, 0.05, -0.03, 0.01])
    f = wrench_to_motor_forces(u, p, clip=False)
    assert np.allclose(motor_forces_to_wrench(f, p), u)


def test_open_loop_falls():
    """No feedback + zero thrust => the quad falls under gravity."""
    p = QuadParams()
    x = hover_state(position=(0, 0, 5.0))
    for _ in range(200):
        x = rk4_step(x, np.zeros(4), p.dt, p)
    assert x[2] < 5.0


def test_cascade_pid_holds_setpoint():
    """The reference controller should reach a step setpoint with small error."""
    sim = Simulator(QuadParams())
    target = [1.0, -1.0, 1.5]
    log = sim.run(
        hover_state(position=(0, 0, 1.0)),
        CascadePID(sim.params),
        reference=traj.step(position=target, start=(0, 0, 1.0), t_step=0.5),
        t_final=8.0,
    )
    final_err = np.linalg.norm(log.position[-1] - target)
    assert final_err < 0.1, f"final error too large: {final_err:.3f} m"


def test_cascade_pid_tracks_figure8():
    sim = Simulator(QuadParams())
    log = sim.run(
        hover_state(position=(0, 0, 1.5)),
        CascadePID(sim.params),
        reference=traj.figure_eight(period=10.0),
        t_final=20.0,
    )
    assert log.position_rmse() < 0.25, log.position_rmse()


def test_linearization_and_lqr():
    """Hover linearizes to a marginally-stable, controllable system that LQR stabilizes."""
    from quadsim import analysis as an

    p = QuadParams()
    A, B = an.linearize(p)
    assert A.shape == (12, 12) and B.shape == (12, 4)
    _, rank = an.controllability(A, B)
    assert rank == 12, f"not fully controllable: rank {rank}"
    ol = an.poles(A)
    assert np.all(ol.real < 1e-6), "open-loop hover should not be unstable-divergent"
    Q = np.diag([10, 10, 10, 1, 1, 1, 10, 10, 10, 1, 1, 1.0])
    R = np.diag([1.0, 10, 10, 10])
    _, _, cl = an.lqr(A, B, Q, R)
    assert np.all(cl.real < 0), "LQR closed loop must be stable"


def test_mpc_tracks_and_respects_limits():
    """Linear MPC holds a setpoint, tracks a previewed trajectory, and obeys input limits."""
    from quadsim.controllers import LinearMPC

    p = QuadParams()
    sim = Simulator(p)
    # setpoint
    target = [1.0, -1.0, 1.5]
    log = sim.run(hover_state(position=(0, 0, 1.0)), LinearMPC(p),
                  reference=traj.step(position=target, start=(0, 0, 1.0), t_step=0.5), t_final=8.0)
    assert np.linalg.norm(log.position[-1] - target) < 0.1
    # previewed trajectory tracking
    fe = traj.figure_eight(period=10.0)
    logp = sim.run(hover_state(position=(0, 0, 1.5)), LinearMPC(p, ref_fn=fe), reference=fe, t_final=20.0)
    assert logp.position_rmse() < 0.2, logp.position_rmse()
    # actuator limits never violated, even with a tight thrust cap
    tight = sim.run(hover_state(position=(0, 0, 1.0)), LinearMPC(p, dT_max=1.0),
                    reference=traj.step(position=[0, 0, 3.0], start=(0, 0, 1.0), t_step=0.5), t_final=10.0)
    assert tight.f.max() <= p.f_max + 1e-6


def test_estimator_closes_loop_on_estimate():
    """Complementary filter + KF estimate is accurate enough to fly the loop on it."""
    from quadsim.estimators import EstimatedStateController

    p = QuadParams()
    sim = Simulator(p)
    ctrl = EstimatedStateController(CascadePID(p), p)
    target = [1.0, -1.0, 1.5]
    log = sim.run(hover_state(position=(0, 0, 1.0)), ctrl,
                  reference=traj.step(position=target, start=(0, 0, 1.0), t_step=0.5), t_final=10.0)
    assert np.linalg.norm(log.position[-1] - target) < 0.2          # flew there on the estimate
    est = np.array([xh for _, xh in ctrl.est_log])
    true = log.x[:len(est)]
    pos_rmse = np.sqrt(np.mean(np.sum((est[:, 0:3] - true[:, 0:3]) ** 2, axis=1)))
    assert pos_rmse < 0.3, f"position estimate RMSE too high: {pos_rmse:.3f}"


def test_rl_cem_learns_hover_policy():
    """CEM improves the reward and the learned policy stabilizes a hover (fast config)."""
    from quadsim.controllers import rl

    p = QuadParams()
    best, hist = rl.train_cem(iters=5, pop=12, seed=0, init_std=0.4)
    assert np.all(np.isfinite(best))
    assert hist[-1] >= hist[0], "no learning progress"
    sim = Simulator(p)
    x0 = hover_state(position=(0.6, -0.5, 1.0)); x0[6] = np.deg2rad(15); x0[7] = np.deg2rad(-12)
    log = sim.run(x0, rl.GainPolicy(best),
                  reference=traj.step(position=[0, 0, 1.5], start=(0, 0, 1.0), t_step=0.0), t_final=5.0)
    assert np.linalg.norm(log.position[-1] - [0, 0, 1.5]) < 0.6


def test_visualizations_render_headless():
    """Every plot helper renders without a display (Agg backend) and returns a figure."""
    import matplotlib
    matplotlib.use("Agg")
    from quadsim import plotting as viz
    from quadsim import analysis as an

    sim = Simulator(QuadParams())
    log = sim.run(hover_state(position=(0, 0, 1.0)), CascadePID(sim.params),
                  reference=traj.figure_eight(period=10.0), t_final=4.0)
    assert viz.plot_pose_strobe(log, n=6, show=False) is not None
    assert viz.plot_tracking_error(log, show=False) is not None
    assert viz.plot_phase_portrait(log, axis="roll", show=False) is not None
    A, B = an.linearize(QuadParams())
    assert viz.plot_poles([an.poles(A)], labels=["open loop"], show=False) is not None
    assert viz.plot_learning_curve([-1.0, -0.5, -0.2], show=False) is not None
    assert viz.plot_estimation_error(log.t, log.x, log.x, show=False) is not None


# ---------------------------------------------------------------------------
# Week-10 hidden "realistic" plant (quadsim/realistic.py)
# ---------------------------------------------------------------------------

def test_nominal_path_unchanged():
    """Regression guard: with plant=None the classic loop is bit-for-bit what it was."""
    sim = Simulator(QuadParams())
    log = sim.run(hover_state(position=(0, 0, 1.0)), CascadePID(sim.params),
                  reference=traj.step(position=[1.0, -1.0, 1.5], start=(0, 0, 1.0), t_step=0.5),
                  t_final=8.0)
    assert log.f_cmd is None
    assert abs(log.position_rmse([1.0, -1.0, 1.5]) - 0.5268297676800145) < 1e-12, log.position_rmse([1.0, -1.0, 1.5])


def test_team_plant_is_deterministic():
    """Same team id -> same plant; different id or salt -> different plant."""
    from quadsim.realistic import team_plant
    a, b = team_plant("T3"), team_plant("T3")
    assert a.fingerprint() == b.fingerprint()
    assert team_plant("T4").fingerprint() != a.fingerprint()
    assert team_plant("T3", salt="x").fingerprint() != a.fingerprint()
    assert "hidden" in repr(a) and "mass" not in repr(a)


def test_team_plant_within_ranges():
    """Every drawn value sits inside its declared range, for many ids."""
    from quadsim import realistic as rl_
    p0 = QuadParams()
    for k in range(50):
        s = rl_.team_plant(f"rng{k}")._spec
        dm = s.p_true.mass / p0.mass - 1
        assert rl_._MASS_OFFSET_RANGE[0] - 1e-9 <= dm <= rl_._MASS_OFFSET_RANGE[1] + 1e-9
        assert rl_._TAU_MOTOR_RANGE[0] <= s.tau_motor <= rl_._TAU_MOTOR_RANGE[1]
        assert rl_._C_LIN_RANGE[0] <= s.c_lin <= rl_._C_LIN_RANGE[1]
        assert rl_._GPS_LATENCY_RANGE[0] <= s.gps_latency <= rl_._GPS_LATENCY_RANGE[1]
        g = np.linalg.norm(s.gust_mean)
        assert rl_._GUST_MEAN_RANGE[0] <= g <= rl_._GUST_MEAN_RANGE[1] and s.gust_mean[2] == 0.0


def test_motor_lag_delays_thrust():
    """A doubled command is only partly realised after one step; fully after many."""
    from quadsim.realistic import team_plant
    plant = team_plant("lag")
    p = plant._spec.p_true
    plant.reset(p.dt)
    hover = p.hover_thrust_per_motor
    cmd = np.full(4, 2 * hover)
    x = hover_state(position=(0, 0, 1.0))
    _, f_app, _ = plant.step(x, cmd, 0.0, p.dt)
    assert np.all(f_app > hover) and np.all(f_app < 2 * hover), f_app
    for _ in range(int(1.0 / p.dt)):
        _, f_app, _ = plant.step(x, cmd, 0.0, p.dt)
    assert np.allclose(f_app, cmd, rtol=1e-3)


def test_drag_opposes_velocity():
    """With forward velocity the plant's acceleration has a component against it."""
    from quadsim.realistic import team_plant
    plant = team_plant("drag")
    p = plant._spec.p_true
    x = hover_state(position=(0, 0, 1.0)); x[3] = 1.0
    u = np.array([p.weight, 0, 0, 0])
    dx = plant.derivative(x, u, np.zeros(3))
    assert dx[3] < 0.0, dx[3]


def test_delayed_gps_holds_fix():
    """A fix taken at t=0 is not delivered before t >= latency."""
    from quadsim.realistic import DelayedGPS
    gps = DelayedGPS(latency=0.2, pos_noise=0.0, rate_hz=5.0)
    rng = np.random.default_rng(0)
    x = hover_state(position=(1, 2, 3))
    assert gps.read(0.0, x, rng) is None
    assert gps.read(0.1, x, rng) is None
    fix = gps.read(0.2, x, rng)
    assert fix is not None and np.allclose(fix, [1, 2, 3])


def test_plant_imu_reports_true_accel():
    """The plant-aware IMU sees a heavier vehicle sag; the stock IMU cannot."""
    from quadsim.sensors import IMU
    from quadsim.realistic import PlantSpec, TeamPlant
    p0 = QuadParams()
    dm = 0.10
    spec = PlantSpec(p_true=QuadParams(mass=p0.mass * (1 + dm)), tau_motor=0.05, c_lin=0.0, c_quad=0.0,
                     gust_mean=np.zeros(3), gust_sigma=0.0, gust_tau=1.0, gps_latency=0.0)
    plant = TeamPlant(spec, seed=0)
    plant.reset(p0.dt)
    x = hover_state(position=(0, 0, 1.0))
    u_nominal = np.array([p0.weight, 0, 0, 0])
    # command nominal hover thrust to the heavier plant, settle the motor lag, observe
    f_cmd = np.full(4, p0.hover_thrust_per_motor)
    for _ in range(400):
        plant.step(x, f_cmd, 0.0, p0.dt)
    plant.observe(x, 0.0)
    rng = np.random.default_rng(0)
    stock = IMU(acc_noise=0.0, gyro_noise=0.0, p=p0).read(x, u_nominal, rng)["acc"][2]
    aware = plant.make_imu(p0, acc_noise=0.0, gyro_noise=0.0).read(x, u_nominal, rng)["acc"][2]
    assert abs(stock - p0.g) < 1e-9                              # stock IMU: "hovering perfectly"
    assert abs(aware - p0.g / (1 + dm)) < 1e-6, aware            # aware IMU: T/m_true, i.e. the sag


def test_realistic_plant_mission_completes():
    """The reference PID survives a team plant on the Week-10 mission, visibly degraded."""
    import importlib.util, pathlib
    spec = importlib.util.spec_from_file_location(
        "tm", pathlib.Path(__file__).resolve().parents[1] / "examples" / "08_team_mission.py")
    tm = importlib.util.module_from_spec(spec); spec.loader.exec_module(tm)
    from quadsim.realistic import team_plant
    _, m_n = tm.fly("cascade", None)
    _, m_r = tm.fly("cascade", team_plant("T1"))
    assert not m_r["crashed"]
    assert max(m_r["land_xy"], m_r["land_z"]) < 1.0
    assert m_r["rmse"] > 1.2 * m_n["rmse"], (m_n["rmse"], m_r["rmse"])


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"PASS {name}")
    print("all smoke tests passed")
