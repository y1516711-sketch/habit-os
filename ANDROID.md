# 🤖 HABIT OS — Android App Guide

## 📲 Ready APK (install now — free)
**`releases/HABIT-OS-v2.0.apk`** (3.9 MB, package `com.codenix.habitos`, Android 5.1+)

1. APK file ko phone mai bhejo (WhatsApp/USB/Google Drive).
2. File tap karo → agar warning aaye to **"Install unknown apps" allow** karo (ye normal hai — Play Store ke bahar ki har APK par aata hai).
3. **Install** → Open. Done! 🎉
4. Pehli baar: apna data chahiye to web version se **Settings → Full backup (JSON)** leke app mai **Restore** kar do.

**Android app mai extra kya hai?** Asli system reminders — app band ho tab bhi habit ke time par notification bajega (LocalNotifications, agle 7 din ke slots schedule hote hain, app khulne par refresh ho jate hain). Data phone par hi save hota hai, bilkul free.

> ℹ️ Ye **debug-signed** APK hai — khud use karne aur doston ko bhejne ke liye perfect. Play Store ke liye release signing chahiye (neeche).

## 🔁 Dobara APK banana hai to (3 free tarike)
### Tarika 1 — GitHub Actions (sabse easy, kuch install nahi)
Is `habit-os` folder ko GitHub repo mai push karo → **Actions → Build Android APK → Run workflow** → 3-4 minute mai APK download ready.

### Tarika 2 — Apne PC/MacBook par
Chahiye: Node 20, JDK 17, Android SDK (Android Studio ke saath free aata hai).
```bash
cd habit-os
npm install --legacy-peer-deps
npm run apk:debug     # android/app/build/outputs/apk/debug/app-debug.apk banega
```
Note: `android/local.properties` mai SDK ka path apne system ka hona chahiye — Android Studio khud set kar deta hai, warna file delete kardo aur Android Studio mai ek baar project khol lo.

Code change ke baad APK update: `npm run cap:sync` phir dobara build. Version badhana ho to `android/app/build.gradle` mai `versionCode`/`versionName`.

### Tarika 3 — Android Studio mai kholo
`npm run cap:sync` → `npx cap open android` → ▶ Run (phone/emulator par).

## 🏪 Play Store par dalna ho to (optional, aage ke liye)
1. Android Studio → Build → **Generate Signed App Bundle** → apni keystore banao (**keystore sambhal kar rakho** — kho gayi to app update kabhi nahi hoga!).
2. Google Play Console account: one-time $25 (~₹2,100).
3. `.aab` file upload karo, listing bharo, submit.

## 🔧 Common dikkat
- **"App not installed"**: purana version uninstall karke phir install karo (debug/release signature alag hone par hota hai).
- **Reminder nahi aaya**: Phone Settings → Apps → HABIT OS → Notifications ON + Battery restriction "Unrestricted" (kuch phones — Xiaomi/Oppo/Vivo — background apps ko rok dete hain).
- **Purana data**: web aur Android app ka data alag-alag hota hai; JSON backup se transfer karo.
