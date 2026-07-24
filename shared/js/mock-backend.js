/* =========================================================
   WAYME — Backend Bridge (real network sync via Socket.IO)
   ---------------------------------------------------------
   Real-time client for the actual server in server/server.js, so
   the three SEPARATELY INSTALLED apps (user, driver, admin) can
   genuinely talk to each other over the network.

   Every function below (createBooking, getBooking, pay, sendMessage,
   setCommissionRate, etc.) keeps the same name/signature the three
   apps' screens already expect — only load()/save()/the realtime
   event plumbing live inside this file.

   ⚠️ SETUP REQUIRED
   1. Run the server: `cd server && npm install && npm start`
   2. Set SERVER_URL below to wherever that server is reachable:
        - Same computer, browser tabs: "http://localhost:3000"
        - Android Emulator: "http://10.0.2.2:3000"
        - Phones on the same Wi-Fi: your computer's LAN IP
        - Real internet access from anywhere: deploy the server (Render's
          free tier works with no credit card — see README section 6) and
          use that public https:// URL instead.
   3. Set ACCESS_KEY below to the SAME value as ACCESS_KEY (or the
      WAYME_ACCESS_KEY environment variable) in server/server.js — this is
      a shared-secret gate so a stranger who finds your public URL can't
      read/write your data, NOT real per-user authentication.
   4. Every app loads the Socket.IO client from a CDN (see each app's
      index.html) — needs real internet access.
   ========================================================= */

