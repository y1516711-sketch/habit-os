# HABIT OS — Personal Progress System ⚡ (v2.1)

A **free, installable** personal habit tracker. Your data is saved **on your own device** (IndexedDB) — no account, no paid cloud, no subscription. Works on **Android, iPhone, MacBook and Windows**, online and offline (PWA).

## ▶ Run locally
```bash
cd habit-os
npm install --legacy-peer-deps
npm run dev        # open http://localhost:5173
npm run build      # production files in dist/
```

## 🌐 Publish FREE forever (₹0)
1. `npm run build`
2. Drag the `dist/` folder onto **Netlify Drop** (app.netlify.com/drop), or deploy to **Vercel / GitHub Pages** (free tiers).
3. Open that link on any device → Install (below). Done — no server cost ever, because data lives in each device's browser storage.

## 📲 Install as an app
| Device | Steps |
|---|---|
| Android (Chrome) | ⋮ menu → **Install app** |
| iPhone/iPad (Safari) | Share → **Add to Home Screen** |
| MacBook (Safari) | File → **Add to Dock** |
| Mac/Windows (Chrome/Edge) | Install icon in address bar |

## 💾 Where is my data saved?
- Automatically in **IndexedDB** on the device where you use it (with a localStorage safety copy). It survives refresh, restart and offline use.
- Moving to a new device: **Settings → Full backup (JSON)** on old device → **Restore backup…** on the new one.
- Each device has its own copy (this MVP has no cloud sync — that's exactly why it costs ₹0 and is fully private). Invalid import files are rejected with a clear error.

## ✨ Features (all functional, no placeholders)
- **Dashboard** — today %, ring, streaks, XP/level, weekly chart, today's checklist, quick timer, recent activity, tomorrow, rule-based insights from *your real data*.
- **Daily Tracker** — any date, category filter, Done/Partial/Skip/Rest, values + notes per log, one record per habit+date guaranteed.
- **Timer** — Pomodoro (configurable focus/break), stopwatch, countdown; pause time never counts; refresh-safe; double-Finish can't duplicate sessions; after finishing it *asks* before marking the habit complete; full session history + day/week/month totals.
- **Habits** — create/edit/delete/pause/reorder; icon, color, category, target+unit, tracking type, daily/weekday/custom schedule, reminder time. Ships with 6 editable samples (Coding 75m, Cyber Security 60m, YouTube/Codenix 80m, Gym 60m, Running 30m, English 20m).
- **Weekly Report** — Mon–Sun (configurable), per-habit rates, missed/skipped, best day & habit, focus pie, this-vs-last week, prev/next navigation.
- **Monthly Report** — calendar, 84-day heatmap, streaks, done/missed/skipped, best/weakest day, previous-month comparison, **CSV + JSON export**.
- **Goals & Badges** — daily/weekly/monthly goals, configurable XP, levels, 9 achievements, schedule-aware streaks (rest & unscheduled days never break a streak or count as missed).
- **Notes/Journal** — dated notes with mood + search.
- **Settings** — light/dark theme, accent, week-start, categories, timer settings, reminders, demo data, reset with confirmation.

## 🔔 Reminder honesty
Notifications only fire after you grant permission, and reliably only while the app/browser is open — that is a web-platform limitation (no paid push server is used). For critical alarms, keep a phone alarm too.

## 🏗️ Architecture
`src/lib/` = types, local-date utils, IndexedDB, analytics (pure logic) · `src/lib/store.tsx` = state+persistence · `src/components/` = UI · `src/pages/` = 9 screens. Charts: Recharts. No API keys anywhere. Insights are local rules — no fake AI, no invented history.

## 🆕 v2.0 — naya kya hai
- **🤖 Android App (APK)** — ready APK `releases/HABIT-OS-v2.0.apk` (Capacitor). App band ho tab bhi asli reminders. Free rebuild ke 3 tarike: `ANDROID.md` dekho (GitHub Actions wala sabse easy). Android widget abhi nahi hai — roadmap par hai.
- **🧠 AI Coach** — do mode: (1) **Local Coach** bina key/internet ke, tumhare real data se jawab ("iss hafte kaisa gaya?", "aaj ka plan banao", "motivate karo"); (2) **Asli AI** apni free Gemini ya Groq API key se (key sirf device par rehti hai, backup mai auto-hat jati hai; AI ko sirf numbers summary jati hai, journal text kabhi nahi).
- **📸 Share Card** — Aaj/Hafta/Streak ki 1080×1350 PNG photo + ready-made caption, WhatsApp/Instagram/YouTube ke liye. `navigator.share` support ke saath.
- **🎮 Gamification+** — 🪙 Coins (complete=10, partial=4, 10-min focus=2, perfect day=+20), roz 3 **Daily Quests** (claim karke coins), **Reward Shop** (🧊 Streak Freeze, avatars, 🥇 Gold Theme), **Streak Freeze** missed din par lagao, aur level ke saath evolve hone wala **Buddy** 🥚→🐣→🦉→🐉→👑.

## 🪝 v2.1 — "Hook System" (user bore na ho, roz wapas aaye)
- **🪄 Personal Setup Wizard** — pehli baar 3 sawal: tu hai kaun (Student/Coder/Creator/Fitness), kitna halka/bhaari shuru karega (Beginner = targets aadhe — haarne ka chance kam), aur kab free hota hai (us hisaab se har habit ka reminder time auto). Settings se kabhi bhi dobara chal sakta hai.
- **🎁 Roz ka Mystery Box** — har din 1 surprise box: coins, kabhi 🧊 freeze, kabhi 💎 100-coin jackpot. Ek din mai ek hi — reload maar ke farm nahi kar sakte!
- **🎯 Hero Quest Dashboard par** + "⚡ Bas 10 minute shuru karo" wala trick button (sabse mushkil kaam = shuru karna).
- **⚠️ Streak Khatre Mai alert** — shaam ko streak tutne wali ho to Dashboard pehle hi cheta dega.
- **👋 Welcome-Back mode** — 2+ din gayab rahe to app daantega nahi, "aaj halka rakho" bolke wapas layega.
- **🥊 Tum vs Pichhle-Hafte-Wale-Tum** — khud se competition ke bars.
- **💙 Daily mood check-in** aur **🎉 100% wale din celebration** (emoji baarish) — chhoti khushiyan, roz wapas aane ki wajah.
