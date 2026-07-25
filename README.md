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
- Different networks entirely, or a real public deployment: see section 8 below

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

### Real accounts — not one hardcoded demo login

Both apps now support genuine sign-up: type a phone number that doesn't
exist yet, and you'll be prompted to create a real account (name, plus
vehicle for drivers) instead of being logged into a single shared demo
identity. Log back in with the same number later and you're back on that
same account — each device remembers who it's logged in as. There's still
no real SMS verification (any 4-digit code works for the user app's OTP
step) — this is a demo login gate, not real authentication.

One built-in demo account of each kind (`Rian Wijaya` the user, `Andi
Pratama` the driver) is still seeded by default, purely so a solo rider
testing the user app by itself — with no driver app open — still gets
auto-matched with a ride, exactly like earlier versions of this project.

**Demo flow:** register or log in as a driver → go online → register or log
in as a user (different browser tab/device) → book a ride (type or tap an
address) → driver accepts → both jump to live trip screens → chat →
complete trip → fare settles automatically between that specific user's and
driver's wallets. Admin sees all of it live — Overview KPIs, Live Map,
Bookings — and can manage **every** registered user and driver (not just
one): suspend accounts, adjust wallets, edit bank details, set commission/
discount, and broadcast announcements that show up instantly in the other
two apps.

Check the admin app's top-right pill: green **"Live"** = connected to the
backend; red **"Offline"** = check that the server is running and
`SERVER_URL` is correct.

## 4. Progressive Web App — install it like a real app

All three apps are now real PWAs: each has its own `manifest.json`, a
service worker (`sw.js`) that caches the app shell for instant/offline
loading, real generated icons (`shared/icons/`), and the meta tags iOS/
Android need to treat it as an installable app rather than just a bookmark.

**To install:**
- **Android (Chrome)**: open the app, tap the ⋮ menu → **"Install app"** (or
  you may see an automatic "Add to Home screen" banner).
- **iOS (Safari)**: open the app, tap the Share icon → **"Add to Home
  Screen"**.
- **Desktop (Chrome/Edge)**: look for an install icon (⊕) in the address bar.

Once installed, it opens in its own window/icon like a native app — no
browser chrome, its own icon on the home screen, matching each app's brand
color as the status bar/splash color.

The service worker only caches the app shell (HTML/CSS/JS) — it deliberately
leaves Socket.IO, map tiles, and geocoding/routing calls untouched, since
this app is only useful with a live connection to the backend anyway. Bump
the `CACHE_NAME` version string in each `sw.js` if you ever need to force
every installed copy to pick up a fresh app shell.

## 5. Sign-up verification (WhatsApp or email)

New accounts (in both the user and driver apps) now go through a real
verification step — sign-up is gated on entering a code sent to your phone
(via WhatsApp) or email, not just typing any 4 digits. **Returning-account
login is unchanged** (still a quick demo OTP) — verification specifically
happens once, when a brand-new account is created, to prove you own that
contact method.

### Email — genuinely works today

