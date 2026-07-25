/* =========================================================
   WAYME — Real Backend Server
   ---------------------------------------------------------
   This is what makes the three SEPARATELY INSTALLED apps
   (wayme-user-app, wayme-driver-app, wayme-admin-app) actually
   talk to each other over the network, instead of each having
   its own isolated localStorage copy of the simulated database.

   Design, on purpose, kept close to how shared/js/mock-backend.js
   already worked: one shared JSON "db" object, mutated as a whole
   and broadcast to everyone else whenever it changes. That's what
   let the client-side rewrite stay a near drop-in replacement —
   see the comments in mock-backend.js for the client side of this.

   ⚠️ THIS IS A DEMO-SCALE BACKEND, NOT PRODUCTION-READY:
   - A single shared secret key (ACCESS_KEY below) gates every
     connection — this is NOT real per-user authentication, just a
     "keep random strangers out" gate. Anyone with the key has full
     read/write access to everything. Fine for a small private demo
     you're sharing the key for; do NOT treat this as real auth for
     paying users or sensitive data.
   - Persistence is a single JSON file on disk (db.json), written
     on every change. Fine at this scale; swap for a real database
     (Postgres, MongoDB, etc.) before this needs to survive serious
     concurrent load or you want proper transactions. NOTE: if you
     deploy this on a free-tier host with no persistent disk (e.g.
     Render's free web services), this file gets wiped every time
     the instance sleeps/restarts — the app still works, it just
     resets to the seed data on the next cold start.
   - State sync is "whole object, last write wins" for most fields
     (simple, but two clients writing at the exact same instant can
     race). The one high-frequency mutation — the driver's live GPS
     position during an animated trip — is special-cased to its own
     lightweight, non-clobbering message (see 'driver_location'
     below) specifically to avoid that race for the common case.
     For true production-grade sync, move everything to per-field
     patches or adopt a real realtime database (Firebase, Supabase
     Realtime, etc.) instead of hand-rolling this further.
   ⚠️ VERIFICATION CODES (sign-up email/WhatsApp OTP) — READ THIS
   - Email: uses nodemailer over real SMTP. Set WAYME_SMTP_HOST/PORT/USER/PASS
     (and optionally WAYME_SMTP_FROM) as environment variables to send real
     emails — e.g. a Gmail address with an "app password", or any SMTP
     relay from Resend/Brevo/etc. Without these set, codes aren't actually
     emailed — the API returns the code directly in its response instead,
     purely so you can keep testing the flow without setting up SMTP.
   - WhatsApp: uses Meta's WhatsApp Cloud API. This is NOT a quick toggle —
     it requires a real Meta Business Platform account, a verified WhatsApp
     Business phone number, and (for anything beyond a 24-hour reply window)
     an approved message template — real-world approval, not just code.
     Set WAYME_WHATSAPP_TOKEN and WAYME_WHATSAPP_PHONE_ID once you have
     those. Without them, same demo fallback as email: the code comes back
     directly in the API response instead of actually being sent.
   ========================================================= */

const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const cors = require("cors");
const { Server } = require("socket.io");
const nodemailer = require("nodemailer");

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, "db.json");
// Set this to any string you like, then put the SAME string into
// ACCESS_KEY near the top of shared/js/mock-backend.js. Overridable via
// an environment variable so you don't have to hardcode it in code you
// might push to a public GitHub repo.
const ACCESS_KEY = process.env.WAYME_ACCESS_KEY || "wayme-demo-2026";

const app = express();
app.use(cors()); // demo-scale: allow any origin, including the WebView's appassets.androidplatform.net
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Reject any connection that doesn't present the shared key.
io.use((socket, next) => {
  if (socket.handshake.auth && socket.handshake.auth.key === ACCESS_KEY) return next();
  next(new Error("unauthorized: missing or incorrect access key"));
});

// Same shared-key gate for the plain REST verification endpoints below.
function requireKey(req, res, next) {
  if (req.headers["x-wayme-key"] === ACCESS_KEY) return next();
  return res.status(401).json({ ok: false, error: "unauthorized" });
}

