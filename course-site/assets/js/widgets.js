/* ==========================================================================
   widgets.js — MLTE03 interactive lecture widgets (dependency-free).

   Usage anywhere:    <div class="widget" data-widget="rot3d"></div>
   Widgets self-mount on DOMContentLoaded; decks additionally call
   MLTEWidgets.init() on Reveal ready/slidechanged (idempotent). 25 widgets:
   see digital-lab.html for the catalogue.

   All widgets recompute + redraw on input; none run animation loops, so any
   number can coexist in one deck. Conventions match quadsim exactly:
   state (p, v, euler ZYX, omega), X-frame mixer rows [T;tx;ty;tz],
   m1 rear-right, m2 front-right, m3 front-left, m4 rear-left,
   l = 0.17 m, c = 0.016 m, mass 0.65 kg, f_max = 4 N per motor.
   ========================================================================== */
(function () {
  "use strict";
  const NAVY = "#0b1f33", CYAN = "#0d9ea6", AMBER = "#c97e0a", RED = "#d8533f",
        OK = "#2faf6b", MUT = "#6b7f93", VIO = "#7c5cbf", LINE = "#dde6f0";

  /* ---------- tiny DOM + math helpers ---------- */
  function el(tag, cls, html) { const e = document.createElement(tag);
    if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function slider(parent, label, min, max, step, val, fmt) {
    const wrap = el("span"); wrap.appendChild(el("label", null, label + " "));
    const inp = el("input"); inp.type = "range"; inp.min = min; inp.max = max;
    inp.step = step; inp.value = val;
    const out = el("span", "val");
    const upd = () => { out.textContent = (fmt || (v => v))(parseFloat(inp.value)); };
    inp.addEventListener("input", upd); upd();
    wrap.appendChild(inp); wrap.appendChild(out); parent.appendChild(wrap);
    return { get: () => parseFloat(inp.value), input: inp };
  }
  function canvas(parent, w, h) { const c = el("canvas"); c.width = w * 2; c.height = h * 2;
    c.style.maxWidth = "100%"; parent.appendChild(c);
    const g = c.getContext("2d"); g.scale(2, 2); return { c, g, w, h }; }
  function rng(seed) { let a = seed >>> 0; return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function gauss(r) { return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()); }

  /* time-series plot into a box */
  function plot(g, bx, t, series, yMin, yMax, opts) {
    opts = opts || {};
    g.save();
    g.fillStyle = "#fbfdff"; g.fillRect(bx.x, bx.y, bx.w, bx.h);
    g.strokeStyle = LINE; g.strokeRect(bx.x, bx.y, bx.w, bx.h);
    const X = tt => bx.x + (tt - t[0]) / (t[t.length - 1] - t[0]) * bx.w;
    const Y = v  => bx.y + bx.h - (v - yMin) / (yMax - yMin) * bx.h;
    if (yMin < 0 && yMax > 0) { g.strokeStyle = "#e8eef5"; g.beginPath();
      g.moveTo(bx.x, Y(0)); g.lineTo(bx.x + bx.w, Y(0)); g.stroke(); }
    (opts.hlines || []).forEach(hl => { g.strokeStyle = hl.color || RED;
      g.setLineDash([5, 4]); g.beginPath(); g.moveTo(bx.x, Y(hl.y));
      g.lineTo(bx.x + bx.w, Y(hl.y)); g.stroke(); g.setLineDash([]); });
    series.forEach(s => {
      if (s.dots) { g.fillStyle = s.color;
        for (let i = 0; i < t.length; i += (s.every || 1)) { if (isNaN(s.ys[i])) continue;
          g.beginPath(); g.arc(X(t[i]), Y(s.ys[i]), 1.6, 0, 7); g.fill(); } return; }
      g.strokeStyle = s.color; g.lineWidth = s.lw || 1.6;
      if (s.dash) g.setLineDash(s.dash);
      g.beginPath(); let started = false;
      for (let i = 0; i < t.length; i++) { const v = s.ys[i]; if (isNaN(v)) { started = false; continue; }
        const px = X(t[i]), py = Math.max(bx.y - 8, Math.min(bx.y + bx.h + 8, Y(v)));
        if (!started) { g.moveTo(px, py); started = true; } else g.lineTo(px, py); }
      g.stroke(); g.setLineDash([]); g.lineWidth = 1; });
    g.fillStyle = MUT; g.font = "11px sans-serif";
    if (opts.title) { g.fillStyle = NAVY; g.font = "bold 12px sans-serif";
      g.fillText(opts.title, bx.x + 6, bx.y + 14); }
    g.fillStyle = MUT; g.font = "11px sans-serif";
    g.fillText(String(yMax.toFixed(opts.dp == null ? 1 : opts.dp)), bx.x + 3, bx.y + 24);
    g.fillText(String(yMin.toFixed(opts.dp == null ? 1 : opts.dp)), bx.x + 3, bx.y + bx.h - 4);
    g.restore();
  }
  function legend(g, x, y, items) { g.font = "11px sans-serif";
    items.forEach(it => { g.strokeStyle = g.fillStyle = it.color;
      g.beginPath(); if (it.dash) g.setLineDash(it.dash);
      g.moveTo(x, y - 3); g.lineTo(x + 16, y - 3); g.stroke(); g.setLineDash([]);
      g.fillStyle = "#33475b"; g.fillText(it.label, x + 20, y);
      x += 30 + g.measureText(it.label).width; }); }

  /* ============================ 1 · rot3d ============================ */
  function rot3d(root) {
    root.appendChild(el("div", null, "<b>Euler ZYX — rotate the airframe</b>"));
    const cv = canvas(root, 520, 230), row = el("div", "wrow");
    const sph = slider(row, "roll φ", -180, 180, 1, 15, v => v + "°");
    const sth = slider(row, "pitch θ", -180, 180, 1, -20, v => v + "°");
    const sps = slider(row, "yaw ψ", -180, 180, 1, 30, v => v + "°");
    root.appendChild(row);
    const note = el("div", "note"); root.appendChild(note);
    function R(ph, th, ps) { const cf = Math.cos(ph), sf = Math.sin(ph),
      ct = Math.cos(th), st = Math.sin(th), cy = Math.cos(ps), sy = Math.sin(ps);
      return [ [cy*ct, cy*st*sf - sy*cf, cy*st*cf + sy*sf],
               [sy*ct, sy*st*sf + cy*cf, sy*st*cf - cy*sf],
               [-st,   ct*sf,            ct*cf] ]; }
    function draw() {
      const d = Math.PI / 180, ph = sph.get()*d, th = sth.get()*d, ps = sps.get()*d;
      const M = R(ph, th, ps), g = cv.g;
      g.clearRect(0, 0, cv.w, cv.h);
      const cx = 150, cyc = 128, S = 78;
      const P = p => { // world -> isometric screen (z up)
        const sx = (p[0] - p[1]) * 0.866, sy = (p[0] + p[1]) * 0.5 - p[2];
        return [cx + sx * S, cyc + sy * S * 0.9]; };
      const rot = p => [ M[0][0]*p[0]+M[0][1]*p[1]+M[0][2]*p[2],
                         M[1][0]*p[0]+M[1][1]*p[1]+M[1][2]*p[2],
                         M[2][0]*p[0]+M[2][1]*p[1]+M[2][2]*p[2] ];
      // world axes
      const O = P([0,0,0]);
      [[[1.25,0,0],"x_w",MUT],[[0,1.25,0],"y_w",MUT],[[0,0,1.05],"z_w (up)",MUT]].forEach(a => {
        const e2 = P(a[0]); g.strokeStyle = a[2]; g.setLineDash([4,3]);
        g.beginPath(); g.moveTo(O[0],O[1]); g.lineTo(e2[0],e2[1]); g.stroke(); g.setLineDash([]);
        g.fillStyle = a[2]; g.font = "11px sans-serif"; g.fillText(a[1], e2[0]+3, e2[1]); });
      // airframe: X arms at 45deg, nose marker on +x
      const arms = [[0.75,0.75,0],[0.75,-0.75,0],[-0.75,0.75,0],[-0.75,-0.75,0]];
      g.strokeStyle = NAVY; g.lineWidth = 3;
      arms.forEach(a => { const e2 = P(rot(a)); g.beginPath();
        g.moveTo(O[0],O[1]); g.lineTo(e2[0],e2[1]); g.stroke();
        g.fillStyle = CYAN; g.beginPath(); g.arc(e2[0],e2[1],6,0,7); g.fill(); });
      g.lineWidth = 1;
      const nose = P(rot([1.05,0,0])); g.fillStyle = RED;
      g.beginPath(); g.arc(nose[0],nose[1],4,0,7); g.fill();
      g.fillStyle = RED; g.fillText("nose (+x_b)", nose[0]+5, nose[1]);
      const zb = P(rot([0,0,0.8])); g.strokeStyle = OK; g.lineWidth = 2;
      g.beginPath(); g.moveTo(O[0],O[1]); g.lineTo(zb[0],zb[1]); g.stroke(); g.lineWidth = 1;
      g.fillStyle = OK; g.fillText("z_b (thrust)", zb[0]+4, zb[1]);
      // R matrix readout
      g.fillStyle = NAVY; g.font = "bold 12px monospace"; g.fillText("R = Rz(ψ)·Ry(θ)·Rx(φ)", 320, 30);
      g.font = "12px monospace";
      for (let i = 0; i < 3; i++) g.fillText(
        "[ " + M[i].map(v => (v<0?"":" ") + v.toFixed(2)).join("  ") + " ]", 320, 52 + i*18);
      const wsing = 1/Math.max(1e-3, Math.abs(Math.cos(th)));
      g.fillText("Euler-rate gain 1/cosθ = " + (wsing>99 ? ">99" : wsing.toFixed(2)), 320, 120);
      note.innerHTML = Math.abs(Math.abs(sth.get())-90) < 8
        ? "<span style='color:"+RED+";font-weight:700'>Near θ = ±90° — gimbal lock: the Euler-rate map W(η) blows up (1/cosθ). Roll and yaw axes have collapsed onto each other.</span>"
        : "Drag pitch toward ±90° and watch 1/cosθ. The rotation R itself is always fine — it is the <i>Euler parametrization</i> that fails.";
    }
    [sph, sth, sps].forEach(s => s.input.addEventListener("input", draw)); draw();
  }

  /* ============================ 2 · mixer ============================ */
  function mixer(root) {
    root.appendChild(el("div", null, "<b>Wrench → motor thrusts (quadsim X-frame allocation)</b>"));
    const cv = canvas(root, 520, 235), row = el("div", "wrow");
    const l = 0.17, c = 0.016, fmax = 4.0;
    const sT = slider(row, "T", 0, 16, 0.1, 6.4, v => v.toFixed(1) + " N");
    const sx = slider(row, "τx", -0.6, 0.6, 0.01, 0, v => v.toFixed(2));
    const sy = slider(row, "τy", -0.6, 0.6, 0.01, 0, v => v.toFixed(2));
    const sz = slider(row, "τz", -0.08, 0.08, 0.002, 0, v => v.toFixed(3));
    root.appendChild(row);
    const note = el("div", "note"); root.appendChild(note);
    function draw() {
      const T = sT.get(), tx = sx.get(), ty = sy.get(), tz = sz.get();
      // inverse of M (rows [1..],[−l,−l,l,l],[l,−l,−l,l],[−c,c,−c,c])
      const f = [ 0.25*T - tx/(4*l) + ty/(4*l) - tz/(4*c),
                  0.25*T - tx/(4*l) - ty/(4*l) + tz/(4*c),
                  0.25*T + tx/(4*l) - ty/(4*l) - tz/(4*c),
                  0.25*T + tx/(4*l) + ty/(4*l) + tz/(4*c) ];
      const fc = f.map(v => Math.min(fmax, Math.max(0, v)));
      const sat = f.some((v,i) => Math.abs(v - fc[i]) > 1e-9);
      // achieved wrench after clamping
      const Ta = fc[0]+fc[1]+fc[2]+fc[3],
            txa = l*(-fc[0]-fc[1]+fc[2]+fc[3]),
            tya = l*( fc[0]-fc[1]-fc[2]+fc[3]),
            tza = c*(-fc[0]+fc[1]-fc[2]+fc[3]);
      const g = cv.g; g.clearRect(0,0,cv.w,cv.h);
      // top view (nose up). screen: sx=-y, sy=-x
      const cx = 110, cyc = 115, k = 330;
      const pos = [[-l,-l],[l,-l],[l,l],[-l,l]]; // m1 RR, m2 FR, m3 FL, m4 RL
      g.strokeStyle = NAVY; g.lineWidth = 3;
      pos.forEach(p => { g.beginPath(); g.moveTo(cx,cyc);
        g.lineTo(cx - p[1]*k, cyc - p[0]*k); g.stroke(); });
      g.lineWidth = 1;
      g.fillStyle = RED; g.beginPath(); g.arc(cx, cyc - 0.24*k, 4, 0, 7); g.fill();
      g.fillStyle = MUT; g.font = "10px sans-serif"; g.fillText("nose +x", cx+8, cyc-0.24*k);
      pos.forEach((p,i) => { const X = cx - p[1]*k, Y = cyc - p[0]*k;
        const rr = 10 + 16*(fc[i]/fmax);
        g.fillStyle = "rgba(13,158,166,.18)"; g.beginPath(); g.arc(X,Y,rr,0,7); g.fill();
        g.strokeStyle = (f[i]>fmax||f[i]<0)?RED:CYAN; g.beginPath(); g.arc(X,Y,rr,0,7); g.stroke();
        g.fillStyle = NAVY; g.font = "bold 11px sans-serif";
        g.fillText("m"+(i+1)+(i===0||i===2?" ↻":" ↺"), X-12, Y+4); });
      // bars
      const bx = 250, bw = 46;
      f.forEach((v,i) => { const X = bx + i*(bw+18), H = 150;
        g.strokeStyle = LINE; g.strokeRect(X, 35, bw, H);
        const hh = Math.min(H, Math.max(0, fc[i]/fmax*H));
        g.fillStyle = (f[i] > fmax || f[i] < 0) ? RED : CYAN;
        g.fillRect(X, 35 + H - hh, bw, hh);
        g.strokeStyle = AMBER; g.setLineDash([4,3]);
        const hov = 35 + H - (1.594/fmax)*H;
        g.beginPath(); g.moveTo(X, hov); g.lineTo(X+bw, hov); g.stroke(); g.setLineDash([]);
        g.fillStyle = NAVY; g.font = "11px monospace";
        g.fillText("f"+(i+1)+"="+f[i].toFixed(2), X-2, 202); });
      g.fillStyle = MUT; g.font = "10px sans-serif";
      g.fillText("amber dash = per-motor hover thrust 1.59 N · box top = f_max 4 N", 250, 222);
      note.innerHTML = sat
        ? "<span style='color:"+RED+";font-weight:700'>Saturated.</span> Requested [T,τ] is not achievable: delivered T=" + Ta.toFixed(2) + " N, τx=" + txa.toFixed(2) + ", τy=" + tya.toFixed(2) + ", τz=" + tza.toFixed(3) + " — <b>the axes are no longer decoupled</b>. This is why aggressive attitude commands steal thrust."
        : "All four motors inside [0, 4] N — the wrench is delivered exactly. Try τx = 0.5 at low T.";
    }
    [sT,sx,sy,sz].forEach(s => s.input.addEventListener("input", draw)); draw();
  }

  /* ============================ 3 · integ ============================ */
  function integ(root) {
    root.appendChild(el("div", null, "<b>Euler vs RK4 — oscillator ẍ = −x, 30 s</b>"));
    const cv = canvas(root, 520, 210), row = el("div", "wrow");
    const sdt = slider(row, "dt", 0.02, 0.9, 0.02, 0.3, v => v.toFixed(2) + " s");
    root.appendChild(row);
    const note = el("div", "note"); root.appendChild(note);
    function step(f, x, v, h, mode) {
      if (mode === "e") return [x + h*v, v - h*x];
      const k1 = [v, -x], k2 = [v + h/2*k1[1], -(x + h/2*k1[0])],
            k3 = [v + h/2*k2[1], -(x + h/2*k2[0])], k4 = [v + h*k3[1], -(x + h*k3[0])];
      return [x + h/6*(k1[0]+2*k2[0]+2*k3[0]+k4[0]), v + h/6*(k1[1]+2*k2[1]+2*k3[1]+k4[1])];
    }
    function draw() {
      const h = sdt.get(), T = 30, n = Math.floor(T/h);
      const t = [], xe = [], xr = [], xt = [];
      let e = [1,0], r4 = [1,0];
      for (let i = 0; i <= n; i++) { t.push(i*h); xe.push(e[0]); xr.push(r4[0]);
        xt.push(Math.cos(i*h)); e = step(null, e[0], e[1], h, "e"); r4 = step(null, r4[0], r4[1], h, "r"); }
      const g = cv.g; g.clearRect(0,0,cv.w,cv.h);
      plot(g, {x:10,y:8,w:500,h:168}, t,
        [{ys:xt,color:MUT,dash:[4,3]},{ys:xe,color:RED},{ys:xr,color:CYAN,lw:2}], -3, 3,
        {title:"x(t) — truth (grey), Euler (red), RK4 (teal)", dp:0});
      const Ee = 0.5*(xe[n]*xe[n]); // rough
      note.innerHTML = "Forward Euler adds energy every step — at dt=" + h.toFixed(2) +
        " its amplitude is ×" + Math.abs(xe[n]).toFixed(2) + " after 30 s, while RK4 still overlays the truth. quadsim runs RK4 at dt = 0.005 s (200 Hz) for exactly this reason.";
    }
    sdt.input.addEventListener("input", draw); draw();
  }

  /* ============================ 4 · cascade ============================ */
  function cascade(root) {
    root.appendChild(el("div", null, "<b>Cascade: outer position loop → tilt setpoint → inner PD (planar quad, 2 m step)</b>"));
    const cv = canvas(root, 520, 235), row = el("div", "wrow");
    const skp = slider(row, "outer Kp", 0.2, 12, 0.1, 2.4, v => v.toFixed(1));
    const skd = slider(row, "outer Kd", 0.2, 8, 0.1, 3.2, v => v.toFixed(1));
    const stl = slider(row, "tilt limit", 5, 60, 1, 25, v => v + "°");
    root.appendChild(row);
    const note = el("div", "note"); root.appendChild(note);
    function draw() {
      const kp = skp.get(), kd = skd.get(), tl = stl.get()*Math.PI/180;
      const g9 = 9.81, KP = 180, KD = 28, dt = 0.002, T = 8, n = Math.floor(T/dt);
      let y = 0, vy = 0, th = 0, w = 0; const t = [], ys = [], ths = [], thd = [];
      for (let i = 0; i <= n; i++) {
        const a = kp*(2 - y) - kd*vy;
        let td = Math.atan2(a, g9); td = Math.max(-tl, Math.min(tl, td));
        const al = KP*(td - th) - KD*w;
        w += al*dt; th += w*dt; vy += g9*Math.tan(th)*dt; y += vy*dt;
        if (i % 8 === 0) { t.push(i*dt); ys.push(y); ths.push(th*180/Math.PI); thd.push(td*180/Math.PI); }
      }
      const g = cv.g; g.clearRect(0,0,cv.w,cv.h);
      plot(g, {x:10,y:6,w:500,h:98}, t, [{ys:ys,color:CYAN,lw:2}], -0.5, 3.5,
        {title:"position y [m] → target 2 m", hlines:[{y:2,color:OK}]});
      plot(g, {x:10,y:116,w:500,h:98}, t,
        [{ys:thd,color:MUT,dash:[4,3]},{ys:ths,color:VIO,lw:1.8}], -65, 65,
        {title:"tilt θ [deg]: commanded (grey) vs actual (violet)", dp:0,
         hlines:[{y:stl.get(),color:AMBER},{y:-stl.get(),color:AMBER}]});
      let ovs = 0; ys.forEach(v => ovs = Math.max(ovs, v));
      note.innerHTML = "Overshoot " + Math.max(0,(ovs-2)/2*100).toFixed(0) +
        "% · The inner loop (Kp=180, Kd=28) is fixed — <b>only the outer loop is being tuned</b>. Push outer Kp past ~8 and the two timescales merge: the outer loop starts exciting the inner one → oscillation no gain can fix. Tighten the tilt limit to 8° and see the approach go slew-rate-limited (this is your safety knob on the real aircraft).";
    }
    [skp,skd,stl].forEach(s => s.input.addEventListener("input", draw)); draw();
  }

  /* ============================ 5 · lqr ============================ */
  function lqr(root) {
    root.appendChild(el("div", null, "<b>LQR on the double integrator — the Q/R dial</b>"));
    const cv = canvas(root, 520, 235), row = el("div", "wrow");
    const sq = slider(row, "log₁₀ q (state)", -1, 3, 0.1, 1, v => v.toFixed(1));
    const sr = slider(row, "log₁₀ r (effort)", -3, 1, 0.1, -1, v => v.toFixed(1));
    root.appendChild(row);
    const note = el("div", "note"); root.appendChild(note);
    function draw() {
      const q = Math.pow(10, sq.get()), r = Math.pow(10, sr.get());
      const dt = 0.02, Ad = [[1, dt],[0, 1]], Bd = [dt*dt/2, dt];
      let P = [[q,0],[0,1]];
      let K = [0,0];
      for (let it = 0; it < 800; it++) {
        // K = (r + B'PB)^-1 B'PA
        const PB = [P[0][0]*Bd[0]+P[0][1]*Bd[1], P[1][0]*Bd[0]+P[1][1]*Bd[1]];
        const bpb = Bd[0]*PB[0] + Bd[1]*PB[1];
        const PA = [[P[0][0]*Ad[0][0]+P[0][1]*Ad[1][0], P[0][0]*Ad[0][1]+P[0][1]*Ad[1][1]],
                    [P[1][0]*Ad[0][0]+P[1][1]*Ad[1][0], P[1][0]*Ad[0][1]+P[1][1]*Ad[1][1]]];
        const BPA = [Bd[0]*PA[0][0]+Bd[1]*PA[1][0], Bd[0]*PA[0][1]+Bd[1]*PA[1][1]];
        K = [BPA[0]/(r+bpb), BPA[1]/(r+bpb)];
        const Acl = [[Ad[0][0]-Bd[0]*K[0], Ad[0][1]-Bd[0]*K[1]],
                     [Ad[1][0]-Bd[1]*K[0], Ad[1][1]-Bd[1]*K[1]]];
        // P = Q + K'rK + Acl' P Acl
        const PAc = [[P[0][0]*Acl[0][0]+P[0][1]*Acl[1][0], P[0][0]*Acl[0][1]+P[0][1]*Acl[1][1]],
                     [P[1][0]*Acl[0][0]+P[1][1]*Acl[1][0], P[1][0]*Acl[0][1]+P[1][1]*Acl[1][1]]];
        P = [[q + r*K[0]*K[0] + Acl[0][0]*PAc[0][0]+Acl[1][0]*PAc[1][0],
                  r*K[0]*K[1] + Acl[0][0]*PAc[0][1]+Acl[1][0]*PAc[1][1]],
             [    r*K[1]*K[0] + Acl[0][1]*PAc[0][0]+Acl[1][1]*PAc[1][0],
              1 + r*K[1]*K[1] + Acl[0][1]*PAc[0][1]+Acl[1][1]*PAc[1][1]]];
      }
      let x = [1,0]; const t = [], xs = [], us = []; const T = 6, n = Math.floor(T/dt);
      for (let i = 0; i <= n; i++) { const u = -(K[0]*x[0]+K[1]*x[1]);
        t.push(i*dt); xs.push(x[0]); us.push(u);
        x = [Ad[0][0]*x[0]+Ad[0][1]*x[1]+Bd[0]*u, Ad[1][0]*x[0]+Ad[1][1]*x[1]+Bd[1]*u]; }
      let umax = 0; us.forEach(u => umax = Math.max(umax, Math.abs(u)));
      const g = cv.g; g.clearRect(0,0,cv.w,cv.h);
      plot(g, {x:10,y:6,w:500,h:98}, t, [{ys:xs,color:CYAN,lw:2}], -0.3, 1.1,
        {title:"state x(t) from 1 → 0"});
      plot(g, {x:10,y:116,w:500,h:98}, t, [{ys:us,color:AMBER,lw:1.8}],
        -Math.max(1,umax)*1.1, Math.max(1,umax)*0.4, {title:"control u(t)", dp:0});
      note.innerHTML = "K = [" + K[0].toFixed(1) + ", " + K[1].toFixed(1) + "] · peak |u| = " +
        umax.toFixed(1) + ".  <b>q/r is the only real tuning knob:</b> expensive control (raise r) → gentle, slow; cheap control (drop r) → aggressive gains and big peak effort — which the mixer must then saturate on a real quad. Same dial, one number per axis, instead of hand-tuning 6 PID gains.";
    }
    [sq,sr].forEach(s => s.input.addEventListener("input", draw)); draw();
  }

  /* ============================ 6 · kalman ============================ */
  function kalman(root) {
    root.appendChild(el("div", null, "<b>1-D Kalman filter — trust the model or trust the sensor?</b>"));
    const cv = canvas(root, 520, 210), row = el("div", "wrow");
    const sR = slider(row, "meas noise σ", 0.05, 1.2, 0.05, 0.5, v => v.toFixed(2) + " m");
    const sQ = slider(row, "process trust Q", -4, 0, 0.1, -2, v => "1e" + v.toFixed(1));
    const btn = el("button", "alt", "toggle 2 s GPS dropout"); row.appendChild(btn);
    root.appendChild(row);
    const note = el("div", "note"); root.appendChild(note);
    let dropout = false;
    btn.addEventListener("click", () => { dropout = !dropout; draw(); });
    function draw() {
      const dt = 0.05, n = 240, sig = sR.get(), Q = Math.pow(10, sQ.get());
      const r = rng(42);
      const t = [], truth = [], meas = [], est = [], bandU = [], bandL = [];
      let x = [0, 0], P = [[1,0],[0,1]];
      for (let i = 0; i <= n; i++) {
        const tt = i*dt; t.push(tt);
        const xt = Math.sin(0.6*tt) + 0.25*tt; truth.push(xt);
        const drop = dropout && tt > 5 && tt < 7;
        const z = xt + sig*gauss(r); meas.push(drop ? NaN : z);
        // predict (const-velocity)
        x = [x[0] + dt*x[1], x[1]];
        P = [[P[0][0] + dt*(P[1][0]+P[0][1]) + dt*dt*P[1][1] + Q, P[0][1] + dt*P[1][1]],
             [P[1][0] + dt*P[1][1], P[1][1] + Q*10]];
        if (!drop) { const S = P[0][0] + sig*sig, K0 = P[0][0]/S, K1 = P[1][0]/S, yk = z - x[0];
          x = [x[0] + K0*yk, x[1] + K1*yk];
          P = [[(1-K0)*P[0][0], (1-K0)*P[0][1]], [P[1][0]-K1*P[0][0], P[1][1]-K1*P[0][1]]]; }
        est.push(x[0]); bandU.push(x[0] + 2*Math.sqrt(P[0][0])); bandL.push(x[0] - 2*Math.sqrt(P[0][0]));
      }
      const g = cv.g; g.clearRect(0,0,cv.w,cv.h);
      plot(g, {x:10,y:6,w:500,h:168}, t,
        [{ys:bandU,color:"#cfe9ef"},{ys:bandL,color:"#cfe9ef"},
         {ys:meas,color:"#c9a2e8",dots:true},
         {ys:truth,color:MUT,dash:[4,3]},{ys:est,color:CYAN,lw:2}], -1, 4.3,
        {title:"position: meas dots · truth grey dash · estimate teal · ±2σ band"});
      let e1 = 0, e2 = 0, m = 0;
      for (let i = 0; i <= n; i++) { e1 += Math.pow(est[i]-truth[i],2);
        if (!isNaN(meas[i])) { e2 += Math.pow(meas[i]-truth[i],2); m++; } }
      note.innerHTML = "RMSE — raw sensor: <b>" + Math.sqrt(e2/m).toFixed(3) +
        " m</b> · Kalman estimate: <b style='color:"+CYAN+"'>" + Math.sqrt(e1/(n+1)).toFixed(3) +
        " m</b>. Small Q = trust the model (smooth, but slow to admit surprises); large Q = trust the sensor (noisy). " +
        (dropout ? "<b>During the dropout the filter coasts on the model and the ±2σ band inflates — honest uncertainty.</b>" : "Click the dropout button: what should an honest filter do with no measurements?");
    }
    [sR,sQ].forEach(s => s.input.addEventListener("input", draw)); draw();
  }

  /* ============================ 7 · comp ============================ */
  function comp(root) {
    root.appendChild(el("div", null, "<b>Complementary filter — gyro drifts, accelerometer shakes, fusion wins</b>"));
    const cv = canvas(root, 520, 210), row = el("div", "wrow");
    const sb = slider(row, "gyro bias", 0, 3, 0.1, 1.2, v => v.toFixed(1) + " °/s");
    const sn = slider(row, "accel noise σ", 0, 15, 0.5, 6, v => v.toFixed(1) + "°");
    const sa = slider(row, "α", 0.80, 0.999, 0.001, 0.98, v => v.toFixed(3));
    root.appendChild(row);
    const note = el("div", "note"); root.appendChild(note);
    function draw() {
      const dt = 0.02, n = 1000, b = sb.get(), s = sn.get(), al = sa.get();
      const r = rng(7);
      const t = [], truth = [], gy = [], ac = [], fu = [];
      let gInt = 0, f = 0;
      for (let i = 0; i <= n; i++) { const tt = i*dt; t.push(tt);
        const th = 25*Math.sin(0.9*tt); truth.push(th);
        const rate = 25*0.9*Math.cos(0.9*tt) + b + 0.6*gauss(r);
        gInt += rate*dt; gy.push(gInt);
        const za = th + s*gauss(r); ac.push(za);
        f = al*(f + rate*dt) + (1-al)*za; fu.push(f);
      }
      const g = cv.g; g.clearRect(0,0,cv.w,cv.h);
      plot(g, {x:10,y:6,w:500,h:168}, t,
        [{ys:ac,color:"#e5c9f5"},{ys:gy,color:AMBER,lw:1.6},
         {ys:truth,color:MUT,dash:[4,3]},{ys:fu,color:CYAN,lw:2}], -45, 65,
        {title:"angle [deg]: accel raw (lavender) · gyro-integrated (amber) · fused (teal) · truth (dash)", dp:0});
      let e = 0; for (let i = 0; i <= n; i++) e += Math.pow(fu[i]-truth[i],2);
      note.innerHTML = "Fused RMSE = <b>" + Math.sqrt(e/(n+1)).toFixed(2) + "°</b> with a gyro drifting " +
        (b*20).toFixed(0) + "° over the 20 s window. α sets the crossover: high-pass the gyro (fast, drift-free short-term), low-pass the accel (noisy, bias-free long-term). α=0.98 at 50 Hz ≈ 1 s time constant — the classic hobby-quad number.";
    }
    [sb,sn,sa].forEach(s => s.input.addEventListener("input", draw)); draw();
  }

  /* ============================ 8 · traj ============================ */
  function traj(root) {
    root.appendChild(el("div", null, "<b>Figure-eight tracking — why feedforward beats pure feedback</b>"));
    const cv = canvas(root, 520, 235), row = el("div", "wrow");
    const sff = el("button", null, "feedforward: ON"); row.appendChild(sff);
    const swd = slider(row, "wind accel", 0, 1.5, 0.05, 0, v => v.toFixed(2) + " m/s²");
    const skp = slider(row, "Kp", 1, 20, 0.5, 6, v => v.toFixed(1));
    root.appendChild(row);
    const note = el("div", "note"); root.appendChild(note);
    let FF = true;
    sff.addEventListener("click", () => { FF = !FF; sff.textContent = "feedforward: " + (FF?"ON":"OFF"); draw(); });
    function draw() {
      const dt = 0.01, T = 2*Math.PI/0.8*1.02, n = Math.floor(2*T/dt);
      const kp = skp.get(), kd = 2*Math.sqrt(kp), w = 0.8, A = 1.2, wind = swd.get();
      let p = [A*Math.sin(0), A*Math.sin(0)/2], v = [A*w, A*w];
      const px = [], py = [], rx = [], ry = []; let err2 = 0, cnt = 0;
      for (let i = 0; i <= n; i++) { const tt = i*dt;
        const pr = [A*Math.sin(w*tt), A*Math.sin(2*w*tt)/2],
              vr = [A*w*Math.cos(w*tt), A*w*Math.cos(2*w*tt)],
              ar = [-A*w*w*Math.sin(w*tt), -2*A*w*w*Math.sin(2*w*tt)];
        const ax = (FF?ar[0]:0) + kp*(pr[0]-p[0]) + kd*(vr[0]-v[0]) + wind,
              ay = (FF?ar[1]:0) + kp*(pr[1]-p[1]) + kd*(vr[1]-v[1]);
        v = [v[0]+ax*dt, v[1]+ay*dt]; p = [p[0]+v[0]*dt, p[1]+v[1]*dt];
        if (tt > T) { err2 += Math.pow(pr[0]-p[0],2)+Math.pow(pr[1]-p[1],2); cnt++; }
        if (i % 4 === 0) { px.push(p[0]); py.push(p[1]); rx.push(pr[0]); ry.push(pr[1]); }
      }
      const g = cv.g; g.clearRect(0,0,cv.w,cv.h);
      const cx = 260, cyc = 118, S = 140;
      g.fillStyle = "#fbfdff"; g.fillRect(0,0,cv.w,cv.h);
      g.strokeStyle = MUT; g.setLineDash([5,4]); g.beginPath();
      rx.forEach((x,i) => { const X = cx + x*S, Y = cyc - ry[i]*S;
        if (i===0) g.moveTo(X,Y); else g.lineTo(X,Y); }); g.stroke(); g.setLineDash([]);
      g.strokeStyle = CYAN; g.lineWidth = 2; g.beginPath();
      px.forEach((x,i) => { const X = cx + x*S, Y = cyc - py[i]*S;
        if (i===0) g.moveTo(X,Y); else g.lineTo(X,Y); }); g.stroke(); g.lineWidth = 1;
      const rmse = Math.sqrt(err2/Math.max(1,cnt));
      g.fillStyle = NAVY; g.font = "bold 13px sans-serif";
      g.fillText("RMSE (2nd lap): " + rmse.toFixed(3) + " m", 16, 22);
      note.innerHTML = FF
        ? "With reference acceleration fed forward, feedback only has to clean up disturbances — add wind and watch the error stay bounded. Course target: <b>RMSE &lt; 0.1 m</b> in the wind-free case."
        : "<b>Pure feedback always lags a moving target</b> — the controller needs a persistent error to generate the centripetal acceleration. No gain fixes this cleanly: raise Kp and it tracks tighter but responds violently to noise. Turn FF back on.";
    }
    [swd,skp].forEach(s => s.input.addEventListener("input", draw)); draw();
  }

  /* ============================ 9 · mpc ============================ */
  function mpc(root) {
    root.appendChild(el("div", null, "<b>Receding horizon vs clamped LQR — stop before the wall</b>"));
    const cv = canvas(root, 520, 235), row = el("div", "wrow");
    const sN = slider(row, "horizon N", 2, 40, 1, 18, v => v + " steps");
    root.appendChild(row);
    const note = el("div", "note"); root.appendChild(note);
    function draw() {
      const dt = 0.1, umax = 1.0, wall = 1.0, xT = 0.95;
      const N = Math.round(sN.get());
      // closed-loop MPC via projected gradient each step
      function mpcU(x0) {
        let U = new Array(N).fill(0);
        for (let it = 0; it < 250; it++) {
          // rollout
          const xs = [x0.slice()];
          for (let k = 0; k < N; k++) { const x = xs[k];
            xs.push([x[0] + dt*x[1] + dt*dt/2*U[k], x[1] + dt*U[k]]); }
          // gradient by adjoint (quadratic cost + wall penalty)
          const q = 6, qv = 1, r = 0.05, W = 600;
          let lam = [0, 0];
          const gU = new Array(N).fill(0);
          for (let k = N; k >= 1; k--) { const x = xs[k];
            const gx = [2*q*(x[0]-xT) + (x[0] > wall ? 2*W*(x[0]-wall) : 0), 2*qv*x[1]];
            lam = [gx[0] + lam[0], gx[1] + lam[1] + dt*lam[0]];
            gU[k-1] = 2*r*U[k-1] + dt*dt/2*lam[0] + dt*lam[1];
            lam = [lam[0], lam[1]]; }
          for (let k = 0; k < N; k++) U[k] = Math.max(-umax, Math.min(umax, U[k] - 0.02*gU[k]));
        }
        return U;
      }
      function run(mode) {
        let x = [0, 1.3]; const xs = [], vs = []; let pred = null;
        for (let i = 0; i < 70; i++) {
          xs.push(x[0]); vs.push(x[1]);
          let u;
          if (mode === "lqr") { u = Math.max(-umax, Math.min(umax, -8*(x[0]-xT) - 4*x[1])); }
          else { const U = mpcU(x); u = U[0];
            if (i === 4 && !pred) { pred = [x.slice()];
              let xp = x.slice();
              for (let k = 0; k < N; k++) { xp = [xp[0]+dt*xp[1]+dt*dt/2*U[k], xp[1]+dt*U[k]]; pred.push(xp); } } }
          x = [x[0] + dt*x[1] + dt*dt/2*u, x[1] + dt*u];
        }
        return { xs, pred };
      }
      const M = run("mpc"), L = run("lqr");
      const t = M.xs.map((_, i) => i*dt);
      const g = cv.g; g.clearRect(0,0,cv.w,cv.h);
      const series = [{ys:L.xs,color:AMBER,lw:1.8},{ys:M.xs,color:CYAN,lw:2.2}];
      if (M.pred) { const pt = M.pred.map((_, k) => (4 + k)*dt),
        pv = M.pred.map(p => p[0]);
        // draw prediction as its own pass after main plot
      }
      plot(g, {x:10,y:6,w:500,h:190}, t, series, -0.1, 1.45,
        {title:"position x(t) · start v=1.3 m/s · WALL at x=1 (red) · target 0.95",
         hlines:[{y:wall,color:RED},{y:xT,color:OK}]});
      if (M.pred) { const bx = {x:10,y:6,w:500,h:190};
        const X = tt => bx.x + tt/t[t.length-1]*bx.w, Y = v => bx.y + bx.h - (v+0.1)/1.55*bx.h;
        g.strokeStyle = VIO; g.setLineDash([3,3]); g.beginPath();
        M.pred.forEach((p, k) => { const px = X((4+k)*dt), py = Y(p[0]);
          if (k===0) g.moveTo(px,py); else g.lineTo(px,py); });
        g.stroke(); g.setLineDash([]);
        g.fillStyle = VIO; g.font = "11px sans-serif";
        g.fillText("← predicted horizon at t=0.4 s (replanned every step)", 200, 30); }
      let mx = 0; M.xs.forEach(v => mx = Math.max(mx, v));
      let lx = 0; L.xs.forEach(v => lx = Math.max(lx, v));
      note.innerHTML = "Peak x — clamped LQR (amber): <b style='color:" + (lx>wall?RED:OK) + "'>" + lx.toFixed(3) +
        "</b> · MPC (teal): <b style='color:" + (mx>wall+0.005?RED:OK) + "'>" + mx.toFixed(3) + "</b>. " +
        "LQR reacts to error only — with |u| ≤ 1 it starts braking too late and punches the wall. MPC <b>sees the wall inside its horizon and brakes early</b>. Shrink N below ~6: the horizon no longer reaches the wall in time and MPC fails the same way. <b>Anticipation is the product; the horizon is the price.</b>";
    }
    sN.input.addEventListener("input", draw); draw();
  }


  /* ============================ 11 · wmatrix (Wk 2) ============================ */
  function wmatrix(root) {
    root.appendChild(el("div", null, "<b>Euler kinematics — η̇ = W(η)·ω, and where 1/cosθ bites</b>"));
    const cv = canvas(root, 520, 215), row = el("div", "wrow");
    const sph = slider(row, "roll φ", -80, 80, 1, 20, v => v + "°");
    const sth = slider(row, "pitch θ", -85, 85, 1, 30, v => v + "°");
    const sp = slider(row, "p", -2, 2, 0.05, 0.5, v => v.toFixed(2));
    const sq = slider(row, "q", -2, 2, 0.05, 0.0, v => v.toFixed(2));
    const sr = slider(row, "r", -2, 2, 0.05, 1.0, v => v.toFixed(2));
    root.appendChild(row); const note = el("div", "note"); root.appendChild(note);
    function draw() {
      const ph = sph.get()*Math.PI/180, th = sth.get()*Math.PI/180;
      const c = Math.cos(ph), s = Math.sin(ph), ct = Math.cos(th), tt = Math.tan(th);
      const W = [[1, s*tt, c*tt],[0, c, -s],[0, s/ct, c/ct]];
      const om = [sp.get(), sq.get(), sr.get()];
      const ed = W.map(r => r[0]*om[0]+r[1]*om[1]+r[2]*om[2]);
      const g = cv.g; g.clearRect(0,0,cv.w,cv.h); g.fillStyle="#fbfdff"; g.fillRect(0,0,cv.w,cv.h);
      g.fillStyle = NAVY; g.font = "bold 13px sans-serif"; g.fillText("W(φ,θ)", 16, 22);
      g.font = "13px monospace";
      W.forEach((r,i) => g.fillText("[ " + r.map(v => (v<0?"":" ") + (Math.abs(v)>99?"  ∞  ":v.toFixed(2))).join("  ") + " ]", 16, 46+i*20));
      g.font = "bold 13px sans-serif"; g.fillText("η̇ = W·ω", 250, 22); g.font = "13px monospace";
      ["φ̇","θ̇","ψ̇"].forEach((n,i) => { g.fillStyle = Math.abs(ed[i])>5?RED:NAVY;
        g.fillText(n + " = " + (Math.abs(ed[i])>999?"∞":ed[i].toFixed(2)) + " rad/s", 250, 46+i*20); });
      // gain curve 1/cosθ
      const bx = {x:16,y:118,w:488,h:88}; const T = [], G = [];
      for (let d=-89; d<=89; d++) { T.push(d); G.push(Math.min(12, 1/Math.cos(d*Math.PI/180))); }
      plot(g, bx, T, [{ys:G,color:CYAN,lw:2}], 0, 12, {title:"gain 1/cosθ vs pitch (°)", dp:0});
      const X = bx.x + (sth.get()+89)/178*bx.w; g.strokeStyle = RED; g.beginPath(); g.moveTo(X,bx.y); g.lineTo(X,bx.y+bx.h); g.stroke();
      const gain = 1/ct;
      note.innerHTML = "At θ = " + sth.get() + "°, body yaw rate r and roll rate p are multiplied by <b>" + (gain>99?"∞":gain.toFixed(2)) + "</b> on their way into ψ̇ and φ̇. " +
        (Math.abs(sth.get())>=80 ? "<b style='color:"+RED+"'>Gimbal lock:</b> two Euler rates blow up for a finite body rate — the aircraft is fine, the <i>coordinates</i> are not. This is the whole case for quaternions."
                                  : "Below ~30° the map is nearly identity — which is why Wk 5 can pretend η̇ ≈ ω. Push θ past 60° and watch that assumption die.");
    }
    [sph,sth,sp,sq,sr].forEach(x => x.input.addEventListener("input", draw)); draw();
  }

  /* ============================ 12 · eulereq (Wk 2) ============================ */
  function eulereq(root) {
    root.appendChild(el("div", null, "<b>Euler's equation — ω×Iω: torque-free rotation couples the axes</b>"));
    const cv = canvas(root, 520, 220), row = el("div", "wrow");
    const sI1 = slider(row, "I₁", 1, 6, 0.1, 2.3, v => v.toFixed(1)+"e-3");
    const sI2 = slider(row, "I₂", 1, 6, 0.1, 2.3, v => v.toFixed(1)+"e-3");
    const sI3 = slider(row, "I₃", 1, 6, 0.1, 4.0, v => v.toFixed(1)+"e-3");
    const sp = slider(row, "p₀", 0, 10, 0.25, 0.5, v => v.toFixed(2));
    const sq = slider(row, "q₀", 0, 10, 0.25, 6.0, v => v.toFixed(2));
    const sr = slider(row, "r₀", 0, 10, 0.25, 0.5, v => v.toFixed(2));
    root.appendChild(row); const note = el("div", "note"); root.appendChild(note);
    function draw() {
      const I = [sI1.get(), sI2.get(), sI3.get()];
      const f = w => [ (I[1]-I[2])/I[0]*w[1]*w[2], (I[2]-I[0])/I[1]*w[2]*w[0], (I[0]-I[1])/I[2]*w[0]*w[1] ];
      let w = [sp.get(), sq.get(), sr.get()]; const dt = 0.005, n = 1200, t = [], P=[],Q=[],R=[];
      for (let i=0;i<n;i++){ t.push(i*dt); P.push(w[0]);Q.push(w[1]);R.push(w[2]);
        const k1=f(w), w2=w.map((v,j)=>v+dt/2*k1[j]), k2=f(w2), w3=w.map((v,j)=>v+dt/2*k2[j]), k3=f(w3), w4=w.map((v,j)=>v+dt*k3[j]), k4=f(w4);
        w = w.map((v,j)=>v+dt/6*(k1[j]+2*k2[j]+2*k3[j]+k4[j])); }
      const g = cv.g; g.clearRect(0,0,cv.w,cv.h);
      const m = Math.max(1, ...P.map(Math.abs), ...Q.map(Math.abs), ...R.map(Math.abs));
      plot(g, {x:10,y:6,w:500,h:180}, t, [{ys:P,color:CYAN,lw:1.8},{ys:Q,color:AMBER,lw:1.8},{ys:R,color:VIO,lw:1.8}], -m*1.1, m*1.1, {title:"body rates, no torque, 6 s", dp:1});
      legend(g, 300, 24, [{label:"p",color:CYAN},{label:"q",color:AMBER},{label:"r",color:VIO}]);
      const c0 = f([sp.get(),sq.get(),sr.get()]);
      const sym = Math.abs(I[0]-I[1])<1e-6;
      note.innerHTML = "ω̇ = I⁻¹(−ω×Iω): initial coupling terms [" + c0.map(v=>v.toFixed(2)).join(", ") + "] rad/s². " +
        (sym ? "With I₁ = I₂ (a symmetric quad) the spin about z stays constant and p, q trade energy in a clean circle — <b>gyroscopic precession</b>. Near hover ω is small, so ω×Iω is second-order small: Wk 5's design gift."
             : "With I₁ ≠ I₂ the intermediate axis is unstable — spin mostly about it and watch the small components grow and flip (the tennis-racket effect). Set I₁ = I₂ to see the quad's tame case.");
    }
    [sI1,sI2,sI3,sp,sq,sr].forEach(x => x.input.addEventListener("input", draw)); draw();
  }

  /* ============================ 13 · deriv12 (Wk 2) ============================ */
  function deriv12(root) {
    root.appendChild(el("div", null, "<b>The 12-state derivative — set x and u, read ẋ term by term, step it by hand</b>"));
    const row = el("div", "wrow");
    const sz = slider(row, "z", 0, 3, 0.1, 1, v => v.toFixed(1)+" m");
    const sph = slider(row, "φ", -40, 40, 1, 0, v => v+"°");
    const sth = slider(row, "θ", -40, 40, 1, 10, v => v+"°");
    const sT = slider(row, "T", 0, 12, 0.05, 6.38, v => v.toFixed(2)+" N");
    const stx = slider(row, "τx", -0.2, 0.2, 0.005, 0, v => v.toFixed(3));
    const sq = slider(row, "q", -3, 3, 0.1, 0, v => v.toFixed(1));
    root.appendChild(row);
    const row2 = el("div", "wrow"); const bstep = el("button", null, "step 20 ms"); const breset = el("button", "alt", "reset"); row2.appendChild(bstep); row2.appendChild(breset); root.appendChild(row2);
    const cv = canvas(root, 520, 175); const note = el("div", "note"); root.appendChild(note);
    const m = 0.65, gg = 9.81, I = [2.3e-3, 2.3e-3, 4.0e-3];
    let x = null, steps = 0;
    function fromSliders() { const s = new Array(12).fill(0); s[2]=sz.get(); s[6]=sph.get()*Math.PI/180; s[7]=sth.get()*Math.PI/180; s[10]=sq.get(); return s; }
    function deriv(s, u) {
      const ph=s[6], th=s[7], ps=s[8], om=[s[9],s[10],s[11]], T=u[0], tau=[u[1],u[2],u[3]];
      const cf=Math.cos(ph), sf=Math.sin(ph), ct=Math.cos(th), st=Math.sin(th), cp=Math.cos(ps), spn=Math.sin(ps);
      const Rz = [cp*st*cf+spn*sf, spn*st*cf-cp*sf, ct*cf]; // third column of R
      const acc = [Rz[0]*T/m, Rz[1]*T/m, -gg + Rz[2]*T/m];
      const tt = Math.tan(th); const W = [[1, sf*tt, cf*tt],[0, cf, -sf],[0, sf/ct, cf/ct]];
      const ed = W.map(r => r[0]*om[0]+r[1]*om[1]+r[2]*om[2]);
      const Iw = [I[0]*om[0], I[1]*om[1], I[2]*om[2]];
      const cr = [om[1]*Iw[2]-om[2]*Iw[1], om[2]*Iw[0]-om[0]*Iw[2], om[0]*Iw[1]-om[1]*Iw[0]];
      const od = [ (tau[0]-cr[0])/I[0], (tau[1]-cr[1])/I[1], (tau[2]-cr[2])/I[2] ];
      return [s[3],s[4],s[5], acc[0],acc[1],acc[2], ed[0],ed[1],ed[2], od[0],od[1],od[2]];
    }
    function draw() {
      if (!x) x = fromSliders();
      const u = [sT.get(), stx.get(), 0, 0]; const d = deriv(x, u);
      const g = cv.g; g.clearRect(0,0,cv.w,cv.h); g.fillStyle="#fbfdff"; g.fillRect(0,0,cv.w,cv.h);
      const names = ["x","y","z","vx","vy","vz","φ","θ","ψ","p","q","r"];
      g.font = "12px monospace";
      for (let i=0;i<12;i++){ const col = Math.floor(i/6), rowi = i%6; const X = 16 + col*250, Y = 22 + rowi*24;
        const xv = (i>=6&&i<9) ? (x[i]*180/Math.PI).toFixed(1)+"°" : x[i].toFixed(3);
        const dv = (i>=6&&i<9) ? (d[i]*180/Math.PI).toFixed(1)+"°/s" : d[i].toFixed(3);
        g.fillStyle = MUT; g.fillText(names[i].padEnd(2), X, Y); g.fillStyle = NAVY; g.fillText("= " + xv.padStart(9), X+22, Y);
        g.fillStyle = Math.abs(d[i])>1e-9 ? CYAN : "#b9c6d3"; g.fillText("ẋ = " + dv.padStart(10), X+120, Y); }
      g.fillStyle = NAVY; g.font = "bold 12px sans-serif"; g.fillText("steps taken: " + steps + "  (t = " + (steps*0.02).toFixed(2) + " s)", 16, 168);
      const hover = Math.abs(sT.get()-m*gg)<0.02 && Math.abs(sph.get())<0.5 && Math.abs(sth.get())<0.5 && Math.abs(stx.get())<1e-6 && Math.abs(sq.get())<1e-6;
      note.innerHTML = hover ? "<b>Hover sanity test passes:</b> every derivative is zero at T = mg, level, at rest. Now tilt θ by 10° and read which two entries wake up (vx from thrust tipping forward, vz from the lost vertical component)."
        : "Sanity tests: (1) T = mg, level ⇒ ẋ = 0 · (2) θ = 10° ⇒ ẍ = g·tanθ·cosθ ≈ 1.7 m/s², z̈ &lt; 0 · (3) τx alone ⇒ only ṗ, and it is large (I is tiny) · (4) q alone ⇒ θ̇ = q and ṗ, ṙ from ω×Iω. Press <b>step 20 ms</b> to hand-integrate (forward Euler) and watch the state move.";
    }
    bstep.addEventListener("click", () => { const u=[sT.get(), stx.get(),0,0]; const d=deriv(x,u); x = x.map((v,i)=>v+0.02*d[i]); steps++; draw(); });
    breset.addEventListener("click", () => { x = null; steps = 0; draw(); });
    [sz,sph,sth,sT,stx,sq].forEach(s => s.input.addEventListener("input", () => { x = null; steps = 0; draw(); })); draw();
  }

  /* ============================ 14 · kffit (Wk 3) ============================ */
  function kffit(root) {
    root.appendChild(el("div", null, "<b>Fitting k_f — drag the bench points, watch the square law and its residual</b>"));
    const cv = canvas(root, 520, 235); const note = el("div", "note"); root.appendChild(note);
    const pts = [[300,0.22],[500,0.62],[650,1.05],[800,1.59],[950,2.10],[1050,2.35]]; // Ω rad/s, thrust N
    const bx = {x:44,y:14,w:460,h:190}, OMAX = 1200, FMAX = 3.5;
    const X = o => bx.x + o/OMAX*bx.w, Y = f => bx.y + bx.h - f/FMAX*bx.h;
    let dragging = -1;
    function fit() { let sxy=0, sxx=0; pts.forEach(p => { const o2=p[0]*p[0]; sxy += o2*p[1]; sxx += o2*o2; }); return sxy/sxx; }
    function draw() {
      const g = cv.g; g.clearRect(0,0,cv.w,cv.h); g.fillStyle="#fbfdff"; g.fillRect(0,0,cv.w,cv.h);
      g.strokeStyle = LINE; g.strokeRect(bx.x,bx.y,bx.w,bx.h);
      const kf = fit(); let ss=0, st=0; const mean = pts.reduce((a,p)=>a+p[1],0)/pts.length;
      pts.forEach(p => { const e = p[1]-kf*p[0]*p[0]; ss += e*e; st += (p[1]-mean)**2; });
      g.strokeStyle = CYAN; g.lineWidth = 2; g.beginPath();
      for (let o=0;o<=OMAX;o+=10){ const px=X(o), py=Y(Math.min(FMAX, kf*o*o)); if(o===0) g.moveTo(px,py); else g.lineTo(px,py);} g.stroke(); g.lineWidth=1;
      pts.forEach((p,i) => { const e = p[1]-kf*p[0]*p[0];
        g.strokeStyle = RED; g.setLineDash([3,3]); g.beginPath(); g.moveTo(X(p[0]),Y(p[1])); g.lineTo(X(p[0]),Y(kf*p[0]*p[0])); g.stroke(); g.setLineDash([]);
        g.fillStyle = i===dragging?AMBER:NAVY; g.beginPath(); g.arc(X(p[0]),Y(p[1]),6,0,7); g.fill(); });
      g.fillStyle = MUT; g.font = "11px sans-serif"; g.fillText("Ω [rad/s] →", bx.x+bx.w-70, bx.y+bx.h+12); g.save(); g.translate(12, bx.y+90); g.rotate(-Math.PI/2); g.fillText("thrust [N]", 0, 0); g.restore();
      g.fillStyle = NAVY; g.font = "bold 13px sans-serif";
      g.fillText("k_f = " + (kf*1e6).toFixed(2) + " ×10⁻⁶ N·s²   ·   RMS residual " + Math.sqrt(ss/pts.length).toFixed(3) + " N   ·   R² = " + (1-ss/st).toFixed(3), bx.x+10, bx.y+18);
      note.innerHTML = "Least squares through the origin on f = k_f Ω². Drag the top points <i>down</i> to fake battery sag and watch the residual pattern turn systematic (all high points below the curve) — that pattern, not R², is what tells you the model has ended. Course nominal: hover needs 1.59 N per motor.";
    }
    const pick = (mx,my) => { let best=-1, bd=144; pts.forEach((p,i)=>{ const d=(X(p[0])-mx)**2+(Y(p[1])-my)**2; if(d<bd){bd=d;best=i;} }); return best; };
    const pos = ev => { const r = cv.c.getBoundingClientRect(); const t = ev.touches?ev.touches[0]:ev; return [(t.clientX-r.left)*cv.w/r.width, (t.clientY-r.top)*cv.h/r.height]; };
    cv.c.addEventListener("pointerdown", ev => { const [mx,my]=pos(ev); dragging = pick(mx,my); draw(); });
    cv.c.addEventListener("pointermove", ev => { if (dragging<0) return; const [mx,my]=pos(ev);
      pts[dragging][0] = Math.max(50, Math.min(OMAX, (mx-bx.x)/bx.w*OMAX)); pts[dragging][1] = Math.max(0, Math.min(FMAX, (bx.y+bx.h-my)/bx.h*FMAX)); draw(); });
    ["pointerup","pointerleave"].forEach(e => cv.c.addEventListener(e, () => { dragging=-1; draw(); }));
    cv.c.style.touchAction = "none"; cv.c.style.cursor = "grab"; draw();
  }

  /* ============================ 15 · hoverpower (Wk 3) ============================ */
  function hoverpower(root) {
    root.appendChild(el("div", null, "<b>Hover power and endurance — momentum theory, then the battery</b>"));
    const cv = canvas(root, 520, 175), row = el("div", "wrow");
    const sm = slider(row, "mass", 0.3, 2.0, 0.05, 0.65, v => v.toFixed(2)+" kg");
    const sd = slider(row, "prop Ø", 3, 12, 0.5, 5, v => v+" in");
    const sE = slider(row, "battery", 5, 80, 1, 22, v => v+" Wh");
    const sη = slider(row, "efficiency", 0.3, 0.8, 0.02, 0.5, v => (v*100).toFixed(0)+"%");
    const sfm = slider(row, "f_max/motor", 1, 10, 0.5, 4, v => v.toFixed(1)+" N");
    root.appendChild(row); const note = el("div", "note"); root.appendChild(note);
    function draw() {
      const m=sm.get(), D=sd.get()*0.0254, E=sE.get(), eta=sη.get(), fmax=sfm.get(), rho=1.225, g=9.81;
      const T = m*g, A = 4*Math.PI*(D/2)**2, Pideal = Math.pow(T,1.5)/Math.sqrt(2*rho*A), Pelec = Pideal/eta;
      const tw = 4*fmax/T, endurance = E/Pelec*60;
      const gg = cv.g; gg.clearRect(0,0,cv.w,cv.h); gg.fillStyle="#fbfdff"; gg.fillRect(0,0,cv.w,cv.h);
      const rows = [["hover thrust T = mg", T.toFixed(2)+" N"],["disk area (4 props)", A.toFixed(4)+" m²"],
        ["ideal induced power  T^{3/2}/√(2ρA)", Pideal.toFixed(1)+" W"],["electrical power  /η", Pelec.toFixed(1)+" W"],
        ["endurance  E/P", endurance.toFixed(1)+" min"],["thrust-to-weight  4·f_max/T", tw.toFixed(2)]];
      gg.font = "13px monospace"; rows.forEach((r,i)=>{ gg.fillStyle = MUT; gg.fillText(r[0], 16, 26+i*24); gg.fillStyle = (i===4&&endurance<8)||(i===5&&tw<1.5)?RED:NAVY; gg.font="bold 13px monospace"; gg.fillText(r[1], 360, 26+i*24); gg.font="13px monospace"; });
      note.innerHTML = (tw<1.5 ? "<b style='color:"+RED+"'>T/W &lt; 1.5:</b> almost no authority for attitude corrections — the mixer saturates on the first gust. " : "T/W " + tw.toFixed(1) + ": every attitude command costs thrust headroom; the course quad has 2.5. ") +
        "Double the prop diameter and induced power halves (A quadruples, P ∝ 1/√A) — which is why endurance aircraft have big slow rotors and racers have small fast ones. Payload scales as m^{3/2} in power: +20 % mass costs +31 % power.";
    }
    [sm,sd,sE,sη,sfm].forEach(s => s.input.addEventListener("input", draw)); draw();
  }

  /* ============================ 16 · jacobian (Wk 4) ============================ */
  function jacobian(root) {
    root.appendChild(el("div", null, "<b>Finite-difference Jacobian — the U-curve: truncation vs round-off</b>"));
    const cv = canvas(root, 520, 220), row = el("div", "wrow");
    const sh = slider(row, "log₁₀ h", -12, -1, 0.1, -6, v => v.toFixed(1));
    const smode = el("button", null, "scheme: central"); row.appendChild(smode);
    root.appendChild(row); const note = el("div", "note"); root.appendChild(note);
    let central = true;
    smode.addEventListener("click", () => { central = !central; smode.textContent = "scheme: " + (central?"central":"forward"); draw(); });
    // entry: d(vx_dot)/d(theta) at hover = g (thrust tips forward): f(th) = (T/m) sin(th) with T=mg -> derivative g cos(th) = g at 0
    const f = th => 9.81*Math.sin(th);
    const exact = 9.81;
    function err(h, cen) { const th = 0.0; const d = cen ? (f(th+h)-f(th-h))/(2*h) : (f(th+h)-f(th))/h; return Math.abs(d-exact); }
    function draw() {
      const H = [], Ec = [], Ef = [];
      for (let e=-12; e<=-1; e+=0.05){ const h=Math.pow(10,e); H.push(e); Ec.push(Math.log10(Math.max(1e-16, err(h,true)))); Ef.push(Math.log10(Math.max(1e-16, err(h,false)))); }
      const g = cv.g; g.clearRect(0,0,cv.w,cv.h);
      plot(g, {x:10,y:6,w:500,h:185}, H, [{ys:Ef,color:AMBER,lw:1.6},{ys:Ec,color:CYAN,lw:2}], -12, 2, {title:"log₁₀ |error| of ∂(v̇ₓ)/∂θ at hover  vs  log₁₀ h", dp:0});
      legend(g, 300, 24, [{label:"forward",color:AMBER},{label:"central",color:CYAN}]);
      const e = err(Math.pow(10, sh.get()), central); const X = 10 + (sh.get()+12)/11*500; g.strokeStyle = RED; g.beginPath(); g.moveTo(X,6); g.lineTo(X,191); g.stroke();
      note.innerHTML = "h = 10^" + sh.get().toFixed(1) + ", " + (central?"central":"forward") + " difference: error <b>" + e.toExponential(2) + "</b> (exact value g = 9.81). " +
        "Right of the minimum the error is truncation — ∝ h (forward) or h² (central); left of it, round-off — ∝ ε/h with ε ≈ 2×10⁻¹⁶. The sweet spot is √ε ≈ 10⁻⁸ for forward and ∛ε ≈ 10⁻⁵ for central, which is why <code>quadsim.analysis.linearize</code> uses central differences near 10⁻⁵ on unit-scaled states.";
    }
    sh.input.addEventListener("input", draw); draw();
  }

  /* ============================ 17 · linvalid (Wk 4) ============================ */
  function linvalid(root) {
    root.appendChild(el("div", null, "<b>Linear vs nonlinear — how far from hover does the design model stay honest?</b>"));
    const cv = canvas(root, 520, 220), row = el("div", "wrow");
    const sth = slider(row, "initial θ", 1, 80, 1, 15, v => v+"°");
    const stol = slider(row, "tolerance", 1, 30, 1, 5, v => v+"%");
    root.appendChild(row); const note = el("div", "note"); root.appendChild(note);
    function draw() {
      const th0 = sth.get()*Math.PI/180, g0 = 9.81, dt = 0.01, n = 200; // open-loop, thrust = mg held, pitch held constant -> compare vx growth
      const t=[], lin=[], non=[]; let vl=0, vn=0, xl=0, xn=0, tdiv=-1;
      for (let i=0;i<n;i++){ t.push(i*dt); lin.push(xl); non.push(xn);
        const al = g0*th0, an = g0*Math.tan(th0); // horizontal accel with T = mg/cosθ vs linear g·θ
        if (tdiv<0 && Math.abs(xn-xl) > stol.get()/100*Math.max(1e-6,Math.abs(xn))) tdiv = i*dt;
        vl += al*dt; vn += an*dt; xl += vl*dt; xn += vn*dt; }
      const g = cv.g; g.clearRect(0,0,cv.w,cv.h);
      const m = Math.max(0.1, non[n-1]*1.1);
      plot(g, {x:10,y:6,w:500,h:185}, t, [{ys:lin,color:CYAN,lw:2},{ys:non,color:AMBER,lw:2}], 0, m, {title:"x(t) after tilting to θ and holding, thrust trimmed for altitude", dp:2});
      legend(g, 300, 24, [{label:"linear (g·θ)",color:CYAN},{label:"nonlinear (g·tanθ)",color:AMBER}]);
      const relerr = Math.abs(Math.tan(th0)-th0)/Math.tan(th0)*100;
      note.innerHTML = "At θ = " + sth.get() + "° the small-angle model under-predicts horizontal acceleration by <b>" + relerr.toFixed(1) + "%</b> (tanθ vs θ), for every second of the flight — the error in position grows as t². " +
        (relerr < stol.get() ? "Inside your " + stol.get() + "% tolerance: the linear design model is honest here." : "Outside your " + stol.get() + "% tolerance from t = 0 — a gain designed on the linear model will be systematically wrong by that fraction. This is why the course tilt limit is 12–25°, and why a 60° racing turn needs a nonlinear method (Wk 12's escape hatch).");
    }
    [sth,stol].forEach(s => s.input.addEventListener("input", draw)); draw();
  }

  /* ============================ 18 · pid (Wk 5) ============================ */
  function pid(root) {
    root.appendChild(el("div", null, "<b>One-axis attitude PID — every term, every fix, switchable</b>"));
    const cv = canvas(root, 520, 225), row = el("div", "wrow"), row2 = el("div", "wrow");
    const skp = slider(row, "Kp", 0, 60, 1, 20, v => v.toFixed(0));
    const ski = slider(row, "Ki", 0, 40, 1, 0, v => v.toFixed(0));
    const skd = slider(row, "Kd", 0, 12, 0.2, 3, v => v.toFixed(1));
    const sns = slider(row, "gyro noise σ", 0, 0.2, 0.01, 0.0, v => v.toFixed(2));
    const sref = slider(row, "setpoint", 5, 60, 1, 20, v => v+"°");
    const toggles = {};
    [["dmeas","D on measurement"],["dfilt","D low-pass"],["clamp","I clamp"],["sep","I separation"],["dead","dead-band"],["bias","hold+release"]].forEach(([k,l]) => {
      const b = el("button", "alt", l + ": off"); b.dataset.on = "0"; b.addEventListener("click", () => { b.dataset.on = b.dataset.on==="1"?"0":"1"; b.textContent = l + ": " + (b.dataset.on==="1"?"on":"off"); b.className = b.dataset.on==="1"?"":"alt"; draw(); }); row2.appendChild(b); toggles[k] = b; });
    root.appendChild(row); root.appendChild(row2); const note = el("div", "note"); root.appendChild(note);
    const on = k => toggles[k].dataset.on === "1";
    function draw() {
      const dt = 0.005, n = 800, I = 2.3e-3, umax = 0.6; // torque limit N·m
      const kp = skp.get()*I, ki = ski.get()*I, kd = skd.get()*I, ref = sref.get()*Math.PI/180, sig = sns.get();
      const r = rng(7); let th = 0, w = 0, integ = 0, dprev = 0, eprev = 0, fd = 0;
      const t=[], TH=[], U=[], REF=[]; let sat = 0;
      for (let i=0;i<n;i++){ const tt = i*dt; t.push(tt);
        const held = on("bias") && tt < 1.0; // airframe held by hand for 1 s
        const rf = ref; REF.push(rf*180/Math.PI);
        const wm = w + sig*gauss(r); const thm = th; let e = rf - thm;
        if (on("dead") && Math.abs(e) < 0.5*Math.PI/180) e = 0;
        let doI = true; if (on("sep") && Math.abs(e) > 10*Math.PI/180) doI = false;
        if (doI) integ += e*dt; if (on("clamp")) integ = Math.max(-0.15, Math.min(0.15, integ));
        let draw_ = on("dmeas") ? -wm : (e - eprev)/dt; eprev = e;
        if (on("dfilt")) { const a = dt/(dt+1/(2*Math.PI*20)); fd += a*(draw_ - fd); draw_ = fd; }
        let u = kp*e + ki*integ + kd*draw_; if (Math.abs(u) > umax) { sat++; u = Math.sign(u)*umax; }
        TH.push(th*180/Math.PI); U.push(u);
        const acc = held ? 0 : u/I; w += acc*dt; th += w*dt; if (held) { w = 0; th = 0; }
      }
      const g = cv.g; g.clearRect(0,0,cv.w,cv.h);
      const mx = Math.max(sref.get()*1.6, ...TH.map(Math.abs));
      plot(g, {x:10,y:4,w:500,h:120}, t, [{ys:REF,color:MUT,dash:[5,4]},{ys:TH,color:CYAN,lw:2}], -mx*0.2, mx, {title:"angle θ [°]  (grey = setpoint" + (on("bias")?"; held by hand until t = 1 s":"") + ")", dp:0});
      plot(g, {x:10,y:128,w:500,h:92}, t, [{ys:U,color:AMBER,lw:1.4}], -umax*1.1, umax*1.1, {title:"torque u [N·m]  · ±0.6 limit", dp:2, hlines:[{y:umax,color:RED},{y:-umax,color:RED}]});
      let ovs = Math.max(0, (Math.max(...TH)-sref.get())/sref.get()*100); const wn = Math.sqrt(skp.get()), z = skd.get()/(2*Math.sqrt(Math.max(1e-6,skp.get())));
      const hiss = sig>0 && !on("dfilt") && skd.get()>0;
      note.innerHTML = "ω<sub>n</sub> = √Kp = " + wn.toFixed(1) + " rad/s, ζ = Kd/2√Kp = " + z.toFixed(2) + ", overshoot " + ovs.toFixed(0) + "%, saturated " + (sat/n*100).toFixed(0) + "% of steps. " +
        (hiss ? "<b style='color:"+RED+"'>Fix 5:</b> D is differentiating gyro noise into the torque — that hash is what motors turn into a scream. Switch on <i>D low-pass</i>. " : "") +
        (on("bias") && ski.get()>0 && !on("clamp") ? "<b style='color:"+RED+"'>Fix 1:</b> held for a second, the integrator wound up; on release it lurches past the setpoint. Switch on <i>I clamp</i>. " : "") +
        (!on("dmeas") && skd.get()>0 ? "Fix 4: D on error kicks at t = 0 (see the torque spike). Switch to <i>D on measurement</i>. " : "") +
        "Each button is one of the seven engineering fixes; each fixes exactly one failure you can make appear here first.";
    }
    [skp,ski,skd,sns,sref].forEach(s => s.input.addEventListener("input", draw)); draw();
  }

  /* ============================ 19 · altitude (Wk 6) ============================ */
  function altitude(root) {
    root.appendChild(el("div", null, "<b>Altitude loop with an unknown mass — what the integrator carries, and what windup costs</b>"));
    const cv = canvas(root, 520, 220), row = el("div", "wrow"), row2 = el("div", "wrow");
    const sdm = slider(row, "mass error", -20, 30, 1, 10, v => (v>0?"+":"")+v+"%");
    const skp = slider(row, "Kp", 2, 30, 0.5, 12, v => v.toFixed(1));
    const skd = slider(row, "Kd", 1, 20, 0.5, 8, v => v.toFixed(1));
    const ski = slider(row, "Ki", 0, 10, 0.25, 2, v => v.toFixed(2));
    const sclamp = slider(row, "I clamp", 0.2, 6, 0.2, 2, v => v.toFixed(1));
    const bff = el("button", "alt", "feed-forward mg: on"); let ff = true; bff.addEventListener("click", () => { ff=!ff; bff.textContent = "feed-forward mg: " + (ff?"on":"off"); bff.className = ff?"alt":""; draw(); }); row2.appendChild(bff);
    const bfloor = el("button", "alt", "ground: on"); let floor = true; bfloor.addEventListener("click", () => { floor=!floor; bfloor.textContent = "ground: " + (floor?"on":"off"); bfloor.className = floor?"alt":""; draw(); }); row2.appendChild(bfloor);
    root.appendChild(row); root.appendChild(row2); const note = el("div", "note"); root.appendChild(note);
    function draw() {
      const m0 = 0.65, g0 = 9.81, mt = m0*(1+sdm.get()/100), dt = 0.005, n = 1600, Tmax = 16, kp=skp.get(), kd=skd.get(), ki=ski.get(), cl=sclamp.get();
      let z=0, v=0, iz=0; const t=[], Z=[], R=[], IZ=[], TT=[]; let sat=0, minz=0;
      for (let i=0;i<n;i++){ const tt=i*dt; t.push(tt); const zr = tt<0.5?0:1.5; R.push(zr);
        const e = zr - z; iz = Math.max(-cl, Math.min(cl, iz + e*dt));
        const a = kp*e - kd*v + ki*iz; let T = (ff?m0*g0:0) + m0*a; T = Math.max(0.1*m0*g0, Math.min(Tmax, T)); if (T>=Tmax-1e-9) sat++;
        const acc = -g0 + T/mt; v += acc*dt; z += v*dt; if (floor && z<0) { z=0; v=Math.max(0,v); } minz = Math.min(minz, z);
        Z.push(z); IZ.push(iz); TT.push(T); }
      const g = cv.g; g.clearRect(0,0,cv.w,cv.h);
      plot(g, {x:10,y:4,w:500,h:125}, t, [{ys:R,color:MUT,dash:[5,4]},{ys:Z,color:CYAN,lw:2}], -0.3, 2.2, {title:"altitude z [m] · step to 1.5 m at t = 0.5 s · true mass " + mt.toFixed(3) + " kg, controller believes 0.650", dp:1});
      plot(g, {x:10,y:133,w:500,h:84}, t, [{ys:IZ,color:VIO,lw:1.6}], -cl*1.1, cl*1.1, {title:"integrator state (clamp ±" + cl.toFixed(1) + ")", dp:1});
      const ss = Z[n-1]-1.5, ovs = Math.max(0, Math.max(...Z)-1.5), need = (mt-m0)*g0/(m0*ki);
      note.innerHTML = "Steady error after 8 s: <b>" + (ss*100).toFixed(1) + " cm</b>, overshoot " + (ovs*100).toFixed(0) + " cm, thrust saturated " + (sat/n*100).toFixed(0) + "% of steps" + (minz<-0.01?", dipped to " + (minz*100).toFixed(0) + " cm below the pad":"") + ". " +
        "To carry " + (sdm.get()>0?"+":"") + sdm.get() + "% mass the integrator must settle at " + need.toFixed(2) + " — " + (Math.abs(need)>cl ? "<b style='color:"+RED+"'>outside the clamp</b>, so the vehicle hovers low forever; raise the clamp or the mass error stays as a permanent offset." : "inside the clamp, so it eventually gets there; the recovery time is set by Ki, and a large clamp plus a large Ki is how you get the overshoot (fix 1/2).") +
        (ff ? "" : " With feed-forward off the integrator has to carry all of mg — fix 6 is the whole difference between a 2 s and a 20 s take-off.");
    }
    [sdm,skp,skd,ski,sclamp].forEach(s => s.input.addEventListener("input", draw)); draw();
  }

  /* ============================ 20 · riccati (Wk 7) ============================ */
  function riccati(root) {
    root.appendChild(el("div", null, "<b>The Riccati recursion — press iterate, watch P and K converge</b>"));
    const cv = canvas(root, 520, 200), row = el("div", "wrow");
    const sq = slider(row, "log₁₀ q", -1, 3, 0.1, 1, v => v.toFixed(1));
    const sr = slider(row, "log₁₀ r", -3, 1, 0.1, -1, v => v.toFixed(1));
    const b1 = el("button", null, "iterate ×1"), b10 = el("button", null, "×10"), b0 = el("button", "alt", "reset"); row.appendChild(b1); row.appendChild(b10); row.appendChild(b0);
    root.appendChild(row); const note = el("div", "note"); root.appendChild(note);
    const dt = 0.05, A = [[1,dt],[0,1]], B = [dt*dt/2, dt]; let P = [[0,0],[0,0]], k = 0, hist = [];
    function step() {
      const q = Math.pow(10,sq.get()), r = Math.pow(10,sr.get()); const Q = [[q,0],[0,q*0.1]];
      // P_{k+1} = Q + A'PA - A'PB (r + B'PB)^-1 B'PA
      const AtP = [[A[0][0]*P[0][0]+A[1][0]*P[1][0], A[0][0]*P[0][1]+A[1][0]*P[1][1]],[A[0][1]*P[0][0]+A[1][1]*P[1][0], A[0][1]*P[0][1]+A[1][1]*P[1][1]]];
      const AtPA = [[AtP[0][0]*A[0][0]+AtP[0][1]*A[1][0], AtP[0][0]*A[0][1]+AtP[0][1]*A[1][1]],[AtP[1][0]*A[0][0]+AtP[1][1]*A[1][0], AtP[1][0]*A[0][1]+AtP[1][1]*A[1][1]]];
      const PB = [P[0][0]*B[0]+P[0][1]*B[1], P[1][0]*B[0]+P[1][1]*B[1]];
      const AtPB = [A[0][0]*PB[0]+A[1][0]*PB[1], A[0][1]*PB[0]+A[1][1]*PB[1]];
      const S = r + B[0]*PB[0] + B[1]*PB[1];
      const Pn = [[Q[0][0]+AtPA[0][0]-AtPB[0]*AtPB[0]/S, Q[0][1]+AtPA[0][1]-AtPB[0]*AtPB[1]/S],[Q[1][0]+AtPA[1][0]-AtPB[1]*AtPB[0]/S, Q[1][1]+AtPA[1][1]-AtPB[1]*AtPB[1]/S]];
      const K = [AtPB[0]/S, AtPB[1]/S]; // K = (r+B'PB)^-1 B'PA  (using symmetry)
      const dP = Math.abs(Pn[0][0]-P[0][0])+Math.abs(Pn[1][1]-P[1][1])+2*Math.abs(Pn[0][1]-P[0][1]);
      P = Pn; k++; hist.push({k, K, dP, P: [P[0][0],P[0][1],P[1][1]]});
    }
    function reset() { P=[[0,0],[0,0]]; k=0; hist=[]; draw(); }
    function draw() {
      const g = cv.g; g.clearRect(0,0,cv.w,cv.h); g.fillStyle="#fbfdff"; g.fillRect(0,0,cv.w,cv.h);
      if (hist.length) { const t = hist.map(h=>h.k), K1 = hist.map(h=>h.K[0]), K2 = hist.map(h=>h.K[1]);
        plot(g, {x:10,y:4,w:320,h:190}, t.length>1?t:[0,1], t.length>1?[{ys:K1,color:CYAN,lw:2},{ys:K2,color:AMBER,lw:2}]:[], 0, Math.max(1, ...K1, ...K2)*1.1, {title:"gain K = [k_pos, k_vel] vs iteration", dp:1});
        legend(g, 200, 24, [{label:"k_pos",color:CYAN},{label:"k_vel",color:AMBER}]); }
      else { g.fillStyle = MUT; g.font = "13px sans-serif"; g.fillText("P₀ = 0. Press iterate.", 20, 40); }
      const h = hist[hist.length-1]; g.fillStyle = NAVY; g.font = "12px monospace";
      if (h) { g.fillText("iteration " + h.k, 345, 24); g.fillText("P = [" + h.P[0].toFixed(2) + " " + h.P[1].toFixed(2) + "]", 345, 48); g.fillText("    [" + h.P[1].toFixed(2) + " " + h.P[2].toFixed(2) + "]", 345, 64);
        g.fillText("K = [" + h.K[0].toFixed(3) + ", " + h.K[1].toFixed(3) + "]", 345, 92); g.fillStyle = h.dP<1e-6?OK:AMBER; g.fillText("|ΔP| = " + h.dP.toExponential(1), 345, 116); }
      note.innerHTML = "Double integrator, Δt = 0.05 s, Q = diag(q, 0.1q), R = r. Each press applies one backward step of dynamic programming: P<sub>k+1</sub> = Q + AᵀPA − AᵀPB(R+BᵀPB)⁻¹BᵀPA. " +
        (h && h.dP<1e-6 ? "<b>Converged</b>: this P is the infinite-horizon cost-to-go bowl and K its LQR gain — the same P Week 12 uses as the MPC terminal cost. Change q or r and reset to see the bowl reshape." : "Watch K rise from zero and settle: the recursion <i>is</i> the ARE solver, made visible. Convergence takes tens of steps here; scipy hides them.");
    }
    b1.addEventListener("click", () => { step(); draw(); }); b10.addEventListener("click", () => { for (let i=0;i<10;i++) step(); draw(); }); b0.addEventListener("click", reset);
    [sq,sr].forEach(s => s.input.addEventListener("input", reset)); draw();
  }

  /* ============================ 21 · latency (Wk 8) ============================ */
  function latency(root) {
    root.appendChild(el("div", null, "<b>Delay destabilises — the same gains, a later measurement</b>"));
    const cv = canvas(root, 520, 215), row = el("div", "wrow");
    const sdl = slider(row, "measurement delay", 0, 400, 10, 0, v => v+" ms");
    const skp = slider(row, "Kp", 1, 20, 0.5, 6, v => v.toFixed(1));
    const skd = slider(row, "Kd", 0.5, 12, 0.5, 4, v => v.toFixed(1));
    root.appendChild(row); const note = el("div", "note"); root.appendChild(note);
    function draw() {
      const dt = 0.005, n = 2000, D = Math.round(sdl.get()/1000/dt), kp=skp.get(), kd=skd.get();
      let x=0, v=0; const X=[], V=[], t=[]; let peak=0, last=[];
      for (let i=0;i<n;i++){ t.push(i*dt); X.push(x); V.push(v);
        const j = Math.max(0, i-D); const xm = X[j], vm = V[j]; // delayed measurement
        const a = kp*(1-xm) - kd*vm; v += a*dt; x += v*dt; peak = Math.max(peak, x); }
      const tail = X.slice(n-400); const osc = (Math.max(...tail)-Math.min(...tail));
      const g = cv.g; g.clearRect(0,0,cv.w,cv.h);
      const mx = Math.max(2, Math.min(6, Math.max(...X.map(Math.abs))*1.1));
      plot(g, {x:10,y:6,w:500,h:180}, t, [{ys:X,color:osc>0.05?RED:CYAN,lw:2}], -mx+1.5, mx, {title:"position step response, measurement delayed " + sdl.get() + " ms", dp:1, hlines:[{y:1,color:OK}]});
      const wn = Math.sqrt(kp), pm = Math.max(0, 90 - sdl.get()/1000*wn*180/Math.PI);
      note.innerHTML = "ω<sub>n</sub> = " + wn.toFixed(2) + " rad/s; a pure delay τ removes ω·τ of phase, ≈ <b>" + (sdl.get()/1000*wn*180/Math.PI).toFixed(0) + "°</b> at the crossover. " +
        (osc>0.05 ? "<b style='color:"+RED+"'>Limit cycle</b> — the loop is correcting toward where the vehicle <i>was</i>, arriving late every time. Lower Kp, or accept less bandwidth." : "Stable; peak " + peak.toFixed(2) + ". ") +
        " The Week-10 plant delays GPS by 120–300 ms — find the Kp at which <i>your</i> gains start to hunt, and you have predicted the workshop.";
    }
    [sdl,skp,skd].forEach(s => s.input.addEventListener("input", draw)); draw();
  }

  /* ============================ 22 · poly7 (Wk 9) ============================ */
  function poly7(root) {
    root.appendChild(el("div", null, "<b>Seventh-order trajectory — boundary conditions in, position/velocity/acceleration/jerk out</b>"));
    const cv = canvas(root, 520, 230), row = el("div", "wrow");
    const sd = slider(row, "distance", 0.5, 4, 0.1, 2, v => v.toFixed(1)+" m");
    const sT = slider(row, "duration T", 1, 8, 0.1, 3, v => v.toFixed(1)+" s");
    const sv1 = slider(row, "end velocity", 0, 1.5, 0.05, 0, v => v.toFixed(2)+" m/s");
    const samax = slider(row, "a limit", 0.5, 6, 0.1, 2.5, v => v.toFixed(1)+" m/s²");
    root.appendChild(row); const note = el("div", "note"); root.appendChild(note);
    function draw() {
      const d=sd.get(), T=sT.get(), v1=sv1.get(), am=samax.get();
      // solve 8 coeffs: p(0)=0,v(0)=0,a(0)=0,j(0)=0 ; p(T)=d, v(T)=v1, a(T)=0, j(T)=0  -> a0..a3 = 0, solve 4x4 for a4..a7
      const M = [], rhs = [d, v1, 0, 0];
      const pw = (k, e) => Math.pow(T, k-e);
      const fact = (k, e) => { let f=1; for (let i=0;i<e;i++) f *= (k-i); return f; };
      for (let e=0;e<4;e++){ M.push([4,5,6,7].map(k => fact(k,e)*pw(k,e))); }
      // gaussian elimination
      const A = M.map((r,i)=>[...r, rhs[i]]);
      for (let c=0;c<4;c++){ let p=c; for (let r=c+1;r<4;r++) if (Math.abs(A[r][c])>Math.abs(A[p][c])) p=r; [A[c],A[p]]=[A[p],A[c]];
        for (let r=0;r<4;r++){ if (r===c) continue; const f=A[r][c]/A[c][c]; for (let k=c;k<5;k++) A[r][k]-=f*A[c][k]; } }
      const a = [0,0,0,0, A[0][4]/A[0][0], A[1][4]/A[1][1], A[2][4]/A[2][2], A[3][4]/A[3][3]];
      const ev = (t, e) => { let s=0; for (let k=e;k<8;k++) s += a[k]*fact(k,e)*Math.pow(t,k-e); return s; };
      const n=200, t=[], P=[],V=[],Ac=[],J=[]; let amax=0, jmax=0;
      for (let i=0;i<=n;i++){ const tt=i/n*T; t.push(tt); P.push(ev(tt,0)); V.push(ev(tt,1)); Ac.push(ev(tt,2)); J.push(ev(tt,3)); amax=Math.max(amax,Math.abs(Ac[i])); jmax=Math.max(jmax,Math.abs(J[i])); }
      const g = cv.g; g.clearRect(0,0,cv.w,cv.h);
      const nrm = (arr) => { const m = Math.max(1e-6, ...arr.map(Math.abs)); return arr.map(v=>v/m); };
      plot(g, {x:10,y:6,w:500,h:150}, t, [{ys:nrm(P),color:NAVY,lw:2},{ys:nrm(V),color:CYAN,lw:1.8},{ys:nrm(Ac),color:amax>am?RED:AMBER,lw:1.8},{ys:nrm(J),color:VIO,lw:1.2,dash:[4,3]}], -1.1, 1.1, {title:"normalised profiles over one segment", dp:0});
      legend(g, 180, 24, [{label:"p",color:NAVY},{label:"v",color:CYAN},{label:"a",color:amax>am?RED:AMBER},{label:"jerk",color:VIO,dash:[4,3]}]);
      g.fillStyle = NAVY; g.font = "12px monospace";
      g.fillText("peak |v| = " + Math.max(...V.map(Math.abs)).toFixed(2) + " m/s   peak |a| = " + amax.toFixed(2) + " m/s²   peak |jerk| = " + jmax.toFixed(1) + " m/s³", 16, 180);
      g.fillText("peak tilt ≈ atan(a/g) = " + (Math.atan(amax/9.81)*180/Math.PI).toFixed(1) + "°   ·   T needed for a ≤ " + am.toFixed(1) + ": " + (T*Math.sqrt(amax/am)).toFixed(2) + " s", 16, 200);
      note.innerHTML = "Eight boundary conditions (p, v, a, jerk at both ends) fix eight coefficients — a 7th-order polynomial, the minimum-snap family. " +
        (amax>am ? "<b style='color:"+RED+"'>Infeasible:</b> peak acceleration exceeds your limit; a ∝ d/T², so stretch T by √(" + (amax/am).toFixed(2) + ") = " + Math.sqrt(amax/am).toFixed(2) + "×. Feasibility first, five lines of arithmetic before any flight." : "Feasible inside your acceleration limit. Halve T and watch a quadruple — aggressiveness is quadratic in tempo.") +
        " Jerk maps to body-rate command; its continuity at the ends is why the corners of a waypoint mission do not snap.";
    }
    [sd,sT,sv1,samax].forEach(s => s.input.addEventListener("input", draw)); draw();
  }

  /* ============================ 23 · gap (Wk 10) ============================ */
  function gap(root) {
    root.appendChild(el("div", null, "<b>Reality-gap explorer — the nominal PID flies the square; switch one effect on at a time</b>"));
    const cv = canvas(root, 520, 240), row = el("div", "wrow"), row2 = el("div", "wrow");
    const eff = {};
    [["lag","motor lag"],["drag","drag"],["mass","extra mass"],["gust","gust"],["lat","GPS latency"]].forEach(([k,l]) => {
      const b = el("button", "alt", l + ": off"); b.dataset.on="0"; b.addEventListener("click", () => { b.dataset.on = b.dataset.on==="1"?"0":"1"; b.textContent = l + ": " + (b.dataset.on==="1"?"on":"off"); b.className = b.dataset.on==="1"?"":"alt"; draw(); }); row.appendChild(b); eff[k]=b; });
    const ssev = slider(row2, "strength", 0.2, 2, 0.1, 1, v => "×"+v.toFixed(1));
    const sview = el("button", null, "view: XY track"); let view = 0; sview.addEventListener("click", () => { view = (view+1)%3; sview.textContent = "view: " + ["XY track","z(t) + thrust","error heading"][view]; draw(); }); row2.appendChild(sview);
    root.appendChild(row); root.appendChild(row2); const note = el("div", "note"); root.appendChild(note);
    const on = k => eff[k].dataset.on === "1";
    function draw() {
      const s = ssev.get(), dt = 0.01, g0 = 9.81, m0 = 0.65, mt = m0*(1 + (on("mass")?0.09*s:0)), tau = on("lag")?0.08*s:1e-4, c1 = on("drag")?0.12*s:0, c2 = on("drag")?0.05*s:0;
      const gm = on("gust")?0.7*s:0, gsig = on("gust")?0.55*s:0, gtau = 1.5, D = on("lat")?Math.round(0.2*s/dt):0;
      const wp = [[0,0,0],[0,0,1.5],[2,0,1.5],[2,2,1.5],[0,2,1.5],[0,0,1.5],[0,0,0.05]], speed=0.5, hold=1.0;
      const seg = []; let tt0 = 0; for (let i=1;i<wp.length;i++){ const L = Math.hypot(wp[i][0]-wp[i-1][0], wp[i][1]-wp[i-1][1], wp[i][2]-wp[i-1][2]); seg.push({t0: tt0+hold, t1: tt0+hold+L/speed, a: wp[i-1], b: wp[i]}); tt0 += hold + L/speed; }
      const ref = t => { for (const sg of seg){ if (t < sg.t0) return sg.a; if (t <= sg.t1) { const f=(t-sg.t0)/(sg.t1-sg.t0); return [0,1,2].map(k=>sg.a[k]+f*(sg.b[k]-sg.a[k])); } } return wp[wp.length-1]; };
      const T = tt0 + hold + 2, n = Math.round(T/dt);
      const kp=[6,6,12], kd=[4,4,8], kiz=2; let p=[0,0,0], v=[0,0,0], iz=0, fact=m0*g0, ou=[0,0], hist=[];
      const r = rng(11); const heading = 2.1; const gmean = [gm*Math.cos(heading), gm*Math.sin(heading)];
      const PX=[],PY=[],PZ=[],RX=[],RY=[],RZ=[],FC=[],FA=[],tt=[]; let e2=0, maxdev=0, minz=0;
      for (let i=0;i<n;i++){ const t=i*dt; const rf = ref(t);
        // delayed position measurement (velocity assumed from IMU = true)
        hist.push(p.slice()); const pm = hist[Math.max(0, i-D)];
        const e = [rf[0]-pm[0], rf[1]-pm[1], rf[2]-pm[2]]; iz = Math.max(-2, Math.min(2, iz + e[2]*dt));
        const a = [kp[0]*e[0]-kd[0]*v[0], kp[1]*e[1]-kd[1]*v[1], kp[2]*e[2]-kd[2]*v[2]+kiz*iz];
        // desired total thrust and tilt (small-angle), clamp 30 deg, thrust 0..16
        let Tcmd = m0*(g0 + a[2]); Tcmd = Math.max(0.1*m0*g0, Math.min(16, Tcmd));
        const tl = Math.tan(30*Math.PI/180); let ax = Math.max(-g0*tl, Math.min(g0*tl, a[0])), ay = Math.max(-g0*tl, Math.min(g0*tl, a[1]));
        // motor lag on total thrust
        const al = 1 - Math.exp(-dt/tau); fact += al*(Tcmd - fact); FC.push(Tcmd); FA.push(fact);
        // gust OU
        ou = ou.map(o => o + (-o*dt/gtau + gsig*Math.sqrt(2*dt/gtau)*gauss(r))); const F = [gmean[0]+ou[0], gmean[1]+ou[1]];
        // dynamics: horizontal accel from tilt scaled by actual thrust ratio, drag, gust
        const sp = Math.hypot(v[0],v[1],v[2]); const drag = v.map(vi => -(c1*vi + c2*sp*vi));
        const acc = [ax*fact/(m0*g0)*(m0/mt) + (drag[0]+F[0])/mt, ay*fact/(m0*g0)*(m0/mt) + (drag[1]+F[1])/mt, -g0 + fact/mt + drag[2]/mt];
        v = v.map((vi,k)=>vi+acc[k]*dt); p = p.map((pi,k)=>pi+v[k]*dt); if (p[2]<0){ p[2]=0; v[2]=Math.max(0,v[2]); } minz = Math.min(minz, p[2]);
        const dev = Math.hypot(p[0]-rf[0],p[1]-rf[1],p[2]-rf[2]); e2 += dev*dev; maxdev = Math.max(maxdev, dev);
        if (i%3===0){ PX.push(p[0]);PY.push(p[1]);PZ.push(p[2]);RX.push(rf[0]);RY.push(rf[1]);RZ.push(rf[2]);tt.push(t);} }
      const rmse = Math.sqrt(e2/n), land = Math.hypot(p[0],p[1]);
      const g = cv.g; g.clearRect(0,0,cv.w,cv.h); g.fillStyle="#fbfdff"; g.fillRect(0,0,cv.w,cv.h);
      if (view===0) { const cx=110, cy=200, S=70; g.strokeStyle=MUT; g.setLineDash([5,4]); g.beginPath(); RX.forEach((x,i)=>{ const X=cx+x*S, Y=cy-RY[i]*S; if(i===0) g.moveTo(X,Y); else g.lineTo(X,Y); }); g.stroke(); g.setLineDash([]);
        g.strokeStyle=CYAN; g.lineWidth=2; g.beginPath(); PX.forEach((x,i)=>{ const X=cx+x*S, Y=cy-PY[i]*S; if(i===0) g.moveTo(X,Y); else g.lineTo(X,Y); }); g.stroke(); g.lineWidth=1;
        g.fillStyle=RED; g.beginPath(); g.arc(cx+p[0]*S, cy-p[1]*S, 4, 0, 7); g.fill();
        g.fillStyle = NAVY; g.font = "bold 13px sans-serif"; g.fillText("XY track · grey = reference · red dot = landing", 300, 30);
        g.font = "13px monospace"; g.fillText("RMSE     " + rmse.toFixed(3) + " m", 300, 60); g.fillText("max dev  " + maxdev.toFixed(3) + " m", 300, 80); g.fillText("landing  " + land.toFixed(3) + " m off", 300, 100); g.fillText("min z    " + minz.toFixed(3) + " m", 300, 120); }
      else if (view===1) { plot(g, {x:10,y:4,w:500,h:110}, tt, [{ys:RZ,color:MUT,dash:[5,4]},{ys:PZ,color:CYAN,lw:2}], -0.1, 1.8, {title:"z(t) — first 4 s show take-off sag if mass is on", dp:1});
        const k = Math.min(FC.length, Math.round(4/dt)); const t4 = FC.slice(0,k).map((_,i)=>i*dt);
        plot(g, {x:10,y:120,w:500,h:115}, t4, [{ys:FC.slice(0,k),color:AMBER,lw:1.4},{ys:FA.slice(0,k),color:CYAN,lw:2}], 4, 12, {title:"total thrust, first 4 s: commanded (amber) vs applied (teal)", dp:0}); }
      else { const bins = new Array(24).fill(0); for (let i=0;i<PX.length;i++){ const ex=PX[i]-RX[i], ey=PY[i]-RY[i]; if (Math.hypot(ex,ey)<0.03) continue; const h=Math.atan2(ey,ex); bins[Math.floor(((h+Math.PI)/(2*Math.PI))*24)%24]++; }
        const mb = Math.max(1,...bins); const cx=260, cy=125, R0=25, R1=95; for (let b=0;b<24;b++){ const a0=-Math.PI+b*Math.PI/12, a1=a0+Math.PI/12, rr=R0+(R1-R0)*bins[b]/mb; g.fillStyle=CYAN; g.beginPath(); g.moveTo(cx+R0*Math.cos(a0), cy-R0*Math.sin(a0)); g.arc(cx,cy,rr,-a0,-a1,true); g.lineTo(cx+R0*Math.cos(a1), cy-R0*Math.sin(a1)); g.arc(cx,cy,R0,-a1,-a0,false); g.fill(); }
        g.strokeStyle=MUT; g.beginPath(); g.arc(cx,cy,R1,0,7); g.stroke(); g.fillStyle=NAVY; g.font="bold 13px sans-serif"; g.fillText("error-direction histogram (where the vehicle sits relative to the reference)", 40, 20); g.fillStyle=MUT; g.font="11px sans-serif"; g.fillText("a preferred lobe = a mean force nobody cancels", 150, 232); }
      const active = ["lag","drag","mass","gust","lat"].filter(on);
      note.innerHTML = (active.length ? "On: <b>" + active.join(", ") + "</b> at ×" + s.toFixed(1) + ". " : "Nothing on — this is the nominal model, the left column of <code>08_team_mission.py</code>. ") +
        "RMSE " + rmse.toFixed(3) + " m, max deviation " + maxdev.toFixed(2) + " m, landed " + land.toFixed(2) + " m from the pad. Simplified point-mass version of <code>TeamPlant</code> (no attitude dynamics, no estimator) — shapes are faithful, numbers are not. Cycle the view: z(t) exposes mass and lag; the heading histogram exposes the gust; the XY track exposes latency when it starts to hunt.";
    }
    ssev.input.addEventListener("input", draw); draw();
  }

  /* ============================ 24 · seeds (Wk 11) ============================ */
  function seeds(root) {
    root.appendChild(el("div", null, "<b>Seed spread — the same controller, many estimator seeds, one threshold</b>"));
    const cv = canvas(root, 520, 205), row = el("div", "wrow");
    const sn = slider(row, "seeds", 1, 200, 1, 8, v => v);
    const sbar = slider(row, "threshold", 0.3, 0.8, 0.01, 0.5, v => v.toFixed(2)+" m");
    const smu = slider(row, "controller mean", 0.3, 0.7, 0.01, 0.42, v => v.toFixed(2)+" m");
    const ssd = slider(row, "spread σ", 0.02, 0.25, 0.01, 0.12, v => v.toFixed(2)+" m");
    root.appendChild(row); const note = el("div", "note"); root.appendChild(note);
    function draw() {
      const N = Math.round(sn.get()), bar = sbar.get(), mu = smu.get(), sd = ssd.get(); const r = rng(3);
      // lognormal-ish: max deviation is positive and right-skewed
      const vals = []; for (let i=0;i<N;i++){ const z = gauss(r); vals.push(Math.max(0.05, mu*Math.exp(sd/mu*z - 0.5*(sd/mu)**2))); }
      const nb = 24, lo = 0.1, hi = 1.0, bins = new Array(nb).fill(0); vals.forEach(v => { const b = Math.min(nb-1, Math.max(0, Math.floor((v-lo)/(hi-lo)*nb))); bins[b]++; });
      const g = cv.g; g.clearRect(0,0,cv.w,cv.h); g.fillStyle="#fbfdff"; g.fillRect(0,0,cv.w,cv.h);
      const bx={x:30,y:20,w:470,h:150}, mb = Math.max(1,...bins);
      for (let b=0;b<nb;b++){ const x0 = bx.x + b/nb*bx.w, ww = bx.w/nb-2, hh = bins[b]/mb*bx.h; const centre = lo + (b+0.5)/nb*(hi-lo);
        g.fillStyle = centre>bar ? RED : OK; g.fillRect(x0, bx.y+bx.h-hh, ww, hh); }
      const X = v => bx.x + (v-lo)/(hi-lo)*bx.w; g.strokeStyle = NAVY; g.lineWidth=2; g.beginPath(); g.moveTo(X(bar), bx.y-6); g.lineTo(X(bar), bx.y+bx.h); g.stroke(); g.lineWidth=1;
      g.fillStyle = MUT; g.font = "11px sans-serif"; g.fillText("REQ-M3-1 max deviation [m] →", bx.x+bx.w-170, bx.y+bx.h+14); g.fillText(lo.toFixed(1), bx.x, bx.y+bx.h+14); g.fillText(hi.toFixed(1), bx.x+bx.w-14, bx.y+bx.h+14);
      const pass = vals.filter(v=>v<bar).length, best = Math.min(...vals), worst = Math.max(...vals);
      g.fillStyle = NAVY; g.font = "bold 13px sans-serif"; g.fillText("pass " + pass + "/" + N + " (" + (pass/N*100).toFixed(0) + "%)  ·  best " + best.toFixed(3) + "  ·  worst " + worst.toFixed(3) + "  ·  seed 0: " + vals[0].toFixed(3) + (vals[0]<bar?" PASS":" FAIL"), bx.x, 14);
      note.innerHTML = (N===1 ? "<b>One seed.</b> You know exactly one thing: whether this seed passed. Drag the slider to 8 and watch the distribution appear — that shape existed all along; one run just could not see it. " : "") +
        "The controller is deterministic; only the estimator noise moves. Course rule: graded on seed 0 with one command, <i>plus</i> one sentence reporting the spread over seeds 0,1,2 — because " + (pass<N && pass>0 ? "a controller that passes " + (pass/N*100).toFixed(0) + "% of the time is a different engineering object from one that always passes, and a single PASS cannot tell them apart." : "the distribution, not the best run, is the claim you are actually making.") +
        " The real CascadePID data (CERTIFICATION.md §6): 0.540/0.721/0.211/0.278/0.255/0.388/0.277/0.306 m over eight seeds — fails 2 of 8 at 0.50 m.";
    }
    [sn,sbar,smu,ssd].forEach(s => s.input.addEventListener("input", draw)); draw();
  }

  /* ============================ 25 · softqp (Wk 12) ============================ */
  function softqp(root) {
    root.appendChild(el("div", null, "<b>Soft constraints and QP size — the price of ρ and the price of N</b>"));
    const cv = canvas(root, 520, 215), row = el("div", "wrow");
    const sN = slider(row, "horizon N", 4, 60, 1, 20, v => v);
    const srho = slider(row, "log₁₀ ρ", 0, 5, 0.1, 2, v => v.toFixed(1));
    const sgust = slider(row, "gust push", 0, 1.5, 0.05, 0.6, v => v.toFixed(2)+" m");
    const shard = el("button", "alt", "corridor: soft"); let hard = false; shard.addEventListener("click", () => { hard=!hard; shard.textContent = "corridor: " + (hard?"HARD":"soft"); shard.className = hard?"":"alt"; draw(); }); row.appendChild(shard);
    root.appendChild(row); const note = el("div", "note"); root.appendChild(note);
    function draw() {
      const N = Math.round(sN.get()), rho = Math.pow(10, srho.get()), push = sgust.get(), dt = 0.05, ymax = 0.5, umax = 3.0;
      // 1-D corridor problem: state y (lateral), pushed to y0 = push at t=0; minimise sum q y^2 + r u^2 + rho*slack^2 s.t. |y|<=ymax+slack, |u|<=umax
      // projected gradient on U with slack implicit (soft) or infeasible flag (hard)
      let x = [push, 0]; const Y=[], t=[]; let infeasible=false, viol=0, solveMs=0;
      const t0 = performance.now();
      for (let i=0;i<60;i++){ t.push(i*dt); Y.push(x[0]);
        let U = new Array(N).fill(0);
        for (let it=0; it<120; it++){ const xs=[x.slice()]; for (let k=0;k<N;k++){ const s=xs[k]; xs.push([s[0]+dt*s[1]+dt*dt/2*U[k], s[1]+dt*U[k]]); }
          let lam=[0,0]; const gU=new Array(N).fill(0);
          for (let k=N;k>=1;k--){ const s=xs[k]; const over = Math.max(0, Math.abs(s[0])-ymax)*Math.sign(s[0]);
            const gx=[2*4*s[0] + (hard?0:2*rho*over), 2*1*s[1]]; lam=[gx[0]+lam[0], gx[1]+lam[1]+dt*lam[0]]; gU[k-1]=2*0.05*U[k-1]+dt*dt/2*lam[0]+dt*lam[1]; }
          for (let k=0;k<N;k++) U[k]=Math.max(-umax, Math.min(umax, U[k]-0.01*gU[k])); }
        // hard mode: check predicted feasibility from current state with max braking
        if (hard) { const tb = Math.abs(x[1])/umax, stop = Math.abs(x[0]) + Math.abs(x[1])*tb - 0.5*umax*tb*tb; if (Math.abs(x[0])>ymax || stop>ymax) { infeasible = true; } }
        const u = infeasible ? 0 : U[0]; x=[x[0]+dt*x[1]+dt*dt/2*u, x[1]+dt*u]; viol = Math.max(viol, Math.abs(x[0])-ymax); }
      solveMs = (performance.now()-t0)/60;
      const g = cv.g; g.clearRect(0,0,cv.w,cv.h);
      plot(g, {x:10,y:6,w:500,h:150}, t, [{ys:Y,color:infeasible?RED:CYAN,lw:2}], -0.8, 1.6, {title:"lateral position y after a gust push · corridor |y| ≤ 0.5 (red)", dp:1, hlines:[{y:ymax,color:RED},{y:-ymax,color:RED}]});
      const nvar = N, ncon = 2*N + (hard?2*N:0), dense = N*N;
      g.fillStyle = NAVY; g.font = "12px monospace"; g.fillText("QP: " + nvar + " variables, " + ncon + " constraints, condensed Hessian " + N + "×" + N + " = " + dense + " entries · ~" + solveMs.toFixed(1) + " ms/step here", 14, 175); g.fillText("N·Δt = " + (N*dt).toFixed(2) + " s of look-ahead", 14, 195);
      note.innerHTML = (hard && infeasible ? "<b style='color:"+RED+"'>Infeasible QP:</b> the push put the state where no admissible input sequence returns inside the corridor in time — a hard state constraint returns <i>nothing</i>, and on an aircraft nothing is not a command. Soften it." :
        (viol>0.005 ? "Corridor violated by " + (viol*100).toFixed(0) + " cm with ρ = 10^" + srho.get().toFixed(1) + ": the solver bought feasibility with a violation it paid for. Raise ρ and the violation shrinks — and the QP gets stiffer; past ~10⁴ you are back to hard-constraint behaviour without the infeasibility guard." : "Inside the corridor. Lower ρ and watch the solver start to <i>rent</i> corridor when the push gets large — that is the design intent of a soft constraint.")) +
        " Cost scales roughly as N³ for a dense solve: doubling N is ×8 solve time for ×2 look-ahead. Keep thrust hard (physics enforces it anyway), soften states.";
    }
    [sN,srho,sgust].forEach(s => s.input.addEventListener("input", draw)); draw();
  }

  /* ============================ 26 · activation (Wk 13) ============================ */
  function activation(root) {
    root.appendChild(el("div", null, "<b>Constraint activation — when is the constraint doing the work?</b>"));
    const cv = canvas(root, 520, 220), row = el("div", "wrow");
    const sdm = slider(row, "mass drop", 0, 0.35, 0.01, 0.20, v => v.toFixed(2)+" kg");
    const sTmax = slider(row, "thrust cap", 8, 16, 0.5, 16, v => v.toFixed(1)+" N");
    const sN = slider(row, "horizon N", 4, 40, 1, 20, v => v);
    root.appendChild(row); const note = el("div", "note"); root.appendChild(note);
    function draw() {
      const dm = sdm.get(), Tmax = sTmax.get(), N = Math.round(sN.get()), dt = 0.05, g0 = 9.81, m0 = 0.65, m1 = m0 - dm;
      // altitude hold through a mass drop at t=5s; MPC on the nominal model (mass m0) with thrust bounds [0, Tmax]; compare to PID with clip
      function runMPC() { let z=0, v=0, m=m0; const Z=[], ACT=[], t=[]; for (let i=0;i<200;i++){ const tt=i*dt; if (tt>=5) m=m1; t.push(tt); Z.push(z);
          let U = new Array(N).fill(m0*g0); for (let it=0; it<80; it++){ const xs=[[z,v]]; for (let k=0;k<N;k++){ const s=xs[k]; const a=-g0+U[k]/m0; xs.push([s[0]+dt*s[1]+dt*dt/2*a, s[1]+dt*a]); }
            let lam=[0,0]; const gU=new Array(N).fill(0); for (let k=N;k>=1;k--){ const s=xs[k]; const gx=[2*30*s[0], 2*2*s[1]]; lam=[gx[0]+lam[0], gx[1]+lam[1]+dt*lam[0]]; gU[k-1]=2*0.02*(U[k-1]-m0*g0)+(dt*dt/2*lam[0]+dt*lam[1])/m0; }
            for (let k=0;k<N;k++) U[k]=Math.max(0, Math.min(Tmax, U[k]-0.0008*gU[k])); }
          const u = U[0]; ACT.push(u>=Tmax-1e-6 || u<=1e-6 ? 1 : 0); const a=-g0+u/m; v+=a*dt; z+=v*dt; } return {t,Z,ACT}; }
      function runPID() { let z=0, v=0, m=m0, iz=0; const Z=[], ACT=[]; for (let i=0;i<200;i++){ const tt=i*dt; if (tt>=5) m=m1; Z.push(z); iz=Math.max(-2,Math.min(2,iz-z*dt)); let u=m0*(g0+12*(-z)-8*v+2*iz); const c=Math.max(0,Math.min(Tmax,u)); ACT.push(c!==u?1:0); const a=-g0+c/m; v+=a*dt; z+=v*dt; } return {Z,ACT}; }
      const M = runMPC(), P = runPID();
      const g = cv.g; g.clearRect(0,0,cv.w,cv.h);
      const mx = Math.max(0.3, ...M.Z.map(Math.abs), ...P.Z.map(Math.abs))*1.15;
      plot(g, {x:10,y:4,w:500,h:140}, M.t, [{ys:P.Z,color:AMBER,lw:1.8},{ys:M.Z,color:CYAN,lw:2}], -mx, mx, {title:"altitude error through a " + dm.toFixed(2) + " kg drop at t = 5 s · PID (amber) vs MPC (teal), thrust ≤ " + Tmax.toFixed(1) + " N", dp:2});
      // activation strips
      const bx={x:10,y:152,w:500,h:60}; g.fillStyle="#fbfdff"; g.fillRect(bx.x,bx.y,bx.w,bx.h); g.strokeStyle=LINE; g.strokeRect(bx.x,bx.y,bx.w,bx.h);
      [[P.ACT,AMBER,"PID clipping"],[M.ACT,CYAN,"MPC bound active"]].forEach((row_,ri)=>{ const y0=bx.y+6+ri*28; g.fillStyle=MUT; g.font="11px sans-serif"; g.fillText(row_[2], bx.x+4, y0+16); row_[0].forEach((a,i)=>{ if(!a) return; g.fillStyle=row_[1]; g.fillRect(bx.x+110+i/200*(bx.w-120), y0, (bx.w-120)/200+0.5, 20); }); });
      const actM = M.ACT.reduce((a,b)=>a+b,0)/M.ACT.length*100, actP = P.ACT.reduce((a,b)=>a+b,0)/P.ACT.length*100;
      const peakM = Math.max(...M.Z.map(Math.abs)), peakP = Math.max(...P.Z.map(Math.abs));
      note.innerHTML = "Peak excursion: PID " + peakP.toFixed(3) + " m, MPC " + peakM.toFixed(3) + " m. Bound active: PID clips " + actP.toFixed(0) + "% of steps, MPC's bound is active " + actM.toFixed(0) + "%. " +
        (actM<1 && Tmax>=16 ? "<b>Nothing shaded for MPC:</b> the constraint never activated, so MPC here is LQR with preview — your improvement claim cannot be 'MPC handles the limit'. Lower the thrust cap until the strip lights up; <i>then</i> the constraint is doing work you can point at." :
         "The shaded strip is the evidence figure: it says <i>when</i> the constraint mattered. A claim about constraint handling without this strip is a claim without a mechanism.") +
        " Shorten N below the transient and MPC stops anticipating the drop — the strip and the excursion both tell you.";
    }
    [sdm,sTmax,sN].forEach(s => s.input.addEventListener("input", draw)); draw();
  }

  /* ============================ registry ============================ */
  const REG = { rot3d, mixer, integ, cascade, lqr, kalman, comp, traj, mpc,
                wmatrix, eulereq, deriv12, kffit, hoverpower, jacobian, linvalid, pid,
                altitude, riccati, latency, poly7, gap, seeds, softqp, activation };
  window.MLTEWidgets = {
    init() {
      document.querySelectorAll("[data-widget]").forEach(node => {
        if (node.dataset.mounted) return;
        const fn = REG[node.dataset.widget];
        if (fn) { node.dataset.mounted = "1"; try { fn(node); } catch (e) { console.error(e); }
          // Anonymous usage ping to the course platform. Since 2026-09-06 these pages are
          // served from the platform's own origin (course.ainrobotics.com/mlte03/site/), so
          // this normally fires; the origin check keeps a local clone or a stray copy on
          // another host from posting into the void (cross-site POST is CORS-blocked).
          if (location.protocol !== "file:" && !window.__MLTE_pinged?.[node.dataset.widget]) {
            (window.__MLTE_pinged = window.__MLTE_pinged || {})[node.dataset.widget] = 1;
            try { if (location.origin === "https://course.ainrobotics.com") fetch("/mlte03/api/widget/" + node.dataset.widget, { method: "POST", keepalive: true }).catch(() => {}); } catch (e) {} } }
      });
    },
    names() { return Object.keys(REG); }
  };
  // Self-bootstrap so the widgets also work outside a reveal.js deck (Digital Lab, lab sheets).
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => window.MLTEWidgets.init());
  else window.MLTEWidgets.init();
})();
