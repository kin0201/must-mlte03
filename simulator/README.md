# quadsim — MLTE03 teaching simulator

A **minimal, fully readable** quadcopter flight simulator for *MLTE03 — Flight
Dynamics and Intelligent Control Technologies*. Pure **NumPy** 12-state
nonlinear model + an RK4 integrator + a closed-loop runner. No black boxes: a
master's student can read every line, re-derive the dynamics by hand, and build
their own controller on top.

This is the **course's own teaching harness** — the thing students design and
test their controllers in for the first ~10 weeks. The richer third-party
platforms (PyBullet / safe-control-gym / do-mpc) come in only for the
intelligent-control weeks; see [the course outline](../course-outline.md) and
[`lab-plan.md`](lab-plan.md).

## Why a custom simulator (not just gym-pybullet-drones)?

- **Transparency.** Students *implement the equations of motion themselves* in
  Week 2 and check them against `quadsim.dynamics`. You can't do that with a
  physics engine you can't see into.
- **Zero friction.** One hard dependency (`numpy`). Runs on any laptop in
  seconds — no GPU, no ROS, no compiler.
- **It's the spine.** Every week the student edits the *same* `StudentController`
  class, and by the final project it flies a full mission. The harness never
  changes underneath them.

## Install

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt          # numpy (+ matplotlib for plots)
```

## 60-second tour

```python
from quadsim import Simulator, QuadParams
from quadsim.dynamics import hover_state
from quadsim.controllers import CascadePID
from quadsim import trajectories as traj

sim = Simulator(QuadParams())
log = sim.run(
    x0=hover_state(position=(0, 0, 1.0)),
    controller=CascadePID(sim.params),     # the reference autopilot
    reference=traj.figure_eight(period=10.0),
    t_final=20.0,
)
print("tracking RMSE:", log.position_rmse())   # ~0.03 m
```

Run the labs from the `simulator/` directory (so `quadsim` is importable):

```bash
export PYTHONPATH=.
python examples/01_open_loop.py        # Wk 1: no feedback -> it tips over
python examples/02_hover_pid.py        # Wk 5-6: hold a hover setpoint
python examples/02_hover_pid.py --controller student   # your turn
python examples/03_figure8.py --plot --wind 0.5        # Wk 9: track a trajectory
python examples/08_team_mission.py --team T3           # Wk 10: your team's hidden 'realistic' plant
python -m pytest -q                    # smoke tests (physics + reference controller)
```

## What's inside

| File | What it is | Touched in |
|---|---|---|
| `quadsim/params.py` | Vehicle parameters + the motor-mixing matrix | Wk 3 |
| `quadsim/dynamics.py` | 12-state nonlinear EOM, RK4, mixer | Wk 2–3 |
| `quadsim/sim.py` | Closed-loop runner + `SimLog` (history, RMSE) | Wk 4 |
| `quadsim/sensors.py` | Noisy IMU + GPS models | Wk 8 |
| `quadsim/trajectories.py` | hover / step / waypoints / figure-eight refs | Wk 9–10 |
| `quadsim/realistic.py` | **`TeamPlant`** — hidden-parameter plant (motor lag, drag, gusts, GPS latency, mass offset) for the Wk-10 reality-gap workshop | Wk 10 |
| `quadsim/controllers/base.py` | The `Controller` interface | Wk 5 |
| `quadsim/controllers/cascade_pid.py` | **Reference** cascade-PID autopilot (the baseline) | Wk 5–7 |
| `quadsim/controllers/student.py` | **`StudentController`** — the file you edit all term | Wk 5 → final |
| `quadsim/analysis.py` | Linearize-about-hover, poles, controllability, **LQR** (pure-NumPy Riccati) | Wk 4, 7 |
| `quadsim/controllers/mpc.py` | **Linear MPC** — condensed QP, input limits, reference preview | Wk 12 |
| `certify.py` | **Certification harness** — missions, requirements, PASS/FAIL evidence | Wk 11, 13–15 |
| `quadsim/controllers/rl.py` | *(unlisted reference)* Policy search (CEM) — not taught, carries no marks | — |
| `quadsim/estimators.py` | Complementary filter + **Kalman filter** (IMU/GPS); close the loop on the estimate | Wk 8 |
| `quadsim/plotting.py` | State/3-D plots + strobe, animation, tracking error, phase portrait, pole map, covariance ellipse, learning curve | all |

Worked demos (each runnable from `simulator/`, `PYTHONPATH=.`):
`examples/04_analysis.py` (linearize → LQR → fly), `05_mpc.py` (preview + constraints),
`07_estimation.py` (fly on the estimate), `08_team_mission.py` (nominal vs your team's
realistic plant). *(Retired Plan-1 RL scripts live in `legacy-plan1/` — not taught, no marks.)*
**Conventions are fixed in [`CONVENTIONS.md`](CONVENTIONS.md) — read it before extending the model or the slides.**

## The model (so you know what you're controlling)

State `x` ∈ ℝ¹² = `[ position(3), velocity(3), euler ZYX(3), body rates(3) ]`,
world frame, SI units. Control `u` = `[T, τx, τy, τz]` (total body-z thrust +
body torques). The simulator turns your wrench into four motor thrusts, clips
them to the actuator limits, and integrates with RK4. See the derivation in
`dynamics.py` — it matches Quan Quan, *Introduction to Multicopter Design and
Control* (Ch. 6) and Beard & McLain.

## License

---

© 2026 Dr Ken Lai（黎子健）. Licensed under [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) — free to use and adapt for non-commercial teaching, with attribution.