// ---- email sending (real, if configured) ----
const SMTP_HOST = process.env.WAYME_SMTP_HOST || "";
const SMTP_PORT = Number(process.env.WAYME_SMTP_PORT || 587);
const SMTP_USER = process.env.WAYME_SMTP_USER || "";
const SMTP_PASS = process.env.WAYME_SMTP_PASS || "";
const SMTP_FROM = process.env.WAYME_SMTP_FROM || SMTP_USER;
const EMAIL_CONFIGURED = !!(SMTP_HOST && SMTP_USER && SMTP_PASS);
let mailer = null;
if (EMAIL_CONFIGURED) {
  mailer = nodemailer.createTransport({ host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_PORT === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } });
  console.log("Email verification: configured (SMTP host " + SMTP_HOST + ")");
} else {
  console.log("Email verification: NOT configured — codes will be returned directly in the API response for demo/testing (set WAYME_SMTP_* env vars for real sending).");
}

// ---- WhatsApp sending via Meta Cloud API (real, if configured) ----
const WHATSAPP_TOKEN = process.env.WAYME_WHATSAPP_TOKEN || "";
const WHATSAPP_PHONE_ID = process.env.WAYME_WHATSAPP_PHONE_ID || "";
const WHATSAPP_CONFIGURED = !!(WHATSAPP_TOKEN && WHATSAPP_PHONE_ID);
if (WHATSAPP_CONFIGURED) console.log("WhatsApp verification: configured");
else console.log("WhatsApp verification: NOT configured — needs a real Meta WhatsApp Business API account (see this file's header). Codes fall back to the demo response for now.");

const pendingCodes = {}; // destination -> { code, expiresAt } — in-memory only, not persisted
const CODE_TTL_MS = 10 * 60 * 1000;
function genCode() { return String(Math.floor(100000 + Math.random() * 900000)); }

