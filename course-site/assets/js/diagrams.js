/* ==========================================================================
   diagrams.js — MLTE03 inline-SVG lecture diagrams (dependency-free).

   Usage:  <div class="fig" data-diagram="cascade"><p class="cap">…</p></div>
   MLTEDiagrams.init() injects the SVG (idempotent). Palette + conventions
   match deck.css / widgets.js / quadsim (m1 RR ↻ · m2 FR ↺ · m3 FL ↻ · m4 RL ↺).
   ========================================================================== */
(function () {
  "use strict";
  const NAVY = "#0b1f33", SLATE = "#1d3a57", CYAN = "#0d9ea6", CYAN2 = "#1ec8c8",
        AMBER = "#c97e0a", AMB2 = "#f5a623", VIO = "#7c5cbf", MUT = "#6b7f93",
        LINE = "#dde6f0", RED = "#d8533f", OK = "#2faf6b", INK = "#0e1a26",
        PAPER = "#f4f7fb", CYLT = "#e8fafa", AMLT = "#fff8ec", VILT = "#f3f0fc";

  let MID = 0;
  function make(w, h, fn) {
    MID++; const id = "dg" + MID;
    const cols = { navy: NAVY, cyan: CYAN, muted: MUT, amber: AMBER, red: RED, violet: VIO, ok: OK };
    const defs = Object.entries(cols).map(([k, v]) =>
      `<marker id="${id}-${k}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path d="M0,1 L9,5 L0,9 z" fill="${v}"/></marker>`).join("");
    const H = {
      txt(x, y, s, o = {}) {
        // NB: position via translate(), not x/y attributes — Chromium's CSS `zoom`
        // (which reveal.js uses to scale slides) mis-renders attribute-positioned
        // SVG text, but applies transforms correctly.
        const lines = String(s).split("\n");
        const size = o.size || 15, lh = size * 1.3;
        const t = lines.map((ln, i) => `<tspan x="0" dy="${i ? lh : 0}">${ln}</tspan>`).join("");
        return `<text transform="translate(${x},${y})" font-size="${size}" fill="${o.color || INK}"` +
          `${o.anchor ? ` text-anchor="${o.anchor}"` : ""}${o.bold ? ` font-weight="700"` : ""}` +
          `${o.italic ? ` font-style="italic"` : ""}${o.mono ? ` font-family="ui-monospace,Menlo,monospace"` : ""}>${t}</text>`;
      },
      box(x, y, w2, h2, label, o = {}) {
        const size = o.size || 15, lines = String(label).split("\n");
        const cx = x + w2 / 2, lh = size * 1.3;
        const y0 = y + h2 / 2 - (lines.length - 1) * lh / 2 + size * 0.35;
        const t = lines.map((ln, i) => `<tspan x="0" dy="${i ? lh : 0}">${ln}</tspan>`).join("");
        return `<rect x="${x}" y="${y}" width="${w2}" height="${h2}" rx="${o.rx == null ? 10 : o.rx}"` +
          ` fill="${o.fill || "#fff"}" stroke="${o.stroke || NAVY}" stroke-width="${o.sw || 1.6}"` +
          `${o.dash ? ` stroke-dasharray="${o.dash}"` : ""}/>` +
          `<text transform="translate(${cx},${y0})" font-size="${size}" text-anchor="middle" fill="${o.tcolor || NAVY}"` +
          `${o.bold === false ? "" : ` font-weight="700"`}>${t}</text>`;
      },
      arrow(x1, y1, x2, y2, o = {}) {
        const c = o.color || NAVY, mk = o.marker || Object.keys(cols).find(k => cols[k] === c) || "navy";
        const d = o.q ? `M${x1},${y1} Q${o.q[0]},${o.q[1]} ${x2},${y2}` : `M${x1},${y1} L${x2},${y2}`;
        let s = `<path d="${d}" fill="none" stroke="${c}" stroke-width="${o.w || 2}"` +
          `${o.dash ? ` stroke-dasharray="${o.dash}"` : ""}${o.noHead ? "" : ` marker-end="url(#${id}-${mk})"`}/>`;
        if (o.label) s += H.txt(o.lx != null ? o.lx : (x1 + x2) / 2, o.ly != null ? o.ly : (y1 + y2) / 2 - 8,
          o.label, { size: o.lsize || 13, color: o.lcolor || c, anchor: o.lanchor || "middle", bold: o.lbold });
        return s;
      },
      line(x1, y1, x2, y2, o = {}) {
        return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${o.color || LINE}"` +
          ` stroke-width="${o.w || 1.5}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ""}/>`;
      },
      circ(x, y, r, o = {}) {
        return `<circle cx="${x}" cy="${y}" r="${r}" fill="${o.fill || "#fff"}" stroke="${o.stroke || NAVY}" stroke-width="${o.sw || 1.6}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ""}/>`;
      },
      sum(x, y, r = 14) { // summing junction
        return `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" stroke="${NAVY}" stroke-width="1.6"/>` +
          `<line x1="${x - r * 0.55}" y1="${y}" x2="${x + r * 0.55}" y2="${y}" stroke="${NAVY}" stroke-width="1.6"/>` +
          `<line x1="${x}" y1="${y - r * 0.55}" x2="${x}" y2="${y + r * 0.55}" stroke="${NAVY}" stroke-width="1.6"/>`;
      },
    };
    return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" role="img"><defs>${defs}</defs>${fn(H)}</svg>`;
  }

  /* -------- small reusable quad glyphs -------- */
  function quadTop(H, cx, cy, s, o = {}) { // X-frame top view
    const col = o.color || NAVY, a = s;
    let g = "";
    [[a, a], [a, -a], [-a, a], [-a, -a]].forEach(p => {
      g += `<line x1="${cx}" y1="${cy}" x2="${cx + p[0]}" y2="${cy + p[1]}" stroke="${col}" stroke-width="${o.w || 4}"/>`;
      g += `<circle cx="${cx + p[0]}" cy="${cy + p[1]}" r="${s * 0.42}" fill="${o.rotor || CYLT}" stroke="${col}" stroke-width="2"/>`;
    });
    g += `<circle cx="${cx}" cy="${cy}" r="${s * 0.22}" fill="${col}"/>`;
    return g;
  }
  function quadSide(H, cx, cy, s, tilt = 0, o = {}) { // side view, tilt in rad
    const col = o.color || NAVY, c = Math.cos(tilt), sn = Math.sin(tilt);
    const R = (x, y) => [cx + x * c - y * sn, cy + x * sn + y * c];
    const [lx, ly] = R(-s, 0), [rx, ry] = R(s, 0);
    let g = `<line x1="${lx}" y1="${ly}" x2="${rx}" y2="${ry}" stroke="${col}" stroke-width="5"/>`;
    [[-s, 0], [s, 0]].forEach(p => {
      const [px, py] = R(p[0], -s * 0.16);
      const [qx, qy] = R(p[0] - s * 0.34, -s * 0.16), [q2x, q2y] = R(p[0] + s * 0.34, -s * 0.16);
      g += `<line x1="${px}" y1="${py}" x2="${px}" y2="${(py + (ly - py) * 0) + (py > ly ? py : py)}" />`;
      g += `<line x1="${qx}" y1="${qy}" x2="${q2x}" y2="${q2y}" stroke="${col}" stroke-width="3"/>`;
      const [mx, my] = R(p[0], -s * 0.08);
      g += `<line x1="${mx}" y1="${my}" x2="${px}" y2="${py}" stroke="${col}" stroke-width="3"/>`;
    });
    const [bx, by] = R(0, s * 0.12);
    g += `<circle cx="${bx}" cy="${by}" r="${s * 0.2}" fill="${col}"/>`;
    return g;
  }

  const D = {};

  /* ============ frames — world vs body (Wk 1) ============ */
  D.frames = () => make(900, 380, H => {
    let g = `<polygon points="70,330 330,330 430,270 170,270" fill="${PAPER}" stroke="${LINE}"/>`;
    // world axes
    g += H.arrow(120, 316, 260, 316, { color: MUT, label: "x&#8339;", lx: 268, ly: 322, lanchor: "start" });
    g += H.arrow(120, 316, 196, 276, { color: MUT, label: "y&#8339;", lx: 204, ly: 274, lanchor: "start" });
    g += H.arrow(120, 316, 120, 190, { color: MUT, label: "z&#8339; (up)", lx: 112, ly: 182, lanchor: "end" });
    g += H.txt(84, 344, "world frame W", { size: 14, color: MUT, bold: true });
    // quad, tilted, upper right
    g += `<g transform="translate(600,150) rotate(-18)">` + quadTop(H, 0, 0, 52) + `</g>`;
    // body axes from quad center
    g += H.arrow(600, 150, 706, 118, { color: RED, label: "x_b (nose)", lx: 714, ly: 114, lanchor: "start" });
    g += H.arrow(600, 150, 522, 96, { color: OK, label: "z_b (thrust)", lx: 514, ly: 88, lanchor: "end" });
    g += H.arrow(600, 150, 536, 208, { color: VIO, label: "y_b", lx: 526, ly: 220 });
    g += H.txt(624, 236, "body frame B", { size: 14, color: SLATE, bold: true });
    // position vector + rotation
    g += H.arrow(120, 316, 588, 162, { color: CYAN, dash: "7 5", w: 2.2, label: "position p&#8339;", lx: 340, ly: 258, lbold: true });
    g += H.arrow(300, 120, 470, 84, { color: AMBER, q: [385, 66], w: 2.2, label: "attitude R(&#966;,&#952;,&#968;) &#8712; SO(3)", lx: 380, ly: 52, lbold: true });
    g += H.txt(700, 330, "state = where you are (p, v in W)\n+ how you point (R, &#969; in B)", { size: 14, color: MUT, anchor: "middle" });
    return g;
  });

  /* ============ eulerzyx — three successive rotations (Wk 1) ============ */
  D.eulerzyx = () => make(900, 250, H => {
    let g = "";
    const panel = (cx, rot, axcol, lab, sub) => {
      let p = `<circle cx="${cx}" cy="120" r="72" fill="${PAPER}" stroke="${LINE}"/>`;
      p += `<g transform="translate(${cx},120) rotate(${rot})">`;
      p += `<line x1="0" y1="0" x2="58" y2="0" stroke="${NAVY}" stroke-width="2.5"/>`;
      p += `<line x1="0" y1="0" x2="0" y2="-58" stroke="${MUT}" stroke-width="2.5"/>`;
      p += `<circle cx="58" cy="0" r="4" fill="${RED}"/></g>`;
      p += `<path d="M ${cx + 46},76 A 52 52 0 0 1 ${cx + 66},104" fill="none" stroke="${axcol}" stroke-width="2.4" marker-end="url(#${'dg' + MID}-cyan)"/>`;
      p += H.txt(cx, 224, lab, { size: 16, bold: true, anchor: "middle", color: NAVY });
      p += H.txt(cx, 244, sub, { size: 12.5, color: MUT, anchor: "middle" });
      return p;
    };
    g += panel(150, 0, CYAN, "1 · yaw &#968; about z", "heading — top view");
    g += H.arrow(258, 120, 330, 120, { color: MUT });
    g += panel(440, -22, CYAN, "2 · pitch &#952; about y&#8242;", "nose up/down");
    g += H.arrow(548, 120, 620, 120, { color: MUT });
    g += panel(730, -40, CYAN, "3 · roll &#966; about x&#8243;", "bank");
    g += H.txt(450, 30, "intrinsic ZYX:  R = R_z(&#968;) &#183; R_y(&#952;) &#183; R_x(&#966;) — each about the *new* axis", { size: 14.5, anchor: "middle", color: SLATE, bold: true });
    return g;
  });

  /* ============ forces — free body (Wk 2/3) ============ */
  D.forces = () => make(900, 360, H => {
    let g = H.line(60, 320, 840, 320, { color: LINE, w: 2 });
    const tilt = -0.2, cx = 430, cy = 200;
    g += `<g transform="translate(${cx},${cy}) rotate(${tilt * 180 / Math.PI})">`;
    g += `<rect x="-120" y="-8" width="240" height="16" rx="8" fill="${SLATE}"/>`;
    g += `<rect x="-132" y="-30" width="44" height="10" rx="5" fill="${NAVY}"/><rect x="88" y="-30" width="44" height="10" rx="5" fill="${NAVY}"/>`;
    g += `<line x1="-110" y1="-8" x2="-110" y2="-24" stroke="${NAVY}" stroke-width="4"/><line x1="110" y1="-8" x2="110" y2="-24" stroke="${NAVY}" stroke-width="4"/>`;
    g += `</g>`;
    const R = (x, y) => [cx + x * Math.cos(tilt) - y * Math.sin(tilt), cy + x * Math.sin(tilt) + y * Math.cos(tilt)];
    const [f1x, f1y] = R(-110, -30), [f2x, f2y] = R(110, -30);
    const bz = [Math.sin(-tilt), -Math.cos(tilt)];
    g += H.arrow(f1x, f1y, f1x + bz[0] * 80, f1y + bz[1] * 80, { color: CYAN, w: 3, label: "f&#8321;&#8226;&#8226;", lx: f1x + bz[0] * 80 - 30, ly: f1y + bz[1] * 80 - 6 });
    g += H.arrow(f2x, f2y, f2x + bz[0] * 110, f2y + bz[1] * 110, { color: CYAN, w: 3, label: "f&#8226;&#8226;&#8324;", lx: f2x + bz[0] * 110 + 34, ly: f2y + bz[1] * 110 - 6 });
    g += H.arrow(cx, cy, cx + bz[0] * 150, cy + bz[1] * 150, { color: OK, w: 3.5, label: "T = &#931;f&#7522;  (along z_b)", lx: cx + bz[0] * 150 + 10, ly: cy + bz[1] * 150 - 12, lanchor: "start", lbold: true });
    g += H.arrow(cx, cy, cx, cy + 140, { color: AMBER, w: 3.5, label: "m&#183;g  (always world-down)", lx: cx + 14, ly: cy + 132, lanchor: "start", lbold: true });
    g += `<path d="M ${cx + 168},${cy - 10} A 46 46 0 0 1 ${cx + 196},${cy + 52}" fill="none" stroke="${VIO}" stroke-width="3" marker-end="url(#${'dg' + MID}-violet)"/>`;
    g += H.txt(cx + 214, cy + 30, "&#964; = torques from\ndifferential thrust", { size: 13.5, color: VIO });
    g += H.txt(120, 70, "unequal rotor thrusts &#8658; net torque &#964; &#8658; the body rotates;\nthe *sum* T, tilted by attitude, is the only translational force", { size: 14.5, color: SLATE, bold: true });
    return g;
  });

  /* ============ eommap — structure of ẋ = f(x,u) (Wk 2) ============ */
  D.eommap = () => make(900, 330, H => {
    let g = H.box(30, 130, 120, 70, "inputs\nT, &#964;&#8339;&#8203;", { fill: AMLT, stroke: AMBER, tcolor: AMBER });
    g = g.replace("&#964;&#8339;&#8203;", "&#964;x &#964;y &#964;z");
    g += H.box(240, 40, 260, 84, "rotational dynamics\nI&#969;&#775; = &#964; &#8722; &#969;&#215;I&#969;", { fill: "#fff" });
    g += H.box(240, 210, 260, 84, "translational dynamics\nmv&#775; = R(&#951;)e&#8323;T &#8722; mge&#8323;", { fill: "#fff" });
    g += H.box(590, 40, 130, 84, "&#8747; dt\n&#969; &#8594; &#951;  via W(&#951;)", { fill: CYLT, stroke: CYAN, tcolor: CYAN });
    g += H.box(590, 210, 130, 84, "&#8747; dt\nv &#8594; p", { fill: CYLT, stroke: CYAN, tcolor: CYAN });
    g += H.box(770, 120, 110, 90, "state x\n12 values", { fill: NAVY, stroke: NAVY, tcolor: "#fff" });
    g += H.arrow(150, 150, 240, 92, { label: "&#964;", lx: 190, ly: 106 });
    g += H.arrow(150, 185, 240, 242, { label: "T", lx: 190, ly: 230 });
    g += H.arrow(500, 82, 590, 82, { label: "&#969;", lx: 545, ly: 74 });
    g += H.arrow(500, 252, 590, 252, { label: "v", lx: 545, ly: 244 });
    g += H.arrow(720, 82, 780, 138, { color: CYAN });
    g += H.arrow(720, 252, 780, 194, { color: CYAN });
    g += H.arrow(700, 60, 380, 200, { color: VIO, dash: "6 5", q: [560, 160], label: "attitude R(&#951;) rotates thrust — the coupling", lx: 470, ly: 178, lsize: 13 });
    g += H.txt(450, 320, "two Newton–Euler halves, coupled one way: rotation steers translation", { size: 14.5, anchor: "middle", color: MUT, italic: true });
    return g;
  });

  /* ============ rotor — one rotor physics (Wk 3) ============ */
  D.rotor = () => make(900, 300, H => {
    const cx = 300, cy = 150;
    let g = `<ellipse cx="${cx}" cy="${cy}" rx="150" ry="34" fill="${CYLT}" stroke="${CYAN}" stroke-width="2"/>`;
    g += `<rect x="${cx - 7}" y="${cy}" width="14" height="80" rx="6" fill="${SLATE}"/>`;
    g += `<path d="M ${cx - 100},${cy - 26} A 105 24 0 0 1 ${cx + 100},${cy - 26}" fill="none" stroke="${VIO}" stroke-width="2.6" marker-end="url(#${'dg' + MID}-violet)"/>`;
    g += H.txt(cx, cy - 44, "&#937; (rotor speed)", { size: 14, color: VIO, anchor: "middle", bold: true });
    g += H.arrow(cx, cy - 10, cx, cy - 110, { color: OK, w: 4, label: "thrust  f = k_f &#937;&#178;", lx: cx + 14, ly: cy - 100, lanchor: "start", lbold: true });
    [[-70, 40], [0, 48], [70, 40]].forEach(p => {
      g += H.arrow(cx + p[0], cy + 16, cx + p[0], cy + 16 + p[1], { color: MUT, dash: "4 4" });
    });
    g += H.txt(cx, cy + 96, "air pushed down", { size: 12.5, color: MUT, anchor: "middle" });
    g += `<path d="M ${cx + 158},${cy + 6} A 44 20 0 0 1 ${cx + 120},${cy + 30}" fill="none" stroke="${AMBER}" stroke-width="3" marker-end="url(#${'dg' + MID}-amber)"/>`;
    g += H.txt(cx + 178, cy + 34, "reaction drag torque\n&#964;_d = k_q &#937;&#178;  (about z)", { size: 13.5, color: AMBER });
    g += H.txt(640, 90, "both quadratic in &#937; &#8658; one knob per rotor:", { size: 14.5, color: SLATE, bold: true });
    g += H.txt(640, 118, "&#8226; thrust you want (lift, tilt)\n&#8226; yaw torque you get for free —\n  cancelled by pairing &#8635;/&#8634; rotors,\n  or *used* by unbalancing them", { size: 14 });
    return g;
  });

  /* ============ xframe — top view + mixer (Wk 3) ============ */
  D.xframe = () => make(900, 400, H => {
    const cx = 250, cy = 195, a = 95;
    let g = quadTop(H, cx, cy, a);
    const spin = (x, y, ccw) => `<path d="M ${x - 26},${y - 8} A 28 28 0 ${ccw ? "0 0" : "0 1"} ${x + 26},${y - 8}" fill="none" stroke="${VIO}" stroke-width="2.2" marker-end="url(#${'dg' + MID}-violet)"/>`;
    // m1 RR (x=-l,y=-l) -> screen (right,down); m2 FR -> (right,up); m3 FL -> (left,up); m4 RL -> (left,down)
    g += H.txt(cx + a + 2, cy + a + 24, "m1 &#8635;", { size: 14.5, bold: true, anchor: "middle" }) + spin(cx + a, cy + a + 34, false);
    g += H.txt(cx + a + 2, cy - a - 34, "m2 &#8634;", { size: 14.5, bold: true, anchor: "middle" }) + spin(cx + a, cy - a - 12, true);
    g += H.txt(cx - a - 2, cy - a - 34, "m3 &#8635;", { size: 14.5, bold: true, anchor: "middle" }) + spin(cx - a, cy - a - 12, false);
    g += H.txt(cx - a - 2, cy + a + 24, "m4 &#8634;", { size: 14.5, bold: true, anchor: "middle" }) + spin(cx - a, cy + a + 34, true);
    g += H.arrow(cx, cy, cx, cy - 150, { color: RED, w: 3, label: "x_b nose", lx: cx + 10, ly: cy - 142, lanchor: "start", lbold: true });
    g += H.arrow(cx, cy, cx - 150, cy, { color: OK, w: 3, label: "y_b", lx: cx - 158, ly: cy - 8, lanchor: "end", lbold: true });
    g += H.txt(cx + 116, cy + 6, "arm l = 0.17 m", { size: 12.5, color: MUT });
    // mixer matrix panel
    g += H.box(520, 60, 350, 250, " ", { fill: "#fff", stroke: LINE });
    g += H.txt(695, 92, "mixer M : motor thrusts &#8594; wrench", { size: 15, bold: true, anchor: "middle", color: NAVY });
    const rows = [["T", "+1", "+1", "+1", "+1", NAVY], ["&#964;x", "&#8722;l", "&#8722;l", "+l", "+l", CYAN],
                  ["&#964;y", "+l", "&#8722;l", "&#8722;l", "+l", VIO], ["&#964;z", "&#8722;c", "+c", "&#8722;c", "+c", AMBER]];
    g += H.txt(600, 122, "m1", { size: 13, color: MUT, anchor: "middle" }) + H.txt(660, 122, "m2", { size: 13, color: MUT, anchor: "middle" }) +
         H.txt(720, 122, "m3", { size: 13, color: MUT, anchor: "middle" }) + H.txt(780, 122, "m4", { size: 13, color: MUT, anchor: "middle" });
    rows.forEach((r, i) => {
      const y = 152 + i * 34;
      g += H.txt(556, y, r[0], { size: 15, bold: true, color: r[5], anchor: "middle" });
      [r[1], r[2], r[3], r[4]].forEach((v, j) => g += H.txt(600 + j * 60, y, v, { size: 14.5, mono: true, anchor: "middle", color: r[5] }));
    });
    g += H.txt(695, 292, "roll = right pair vs left &#183; pitch = front vs rear\nyaw = &#8635; pair vs &#8634; pair (drag, c = 0.016 m)", { size: 12.5, color: MUT, anchor: "middle" });
    g += H.txt(250, 372, "diagonal pairs co-rotate &#8658; hover yaw torque cancels", { size: 13.5, color: MUT, anchor: "middle", italic: true });
    return g;
  });

  /* ============ splane — poles before/after feedback (Wk 4) ============ */
  D.splane = () => make(900, 330, H => {
    let g = `<rect x="450" y="30" width="390" height="250" fill="#fdf0ee" opacity="0.55"/>`;
    g += H.line(80, 155, 850, 155, { color: MUT, w: 1.8 }) + H.line(450, 30, 450, 280, { color: MUT, w: 1.8 });
    g += H.txt(846, 175, "Re", { size: 13, color: MUT, anchor: "end" }) + H.txt(462, 42, "Im", { size: 13, color: MUT });
    g += H.txt(640, 60, "right half-plane = divergence", { size: 13.5, color: RED, anchor: "middle", bold: true });
    const X = (x, y, c) => `<path d="M${x - 8},${y - 8} L${x + 8},${y + 8} M${x - 8},${y + 8} L${x + 8},${y - 8}" stroke="${c}" stroke-width="3.4"/>`;
    g += X(450, 155, AMBER) + X(436, 141, AMBER) + X(436, 169, AMBER) + X(464, 141, AMBER) + X(464, 169, AMBER);
    g += H.txt(452, 214, "open loop: integrator chains at s = 0\n(hover is a ball balanced on a ball)", { size: 13.5, color: AMBER, anchor: "middle" });
    g += X(250, 105, CYAN) + X(250, 205, CYAN);
    g += H.arrow(432, 146, 268, 112, { color: CYAN, dash: "5 4", q: [340, 96] });
    g += H.arrow(432, 164, 268, 198, { color: CYAN, dash: "5 4", q: [340, 214] });
    g += H.txt(250, 250, "closed loop: feedback places poles here\n&#963; = &#8722;&#950;&#969;&#8345; &#183; damped ringing at &#969;_d", { size: 13.5, color: CYAN, anchor: "middle", bold: true });
    g += H.txt(150, 60, "the whole course, on one plane:\ncontrol = choosing where the &#215;'s live", { size: 14.5, color: SLATE, bold: true });
    return g;
  });

  /* ============ pid — block diagram (Wk 5) ============ */
  D.pid = () => make(900, 330, H => {
    let g = H.txt(60, 158, "&#952;_ref", { size: 15, bold: true, color: NAVY });
    g += H.arrow(105, 152, 155, 152);
    g += H.sum(172, 152);
    g += H.txt(160, 132, "+", { size: 13 }) + H.txt(152, 186, "&#8722;", { size: 15 });
    g += H.arrow(188, 152, 240, 152, { label: "e", lx: 214, ly: 142 });
    // three parallel branches
    g += H.line(240, 152, 240, 62, { color: NAVY, w: 2 }) + H.line(240, 152, 240, 242, { color: NAVY, w: 2 });
    g += H.arrow(240, 62, 300, 62) + H.arrow(240, 152, 300, 152) + H.arrow(240, 242, 300, 242);
    g += H.box(300, 34, 170, 56, "K_p e\nnow", { fill: CYLT, stroke: CYAN, tcolor: CYAN });
    g += H.box(300, 124, 170, 56, "K_i &#8747; e dt\npast (bias killer)", { fill: AMLT, stroke: AMBER, tcolor: AMBER });
    g += H.box(300, 214, 170, 56, "K_d de/dt\nfuture (damping)", { fill: VILT, stroke: VIO, tcolor: VIO });
    g += H.arrow(470, 62, 540, 142, { color: CYAN }) + H.arrow(470, 152, 540, 152, { color: AMBER }) + H.arrow(470, 242, 540, 162, { color: VIO });
    g += H.sum(556, 152);
    g += H.arrow(572, 152, 630, 152, { label: "u (&#964;)", lx: 600, ly: 142 });
    g += H.box(630, 122, 150, 60, "quad axis\nI&#952;&#776; = &#964;", { fill: NAVY, tcolor: "#fff" });
    g += H.arrow(780, 152, 840, 152, { label: "&#952;", lx: 812, ly: 142 });
    g += H.line(812, 152, 812, 300, { color: NAVY, w: 2 }) + H.line(812, 300, 172, 300, { color: NAVY, w: 2 });
    g += H.arrow(172, 300, 172, 168, { label: "measured &#952; (gyro-derived)", lx: 480, ly: 292, lsize: 12.5, lcolor: MUT });
    return g;
  });

  /* ============ cascade — two nested loops (Wk 5/6/12) ============ */
  D.cascade = () => make(900, 340, H => {
    let g = H.txt(28, 120, "p_d", { size: 15, bold: true, color: NAVY });
    g += H.arrow(62, 114, 100, 114);
    g += H.box(100, 80, 150, 68, "OUTER loop\nposition PD\n~1–2 Hz", { fill: CYLT, stroke: CYAN, tcolor: CYAN, size: 14 });
    g += H.arrow(250, 114, 330, 114, { label: "&#966;_d &#952;_d, T", lx: 290, ly: 102, lsize: 13 });
    g += H.box(330, 80, 150, 68, "INNER loop\nattitude PD\n~10–20 Hz", { fill: VILT, stroke: VIO, tcolor: VIO, size: 14 });
    g += H.arrow(480, 114, 552, 114, { label: "&#964;", lx: 516, ly: 104 });
    g += H.box(552, 84, 110, 60, "mixer\nM&#8315;&#185;", { size: 14 });
    g += H.arrow(662, 114, 724, 114, { label: "f&#8321;..f&#8324;", lx: 693, ly: 102, lsize: 13 });
    g += H.box(724, 80, 140, 68, "QUAD\n200 Hz physics", { fill: NAVY, tcolor: "#fff", size: 14 });
    // inner feedback (attitude) — short loop
    g += H.line(794, 148, 794, 218, { color: VIO, w: 2 }) + H.line(794, 218, 405, 218, { color: VIO, w: 2 });
    g += H.arrow(405, 218, 405, 152, { color: VIO, label: "attitude &#951;, rates &#969;  (fast, IMU)", lx: 600, ly: 210, lsize: 12.5 });
    // outer feedback (position) — long loop
    g += H.line(794, 148, 794, 282, { color: CYAN, w: 2 });
    g = g.replace('y2="282"', 'y2="282"');
    g += H.line(794, 282, 175, 282, { color: CYAN, w: 2 });
    g += H.arrow(175, 282, 175, 152, { color: CYAN, label: "position p, velocity v  (slow — flow/GPS &#8594; Wk 8 estimator)", lx: 485, ly: 274, lsize: 12.5 });
    g += H.txt(450, 46, "each loop assumes the one inside it is 'instant' — &#215;5–10 timescale separation", { size: 14.5, anchor: "middle", color: SLATE, bold: true });
    g += H.txt(450, 322, "Wk 5 builds the violet loop &#183; Wk 6 wraps the teal one &#183; Wk 12's MPC replaces the teal box and keeps the rest", { size: 13, anchor: "middle", color: MUT, italic: true });
    return g;
  });

  /* ============ tilt — tilt to translate (Wk 6) ============ */
  D.tilt = () => make(900, 360, H => {
    let g = H.line(40, 320, 860, 320, { color: LINE, w: 2 });
    // left: hover
    g += quadSide(H, 210, 200, 80, 0);
    g += H.arrow(210, 186, 210, 76, { color: OK, w: 3.5, label: "T = mg", lx: 222, ly: 90, lanchor: "start", lbold: true });
    g += H.arrow(210, 216, 210, 296, { color: AMBER, w: 3, label: "mg", lx: 222, ly: 286, lanchor: "start" });
    g += H.txt(210, 344, "level: forces balance &#8594; parked", { size: 14, anchor: "middle", color: MUT });
    // right: tilted
    const th = 0.32, cx = 620, cy = 200;
    g += quadSide(H, cx, cy, 80, th);
    const bz = [Math.sin(th), -Math.cos(th)];
    g += H.arrow(cx, cy - 14, cx + bz[0] * 150, cy - 14 + bz[1] * 150, { color: OK, w: 3.5, label: "T along z_b", lx: cx + bz[0] * 150 + 8, ly: cy - 20 + bz[1] * 150, lanchor: "start", lbold: true });
    g += H.arrow(cx, cy - 14, cx, cy - 14 - 150 * Math.cos(th), { color: MUT, dash: "5 4", w: 2, label: "T cos&#952; &#8776; mg", lx: cx - 12, ly: cy - 150, lanchor: "end", lsize: 13 });
    g += H.arrow(cx, cy - 14, cx + 150 * Math.sin(th), cy - 14, { color: CYAN, w: 3.5, label: "T sin&#952; &#8776; mg&#183;&#952; &#8658; a&#8339; = g&#952;", lx: cx + 160, ly: cy - 26, lanchor: "start", lbold: true });
    g += `<path d="M ${cx},${cy - 100} A 86 86 0 0 1 ${cx + 30},${cy - 96}" fill="none" stroke="${VIO}" stroke-width="2.6" marker-end="url(#${'dg' + MID}-violet)"/>`;
    g += H.txt(cx + 40, cy - 108, "&#952;", { size: 16, color: VIO, bold: true });
    g += H.txt(620, 344, "tilted: vertical share still fights gravity, horizontal share accelerates", { size: 14, anchor: "middle", color: MUT });
    return g;
  });

  /* ============ timescale — bandwidth ladder (Wk 6) ============ */
  D.timescale = () => make(900, 240, H => {
    let g = H.arrow(60, 170, 860, 170, { color: MUT, w: 2, label: "loop rate (log scale)", lx: 800, ly: 196, lsize: 13 });
    const items = [[130, "mission logic\n&#8776;0.1–1 Hz", VILT, VIO], [340, "outer position\n1–2 Hz", CYLT, CYAN],
                   [560, "inner attitude\n10–20 Hz", "#fff", NAVY], [770, "physics + mixer\n200 Hz", NAVY, NAVY]];
    items.forEach((it, i) => {
      g += H.box(it[0] - 85, 90, 170, 62, it[1], { fill: it[2], stroke: it[3], tcolor: i === 3 ? "#fff" : it[3], size: 14 });
      g += H.line(it[0], 152, it[0], 178, { color: it[3], w: 2.5 });
    });
    [[235, "&#215;5–10"], [450, "&#215;5–10"], [665, "&#215;10+"]].forEach(b => {
      g += `<path d="M ${b[0] - 60},70 Q ${b[0]},40 ${b[0] + 60},70" fill="none" stroke="${AMBER}" stroke-width="2" stroke-dasharray="5 4"/>`;
      g += H.txt(b[0], 34, b[1], { size: 13.5, color: AMBER, anchor: "middle", bold: true });
    });
    g += H.txt(450, 224, "every gap is a separation assumption — close a gap and the loops fight", { size: 14, anchor: "middle", color: SLATE, italic: true });
    return g;
  });

  window.__MLTE_D_PART1 = D; // merged in part 2
  window.__MLTE_make = make; window.__MLTE_quadTop = quadTop;
})();

