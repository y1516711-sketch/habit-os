# HABIT OS — Implementation Plan

**Inspected:** empty workspace (2026-10-19). No existing code to preserve. Scaffolded Vite + React + TypeScript (pinned stable versions because latest-registry Vite 8 / TS 7 breaks npm 10 peer resolution in this sandbox).

## Architecture (free, no paid APIs, installable on all devices)
- **Frontend only PWA** — installable on Android (Chrome), iPhone/iPad (Safari "Add to Home Screen"), MacBook/Windows (Chrome/Edge/Safari install). Works offline via service worker.
- **Data saved on the user's own device** in **IndexedDB** (`src/lib/db.ts`, localStorage fallback). No server cost, no account, private by design. Backup = JSON/CSV export + validated restore in Settings.
- **Layers:** `lib/` (types, dates, db, analytics — pure business logic) → `lib/store.tsx` (state + persistence) → `components/` (UI) → `pages/` (9 screens). No secrets in frontend. No fake AI — insights are local rule-based from real saved data.

## Build order (as requested)
1. Habit CRUD + daily tracking (unique log per habit+date) ✅
2. Persistent timer (stopwatch/countdown/Pomodoro, pause-excluded, refresh-safe, double-finish guard) ✅
3. Weekly (Mon–Sun) + monthly reports, calendar, heatmap, comparisons ✅
4. Streaks (schedule-aware, rest days never count as missed), goals, XP/levels/badges ✅
5. Reminders (Notification API after permission), insights, export/import, PWA polish ✅

## Run locally
```bash
cd habit-os
npm install --legacy-peer-deps
npm run dev        # http://localhost:5173
npm run build      # production build in dist/ — deploy FREE to Netlify/Vercel/GitHub Pages by uploading dist/
```
Install as app: open the site → Android/Chrome: ⋮ → "Install app"; Mac Safari: File → Add to Dock; iPhone Safari: Share → Add to Home Screen.