Set these environment variables when running the server (or in a `.env`
file, or your hosting platform's environment variable settings):
```
WAYME_SMTP_HOST=smtp.gmail.com
WAYME_SMTP_PORT=587
WAYME_SMTP_USER=you@gmail.com
WAYME_SMTP_PASS=your-16-character-app-password
WAYME_SMTP_FROM=you@gmail.com
```
(For Gmail: enable 2-Step Verification on the account, then create an "App
Password" specifically for this — your normal password won't work. Any
other SMTP provider — Resend, Brevo, your own mail server — works the same
way, just with their host/port/credentials instead.)

### WhatsApp — real, but not a quick toggle

Set `WAYME_WHATSAPP_TOKEN` and `WAYME_WHATSAPP_PHONE_ID` and the code will
call Meta's real WhatsApp Cloud API. The honest catch: this requires an
actual Meta Business Platform account, a verified WhatsApp Business phone
number, and — for messages outside a 24-hour customer-initiated reply
window — an **approved message template**, which is a real-world approval
process through Meta, not something any amount of code can shortcut. If you
don't have that set up, don't set these variables.

### Without either configured

Both channels have the same graceful fallback: the server generates a real
6-digit code and hands it straight back in the API response instead of
actually sending it, so the whole verification flow is still fully testable
without any real email/WhatsApp setup — you'll just see the code appear
on-screen with a note that real delivery isn't configured, instead of it
landing in an inbox or chat.

## 6. PIN lock & session expiry

All three apps now stay logged in indefinitely on a device — no re-login
just for closing the tab or app — but protect that persistent session with
a 4-digit PIN instead of leaving it wide open:

- **First time you log in** (or the first time you open the app after this
  update, for an already-logged-in session), you're asked to set a 4-digit
  PIN for that device.
- **Every time after that**, opening the app shows a quick "Welcome back —
  enter your PIN" lock screen instead of the full login flow. This is
  per-device — the PIN isn't synced anywhere, similar to how a phone's own
  lock screen PIN never leaves that phone.
- **If the app goes untouched for more than 2 weeks**, the session expires
  automatically — the next time it's opened, it drops back to full login
  (phone/email + code, or admin email/password) instead of just a PIN.
  Using the app at all — any screen navigation — resets that 2-week clock.
- **"Not you? Log out"** on the PIN screen clears the session and returns to
  full login, e.g. for switching accounts on a shared device.

This is stored entirely in the browser's local storage (`wayme_user_pin_*`,
`wayme_driver_pin_*`, `wayme_admin_pin`, hashed with SHA-256 via the
browser's built-in Web Crypto API) — nothing PIN-related is sent to or
stored on the server, so it doesn't affect `db.json` or require any backend
changes.

## 7. Building this into an Android WebView app

Use `WebViewAssetLoader` (not raw `file://`), enable `javaScriptEnabled` and
`domStorageEnabled`, grant the `INTERNET` permission, and set
`usesCleartextTraffic="true"` if your backend is plain `http://` during
development. The driver app's Navigate button opens a `geo:` URI — intercept
that in `shouldOverrideUrlLoading` and hand it to `Intent.ACTION_VIEW` so
Android's normal navigation-app chooser opens.

## 8. Deploying the backend so it's reachable from anywhere (not just your Wi-Fi)

**Quick note on what needs redeploying when you update this project:** most
features in this README (PWA install, sign-up verification, PIN lock) live
entirely in the client-side app files (`user-app/`, `driver-app/`,
`admin-app/`, `shared/`) — if you're hosting those on GitHub Pages, you only
need to `git add`/`commit`/`push` again for those to take effect; your
Render/ngrok backend doesn't need touching. You only need to redeploy the
**server** itself (`server/`) if `server.js` or `package.json` changed —
e.g. this section's own setup, or the email/WhatsApp verification env vars.

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

## 9. Before using any of this for real

- `server/server.js` now has a shared-secret access key (not real per-user
  authentication — everyone with the key has full read/write access to
  everything) and uses simple JSON-file persistence — fine for a small
  private demo, not for real users or sensitive data as-is.
- Nominatim/OSRM are free shared community infrastructure with fair-use
  limits — self-host both, or use a paid provider, before real-scale traffic.
- Add a licensed payment gateway and per-user role-based auth (not just the
  shared access key) for the admin dashboard before going live.
- Sign-up verification is real (email/WhatsApp) if you configure it (see
  section 5), and returning visits are now protected by a device-local PIN
  (see section 6) — but **the underlying account login itself is still just
  a phone/email lookup with a demo OTP, no password.** A stolen/shared
  device's PIN protects that one device, but anyone who knows a registered
  phone number or email can still log into that account fresh on a
  different device. Add a real password and/or stronger 2FA on the
  account-login step itself before this holds anyone's real money or bookings.
