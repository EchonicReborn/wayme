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
   ========================================================= */

const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const cors = require("cors");
const { Server } = require("socket.io");

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

// ---- seed data (same shape as shared/js/mock-backend.js's seed()) ----
const HOME_LAT = -6.9932, HOME_LNG = 110.4203;
function seed() {
  return {
    wallet: { user: 250000, driver: 1850000 },
    bookings: {},
    chats: {},
    userProfile: {
      name: "Rian Wijaya",
      phone: "+62 812 3456 7890",
      bankName: "BCA",
      bankAccount: "1234567890",
      suspended: false,
    },
    driver: {
      name: "Andi Pratama",
      rating: 4.9,
      vehicle: "Honda Vario · B 3921 WAY",
      online: false,
      suspended: false,
      bankName: "BCA",
      bankAccount: "0987654321",
      lat: HOME_LAT + 0.01,
      lng: HOME_LNG + 0.01,
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
    if (!loc || typeof loc.lat !== "number" || typeof loc.lng !== "number") return;
    db.driver.lat = loc.lat;
    db.driver.lng = loc.lng;
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