/* ================= PART 2 — estimation / demo / MPC / RL diagrams ================= */
(function () {
  "use strict";
  const NAVY = "#0b1f33", SLATE = "#1d3a57", CYAN = "#0d9ea6", CYAN2 = "#1ec8c8",
        AMBER = "#c97e0a", VIO = "#7c5cbf", MUT = "#6b7f93", LINE = "#dde6f0",
        RED = "#d8533f", OK = "#2faf6b", INK = "#0e1a26", PAPER = "#f4f7fb",
        CYLT = "#e8fafa", AMLT = "#fff8ec", VILT = "#f3f0fc";
  const make = window.__MLTE_make, quadTop = window.__MLTE_quadTop;
  const D = window.__MLTE_D_PART1;

  /* ============ kfcycle — predict/update (Wk 8) ============ */
  D.kfcycle = () => make(900, 340, H => {
    let g = H.box(90, 90, 290, 150, " ", { fill: CYLT, stroke: CYAN });
    g += H.txt(235, 122, "PREDICT (every step)", { size: 16, bold: true, anchor: "middle", color: CYAN });
    g += H.txt(235, 152, "x&#770;&#8315; = A x&#770; + B u\nP&#8315; = A P A&#7488; + Q", { size: 14.5, anchor: "middle", mono: true });
    g += `<ellipse cx="180" cy="212" rx="14" ry="9" fill="none" stroke="${CYAN}" stroke-width="2"/>` +
         `<ellipse cx="235" cy="212" rx="24" ry="15" fill="none" stroke="${CYAN}" stroke-width="2" stroke-dasharray="4 3"/>` +
         H.txt(292, 217, "uncertainty grows", { size: 12.5, color: CYAN });
    g += H.box(520, 90, 290, 150, " ", { fill: VILT, stroke: VIO });
    g += H.txt(665, 122, "UPDATE (when z arrives)", { size: 16, bold: true, anchor: "middle", color: VIO });
    g += H.txt(665, 152, "K = P&#8315;H&#7488;(HP&#8315;H&#7488;+R)&#8315;&#185;\nx&#770; = x&#770;&#8315; + K(z &#8722; Hx&#770;&#8315;)", { size: 14.5, anchor: "middle", mono: true });
    g += `<ellipse cx="620" cy="212" rx="24" ry="15" fill="none" stroke="${VIO}" stroke-width="2" stroke-dasharray="4 3"/>` +
         `<ellipse cx="672" cy="212" rx="12" ry="8" fill="none" stroke="${VIO}" stroke-width="2"/>` +
         H.txt(722, 217, "uncertainty shrinks", { size: 12.5, color: VIO });
    g += H.arrow(380, 128, 520, 128, { q: [450, 98], w: 2.4, label: "model forward", lcolor: MUT, lsize: 12.5, lx: 450, ly: 92 });
    g += H.arrow(520, 206, 380, 206, { q: [450, 240], w: 2.4, label: "corrected belief back", lcolor: MUT, lsize: 12.5, lx: 450, ly: 262 });
    g += H.arrow(665, 30, 665, 88, { color: AMBER, w: 2.6, label: "measurement z (10–50 Hz)", lx: 680, ly: 52, lanchor: "start", lsize: 13 });
    g += H.txt(450, 310, "no measurement? keep predicting — and let P confess how lost you are", { size: 14, anchor: "middle", color: SLATE, italic: true });
    return g;
  });

  /* ============ fusion — sensors → estimator → controller (Wk 8) ============ */
  D.fusion = () => make(900, 340, H => {
    const sens = [["gyro  p,q,r", "1–8 kHz", 40], ["accel", "1 kHz", 106], ["optical flow", "20–100 Hz", 172], ["ToF height", "~40 Hz", 238]];
    let g = "";
    sens.forEach(s2 => {
      g += H.box(40, s2[2], 170, 52, s2[0] + "\n" + s2[1], { size: 13.5, fill: "#fff", stroke: MUT, tcolor: SLATE });
      g += H.arrow(210, s2[2] + 26, 290, 160, { color: MUT, w: 1.8 });
    });
    g += H.box(290, 110, 220, 100, "ESTIMATOR\ncomplementary + Kalman\n(asynchronous rates!)", { fill: CYLT, stroke: CYAN, tcolor: CYAN, size: 14 });
    g += H.arrow(510, 160, 585, 160, { label: "x&#770;, P", lx: 548, ly: 148, lbold: true });
    g += H.box(585, 122, 165, 76, "CONTROLLER\n(Wk 5–7 cascade/LQR)", { size: 13.5 });
    g += H.arrow(750, 160, 812, 160, { label: "u", lx: 782, ly: 148 });
    g += H.box(812, 128, 70, 64, "quad", { fill: NAVY, tcolor: "#fff", size: 14 });
    g += H.line(847, 192, 847, 300, { color: MUT, w: 2 }) + H.line(847, 300, 125, 300, { color: MUT, w: 2 });
    g += H.arrow(125, 300, 125, 296, { color: MUT, noHead: true });
    g += H.arrow(125, 300, 125, 294, { color: MUT });
    g += H.txt(485, 292, "physics excites the sensors — the loop closes through the estimate, never the truth", { size: 13, color: MUT, anchor: "middle" });
    g += H.txt(450, 46, "the state vector is reconstructed, not read", { size: 15, anchor: "middle", color: SLATE, bold: true });
    return g;
  });

  /* ============ trajlayers — mission stack (Wk 9) ============ */
  D.trajlayers = () => make(900, 330, H => {
    const rows = [["MISSION", "waypoint list, abort edge", VILT, VIO, "&#8776;event-driven"],
                  ["GUIDANCE", "carrot / acceptance radius &#8594; active segment", "#fff", NAVY, "~1 Hz"],
                  ["TRAJECTORY", "smooth p_r(t), &#7873;_r(t), p&#776;_r(t)", CYLT, CYAN, "continuous"],
                  ["CONTROLLER", "FF from p&#776;_r + FB cascade", AMLT, AMBER, "20–200 Hz"]];
    let g = "";
    rows.forEach((r, i) => {
      const y = 30 + i * 66;
      g += H.box(140, y, 460, 52, r[0] + " — " + r[1], { fill: r[2], stroke: r[3], tcolor: r[3], size: 14 });
      g += H.txt(626, y + 30, r[4], { size: 13, color: MUT });
      if (i < 3) g += H.arrow(370, y + 52, 370, y + 66, { w: 2.2 });
    });
    g = g.replace("&#7873;_r(t)", "p&#775;_r(t)");
    g += H.arrow(700, 60, 700, 250, { color: RED, w: 2.4, dash: "6 4", label: "abort:\nany layer can\ncommand LAND", lx: 760, ly: 140, lsize: 13, lcolor: RED });
    g += H.txt(370, 316, "each layer only talks to its neighbours — swapping the controller (PID, LQR, MPC) never touches the mission", { size: 13.5, anchor: "middle", color: MUT, italic: true });
    return g;
  });


  /* ============ mpchorizon — receding horizon (Wk 11) ============ */
  D.mpchorizon = () => make(900, 360, H => {
    let g = H.arrow(50, 250, 870, 250, { color: MUT, w: 2, label: "t", lx: 862, ly: 272 });
    // executed past
    g += `<path d="M 70,180 C 150,150 220,200 320,196" fill="none" stroke="${NAVY}" stroke-width="3.5"/>`;
    g += H.txt(150, 140, "executed (closed loop)", { size: 13, color: NAVY, bold: true });
    g += H.line(320, 70, 320, 250, { color: RED, w: 2, dash: "5 4" });
    g += H.txt(320, 62, "now: measure x&#770;", { size: 13.5, color: RED, anchor: "middle", bold: true });
    // predicted horizon
    g += `<path d="M 320,196 C 420,190 520,120 640,112" fill="none" stroke="${CYAN}" stroke-width="3" stroke-dasharray="7 5"/>`;
    for (let k = 0; k < 8; k++) {
      const x = 335 + k * 40;
      g += H.line(x, 250, x, 258, { color: CYAN, w: 2 });
      if (k < 3) g += H.txt(x, 274, "u" + "&#8320;&#8321;&#8322;"[k === 0 ? 0 : k], { size: 12, color: CYAN, anchor: "middle", mono: true });
    }
    g = g.replace("u&#8320;", "u&#8320;").replace("u&#8321;", "u&#8321;");
    g += H.txt(660, 104, "plan: N steps ahead\n(constraints respected\ninside the window)", { size: 13, color: CYAN });
    g += `<rect x="322" y="80" width="316" height="150" fill="${CYAN}" opacity="0.07"/>`;
    g += H.txt(480, 96, "horizon N&#183;&#916;t", { size: 13, color: CYAN, anchor: "middle", bold: true });
    // apply u0
    g += H.arrow(335, 250, 335, 214, { color: OK, w: 3, label: "apply u&#8320; only", lx: 348, ly: 226, lanchor: "start", lbold: true });
    // discard
    g += H.txt(560, 208, "u&#8321;…u&#8342;&#8331;&#8321; discarded — replaced by tomorrow's plan", { size: 12.5, color: MUT });
    // slide window
    g += H.arrow(480, 300, 560, 300, { color: VIO, w: 2.4, label: "next step: window slides, warm-start from the old plan", lx: 520, ly: 326, lsize: 13 });
    g += H.txt(450, 30, "feedback = re-planning from the *measured* state, every control period", { size: 15, anchor: "middle", color: SLATE, bold: true });
    return g;
  });

  /* ============ layered — MPC over PID (Wk 12) ============ */
  D.layered = () => make(900, 300, H => {
    let g = H.box(60, 60, 240, 110, "MPC\nplans a_des over horizon\nconstraints live here\n25–50 Hz", { fill: CYLT, stroke: CYAN, tcolor: CYAN, size: 14 });
    g += H.arrow(300, 115, 380, 115, { label: "a_des / &#951;_d, T", lx: 340, ly: 103, lsize: 13 });
    g += H.box(380, 72, 210, 86, "inner attitude PID\ntracks fast, forgives tempo\n200 Hz", { fill: VILT, stroke: VIO, tcolor: VIO, size: 14 });
    g += H.arrow(590, 115, 660, 115, { label: "&#964;", lx: 625, ly: 105 });
    g += H.box(660, 80, 90, 70, "mixer", { size: 14 });
    g += H.arrow(750, 115, 812, 115);
    g += H.box(812, 82, 70, 66, "quad", { fill: NAVY, tcolor: "#fff" });
    g += H.line(847, 148, 847, 232, { color: MUT, w: 2 }) + H.line(847, 232, 180, 232, { color: MUT, w: 2 });
    g += H.arrow(180, 232, 180, 174, { color: MUT, label: "x&#770; (estimator) feeds both layers", lx: 500, ly: 224, lsize: 12.5 });
    g += H.txt(450, 40, "Wk-6's timescale separation, reborn as a real-time strategy: plan slowly, track fast", { size: 14.5, anchor: "middle", color: SLATE, bold: true });
    g += H.txt(450, 282, "solver misses a deadline? apply the previous plan's u&#8321; — it was computed for exactly this moment", { size: 13, anchor: "middle", color: MUT, italic: true });
    return g;
  });

  /* ============ rlloop — agent/environment (Wk 13) ============ */
  D.rlloop = () => make(900, 300, H => {
    let g = H.box(120, 90, 250, 120, "AGENT\npolicy &#960;(a|s)\n(for us: the 8 gains,\nlater: a network)", { fill: VILT, stroke: VIO, tcolor: VIO, size: 14 });
    g += H.box(530, 90, 250, 120, "ENVIRONMENT\nquadsim physics\n+ reward function\n(the spec!)", { fill: CYLT, stroke: CYAN, tcolor: CYAN, size: 14 });
    g += H.arrow(370, 120, 530, 120, { q: [450, 84], w: 2.6, label: "action a&#8348; (thrust cmd)", lx: 450, ly: 74, lbold: true });
    g += H.arrow(530, 180, 370, 180, { q: [450, 216], w: 2.6, color: AMBER, label: "state s&#8348;&#8330;&#8321; , reward r&#8348;&#8330;&#8321;", lx: 450, ly: 238, lbold: true });
    g += H.txt(450, 270, "no model handed over — the agent meets the dynamics only through samples", { size: 14, anchor: "middle", color: SLATE, italic: true });
    g += H.txt(120, 60, "goal: max &#120124;[ &#931; &#947;&#7511; r&#8342; ]", { size: 15, color: NAVY, bold: true });
    return g;
  });

  /* ============ cem — population → elites → refit (Wk 13) ============ */
  D.cem = () => make(900, 300, H => {
    let g = "";
    const panel = (cx, seed, spread, label) => {
      let p = `<rect x="${cx - 120}" y="50" width="240" height="180" rx="10" fill="${PAPER}" stroke="${LINE}"/>`;
      p += H.txt(cx, 42, label, { size: 14, bold: true, anchor: "middle", color: NAVY });
      // star = optimum
      p += H.txt(cx + 58, 96, "&#9733;", { size: 18, color: AMBER, anchor: "middle" });
      let s = seed;
      const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647 - 0.5;
      for (let i = 0; i < 26; i++) {
        const px = cx + rnd() * spread * 2 + (1 - spread / 90) * 48, py = 140 + rnd() * spread * 1.6 - (1 - spread / 90) * 36;
        const elite = Math.hypot(px - (cx + 58), py - 96) < spread * 0.85;
        p += `<circle cx="${px}" cy="${py}" r="4" fill="${elite ? CYAN : "#c4cfdb"}"/>`;
      }
      p += `<ellipse cx="${cx + (1 - spread / 90) * 48}" cy="${140 - (1 - spread / 90) * 36}" rx="${spread}" ry="${spread * 0.75}" fill="none" stroke="${VIO}" stroke-width="2" stroke-dasharray="6 4"/>`;
      p += H.txt(cx, 252, spread > 70 ? "sample population\nfrom N(&#956;,&#963;)" : spread > 40 ? "keep elite (teal),\nrefit &#956;,&#963; to them" : "&#963; collapses\nonto the optimum", { size: 12.5, anchor: "middle", color: MUT });
      return p;
    };
    g += panel(170, 7, 90, "generation 1");
    g += H.arrow(300, 140, 340, 140, { color: MUT });
    g += panel(470, 99, 55, "generation 4");
    g += H.arrow(600, 140, 640, 140, { color: MUT });
    g += panel(770, 1234, 24, "generation 8");
    return g;
  });

  /* ============ ppo — training pipeline (Wk 14) ============ */
  D.ppo = () => make(900, 300, H => {
    let g = H.box(50, 90, 200, 110, "COLLECT\nN parallel envs &#215; T steps\nstore (s, a, r, log&#960;)", { fill: CYLT, stroke: CYAN, tcolor: CYAN, size: 13.5 });
    g += H.arrow(250, 145, 320, 145, { label: "batch", lx: 285, ly: 133, lsize: 12.5 });
    g += H.box(320, 90, 180, 110, "ADVANTAGES\nGAE from learned V&#966;\n\"better than expected?\"", { size: 13.5 });
    g += H.arrow(500, 145, 570, 145);
    g += H.box(570, 90, 220, 110, "CLIPPED UPDATE\nmin(&#961;A&#770;, clip(&#961;,1&#177;&#949;)A&#770;)\n+ value loss + entropy", { fill: VILT, stroke: VIO, tcolor: VIO, size: 13.5 });
    g += H.line(680, 200, 680, 250, { color: NAVY, w: 2 }) + H.line(680, 250, 150, 250, { color: NAVY, w: 2 });
    g += H.arrow(150, 250, 150, 204, { label: "updated &#960;&#952; flies the next batch", lx: 420, ly: 242, lsize: 12.5, lcolor: MUT });
    g += H.txt(450, 50, "the clip is a promise: never step further than this batch of data can justify", { size: 14.5, anchor: "middle", color: SLATE, bold: true });
    g += H.txt(450, 286, "knobs that matter, in order: reward scale &#183; n_envs &#183; learning rate &#183; clip &#949; &#183; entropy", { size: 13, anchor: "middle", color: MUT, italic: true });
    return g;
  });

  /* ============ sim2real — the gap (Wk 14) ============ */
  D.sim2real = () => make(900, 320, H => {
    let g = H.box(60, 70, 240, 160, " ", { fill: CYLT, stroke: CYAN });
    g += H.txt(180, 100, "SIMULATOR", { size: 15, bold: true, anchor: "middle", color: CYAN });
    g += quadTop({}, 180, 160, 34);
    g += H.txt(180, 214, "one tidy physics", { size: 12.5, anchor: "middle", color: MUT });
    g += H.box(600, 70, 240, 160, " ", { fill: AMLT, stroke: AMBER });
    g += H.txt(720, 100, "REALITY", { size: 15, bold: true, anchor: "middle", color: AMBER });
    g += quadTop({}, 720, 160, 34);
    g += H.txt(720, 214, "mass +12% &#183; motor lag\nsensor delay &#183; drafts", { size: 12, anchor: "middle", color: MUT });
    g += H.txt(450, 140, "&#9889;", { size: 30, anchor: "middle" });
    g += H.txt(450, 172, "the gap:\npolicies overfit\ntheir simulator", { size: 13, anchor: "middle", color: RED, bold: true });
    // randomization bridge
    for (let i = 0; i < 5; i++) {
      g += `<rect x="${330 + i * 12}" y="${252 - i * 4}" width="60" height="40" rx="6" fill="#fff" stroke="${CYAN}" opacity="${0.35 + i * 0.13}"/>`;
    }
    g += H.txt(360, 312, "many randomized sims", { size: 12.5, color: CYAN });
    g += H.arrow(460, 268, 640, 244, { color: OK, w: 2.6, q: [560, 232], label: "train across them all &#8658; robustness transfers", lx: 584, ly: 292, lsize: 13, lbold: true });
    g += H.txt(450, 40, "domain randomization: make the training set contain the truth", { size: 15, anchor: "middle", color: SLATE, bold: true });
    return g;
  });

  /* ============ methods — the landscape (Wk 7) ============ */
  D.methods = () => make(900, 360, H => {
    let g = H.arrow(90, 300, 850, 300, { color: MUT, w: 2, label: "model knowledge required", lx: 700, ly: 324, lsize: 13 });
    g += H.arrow(90, 300, 90, 40, { color: MUT, w: 2, label: "handles constraints &\nnonlinearity", lx: 100, ly: 56, lsize: 13, lanchor: "start" });
    const bub = (x, y, r, label, wk, fill, stroke) => H.circ(x, y, r, { fill, stroke, sw: 2 }) +
      H.txt(x, y - 2, label, { size: 15, bold: true, anchor: "middle", color: stroke }) +
      H.txt(x, y + 16, wk, { size: 11.5, anchor: "middle", color: MUT });
    g += bub(640, 240, 46, "PID", "Wk 5–6", "#fff", NAVY);
    g += bub(760, 180, 46, "LQR", "Wk 7", CYLT, CYAN);
    g += bub(680, 90, 52, "MPC", "Wk 12", CYLT, CYAN);
    g += bub(220, 110, 52, "RL", "not taught", VILT, VIO);
    g += H.txt(640, 300, "", {});
    g += H.arrow(668, 224, 736, 200, { color: MUT, dash: "4 4", w: 1.6 });
    g += H.arrow(748, 148, 706, 130, { color: MUT, dash: "4 4", w: 1.6 });
    g += H.txt(452, 60, "same Bellman spine, different knowledge budgets", { size: 14, color: SLATE, anchor: "middle", italic: true });
    g += H.txt(220, 190, "model-free:\npays in samples\n& guarantees", { size: 12.5, anchor: "middle", color: VIO });
    g += H.txt(220, 246, "(context only — this course\nstops at MPC)", { size: 11.5, anchor: "middle", color: MUT, italic: true });
    g += H.txt(500, 260, "industry default lives here &#8594;", { size: 12.5, color: MUT });
    return g;
  });

  /* ============ coursearc — 15-week roadmap (Wk 1/9) ============ */
  D.coursearc = () => make(900, 300, H => {
    let g = H.line(60, 170, 860, 170, { color: LINE, w: 3 });
    const phases = [["MODEL", 1, 4, CYLT, CYAN], ["CONTROL", 5, 7, VILT, VIO], ["ESTIMATE & FLY", 8, 10, AMLT, AMBER], ["INTELLIGENT", 11, 14, "#fde8e5", RED], ["FINAL", 15, 15, PAPER, SLATE]];
    const X = wk => 60 + (wk - 0.5) * (800 / 15);
    phases.forEach(p => {
      const x1 = 60 + (p[1] - 1) * (800 / 15), x2 = 60 + p[2] * (800 / 15);
      g += `<rect x="${x1 + 2}" y="120" width="${x2 - x1 - 4}" height="100" rx="10" fill="${p[3]}" stroke="${p[4]}" stroke-width="1.6"/>`;
      g += H.txt((x1 + x2) / 2, 112, p[0], { size: 13.5, bold: true, anchor: "middle", color: p[4] });
    });
    for (let wk = 1; wk <= 15; wk++) g += H.txt(X(wk), 176, String(wk), { size: 12.5, anchor: "middle", color: NAVY, bold: true });
    const mark = (wk, label, color, up) => {
      g += H.line(X(wk), up ? 120 : 220, X(wk), up ? 74 : 258, { color, w: 2 });
      g += H.txt(X(wk), up ? 64 : 276, label, { size: 12, anchor: "middle", color, bold: true });
    };
    mark(4, "Lab 1: harness &#9733;", CYAN, true);
    mark(6, "it flies (sim)", VIO, false);
    mark(9, "team dry-run", AMBER, true);
    mark(10, "reality-gap workshop", RED, false);
    mark(12, "baseline freeze", RED, true);
    mark(15, "defense + viva", SLATE, false);
    g += H.txt(450, 34, "one controller, grown all term — nothing is throwaway", { size: 15, anchor: "middle", color: SLATE, bold: true });
    return g;
  });

  /* ============ registry ============ */
  /* decorative quad wireframe for title slides */
  function titleArt() {
    const c = "#1ec8c8";
    let a = "";
    [[64,64],[64,-64],[-64,64],[-64,-64]].forEach(p2 => {
      a += `<line x1="0" y1="0" x2="${p2[0]}" y2="${p2[1]}" stroke="${c}" stroke-width="3"/>`;
      a += `<ellipse cx="${p2[0]}" cy="${p2[1]}" rx="34" ry="12" fill="none" stroke="${c}" stroke-width="2.4"/>`;
      a += `<line x1="${p2[0]}" y1="${p2[1]}" x2="${p2[0]}" y2="${p2[1]-14}" stroke="${c}" stroke-width="2.4"/>`;
      a += `<ellipse cx="${p2[0]}" cy="${p2[1]-14}" rx="34" ry="12" fill="none" stroke="${c}" stroke-width="2.4" opacity="0.5"/>`;
    });
    a += `<circle cx="0" cy="0" r="15" fill="none" stroke="${c}" stroke-width="3"/>`;
    a += `<path d="M -170,110 Q 0,150 170,96" fill="none" stroke="${c}" stroke-width="2" stroke-dasharray="2 7"/>`;
    return `<svg class="titleart" viewBox="-190 -140 380 300" xmlns="http://www.w3.org/2000/svg"><g transform="rotate(-14)">${a}</g></svg>`;
  }

  window.MLTEDiagrams = {
    init() {
      document.querySelectorAll("section.title-slide").forEach(sec => {
        if (!sec.querySelector(".titleart")) sec.insertAdjacentHTML("beforeend", titleArt());
      });
      document.querySelectorAll("[data-diagram]").forEach(node => {
        if (node.dataset.dmounted) return;
        const fn = D[node.dataset.diagram];
        if (fn) { node.dataset.dmounted = "1"; try { node.insertAdjacentHTML("afterbegin", fn()); } catch (e) { console.error("diagram", node.dataset.diagram, e); } }
      });
    }
  };
  if (document.readyState !== "loading") window.MLTEDiagrams.init();
  else document.addEventListener("DOMContentLoaded", () => window.MLTEDiagrams.init());
})();

