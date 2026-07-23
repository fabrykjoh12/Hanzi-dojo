# Collaboration Hq Page Overrides

> **PROJECT:** Hanzi Dojo HQ
> **Generated:** 2026-07-22 21:39:30
> **Page Type:** Dashboard / Data View

> ⚠️ **IMPORTANT:** Rules in this file **override** the Master file (`design-system/MASTER.md`).
> Only deviations from the Master are documented here. For all other rules, refer to the Master.

---

## Page-Specific Rules

### Layout Overrides

- **Max Width:** 1200px (standard)
- **Layout:** Full-width sections, centered content
- **Sections:** 1. Hero, 2. Bento Grid (Key Features), 3. Detail Cards, 4. Tech Specs, 5. CTA

### Spacing Overrides

- No overrides — use Master spacing

### Typography Overrides

- No overrides — use Master typography

### Color Overrides

- **Strategy:** Card backgrounds: #F5F5F7 or Glass. Icons: Vibrant brand colors. Text: Dark.

### Component Overrides

- Avoid: Use arbitrary large z-index values

---

## Page-Specific Components

- No unique components for this page

---

## Recommendations

- Effects: No motion blur, distinct page turns, grain/noise texture, sharp transitions (no fade)
- Layout: Define z-index scale system (10 20 30 50)
- CTA Placement: Floating Action Button or Bottom of Grid

## Weekly Planning Cockpit

- Keep the visual hero compact while planning so the working surface appears sooner.
- Use four layers in order: week controls, planning metrics, focus items, weekly board.
- Pin the unscheduled backlog at the left edge on desktop; let it scroll normally on mobile.
- Show seven day columns with lightweight capacity markers and a clear current-day state.
- Support drag-and-drop plus an explicit quick-schedule button so planning never depends on drag alone.
- Let users create an item directly inside a day with its due date prefilled.
- Separate later work below the active week to protect the weekly plan from visual noise.

## Ready-to-use Local Collaboration

- On first launch, collect only workspace name, the two member names, and which member owns the current device.
- Default to a clean workspace; keep demo work only as an explicit choice.
- Communicate local autosave and file-based collaboration plainly without implying real-time sync.
- Put import, download, identity switching, and the three-step handoff flow in one compact collaboration dialog.
- Merge imported records by stable id and latest update time, and carry deletion tombstones so imports never resurrect removed work.
- Use the Web Share API when supported, with a normal file download as the reliable fallback.

## Claude Code Roadmap Bridge

- Show bridge availability as a compact neutral/green status dot; never imply Claude is connected when the local bridge is offline.
- Keep terminal launch explicit and item-scoped. The browser may send structured task data, never an arbitrary shell command.
- Use one dialog for document selection, HQ-to-Markdown sync, and Markdown-to-HQ completion import.
- Write only between stable `DOJO-HQ` markers so existing roadmap prose remains untouched.
- Launch Claude Code with manual permissions and a prompt that prohibits commit, push, deployment, and unrelated deletion.
- Place the task-level launch action inside task detail, after context and comments, so the user reviews the task before starting an agent.
