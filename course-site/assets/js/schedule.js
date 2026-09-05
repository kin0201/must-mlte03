/* ==========================================================================
   schedule.js — the ONE place course dates & LMS links live.
   Filling `lmsUrl` (and any remaining null deadlines) here updates the
   home page button and every lab sheet's submit box at once — no need to
   edit 14 HTML files. Weeks left `null` still show their "TO FILL" badge.

   Deadline convention: the lab is due at the START of the next class
   (Mon 12:00). Weeks 5+ depend on the make-up-class plan (TEACHING-PLAN §3)
   and stay null until the faculty confirms the slots.
   ========================================================================== */
window.MLTE03_SCHEDULE = {
  // Hand-in destination: our own platform under /app/ (no school LMS)
  lmsUrl: "https://course.ainrobotics.com/mlte03/",   // our own platform, under the Ken Sir course hub (2026-09-06; was /app/)

  // Optional per-week dropbox deep links; fall back to lmsUrl when absent.
  dropbox: {},

  // Lab-report deadlines (shown verbatim). null = keep the TO FILL badge.
  deadlines: {
    week01: "Mon 2026-09-14, 12:00 (start of class)",
    week02: "Mon 2026-09-21, 12:00 (start of class)",
    week03: "Mon 2026-10-05, 12:00 (start of class)",   // no class 09-28
    week04: "Mon 2026-10-12, 12:00 (start of class)",   // Lab 1 ⭐
    week05: null,  // ⭐ next session = make-up slot or 10-26 — set after the faculty confirms
    week06: null,  // ⭐ taught in make-up slot 1 (plan A)
    week07: null,  // ⭐
    week08: null,  // ⭐ taught in make-up slot 2 (plan A)
    week09: null,  // ⭐
    week10: null,  // team case study + proposal
    week11: null,
    week12: null,
    week13: null,
    week14: null,
    week15: null,  // final project — before the Week 15 session
  },
};
