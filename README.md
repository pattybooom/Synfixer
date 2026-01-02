# Synfixer (Daily Fix) — iPhone PWA

A tiny Duolingo-style “daily coding fix” app you install to your iPhone Home Screen.
- No App Store
- Works offline after first load (service worker cache)
- Unlimited challenges per day
- Streak increases **at most once per day** when you complete **≥ 1** challenge

---

## Live site (GitHub Pages)

Deployed from:

`pattybooom.github.io/Synfixer`

Open that in **Safari on iPhone**.

---

## Install on iPhone (PWA)

1. Open **Safari** and go to: `pattybooom.github.io/Synfixer`
2. Tap **Share**
3. Tap **Add to Home Screen**
4. Launch Synfixer from the Home Screen icon

Notes:
- For the “app-like” feel, always open from the Home Screen icon.
- After first load, it should work offline (cached).

---

## Project files

Required:
- `index.html`
- `styles.css`
- `app.js`
- `challenges.json`
- `manifest.json`
- `service-worker.js`

Assets:
- `correct.m4a` (played on correct answers)
- `icons/icon-192.png`
- `icons/icon-512.png`
- `icons/apple-touch-icon.png`

---

## Using the app

- Go to **Today**
- Solve a challenge
- Tap **Do another challenge** to keep going
- “Completed today: N” shows today’s count
- Streak increases only on the **first completion** of the day

### Hints & solution
- **Hint** shows the first hint
- **Show solution** reveals the expected code / filled template

### Streak + grace (optional)
- Settings has **Grace** toggle
- Grace can preserve your streak once after missed days (if enabled)

## License
MIT (do whatever, no warranty)