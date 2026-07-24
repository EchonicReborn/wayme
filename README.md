# WAYME — Mobility, Delivery & Booking Super-App

Three linked apps — User, Driver/Partner, and Admin — for ride-hailing
(motorbike/car/air taxi), food delivery, package shipment, and stay
reservations. Sky-blue theme, wallet/card/QR payment UI, live map tracking
via free OpenStreetMap, in-app chat, and a real backend server so all three
genuinely sync over the network.

## 1. Project structure

```
wayme/
├── server/                   ← the real backend (Node/Express/Socket.IO)
│   ├── package.json
│   └── server.js
├── shared/
│   ├── css/tokens.css        ← design system (Sky Blue theme)
│   ├── js/mock-backend.js    ← real-time backend client — set SERVER_URL here
│   └── js/maps-service.js    ← OpenStreetMap service layer (Leaflet/Nominatim/OSRM)
├── user-app/                 ← the User app
├── driver-app/                ← the Driver/Partner app
├── admin-app/                 ← the Admin dashboard
└── README.md
```

## 2. Setting up the real backend (do this first)

```bash
cd server
npm install
npm start
```
You should see `WAYME backend listening on http://localhost:3000`. Leave it
running — it auto-creates `db.json` next to `server.js` for persistence.

Then open `shared/js/mock-backend.js` and set:
```js
const SERVER_URL = "http://localhost:3000"; // <-- point this at your running server
const ACCESS_KEY = "wayme-demo-2026";        // <-- must match server/server.js
```
- Browser tabs, same computer: `http://localhost:3000` (default)
- Android Emulator: `http://10.0.2.2:3000`
- Real phone, same Wi-Fi: your computer's LAN IP, e.g. `http://192.168.1.23:3000`
- Different networks entirely, or a real public deployment: see section 5 below

`ACCESS_KEY` is a shared-secret gate (not real per-user auth) so a stranger
who stumbles on your public URL can't read or rewrite your data. Change it
to something of your own if you're deploying this publicly — just keep the
value identical in both `server/server.js` and `shared/js/mock-backend.js`.

**No API key needed anywhere for maps** — they run on free
Leaflet/OpenStreetMap/Nominatim/OSRM.

## 3. Running it locally

```bash
python3 -m http.server 8080
```
Then open:
- `http://localhost:8080/user-app/index.html`
- `http://localhost:8080/driver-app/index.html`
- `http://localhost:8080/admin-app/index.html`

**Demo flow:** driver logs in → goes online → user books a ride (type or tap
an address) → driver accepts → both jump to live trip screens → chat →
complete trip → fare settles automatically. Admin sees all of it live —
Overview KPIs, Live Map, Bookings, and can suspend accounts, adjust
commission/discount, edit bank details, and broadcast announcements that
show up instantly in the other two apps.

Check the admin app's top-right pill: green **"Live"** = connected to the
backend; red **"Offline"** = check that the server is running and
`SERVER_URL` is correct.

## 4. Building this into an Android WebView app

Use `WebViewAssetLoader` (not raw `file://`), enable `javaScriptEnabled` and
`domStorageEnabled`, grant the `INTERNET` permission, and set
`usesCleartextTraffic="true"` if your backend is plain `http://` during
development. The driver app's Navigate button opens a `geo:` URI — intercept
that in `shouldOverrideUrlLoading` and hand it to `Intent.ACTION_VIEW` so
Android's normal navigation-app chooser opens.

## 5. Deploying the backend so it's reachable from anywhere (not just your Wi-Fi)

This is the step that makes WAYME work for real, from any device, anywhere
— not just devices on your own network. **Render's free web service tier**
is the recommended starting point: genuinely free, no credit card required.
The honest tradeoff: free instances sleep after 15 minutes idle, the first
request after sleeping takes 30-60 seconds to wake up, and — because free
tier has no persistent disk — `db.json` resets to the seed data every time
it wakes from sleep or redeploys. Good enough to prove this works for real
from anywhere; if you want data that never resets, that's Render's Starter
tier (~$7/mo) or similar elsewhere, a five-minute change once you're ready.

**Steps:**

1. **Put the code on GitHub** (Render deploys from a Git repo):
   ```bash
   cd wayme
   git init
   git add .
   git commit -m "WAYME"
   ```
   Create a new repository on github.com (can be private), then:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/wayme.git
   git branch -M main
   git push -u origin main
   ```
2. **Create the Render service:**
   - Sign up at render.com (no card needed for the free tier).
   - **New +** → **Web Service** → connect your GitHub account → pick the
     `wayme` repo.
   - **Root Directory:** `server` (important — this tells Render to only
     build/run the `server/` subfolder, not the whole repo).
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
   - Add an environment variable: `WAYME_ACCESS_KEY` = something private
     you choose (this becomes your server's access key instead of the
     default `wayme-demo-2026` — don't leave the default on a public server).
   - Click **Create Web Service**. First deploy takes a couple of minutes.
3. **Get your URL** — Render gives you something like
   `https://wayme-server-xxxx.onrender.com`. Visit
   `https://wayme-server-xxxx.onrender.com/health` to confirm it responds
   with `{"ok":true,...}`.
4. **Point every app at it** — in `shared/js/mock-backend.js`:
   ```js
   const SERVER_URL = "https://wayme-server-xxxx.onrender.com"; // your real URL, https
   const ACCESS_KEY = "the same value you set as WAYME_ACCESS_KEY";
   ```
5. **If you're serving the web apps yourself too**, re-upload the updated
   `user-app/`, `driver-app/`, `admin-app/` (with the new `mock-backend.js`)
   anywhere that serves static files — GitHub Pages, Netlify, Vercel, or
   even the same Render account as a separate Static Site — so the whole
   thing is reachable by URL, not just `localhost`.
6. **If you built the Android APKs**, update the same `SERVER_URL`/
   `ACCESS_KEY` in each project's bundled copy of `mock-backend.js` and
   rebuild. Since it's now real `https://`, you can also set
   `usesCleartextTraffic="false"` again in each manifest for tighter security.

## 6. Before using any of this for real

- `server/server.js` now has a shared-secret access key (not real per-user
  authentication — everyone with the key has full read/write access to
  everything) and uses simple JSON-file persistence — fine for a small
  private demo, not for real users or sensitive data as-is.
- Nominatim/OSRM are free shared community infrastructure with fair-use
  limits — self-host both, or use a paid provider, before real-scale traffic.
- Add real SMS OTP, a licensed payment gateway, and per-user role-based auth
  (not just the shared access key) for the admin dashboard before going live.