const WAYME = (function () {
  const SERVER_URL = "https://suffering-relearn-unpinned.ngrok-free.dev"; // <-- point this at your running server
  const ACCESS_KEY = "wayme-demo-2026"; // <-- must match ACCESS_KEY (or WAYME_ACCESS_KEY env var) in server/server.js

  const HOME_LAT = -6.9932, HOME_LNG = 110.4203;

  const listeners = {};
  let cache = seed();
  let connected = false;

  function _emit(type, payload) { (listeners[type] || []).forEach((cb) => cb(payload)); }
  function on(type, cb) { listeners[type] = listeners[type] || []; listeners[type].push(cb); }

  let socket = null;
  if (typeof io !== "undefined") {
    socket = io(SERVER_URL, { transports: ["websocket", "polling"], auth: { key: ACCESS_KEY } });
    socket.on("connect", () => { connected = true; console.log("[WAYME] connected to backend at " + SERVER_URL); socket.emit("get_state"); });
    socket.on("disconnect", () => { connected = false; console.warn("[WAYME] disconnected from backend"); });
    socket.on("connect_error", (err) => { console.warn("[WAYME] couldn't reach backend at " + SERVER_URL + " (" + err.message + ")"); });
    socket.on("state", (incoming) => { if (!incoming || typeof incoming !== "object") return; cache = incoming; _emit("db_updated", {}); });
    socket.on("driver_location", (loc) => { if (!loc || typeof loc.lat !== "number") return; cache.driver.lat = loc.lat; cache.driver.lng = loc.lng; _emit("db_updated", {}); });
  } else {
    console.warn("[WAYME] Socket.IO client script not found — check each index.html loads it before mock-backend.js.");
  }

  function isConnected() { return connected; }

  function seed() {
    return {
      wallet: { user: 250000, driver: 1850000 },
      bookings: {}, chats: {},
      userProfile: { name: "Rian Wijaya", phone: "+62 812 3456 7890", bankName: "BCA", bankAccount: "1234567890", suspended: false },
      driver: { name: "Andi Pratama", rating: 4.9, vehicle: "Honda Vario · B 3921 WAY", online: false, suspended: false, bankName: "BCA", bankAccount: "0987654321", lat: HOME_LAT + 0.01, lng: HOME_LNG + 0.01 },
      fareRates: {
        moto: { base: 5000, perKm: 2500, min: 8000 }, car: { base: 10000, perKm: 4200, min: 18000 },
        air: { base: 250000, perKm: 18000, min: 350000 }, food: { base: 6000, perKm: 2200, min: 9000 }, package: { base: 8000, perKm: 2800, min: 12000 },
      },
      commissionRate: 0.15, discountRate: 0, platformCommissionEarned: 0, announcement: null,
    };
  }
  function seed_fareRates() {
    return { moto: { base: 5000, perKm: 2500, min: 8000 }, car: { base: 10000, perKm: 4200, min: 18000 }, air: { base: 250000, perKm: 18000, min: 350000 }, food: { base: 6000, perKm: 2200, min: 9000 }, package: { base: 8000, perKm: 2800, min: 12000 } };
  }

  function load() {
    if (!cache.fareRates) cache.fareRates = seed_fareRates();
    if (cache.driver && cache.driver.suspended === undefined) cache.driver.suspended = false;
    if (cache.driver && cache.driver.bankName === undefined) { cache.driver.bankName = "BCA"; cache.driver.bankAccount = "0987654321"; }
    if (!cache.userProfile) cache.userProfile = { name: "Rian Wijaya", phone: "+62 812 3456 7890", bankName: "BCA", bankAccount: "1234567890", suspended: false };
    if (cache.commissionRate === undefined) cache.commissionRate = 0.15;
    if (cache.discountRate === undefined) cache.discountRate = 0;
    if (cache.platformCommissionEarned === undefined) cache.platformCommissionEarned = 0;
    if (cache.announcement === undefined) cache.announcement = null;
    return cache;
  }
  function save(db) {
    cache = db;
    _emit("db_updated", {});
    if (socket && connected) socket.emit("state", db);
  }

  function haversineMeters(a, b) {
    const R = 6371000; const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function isInsideGeofence(center, radiusMeters, point) { return haversineMeters(center, point) <= radiusMeters; }
  function estimateFare(kind, distanceKm) {
    const db = load(); const rates = db.fareRates || seed_fareRates(); const r = rates[kind] || rates.moto;
    const base = Math.max(r.min, Math.round(r.base + distanceKm * r.perKm));
    const discount = db.discountRate || 0;
    return Math.round(base * (1 - discount));
  }
  function getFareRates() { return load().fareRates; }
  function setFareRates(kind, patch) { const db = load(); db.fareRates[kind] = Object.assign({}, db.fareRates[kind], patch); save(db); return db.fareRates[kind]; }

  function createBooking(details) {
    const db = load();
    const id = "WM" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
    db.bookings[id] = Object.assign({ id, status: "searching", createdAt: Date.now() }, details);
    db.chats[id] = [];
    save(db);
    return db.bookings[id];
  }
  function getBooking(id) { return load().bookings[id] || null; }
  function listBookings() { return Object.values(load().bookings).sort((a, b) => b.createdAt - a.createdAt); }
  function updateBooking(id, patch) { const db = load(); if (!db.bookings[id]) return null; db.bookings[id] = Object.assign(db.bookings[id], patch); save(db); return db.bookings[id]; }
  function cancelBooking(id, by) { return updateBooking(id, { status: "cancelled", cancelledBy: by }); }

  function setDriverOnline(isOnline) { const db = load(); db.driver.online = isOnline; save(db); }
  function getDriver() { return load().driver; }
  function updateDriverLocation(lat, lng) {
    cache.driver.lat = lat; cache.driver.lng = lng; _emit("db_updated", {});
    if (socket && connected) socket.emit("driver_location", { lat, lng });
  }
  function setDriverSuspended(isSuspended) { const db = load(); db.driver.suspended = isSuspended; if (isSuspended) db.driver.online = false; save(db); }
  function setDriverBankAccount(bankName, bankAccount) { const db = load(); db.driver.bankName = bankName; db.driver.bankAccount = bankAccount; save(db); }

  function getUserProfile() { return load().userProfile; }
  function setUserSuspended(isSuspended) { const db = load(); db.userProfile.suspended = isSuspended; save(db); }
  function setUserBankAccount(bankName, bankAccount) { const db = load(); db.userProfile.bankName = bankName; db.userProfile.bankAccount = bankAccount; save(db); }

  function getCommissionRate() { return load().commissionRate; }
  function setCommissionRate(rate) { const db = load(); db.commissionRate = Math.max(0, Math.min(1, rate)); save(db); }
  function getDiscountRate() { return load().discountRate; }
  function setDiscountRate(rate) { const db = load(); db.discountRate = Math.max(0, Math.min(1, rate)); save(db); }
  function getPlatformCommissionEarned() { return load().platformCommissionEarned || 0; }

  function setAnnouncement(text) { const db = load(); db.announcement = { text, ts: Date.now() }; save(db); }
  function getAnnouncement() { return load().announcement; }

  function sendMessage(bookingId, from, text) { const db = load(); if (!db.chats[bookingId]) db.chats[bookingId] = []; db.chats[bookingId].push({ from, text, ts: Date.now() }); save(db); }
  function getMessages(bookingId) { return load().chats[bookingId] || []; }

  function settleBooking(bookingId) {
    const db = load(); const b = db.bookings[bookingId];
    if (!b) return { ok: false, reason: "not_found" };
    if (b.settled) return { ok: true, already: true, amount: b.fare || b.total || 0 };
    const amount = b.fare || b.total || 0;
    if ((b.payMethod || "wallet") === "wallet") {
      if ((db.wallet.user || 0) < amount) return { ok: false, reason: "insufficient_balance" };
      db.wallet.user -= amount;
    }
    const commissionRate = db.commissionRate || 0;
    const commission = Math.round(amount * commissionRate);
    const driverEarning = amount - commission;
    db.wallet.driver = (db.wallet.driver || 0) + driverEarning;
    db.platformCommissionEarned = (db.platformCommissionEarned || 0) + commission;
    db.bookings[bookingId].settled = true;
    db.bookings[bookingId].commission = commission;
    db.bookings[bookingId].driverEarning = driverEarning;
    save(db);
    return { ok: true, amount, commission, driverEarning };
  }
  function reverseCommission(amount) { const db = load(); db.platformCommissionEarned = Math.max(0, (db.platformCommissionEarned || 0) - amount); save(db); }

  function getWallet(who) { return load().wallet[who] || 0; }
  function topUp(who, amount) { const db = load(); db.wallet[who] = (db.wallet[who] || 0) + amount; save(db); return db.wallet[who]; }
  function pay(who, amount) { const db = load(); if ((db.wallet[who] || 0) < amount) return { ok: false, reason: "insufficient_balance" }; db.wallet[who] -= amount; save(db); return { ok: true, balance: db.wallet[who] }; }

  function fmtIDR(n) { return "Rp" + Math.round(n).toLocaleString("id-ID"); }

  return {
    HOME_LAT, HOME_LNG, on,
    createBooking, getBooking, listBookings, updateBooking, cancelBooking,
    setDriverOnline, setDriverSuspended, setDriverBankAccount, getDriver, updateDriverLocation,
    getUserProfile, setUserSuspended, setUserBankAccount,
    getCommissionRate, setCommissionRate, getDiscountRate, setDiscountRate, getPlatformCommissionEarned, reverseCommission,
    sendMessage, getMessages, settleBooking,
    getWallet, topUp, pay,
    getFareRates, setFareRates, setAnnouncement, getAnnouncement,
    haversineMeters, isInsideGeofence, estimateFare, fmtIDR,
    isConnected,
    _load: load,
  };
})();
