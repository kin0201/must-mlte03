# MLTE03 — Conventions & correctness sheet

> The **single source of truth** for sign/frame conventions across the course.
> Every slide deck, lab sheet, and line of `quadsim` must match this page. It is
> locked to what `quadsim/dynamics.py` and `quadsim/params.py` actually compute,
> and cross-checked against the deep-research source pass (2026-06-07). Pick ONE
> convention course-wide — mixing them is the #1 source of student (and instructor) bugs.

## The course convention (what `quadsim` uses)

| Choice | This course | Why / note |
|---|---|---|
| **World axes** | **ENU-style, z-up** (z positive **up**) | Matches `quadsim`: `accel = [0,0,−g] + R·[0,0,T]/m`. Gravity is `−z`, thrust is `+body-z`. |
| **Gravity** | \( \mathbf{g}=(0,0,-g),\ g=9.81 \) | Up-positive ⇒ gravity is negative-z. |
| **Thrust** | total thrust \(T\) along **+body-z**, rotated to world by \(R\) | `R @ [0,0,T]`. |
| **Euler sequence** | **ZYX intrinsic** (yaw ψ → pitch θ → roll φ), aka 3-2-1 | `rotation_matrix(phi,theta,psi)` = \(R_z(\psi)R_y(\theta)R_x(\phi)\), body→world. |
| **Rotation matrix** | \(R\in SO(3)\): columns = body axes in world; \(R^{-1}=R^\top\), \(\det R=+1\) | Standard. |
| **State (12)** | \([\,\mathbf p(3),\ \mathbf v(3),\ (\phi,\theta,\psi),\ \boldsymbol\omega(3)\,]\), world-frame p,v; body-frame rates | `dynamics.py` docstring. |
| **Control wrench** | \(\mathbf u=[T,\tau_x,\tau_y,\tau_z]\) (total thrust + body torques) | Simulator does mixing + motor saturation. |
| **Motor layout** | **X-frame**, 4 rotors | `params.mixer_matrix()` — see below. ⚠ NOT plus-frame. |
| **Realistic plant** (Wk 10 only) | `quadsim/realistic.py` `TeamPlant`: motor lag τ_m (per-motor first-order, state kept *inside the plant*), body-frame drag −(c₁v_b + c₂‖v_b‖v_b) rotated by R, world-frame gust force, GPS latency, p_true ≠ controller's p | The 12-state layout is unchanged; `Simulator.run(plant=None)` is the classic loop bit-for-bit. |
| **Quaternions** (Wk 1 only, for teaching) | **scalar-first / Hamilton** \(q=[q_0,q_1,q_2,q_3]\) | ⚠ SciPy `Rotation.as_quat` is scalar-**last** by default. |

## The X-frame mixer (course standard — verify against `params.mixer_matrix()`)

`quadsim` maps 4 motor thrusts \(f_i\) → wrench with arm \(l\), torque ratio \(c\):

\[
\begin{bmatrix}T\\\tau_x\\\tau_y\\\tau_z\end{bmatrix}=
\begin{bmatrix}1&1&1&1\\-l&-l&l&l\\ l&-l&-l&l\\-c&c&-c&c\end{bmatrix}
\begin{bmatrix}f_1\\f_2\\f_3\\f_4\end{bmatrix}
\]

The controller returns a wrench; the simulator inverts this (`allocation_matrix`) and clips to `[f_min, f_max]`.

> **CONVENTION HAZARD (verified).** Most free references — MathWorks NMPC page,
> Bresciani thesis, Gibiansky — give the **plus-frame** mixing matrix
> (roll uses only motors 2&4, pitch only 1&3). Our course is **X-frame** (every
> motor contributes to roll AND pitch). When citing those sources in slides,
> **relabel/re-derive to X-frame** or students will wire the wrong mixer.

## Convention hazards to call out in lecture (all verified)

1. **NED vs ENU (up sign).** Beard & McLain / the UAVbook use **NED** (z-down, gravity +z).
   We use **z-up**. If you lift an equation from Beard, flip the z-axis sign. Never mix the two in one derivation.
2. **Plus-frame vs X-frame mixer** — see above.
3. **Quaternion order:** scalar-first (Hamilton, all the theses below) vs scalar-last (SciPy/JPL).
   A guaranteed bug when students paste SciPy code. Always state the order on the slide.
4. **Gimbal lock:** every Euler convention has exactly **two** singularities; for ZYX (Tait-Bryan)
   they're at **pitch \(\theta=\pm90°\)** (the *second* rotation). This is the motivation for quaternions.
5. **BYU mavsim / UAVbook are fixed-wing.** Frames, kinematics, and the EKF transfer directly;
   the **vehicle dynamics, aero forces (Ch4), and autopilot (Ch6) need quadrotor substitution.**
6. **Do NOT** teach the DiVA thesis's fixed-vs-body-frame labeling of the quaternion derivative
   \(\dot q=\tfrac12 q\otimes[0,\omega]\) as-is — that specific framing **failed** independent
   verification (0-3). Re-derive \(\dot q\) from a primary source if you teach it.

## Source: deep-research pass (2026-06-07)

24/25 claims confirmed via 3-vote adversarial verification; 1 refuted (the quaternion-derivative
framing above). Full machine output archived in
`research/2026-06-07-deep-research-raw.json`; the citable map is in
[`../teaching-resources.md`](../teaching-resources.md).

---

© 2026 Dr Ken Lai（黎子健）. Licensed under [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) — free to use and adapt for non-commercial teaching, with attribution.