async function sendEmailCode(toEmail, code) {
  if (!mailer) return { ok: false, demo: true };
  try {
    await mailer.sendMail({
      from: SMTP_FROM,
      to: toEmail,
      subject: "Your WAYME verification code",
      text: "Your WAYME verification code is: " + code + "\nThis code expires in 10 minutes.",
      html: "<p>Your WAYME verification code is: <strong style=\"font-size:20px;\">" + code + "</strong></p><p>This code expires in 10 minutes.</p>",
    });
    return { ok: true };
  } catch (err) {
    console.error("Failed to send verification email:", err.message);
    return { ok: false, error: err.message };
  }
}
async function sendWhatsAppCode(toPhone, code) {
  if (!WHATSAPP_CONFIGURED) return { ok: false, demo: true };
  try {
    const digits = toPhone.replace(/\D/g, "");
    const res = await fetch("https://graph.facebook.com/v20.0/" + WHATSAPP_PHONE_ID + "/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + WHATSAPP_TOKEN },
      body: JSON.stringify({ messaging_product: "whatsapp", to: digits, type: "text", text: { body: "Your WAYME verification code is: " + code + ". This code expires in 10 minutes." } }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error ? data.error.message : "WhatsApp API error" };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

app.post("/api/send-code", requireKey, async (req, res) => {
  const { destination, channel } = req.body || {};
  if (!destination || !channel) return res.status(400).json({ ok: false, error: "destination and channel are required" });
  const code = genCode();
  pendingCodes[destination] = { code, expiresAt: Date.now() + CODE_TTL_MS };

  const result = channel === "email" ? await sendEmailCode(destination, code)
    : channel === "whatsapp" ? await sendWhatsAppCode(destination, code)
    : null;
  if (!result) return res.status(400).json({ ok: false, error: "channel must be 'email' or 'whatsapp'" });
  if (result.ok) return res.json({ ok: true, delivered: true });
  // Demo fallback: real sending isn't configured, so hand the code back
  // directly in the response so the flow is still testable end to end.
  return res.json({ ok: true, delivered: false, demoCode: code });
});

app.post("/api/verify-code", requireKey, (req, res) => {
  const { destination, code } = req.body || {};
  const pending = pendingCodes[destination];
  if (!pending) return res.json({ ok: false, reason: "no_code_sent" });
  if (Date.now() > pending.expiresAt) { delete pendingCodes[destination]; return res.json({ ok: false, reason: "expired" }); }
  if (pending.code !== String(code || "").trim()) return res.json({ ok: false, reason: "incorrect" });
  delete pendingCodes[destination];
  res.json({ ok: true });
});

// ---- seed data (same shape as shared/js/mock-backend.js's seed()) ----
const HOME_LAT = -6.9932, HOME_LNG = 110.4203;
const DEMO_DRIVER_ID = "d_demo001";
const DEMO_USER_ID = "u_demo001";
function seed() {
  return {
    wallet: { [DEMO_USER_ID]: 250000, [DEMO_DRIVER_ID]: 1850000 },
    bookings: {},
    chats: {},
    users: {
      [DEMO_USER_ID]: {
        id: DEMO_USER_ID,
        name: "Rian Wijaya",
        phone: "+62 812 3456 7890",
        email: "",
        bankName: "BCA",
        bankAccount: "1234567890",
        suspended: false,
      },
    },
    drivers: {
      [DEMO_DRIVER_ID]: {
        id: DEMO_DRIVER_ID,
        name: "Andi Pratama",
        phone: "+62 813 9988 7766",
        email: "",
        rating: 4.9,
        vehicle: "Honda Vario · B 3921 WAY",
        online: false,
        suspended: false,
        bankName: "BCA",
        bankAccount: "0987654321",
        lat: HOME_LAT + 0.01,
        lng: HOME_LNG + 0.01,
      },
    },
    fareRates: {
      moto: { base: 5000, perKm: 2500, min: 8000 },
      car: { base: 10000, perKm: 4200, min: 18000 },
      air: { base: 250000, perKm: 18000, min: 350000 },
      food: { base: 6000, perKm: 2200, min: 9000 },
      package: { base: 8000, perKm: 2800, min: 12000 },
    },
    commissionRate: 0.15,
    discountRate: 0,
    platformCommissionEarned: 0,
    announcement: null,
  };
}

// ---- load persisted state, or seed a fresh one ----
let db;
try {
  db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  console.log("Loaded existing state from db.json");
} catch (e) {
  db = seed();
  console.log("No existing db.json found — starting from a fresh seed");
}

// Migrate an older single-account save (from before multi-user/driver
// accounts existed) into the new collections shape, so upgrading this
// file doesn't wipe out anyone's existing db.json.
if (!db.users && db.userProfile) {
  db.users = { [DEMO_USER_ID]: Object.assign({ id: DEMO_USER_ID }, db.userProfile) };
  delete db.userProfile;
}
if (!db.drivers && db.driver) {
  db.drivers = { [DEMO_DRIVER_ID]: Object.assign({ id: DEMO_DRIVER_ID }, db.driver) };
  delete db.driver;
}
if (!db.users) db.users = {};
if (!db.drivers) db.drivers = {};
if (!db.wallet) db.wallet = {};

function persist() {
  fs.writeFile(DB_FILE, JSON.stringify(db, null, 2), (err) => {
    if (err) console.error("Failed to persist db.json:", err.message);
  });
}

// ---- REST fallback (Socket.IO is the primary path; this is handy for
//      debugging in a browser, or a health check) ----
app.get("/api/state", (req, res) => {
  if (req.query.key !== ACCESS_KEY) return res.status(401).json({ error: "unauthorized" });
  res.json(db);
});
app.get("/health", (req, res) => res.json({ ok: true, connectedClients: io.engine.clientsCount }));

// ---- realtime sync ----
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id, "— total connected:", io.engine.clientsCount);

  // Send the current canonical state immediately on connect.
  socket.emit("state", db);

  // A client pushes its full local state after any mutation (see
  // save() in mock-backend.js). We accept it as the new canonical
  // state, persist it, and broadcast it to every OTHER connected client
  // so their local caches — and their UIs, via the existing db_updated
  // listeners already wired into all three apps — update in real time.
  socket.on("state", (incoming) => {
    if (!incoming || typeof incoming !== "object") return;
    db = incoming;
    persist();
    socket.broadcast.emit("state", db);
  });

  // A client can explicitly ask to be re-synced (e.g. after a
  // reconnect following a dropped connection).
  socket.on("get_state", () => {
    socket.emit("state", db);
  });

  // Lightweight, high-frequency path for the driver's live GPS position
  // during an animated trip (called many times per second) — deliberately
  // bypasses the whole-object 'state' path above so it can't clobber a
  // concurrent change to some other field (e.g. an admin fare-rate edit
  // landing at the same moment).
  socket.on("driver_location", (loc) => {
    if (!loc || typeof loc.lat !== "number" || typeof loc.lng !== "number" || !loc.driverId) return;
    if (!db.drivers[loc.driverId]) return;
    db.drivers[loc.driverId].lat = loc.lat;
    db.drivers[loc.driverId].lng = loc.lng;
    persist();
    socket.broadcast.emit("driver_location", loc);
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id, "— total connected:", io.engine.clientsCount);
  });
});

server.listen(PORT, () => {
  console.log("WAYME backend listening on http://localhost:" + PORT);
  console.log("Access key: " + ACCESS_KEY + " (set the SAME value in shared/js/mock-backend.js)");
  console.log("Point each app's shared/js/mock-backend.js SERVER_URL at this machine's address.");
});
