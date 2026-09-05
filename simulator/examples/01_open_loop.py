# Copyright (c) 2026 Dr Ken Lai (黎子健).
# Licensed under CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
# MLTE03 — Flight Dynamics and Intelligent Control Technologies, MUST.
"""Week 1 lab: fly the quad OPEN-LOOP and watch it fall over.

The point: with no feedback, even perfect hover thrust can't hold attitude —
the quad is unstable. This is *why* the rest of the course exists.

    python examples/01_open_loop.py
"""
import numpy as np

from quadsim import Simulator, QuadParams
from quadsim.controllers.base import Controller
from quadsim.dynamics import hover_state


class OpenLoopHover(Controller):
    """Apply exactly hover thrust and a tiny torque bias — no feedback at all."""

    def __init__(self, p):
        self.p = p

    def control(self, t, x, ref):
        return np.array([self.p.weight, 0.001, 0.0, 0.0])  # 0.001 N·m roll bias


def main():
    sim = Simulator(QuadParams())
    log = sim.run(hover_state(position=(0, 0, 2.0)), OpenLoopHover(sim.params), t_final=3.0)
    roll_final = np.rad2deg(log.euler[-1, 0])
    print(f"final roll angle after 3 s open loop: {roll_final:.1f} deg  (it tips over)")
    try:
        from quadsim.plotting import plot_states
        plot_states(log, save="open_loop.png", show=False)
        print("saved open_loop.png")
    except ImportError:
        print("(install matplotlib to see the plot)")


if __name__ == "__main__":
    main()
