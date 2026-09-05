/* ==========================================================================
   attitude-demo.js — a tiny, dependency-free 1-DOF attitude PID simulator.

   The same inner attitude loop quadsim's CascadePID uses, reduced to one axis
   so students can *feel* what Kp and Kd do before they write any code.

   Closed-loop model (inertia cancels, exactly as in cascade_pid.py where
   tau = I*(Kp*e + Kd*(-omega))):

        theta_ddot = Kp*(theta_ref - theta) - Kd*theta_dot

   => natural frequency wn = sqrt(Kp), damping zeta = Kd / (2*sqrt(Kp)).
   The reference autopilot uses Kp=180, Kd=28  (zeta ~ 1.04, slightly damped),
   which are the slider defaults here.

   Usage:  <div class="attitude-demo"></div>  + this script. Every such div on
   the page is auto-mounted. Optional data- attributes:
       data-kp, data-kd, data-ref (deg), data-title
   ========================================================================== */
(function () {
  "use strict";

  const DEG = Math.PI / 180;

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function slider(row, key, label, min, max, step, val, unit) {
    const wrap = el("div", "ad-row");
    const lab = el("label", null,
      `<span class="lbl">${label}</span><span class="val" data-for="${key}">${val}${unit || ""}</span>`);
    const inp = el("input");
    inp.type = "range"; inp.min = min; inp.max = max; inp.step = step; inp.value = val;
    inp.dataset.key = key;
    wrap.appendChild(lab); wrap.appendChild(inp);
    row.appendChild(wrap);
    return inp;
  }

  function mount(host) {
    const cfg = {
      kp: parseFloat(host.dataset.kp || "180"),
      kd: parseFloat(host.dataset.kd || "28"),
      refDeg: parseFloat(host.dataset.ref || "20"),
      title: host.dataset.title || "Inner attitude loop — tune Kp, Kd",
    };

    host.innerHTML = "";
    const head = el("div", "ad-head");
    head.appendChild(el("div", "ad-title", cfg.title));
    const stats = el("div", "ad-stats", "");
    head.appendChild(stats);
    host.appendChild(head);

    const cv = el("div", "ad-canvases");
    const quadCv = el("canvas"); quadCv.width = 400; quadCv.height = 300;
    const plotCv = el("canvas"); plotCv.width = 760; plotCv.height = 300;
    cv.appendChild(quadCv); cv.appendChild(plotCv);
    host.appendChild(cv);

    const ctrls = el("div", "ad-controls");
    const sKp  = slider(ctrls, "kp",  "K<sub>p</sub> (stiffness)",  0, 400, 1, cfg.kp, "");
    const sKd  = slider(ctrls, "kd",  "K<sub>d</sub> (damping)",    0, 80,  1, cfg.kd, "");
    const sRef = slider(ctrls, "ref", "θ target",                  -30, 30, 1, cfg.refDeg, "°");
    host.appendChild(ctrls);

    const btns = el("div", "ad-btns");
    const bKick  = el("button", null, "↯ Disturb");
    const bReset = el("button", null, "↺ Reset");
    const bRef   = el("button", null, "Use reference gains (180 / 28)");
    btns.appendChild(bKick); btns.appendChild(bReset); btns.appendChild(bRef);
    host.appendChild(btns);

    // ---- state ----
    const S = {
      kp: cfg.kp, kd: cfg.kd, refDeg: cfg.refDeg,
      theta: 0, omega: 0, t: 0,
      hist: [], // {t, theta, ref}
    };
    const HIST_T = 5.0; // seconds shown

    function reset() { S.theta = 0; S.omega = 0; S.t = 0; S.hist = []; }
    function kick() { S.omega += 6.0; } // sudden body-rate disturbance [rad/s]

    sKp.oninput  = () => { S.kp = +sKp.value;  upd("kp", S.kp); };
    sKd.oninput  = () => { S.kd = +sKd.value;  upd("kd", S.kd); };
    sRef.oninput = () => { S.refDeg = +sRef.value; upd("ref", S.refDeg + "°"); };
    bReset.onclick = reset;
    bKick.onclick = kick;
    bRef.onclick = () => {
      S.kp = 180; S.kd = 28; sKp.value = 180; sKd.value = 28;
      upd("kp", 180); upd("kd", 28); reset();
    };
    function upd(key, v) {
      const t = host.querySelector(`.val[data-for="${key}"]`);
      if (t) t.textContent = v;
    }

    // ---- physics: fixed-step substeps for stability irrespective of frame rate ----
    function integrate(realDt) {
      const dt = 0.002;                    // 500 Hz internal step
      let acc = Math.min(realDt, 0.05);    // clamp big gaps (tab switch)
      const ref = S.refDeg * DEG;
      while (acc > 0) {
        const h = Math.min(dt, acc); acc -= h;
        const e = ref - S.theta;
        const thddot = S.kp * e - S.kd * S.omega;
        S.omega += thddot * h;
        S.theta += S.omega * h;
        S.t += h;
      }
      S.hist.push({ t: S.t, theta: S.theta, ref });
      while (S.hist.length && S.hist[0].t < S.t - HIST_T) S.hist.shift();
    }

    // ---- rendering ----
    function drawQuad(c) {
      const g = c.getContext("2d"), W = c.width, H = c.height;
      g.clearRect(0, 0, W, H);
      const cx = W / 2, cy = H / 2, arm = W * 0.34;
      // target ghost
      g.save(); g.translate(cx, cy); g.rotate(S.refDeg * DEG);
      g.strokeStyle = "rgba(245,166,35,.5)"; g.lineWidth = 2; g.setLineDash([6, 6]);
      g.beginPath(); g.moveTo(-arm, 0); g.lineTo(arm, 0); g.stroke();
      g.restore();
      // actual quad
      g.save(); g.translate(cx, cy); g.rotate(S.theta);
      g.setLineDash([]);
      g.strokeStyle = "#1ec8c8"; g.lineWidth = 5; g.lineCap = "round";
      g.beginPath(); g.moveTo(-arm, 0); g.lineTo(arm, 0); g.stroke();
      for (const s of [-1, 1]) {
        g.fillStyle = "#eaf3fb";
        g.beginPath(); g.arc(s * arm, 0, 10, 0, 7); g.fill();
        g.strokeStyle = "rgba(234,243,251,.6)"; g.lineWidth = 2;
        g.beginPath(); g.arc(s * arm, 0, 16, 0, 7); g.stroke();
      }
      // up vector
      g.strokeStyle = "rgba(234,243,251,.35)"; g.lineWidth = 2; g.setLineDash([3, 4]);
      g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -arm * 0.7); g.stroke();
      g.restore();
      g.fillStyle = "#7d97ad"; g.font = "12px ui-monospace, monospace";
      g.fillText(`θ = ${(S.theta / DEG).toFixed(1)}°`, 10, 20);
    }

    function drawPlot(c) {
      const g = c.getContext("2d"), W = c.width, H = c.height;
      g.clearRect(0, 0, W, H);
      const padL = 36, padB = 18, padT = 10;
      const yMax = 35 * DEG, yMin = -35 * DEG;
      const x2 = (t) => padL + (W - padL - 6) * (1 - (S.t - t) / HIST_T);
      const y2 = (v) => padT + (H - padT - padB) * (1 - (v - yMin) / (yMax - yMin));
      // gridlines
      g.strokeStyle = "rgba(255,255,255,.08)"; g.lineWidth = 1; g.font = "10px ui-monospace, monospace";
      g.fillStyle = "#7d97ad";
      for (const deg of [-30, -15, 0, 15, 30]) {
        const y = y2(deg * DEG);
        g.beginPath(); g.moveTo(padL, y); g.lineTo(W - 6, y); g.stroke();
        g.fillText(deg + "°", 4, y + 3);
      }
      if (S.hist.length < 2) return;
      // reference
      g.strokeStyle = "rgba(245,166,35,.85)"; g.lineWidth = 2; g.setLineDash([5, 5]);
      g.beginPath();
      S.hist.forEach((p, i) => { const X = x2(p.t), Y = y2(p.ref); i ? g.lineTo(X, Y) : g.moveTo(X, Y); });
      g.stroke();
      // response
      g.setLineDash([]); g.strokeStyle = "#1ec8c8"; g.lineWidth = 2.5;
      g.beginPath();
      S.hist.forEach((p, i) => { const X = x2(p.t), Y = y2(p.theta); i ? g.lineTo(X, Y) : g.moveTo(X, Y); });
      g.stroke();
    }

    function updateStats() {
      const wn = Math.sqrt(Math.max(S.kp, 1e-9));
      const zeta = S.kd / (2 * wn);
      let cls = "critically damped", col = "var(--ok)";
      if (zeta < 0.7) { cls = "underdamped → overshoot"; col = "var(--bad)"; }
      else if (zeta > 1.3) { cls = "overdamped → sluggish"; col = "var(--amber-dk)"; }
      stats.innerHTML =
        `ω<sub>n</sub>=<b>${wn.toFixed(1)}</b> rad/s · ζ=<b style="color:${col}">${zeta.toFixed(2)}</b> · ` +
        `<span style="color:${col}">${cls}</span>`;
    }

    let last = null;
    function loop(ts) {
      if (last == null) last = ts;
      const dt = (ts - last) / 1000; last = ts;
      integrate(dt);
      drawQuad(quadCv);
      drawPlot(plotCv);
      updateStats();
      host._raf = requestAnimationFrame(loop);
    }

    // pause when offscreen (saves battery on the long course site)
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { if (!host._raf) { last = null; host._raf = requestAnimationFrame(loop); } }
        else if (host._raf) { cancelAnimationFrame(host._raf); host._raf = null; }
      });
    }, { threshold: 0.05 });
    io.observe(host);
  }

  function init() {
    document.querySelectorAll(".attitude-demo").forEach((h) => { if (!h._mounted) { h._mounted = true; mount(h); } });
  }

  // expose for reveal.js (slides mount lazily as you navigate)
  window.AttitudeDemo = { init };
  if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);
})();
