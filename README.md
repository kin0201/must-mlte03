# MLTE03 — Flight Dynamics & Intelligent Control Technologies

Course materials for **MLTE03 飛行動力學與智能控制技術**, Macau University of
Science and Technology (Master's, 2026 Fall).

A hands-on, model-based course built around **one platform — the quadrotor**.
You derive the 6-DOF model, make it fly with classical and optimal control,
estimate its state, then push it further with model-predictive control and
reinforcement learning — all in a transparent Python simulator you write your
own controller into, week after week.

## What's here

| Folder | Contents |
|---|---|
| `course-site/` | The course website — 15-week plan, slide decks, lab sheets, assignment briefs. Open `course-site/index.html` locally, or read it online at <https://course.ainrobotics.com/mlte03/site/>. |
| `simulator/` | **`quadsim`** — the pure-NumPy quadrotor simulator you build your controller in. Start with `simulator/INSTALL.md`. |

## Quick start

```bash
git clone https://github.com/kin0201/must-mlte03.git
cd must-mlte03/simulator
python3 -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
PYTHONPATH=. python examples/01_open_loop.py
```

Full instructions, including Windows and mainland-China mirrors:
[`simulator/INSTALL.md`](simulator/INSTALL.md).

## Staying up to date

Materials are updated through the term. Refresh with:

```bash
git pull
```

> This repository is rebuilt and force-pushed from the instructor's private
> source repository, so **do not commit your work here** — keep your own
> controller in your own copy or your own repo. Coursework is handed in on the
> course platform, not through this repository.

## Submission

All graded work (six lab reports, the team case study, the final project) is handed
in on the **course platform** — not the school LMS:

**<https://course.ainrobotics.com/mlte03/>**

Log in once at the Ken Sir course hub, join this course (course key or your student
ID), then upload each week's file. Every version you upload is kept, and the same
page shows your marks, feedback, quiz scores and attendance. Each assignment brief
in `course-site/assignments/` states exactly what to hand in and how it is graded.

---

Instructor: Lai Chi Kin（黎子健）· cklai@must.edu.mo