/* ============== PART 3 — concept diagrams for the expanded lectures ============== */
(function () {
  "use strict";
  const NAVY="#0b1f33", SLATE="#1d3a57", CYAN="#0d9ea6", AMBER="#c97e0a", VIO="#7c5cbf",
        MUT="#6b7f93", LINE="#dde6f0", RED="#d8533f", OK="#2faf6b", INK="#0e1a26",
        PAPER="#f4f7fb", CYLT="#e8fafa", AMLT="#fff8ec", VILT="#f3f0fc";
  const make = window.__MLTE_make, quadTop = window.__MLTE_quadTop;
  const D = window.__MLTE_D_PART1;

  /* ---- W1: vector vs basis vs coordinates ---- */
  D.basiscoord = () => make(900, 330, H => {
    let g = "";
    const panel = (ox, axcol, lab, e1, e2, coords, note) => {
      let s = `<rect x="${ox}" y="40" width="330" height="220" rx="6" fill="${PAPER}" stroke="${LINE}"/>`;
      const cx = ox+80, cy = 210;
      s += H.arrow(cx, cy, cx+e1[0], cy+e1[1], {color:axcol, w:2, dash:"4 3"});
      s += H.arrow(cx, cy, cx+e2[0], cy+e2[1], {color:axcol, w:2, dash:"4 3"});
      s += H.txt(cx+e1[0]+6, cy+e1[1]+4, "e₁", {size:12, color:axcol});
      s += H.txt(cx+e2[0]+4, cy+e2[1]-4, "e₂", {size:12, color:axcol});
      s += H.arrow(cx, cy, cx+140, cy-110, {color:RED, w:3.4});
      s += H.txt(cx+146, cy-114, "v", {size:16, color:RED, bold:true});
      s += H.txt(ox+165, 66, lab, {size:14, bold:true, anchor:"middle", color:NAVY});
      s += H.txt(ox+165, 286, coords, {size:15, anchor:"middle", color:axcol, mono:true, bold:true});
      s += H.txt(ox+165, 308, note, {size:11.5, anchor:"middle", color:MUT});
      return s;
    };
    g += panel(30, CYAN, "basis A (world)", [110,0], [0,-110], "v_A = (1.4, 1.1)", "same arrow");
    g += panel(410, VIO, "basis B (body, rotated)", [104,-38], [38,104], "v_B = (0.9, 1.5)", "different numbers");
    g += H.arrow(370, 150, 405, 150, {color:MUT, w:2});
    g += H.txt(770, 150, "R", {size:20, color:NAVY, bold:true});
    g += H.txt(790, 175, "the matrix that\nconverts the numbers", {size:11.5, color:MUT});
    g += H.txt(450, 26, "one physical arrow · two bases · two sets of coordinates", {size:15, anchor:"middle", color:SLATE, bold:true});
    return g;
  });

  /* ---- W1: active vs passive rotation ---- */
  D.activepassive = () => make(900, 300, H => {
    let g = "";
    // active
    g += `<rect x="30" y="50" width="390" height="200" rx="6" fill="${PAPER}" stroke="${LINE}"/>`;
    g += H.txt(225, 40, "ACTIVE — the object turns", {size:14, bold:true, anchor:"middle", color:CYAN});
    let cx=140, cy=190;
    g += H.arrow(cx, cy, cx+120, cy, {color:MUT, w:1.6, dash:"4 3"});
    g += H.arrow(cx, cy, cx, cy-110, {color:MUT, w:1.6, dash:"4 3"});
    g += H.arrow(cx, cy, cx+120, cy, {color:"#c4cfdb", w:3});
    g += H.arrow(cx, cy, cx+92, cy-77, {color:RED, w:3.4});
    g += H.arrow(cx+128, cy-8, cx+100, cy-84, {color:CYAN, w:2.4, q:[cx+134, cy-50]});
    g += H.txt(cx+140, cy-40, "v → Rv", {size:13, color:CYAN, bold:true});
    g += H.txt(225, 272, "frame fixed · vector moves · e.g. the quad banks", {size:12, anchor:"middle", color:MUT});
    // passive
    g += `<rect x="470" y="50" width="400" height="200" rx="6" fill="${PAPER}" stroke="${LINE}"/>`;
    g += H.txt(670, 40, "PASSIVE — the frame turns", {size:14, bold:true, anchor:"middle", color:VIO});
    cx=580; cy=190;
    g += H.arrow(cx, cy, cx+120, cy, {color:"#c4cfdb", w:1.6, dash:"4 3"});
    g += H.arrow(cx, cy, cx, cy-110, {color:"#c4cfdb", w:1.6, dash:"4 3"});
    g += H.arrow(cx, cy, cx+113, cy-41, {color:VIO, w:1.8, dash:"4 3"});
    g += H.arrow(cx, cy, cx+41, cy-113, {color:VIO, w:1.8, dash:"4 3"});
    g += H.arrow(cx, cy, cx+92, cy-77, {color:RED, w:3.4});
    g += H.txt(cx+150, cy-70, "same v,\nnew numbers", {size:12.5, color:VIO});
    g += H.txt(670, 272, "vector fixed · frame moves · e.g. thrust in world coords", {size:12, anchor:"middle", color:MUT});
    g += H.txt(450, 296, "the SAME matrix serves both readings — which is why subscripts R_{W←B} are not pedantry", {size:12.5, anchor:"middle", color:SLATE, italic:true});
    return g;
  });

  /* ---- W1: non-commutativity, drawn ---- */
  D.noncommute = () => make(900, 340, H => {
    let g = H.txt(450, 24, "φ = 90° (roll) and θ = 90° (pitch) — order decides where the nose ends up", {size:14.5, anchor:"middle", color:SLATE, bold:true});
    const seq = (oy, lab, mid, end, col) => {
      let s = H.txt(40, oy+56, lab, {size:13.5, bold:true, color:col});
      const box = (x, sub, arrowTo) => {
        let t = `<rect x="${x}" y="${oy+10}" width="150" height="100" rx="8" fill="#fff" stroke="${LINE}"/>`;
        t += `<g transform="translate(${x+75},${oy+58})">` + quadTop({}, 0, 0, 26) + `</g>`;
        t += H.txt(x+75, oy+128, sub, {size:12, anchor:"middle", color:MUT});
        return t;
      };
      s += box(200, "start: nose +x");
      s += H.arrow(355, oy+60, 395, oy+60, {color:col, label:mid, ly:oy+50, lsize:12});
      s += box(400, "");
      s += H.arrow(555, oy+60, 595, oy+60, {color:col, label:end, ly:oy+50, lsize:12});
      s += `<rect x="600" y="${oy+10}" width="260" height="100" rx="8" fill="${col==="#0d9ea6"?CYLT:VILT}" stroke="${col}"/>`;
      return s;
    };
    g += seq(50, "R_x R_y", "pitch 90°", "roll 90°", CYAN);
    g += H.txt(730, 92, "nose → world +y", {size:15, anchor:"middle", bold:true, color:CYAN});
    g += H.txt(730, 116, "(pointing sideways)", {size:12, anchor:"middle", color:MUT});
    g += seq(190, "R_y R_x", "roll 90°", "pitch 90°", VIO);
    g += H.txt(730, 232, "nose → world −z", {size:15, anchor:"middle", bold:true, color:VIO});
    g += H.txt(730, 256, "(pointing at the floor)", {size:12, anchor:"middle", color:MUT});
    g += H.txt(450, 322, "same two angles · two different aircraft attitudes ⇒ always state the sequence", {size:13, anchor:"middle", color:RED, bold:true});
    return g;
  });

  /* ---- W1: small-angle error curve ---- */
  D.smallangle = () => make(900, 300, H => {
    const bx = {x:90, y:40, w:420, h:200};
    let g = `<rect x="${bx.x}" y="${bx.y}" width="${bx.w}" height="${bx.h}" fill="#fbfdff" stroke="${LINE}"/>`;
    const X = a => bx.x + a/60*bx.w, Y = e => bx.y + bx.h - e/12*bx.h;
    // error curve: (theta - sin theta)/sin theta *100
    let d = "";
    for (let a = 1; a <= 60; a++) {
      const r = a*Math.PI/180, e = (r - Math.sin(r))/Math.sin(r)*100;
      d += (a===1?"M":"L") + X(a) + "," + Y(Math.min(12,e)) + " ";
    }
    g += `<path d="${d}" fill="none" stroke="${CYAN}" stroke-width="3"/>`;
    // shaded operating band
    g += `<rect x="${X(0)}" y="${bx.y}" width="${X(25)-X(0)}" height="${bx.h}" fill="${OK}" opacity="0.08"/>`;
    g += H.txt(X(12), bx.y+18, "our demo tilt band", {size:11.5, anchor:"middle", color:OK, bold:true});
    [[5,0.13],[15,1.1],[30,4.7],[45,10.3]].forEach(pt => {
      g += `<circle cx="${X(pt[0])}" cy="${Y(pt[1])}" r="4" fill="${NAVY}"/>`;
      g += H.txt(X(pt[0]), Y(pt[1])-10, pt[1]+"%", {size:11.5, anchor:"middle", color:NAVY, bold:true});
    });
    [0,15,30,45,60].forEach(a => g += H.txt(X(a), bx.y+bx.h+18, a+"°", {size:12, anchor:"middle", color:MUT}));
    g += H.txt(bx.x-8, bx.y+10, "12%", {size:11, anchor:"end", color:MUT});
    g += H.txt(bx.x-8, bx.y+bx.h, "0", {size:11, anchor:"end", color:MUT});
    g += H.txt(300, 282, "relative error of  sin θ ≈ θ", {size:13, anchor:"middle", color:SLATE, bold:true});
    g += H.box(550, 60, 320, 160, " ", {fill:PAPER, stroke:LINE});
    g += H.txt(710, 88, "what the number buys you", {size:14, bold:true, anchor:"middle", color:NAVY});
    g += H.txt(575, 116, "≤ 15° : linear model honest to ~1%\n         ⇒ LQR, linear MPC, Kalman all valid\n\n25–30° : 3–5% — usable, watch it\n\n> 45° : 10%+ — the design model is\n         no longer describing your aircraft\n         ⇒ nonlinear methods (mission M2)", {size:12.5, color:INK});
    return g;
  });

  /* ---- W1: quad anatomy, labelled ---- */
  D.anatomy = () => make(900, 380, H => {
    const cx = 330, cy = 195;
    let g = quadTop(H, cx, cy, 105);
    g += `<rect x="${cx-46}" y="${cy-30}" width="92" height="60" rx="8" fill="#fff" stroke={NAVY} stroke-width="2"/>`.replace("{NAVY}", NAVY);
    g += H.txt(cx, cy-6, "FC", {size:14, anchor:"middle", bold:true, color:NAVY});
    g += H.txt(cx, cy+12, "IMU", {size:11, anchor:"middle", color:MUT});
    const lab = (x1,y1,x2,y2,t,sub) => H.arrow(x2,y2,x1,y1,{color:MUT,w:1.4}) +
      H.txt(x2+ (x2>cx?8:-8), y2, t, {size:13, bold:true, color:NAVY, anchor:x2>cx?"start":"end"}) +
      H.txt(x2+ (x2>cx?8:-8), y2+16, sub, {size:11, color:MUT, anchor:x2>cx?"start":"end"});
    g += lab(cx+105, cy-105, 620, 60, "motor + ESC", "thrust, with ~40 ms lag");
    g += lab(cx+105, cy+105, 620, 150, "propeller", "f = k_f Ω²  ·  drag torque");
    g += lab(cx, cy, 620, 240, "flight controller", "your code, 200–1000 Hz");
    g += lab(cx-105, cy+105, 120, 330, "battery", "sags under load");
    g += lab(cx-105, cy-105, 120, 60, "frame arm", "sets l = 0.17 m, inertia");
    g += `<rect x="${cx-24}" y="${cy+44}" width="48" height="22" rx="5" fill="${CYLT}" stroke="${CYAN}"/>`;
    g += H.txt(cx, cy+59, "flow", {size:10.5, anchor:"middle", color:CYAN});
    g += H.arrow(cx+24, cy+55, 620, 320, {color:CYAN, w:1.4});
    g += H.txt(628, 320, "optical flow + ToF", {size:13, bold:true, color:CYAN});
    g += H.txt(628, 336, "the only indoor position sensor", {size:11, color:MUT});
    g += H.txt(450, 24, "everything here is purchasable — the loop that ties them together is not", {size:14.5, anchor:"middle", color:SLATE, bold:true});
    return g;
  });

  /* ---- W2: transport theorem ---- */
  D.transport = () => make(900, 320, H => {
    const cx=260, cy=175;
    let g = H.circ(cx, cy, 110, {fill:PAPER, stroke:LINE});
    g += H.arrow(cx-88, cy-66, cx+30, cy-105, {color:VIO, w:2.6, q:[cx-30, cy-130]});
    g += H.txt(cx-60, cy-92, "ω", {size:16, color:VIO, bold:true});
    g += H.arrow(cx, cy, cx+80, cy-56, {color:RED, w:3.2, label:"L", lx:cx+90, ly:cy-60, lbold:true});
    g += H.arrow(cx+80, cy-56, cx+112, cy-8, {color:CYAN, w:2.4, dash:"4 3"});
    g += H.txt(cx+120, cy+4, "ω × L", {size:13, color:CYAN, bold:true});
    g += H.txt(cx, cy+140, "the vector L, seen from the rotating body", {size:12.5, anchor:"middle", color:MUT});
    g += H.box(470, 70, 400, 150, " ", {fill:"#fff", stroke:LINE});
    g += H.txt(670, 100, "transport theorem", {size:15, bold:true, anchor:"middle", color:NAVY});
    g += H.txt(670, 134, "dL/dt |world  =  dL/dt |body  +  ω × L", {size:14, anchor:"middle", mono:true, color:INK});
    g += H.txt(490, 168, "even if L never changes in the body frame,\nit changes in the world frame — because the\nframe itself turned. That extra term is the\nentire origin of ω × Iω in Euler's equation.", {size:12.5, color:MUT});
    g += H.txt(450, 300, "differentiating in a rotating frame costs exactly one cross product", {size:13.5, anchor:"middle", color:SLATE, bold:true});
    return g;
  });

  /* ---- W2: W(eta) rate map ---- */
  D.wmatrix = () => make(900, 300, H => {
    let g = H.box(50, 100, 200, 90, "GYRO reads\nbody rates\np, q, r", {fill:CYLT, stroke:CYAN, tcolor:CYAN, size:14});
    g += H.arrow(250, 145, 350, 145, {w:2.4, label:"W(φ,θ)", lx:300, ly:132, lbold:true});
    g += H.box(350, 100, 210, 90, "EULER rates\nφ̇, θ̇, ψ̇", {fill:VILT, stroke:VIO, tcolor:VIO, size:14});
    g += H.arrow(560, 145, 650, 145, {w:2.4, label:"∫dt", lx:605, ly:132});
    g += H.box(650, 100, 200, 90, "ATTITUDE\nφ, θ, ψ", {size:14});
    g += H.txt(450, 44, "three different objects that students routinely conflate", {size:14.5, anchor:"middle", color:SLATE, bold:true});
    g += H.txt(150, 218, "measured, singularity-free,\nbody frame", {size:12, anchor:"middle", color:MUT});
    g += H.txt(455, 218, "a chart's rates —\nblows up at θ = ±90°", {size:12, anchor:"middle", color:RED});
    g += H.txt(750, 218, "what humans read\non the screen", {size:12, anchor:"middle", color:MUT});
    g += `<path d="M 300,196 Q 300,262 455,262" fill="none" stroke="${RED}" stroke-width="2" stroke-dasharray="5 4"/>`;
    g += H.txt(500, 284, "W ≈ I only near hover — assuming ω = η̇ is a hover-only shortcut", {size:12.5, color:RED, anchor:"middle"});
    return g;
  });

  /* ---- W2: 12-state vector, organised ---- */
  D.statevector = () => make(900, 300, H => {
    const grp = (x, title, items, col, fill) => {
      let s = `<rect x="${x}" y="70" width="190" height="150" rx="8" fill="${fill}" stroke="${col}" stroke-width="1.8"/>`;
      s += H.txt(x+95, 96, title, {size:14, bold:true, anchor:"middle", color:col});
      items.forEach((it, i) => {
        s += H.txt(x+95, 126+i*26, it, {size:13.5, anchor:"middle", mono:true, color:INK});
      });
      return s;
    };
    let g = grp(30, "position", ["x  y  z", "[m]", "world frame"], CYAN, CYLT);
    g += grp(250, "velocity", ["vx vy vz", "[m/s]", "world frame"], CYAN, CYLT);
    g += grp(470, "attitude", ["φ  θ  ψ", "[rad]", "ZYX Euler"], VIO, VILT);
    g += grp(690, "body rates", ["p  q  r", "[rad/s]", "body frame"], VIO, VILT);
    g += H.arrow(220, 145, 250, 145, {color:MUT, w:1.6, label:"d/dt", ly:134, lsize:11});
    g += H.arrow(660, 145, 690, 145, {color:MUT, w:1.6, label:"≈d/dt", ly:134, lsize:11});
    g += H.txt(450, 42, "x ∈ ℝ¹² — the minimal memory that makes the future computable", {size:15, anchor:"middle", color:SLATE, bold:true});
    g += `<path d="M 125,228 Q 300,275 560,228" fill="none" stroke="${AMBER}" stroke-width="2" stroke-dasharray="5 4"/>`;
    g += H.txt(345, 292, "coupled one way only: attitude steers position (via R), never the reverse", {size:12.5, anchor:"middle", color:AMBER});
    return g;
  });

  /* ---- W3: command chain ---- */
  D.cmdchain = () => make(900, 260, H => {
    const chain = [["your code","f_i desired",CYLT,CYAN],["PWM / DShot","duty cycle","#fff",NAVY],
                   ["ESC","3-phase switching","#fff",NAVY],["motor","Ω, with lag τ≈40 ms",AMLT,AMBER],
                   ["propeller","f = k_f Ω²",CYLT,CYAN]];
    let g = "";
    chain.forEach((c, i) => {
      const x = 25 + i*175;
      g += H.box(x, 90, 150, 76, c[0], {fill:c[2], stroke:c[3], tcolor:c[3], size:13.5});
      g += H.txt(x+75, 184, c[1], {size:11.5, anchor:"middle", color:MUT});
      if (i < 4) g += H.arrow(x+150, 128, x+175, 128, {w:2});
    });
    g += H.txt(450, 44, "five links between your number and actual lift — quadsim models only the last one", {size:14.5, anchor:"middle", color:SLATE, bold:true});
    g += `<path d="M 640,80 Q 700,40 760,80" fill="none" stroke="${RED}" stroke-width="2"/>`;
    g += H.txt(700, 32, "where the lag lives", {size:12.5, anchor:"middle", color:RED, bold:true});
    g += H.txt(450, 228, "the lag eats phase margin — it is why real-aircraft gains land lower than nominal-model gains", {size:12.5, anchor:"middle", color:MUT, italic:true});
    return g;
  });

  /* ---- W3: thrust curve with ID points ---- */
  D.thrustcurve = () => make(900, 300, H => {
    const bx = {x:80, y:35, w:400, h:210};
    let g = `<rect x="${bx.x}" y="${bx.y}" width="${bx.w}" height="${bx.h}" fill="#fbfdff" stroke="${LINE}"/>`;
    const X = o => bx.x + o/1000*bx.w, Y = f => bx.y + bx.h - f/3.2*bx.h;
    let d = "";
    for (let o = 0; o <= 1000; o += 20) d += (o===0?"M":"L") + X(o) + "," + Y(2.5e-6*o*o) + " ";
    g += `<path d="${d}" fill="none" stroke="${CYAN}" stroke-width="3"/>`;
    [[400,0.40],[600,0.90],[800,1.60],[900,2.02]].forEach(pt => {
      g += `<circle cx="${X(pt[0])}" cy="${Y(pt[1])}" r="5" fill="${NAVY}"/>`;
    });
    g += H.line(bx.x, Y(1.594), bx.x+bx.w, Y(1.594), {color:AMBER, dash:"5 4", w:2});
    g += H.txt(bx.x+8, Y(1.594)-8, "hover: 1.59 N per motor", {size:11.5, color:AMBER, bold:true});
    g += H.line(bx.x, Y(3.0), bx.x+bx.w, Y(3.0), {color:RED, dash:"5 4", w:2});
    g += H.txt(bx.x+8, Y(3.0)-8, "f_max ≈ 4 N (off-scale)", {size:11.5, color:RED});
    g += H.txt(280, 272, "rotor speed Ω  [rad/s]", {size:12.5, anchor:"middle", color:MUT});
    g += H.txt(bx.x-10, bx.y+12, "f [N]", {size:12, anchor:"end", color:MUT});
    g += H.box(520, 60, 350, 165, " ", {fill:PAPER, stroke:LINE});
    g += H.txt(695, 88, "identification, on a kitchen scale", {size:14, bold:true, anchor:"middle", color:NAVY});
    g += H.txt(540, 116, "1. hold aircraft on scale, one motor\n2. set a speed, read grams → N\n3. repeat at 3–4 speeds (the dots)\n4. fit f = k_f Ω²  ⇒  k_f ≈ 2.5e-6\n\nresidual grows at high throttle:\nthat is battery sag, not bad fitting —\nthe model's honest boundary.", {size:12.5, color:INK});
    return g;
  });

  /* ---- W4: linearisation tangent ---- */
  D.taylor = () => make(900, 300, H => {
    const bx = {x:70, y:35, w:420, h:210};
    let g = `<rect x="${bx.x}" y="${bx.y}" width="${bx.w}" height="${bx.h}" fill="#fbfdff" stroke="${LINE}"/>`;
    const X = t => bx.x + (t+60)/120*bx.w, Y = v => bx.y + bx.h/2 - v/1.2*(bx.h/2);
    let dn = "", dl = "";
    for (let t=-60;t<=60;t+=2){ const r=t*Math.PI/180;
      dn += (t===-60?"M":"L")+X(t)+","+Y(Math.sin(r))+" ";
      dl += (t===-60?"M":"L")+X(t)+","+Y(r)+" "; }
    g += `<rect x="${X(-20)}" y="${bx.y}" width="${X(20)-X(-20)}" height="${bx.h}" fill="${OK}" opacity="0.08"/>`;
    g += `<path d="${dl}" fill="none" stroke="${AMBER}" stroke-width="2.6" stroke-dasharray="6 4"/>`;
    g += `<path d="${dn}" fill="none" stroke="${CYAN}" stroke-width="3"/>`;
    g += `<circle cx="${X(0)}" cy="${Y(0)}" r="5" fill="${NAVY}"/>`;
    g += H.txt(X(0)+8, Y(0)+20, "operating point\n(hover trim)", {size:11.5, color:NAVY});
    g += H.txt(X(46), Y(Math.sin(46*Math.PI/180))-12, "true f(x)", {size:12.5, color:CYAN, bold:true});
    g += H.txt(X(40), Y(0.86)+26, "linear model", {size:12.5, color:AMBER, bold:true});
    g += H.txt(X(0), bx.y+bx.h+20, "deviation from trim", {size:12, anchor:"middle", color:MUT});
    g += H.txt(X(0), bx.y+16, "valid band", {size:11.5, anchor:"middle", color:OK, bold:true});
    g += H.box(530, 55, 340, 175, " ", {fill:PAPER, stroke:LINE});
    g += H.txt(700, 84, "what linearisation promises", {size:14, bold:true, anchor:"middle", color:NAVY});
    g += H.txt(550, 112, "• exact AT the operating point\n• excellent nearby (the green band)\n• degrades smoothly, then badly\n\nA = ∂f/∂x, B = ∂f/∂u  evaluated at trim\n\nThe promise has a RADIUS —\nknowing it is the engineering;\nrefusing the promise is not.", {size:12.5, color:INK});
    return g;
  });

  /* ---- W4: A,B sparsity map ---- */
  D.absparse = () => make(900, 330, H => {
    const names = ["x","y","z","vx","vy","vz","φ","θ","ψ","p","q","r"];
    const cell = 21, ox = 120, oy = 55;
    let g = H.txt(ox+126, 38, "A  (12×12)", {size:14, bold:true, anchor:"middle", color:NAVY});
    const entries = {}; // "row,col" -> [color,label]
    [[0,3],[1,4],[2,5]].forEach(e => entries[e]=["cyan","1"]);
    [[6,9],[7,10],[8,11]].forEach(e => entries[e]=["cyan","1"]);
    entries[[3,7]]=["amber","+g"]; entries[[4,6]]=["amber","−g"];
    for (let r=0;r<12;r++) for (let c=0;c<12;c++){
      const k = entries[[r,c]];
      const fill = k ? (k[0]==="cyan"?"#bfe9ea":"#f5d9a8") : "#fafcfe";
      g += `<rect x="${ox+c*cell}" y="${oy+r*cell}" width="${cell-1.5}" height="${cell-1.5}" fill="${fill}" stroke="${LINE}" stroke-width="0.6"/>`;
      if (k) g += H.txt(ox+c*cell+cell/2-0.75, oy+r*cell+cell/2+4, k[1], {size:10, anchor:"middle", color:NAVY, bold:true});
    }
    names.forEach((n,i)=>{
      g += H.txt(ox-6, oy+i*cell+14, n, {size:10.5, anchor:"end", color:MUT});
      g += H.txt(ox+i*cell+9, oy-6, n, {size:10.5, anchor:"middle", color:MUT});
    });
    // B
    const ox2 = 440;
    g += H.txt(ox2+42, 38, "B (12×4)", {size:14, bold:true, anchor:"middle", color:NAVY});
    const bent = {}; bent[[5,0]]=["1/m","#bfe9ea"]; bent[[9,1]]=["1/Ixx","#d9cdf2"]; bent[[10,2]]=["1/Iyy","#d9cdf2"]; bent[[11,3]]=["1/Izz","#d9cdf2"];
    for (let r=0;r<12;r++) for (let c=0;c<4;c++){
      const k = bent[[r,c]];
      g += `<rect x="${ox2+c*cell}" y="${oy+r*cell}" width="${cell-1.5}" height="${cell-1.5}" fill="${k?k[1]:"#fafcfe"}" stroke="${LINE}" stroke-width="0.6"/>`;
    }
    ["T","τx","τy","τz"].forEach((n,i)=> g += H.txt(ox2+i*cell+9, oy-6, n, {size:10.5, anchor:"middle", color:MUT}));
    g += H.txt(ox2+120, oy+130, "1/m = 1.54", {size:12, color:CYAN, bold:true});
    g += H.txt(ox2+120, oy+152, "1/I ≈ 435", {size:12, color:VIO, bold:true});
    g += H.txt(ox2+120, oy+172, "→ 280× more angular\n   than linear authority:\n   attitude is the fast loop", {size:11.5, color:MUT});
    g += H.box(600, 200, 280, 105, " ", {fill:PAPER, stroke:LINE});
    g += H.txt(740, 226, "read the two amber cells", {size:13, bold:true, anchor:"middle", color:AMBER});
    g += H.txt(618, 250, "∂ẍ/∂θ = +g   ∂ÿ/∂φ = −g\n\nthe ONLY bridge from attitude to\nposition. Delete them and the quad\nnever moves sideways.", {size:11.5, color:INK});
    return g;
  });

  window.__MLTE_P3 = true;
})();
