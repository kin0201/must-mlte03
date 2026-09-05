/* ==========================================================================
   lab.js — interactivity for the HTML lab sheets.
   - "copy" buttons on every code block
   - a sticky progress bar tied to scroll
   - self-check checklists that remember state per lab (localStorage)
   No dependencies.
   ========================================================================== */
(function () {
  "use strict";

  // ---- copy buttons -------------------------------------------------------
  function addCopyButtons() {
    document.querySelectorAll(".code").forEach((box) => {
      if (box.querySelector(".copy")) return;
      const pre = box.querySelector("pre");
      if (!pre) return;
      const btn = document.createElement("button");
      btn.className = "copy"; btn.textContent = "copy";
      btn.addEventListener("click", () => {
        const text = pre.innerText.replace(/ /g, " ");
        navigator.clipboard.writeText(text).then(() => {
          btn.textContent = "copied ✓"; btn.classList.add("copied");
          setTimeout(() => { btn.textContent = "copy"; btn.classList.remove("copied"); }, 1400);
        });
      });
      box.appendChild(btn);
    });
  }

  // ---- self-check persistence --------------------------------------------
  // The course platform keeps a per-student copy when the visitor is logged in;
  // localStorage remains the offline fallback. All platform calls fail silently.
  //
  // 2026-09-06: the platform moved to course.ainrobotics.com/mlte03/ (the Ken Sir course
  // hub), and these lab sheets moved with it — they are served from /mlte03/site/ on the
  // SAME origin, which is what makes the sync possible at all: the hub's session cookie is
  // scoped to that host, so a call from anywhere else is cross-site (no cookie sent, no
  // CORS header on the reply) and can never identify the student.
  // The guard below keeps that honest — in a local clone opened over file://, or on any
  // leftover copy served from another host, we skip the calls instead of firing requests
  // that are guaranteed to fail, and localStorage alone keeps the boxes ticked.
  const APP = "https://course.ainrobotics.com/mlte03";
  const PLATFORM_SAME_ORIGIN = (function () {
    try { return location.origin === new URL(APP).origin; } catch (e) { return false; }
  })();
  function wireChecklist() {
    const lab = document.body.dataset.lab || location.pathname;
    const key = "mlte03:" + lab;
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(key) || "{}"); } catch (e) {}
    const boxes = [...document.querySelectorAll(".checklist input[type=checkbox]")];
    const apply = () => boxes.forEach((cb, i) => {
      const id = cb.dataset.id || "c" + i;
      cb.checked = !!saved[id];
      cb.closest("li")?.classList.toggle("done", cb.checked);
    });
    apply();
    let loggedIn = false;
    const push = () => { if (!loggedIn || !PLATFORM_SAME_ORIGIN) return;
      fetch(APP + "/api/selfcheck", { method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "same-origin", body: JSON.stringify({ lab, items: saved }) }).catch(() => {}); };
    boxes.forEach((cb, i) => {
      const id = cb.dataset.id || "c" + i;
      cb.addEventListener("change", () => {
        saved[id] = cb.checked;
        cb.closest("li")?.classList.toggle("done", cb.checked);
        try { localStorage.setItem(key, JSON.stringify(saved)); } catch (e) {}
        push();
      });
    });
    if (location.protocol === "file:" || !PLATFORM_SAME_ORIGIN) return;
    fetch(APP + "/api/me", { credentials: "same-origin" }).then(r => r.ok ? r.json() : null).then(me => {
      if (!me || !me.logged_in) return;
      loggedIn = true;
      return fetch(APP + "/api/selfcheck/" + encodeURIComponent(lab), { credentials: "same-origin" }).then(r => r.ok ? r.json() : {});
    }).then(server => {
      if (!server) return;
      // server wins for items it knows; unknown items keep the local value, then sync up once
      Object.assign(saved, server); apply();
      try { localStorage.setItem(key, JSON.stringify(saved)); } catch (e) {}
      push();
    }).catch(() => {});
  }

  // ---- scroll progress bar -----------------------------------------------
  function wireProgress() {
    const bar = document.querySelector(".lab-progress > i");
    if (!bar) return;
    const onScroll = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      bar.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + "%";
    };
    document.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  function init() { addCopyButtons(); wireChecklist(); wireProgress(); fillSchedule(); }
  if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);

  // ---- submit box: fill the platform link + deadline from schedule.js ------
  function fillSchedule() {
    const cfg = window.MLTE03_SCHEDULE;
    if (!cfg) return;
    const week = (document.body.dataset.lab || "").slice(0, 6); // "week01"
    if (!/^week\d\d$/.test(week)) return;
    document.querySelectorAll(".submit .tofill, .submit-box .tofill, .tofill").forEach((span) => {
      const t = span.textContent;
      if (/LMS link/i.test(t)) {
        const url = cfg.dropbox[week] || cfg.lmsUrl;
        if (!url) return;
        const a = document.createElement("a");
        a.href = url; a.target = "_blank"; a.rel = "noopener";
        a.textContent = "open the platform ↗";
        span.replaceWith(a);
      } else if (/date \/ time/i.test(t)) {
        const d = cfg.deadlines[week];
        if (!d) return;
        span.classList.remove("tofill");
        span.style.fontWeight = "600";
        span.textContent = d;
      }
    });
  }

})();
