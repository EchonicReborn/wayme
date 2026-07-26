/* =========================================================
   WAYME — Backend Bridge (real network sync via Socket.IO)
   ---------------------------------------------------------
   Real-time client for the actual server in server/server.js, so
   the three SEPARATELY INSTALLED apps (user, driver, admin) can
   genuinely talk to each other over the network.

   ⚠️ SETUP REQUIRED
   1. Run the server: `cd server && npm install && npm start`
   2. Set SERVER_URL below to wherever that server is reachable.
   3. Set ACCESS_KEY below to match server/server.js's ACCESS_KEY
      (or WAYME_ACCESS_KEY env var) — a shared-secret gate, not real
      per-user authentication.
   4. Every app loads the Socket.IO client from a CDN — needs real
      internet access.

   ⚠️ ACCOUNTS MODEL (read this if you're extending the code)
   Real multi-user / multi-driver accounts: `users` and `drivers` are
   now collections keyed by generated IDs, not single hardcoded
   objects. Each browser/device remembers which account it's logged
   in as via localStorage (`wayme_user_id` / `wayme_driver_id`) — this
   is just local "who am I on this device" bookkeeping, completely
   separate from the shared booking/wallet data that lives on the
   server. Login here is a demo phone-number lookup with no real SMS
   verification (any phone that doesn't match an existing account
   just prompts you to create one) — not real authentication.

   A `DEMO_DRIVER_ID` account is always seeded so a rider testing the
   user app solo (no driver app open) still gets auto-matched, exactly
   like earlier versions of this project.
   ========================================================= */

const WAYME = (function () {
  const SERVER_URL = "http://localhost:3000"; // <-- point this at your running server
  const ACCESS_KEY = "wayme-demo-2026"; // <-- must match ACCESS_KEY (or WAYME_ACCESS_KEY env var) in server/server.js

  const HOME_LAT = -6.9932, HOME_LNG = 110.4203;
  const DEMO_DRIVER_ID = "d_demo001";
  const DEMO_USER_ID = "u_demo001";

  const listeners = {};
  let cache = seed();
  let connected = false;

  // ---- local "who am I on this device" session (not shared/synced) ----
  let currentUserId = null, currentDriverId = null;
  try { currentUserId = localStorage.getItem("wayme_user_id") || null; } catch (e) {}
  try { currentDriverId = localStorage.getItem("wayme_driver_id") || null; } catch (e) {}

  function _emit(type, payload) { (listeners[type] || []).forEach((cb) => cb(payload)); }
  function on(type, cb) { listeners[type] = listeners[type] || []; listeners[type].push(cb); }

  let socket = null;
  if (typeof io !== "undefined") {
    socket = io(SERVER_URL, { transports: ["websocket", "polling"], auth: { key: ACCESS_KEY } });
    socket.on("connect", () => { connected = true; console.log("[WAYME] connected to backend at " + SERVER_URL); socket.emit("get_state"); });
    socket.on("disconnect", () => { connected = false; console.warn("[WAYME] disconnected from backend"); });
    socket.on("connect_error", (err) => { console.warn("[WAYME] couldn't reach backend at " + SERVER_URL + " (" + err.message + ")"); });
    socket.on("state", (incoming) => { if (!incoming || typeof incoming !== "object") return; cache = incoming; _emit("db_updated", {}); });
    socket.on("driver_location", (loc) => {
      if (!loc || typeof loc.lat !== "number" || !loc.driverId) return;
      if (cache.drivers[loc.driverId]) { cache.drivers[loc.driverId].lat = loc.lat; cache.drivers[loc.driverId].lng = loc.lng; }
      _emit("db_updated", {});
    });
  } else {
    console.warn("[WAYME] Socket.IO client script not found — check each index.html loads it before mock-backend.js.");
  }

  function isConnected() { return connected; }

  // ---- session expiry + PIN lock (device-local security, NOT synced to the
  // server — a PIN only protects this one device's session, same as how a
  // phone's lock screen PIN doesn't sync between devices either) ----
  const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 2 weeks

  function touchUserSession() { if (currentUserId) { try { localStorage.setItem("wayme_user_last_active", String(Date.now())); } catch (e) {} } }
  function touchDriverSession() { if (currentDriverId) { try { localStorage.setItem("wayme_driver_last_active", String(Date.now())); } catch (e) {} } }
  function isUserSessionExpired() {
    if (!currentUserId) return false;
    let last = 0; try { last = Number(localStorage.getItem("wayme_user_last_active") || 0); } catch (e) {}
    return last > 0 && Date.now() - last > SESSION_TTL_MS;
  }
  function isDriverSessionExpired() {
    if (!currentDriverId) return false;
    let last = 0; try { last = Number(localStorage.getItem("wayme_driver_last_active") || 0); } catch (e) {}
    return last > 0 && Date.now() - last > SESSION_TTL_MS;
  }

  async function sha256Hex(text) {
    const enc = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest("SHA-256", enc);
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  function pinKey(kind, id) { return "wayme_pin_" + kind + "_" + id; }

  function hasUserPin(userId) { try { return !!localStorage.getItem(pinKey("user", userId)); } catch (e) { return false; } }
  async function setUserPin(userId, pin) { const hash = await sha256Hex(pin); try { localStorage.setItem(pinKey("user", userId), hash); } catch (e) {} }
  async function verifyUserPin(userId, pin) {
    const hash = await sha256Hex(pin);
    let stored = null; try { stored = localStorage.getItem(pinKey("user", userId)); } catch (e) {}
    return !!stored && stored === hash;
  }
  function hasDriverPin(driverId) { try { return !!localStorage.getItem(pinKey("driver", driverId)); } catch (e) { return false; } }
  async function setDriverPin(driverId, pin) { const hash = await sha256Hex(pin); try { localStorage.setItem(pinKey("driver", driverId), hash); } catch (e) {} }
  async function verifyDriverPin(driverId, pin) {
    const hash = await sha256Hex(pin);
    let stored = null; try { stored = localStorage.getItem(pinKey("driver", driverId)); } catch (e) {}
    return !!stored && stored === hash;
  }

  function seed() {
    return {
      wallet: { [DEMO_USER_ID]: 250000, [DEMO_DRIVER_ID]: 1850000 },
      bookings: {}, chats: {},
      users: {
        [DEMO_USER_ID]: { id: DEMO_USER_ID, name: "Rian Wijaya", phone: "+62 812 3456 7890", email: "", bankName: "BCA", bankAccount: "1234567890", suspended: false },
      },
      drivers: {
        [DEMO_DRIVER_ID]: { id: DEMO_DRIVER_ID, name: "Andi Pratama", phone: "+62 813 9988 7766", email: "", rating: 4.9, vehicle: "Honda Vario · B 3921 WAY", online: false, suspended: false, bankName: "BCA", bankAccount: "0987654321", lat: HOME_LAT + 0.01, lng: HOME_LNG + 0.01 },
      },
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
    // backward-compatibility: upgrade an older single-account save into the new collections shape
    if (!cache.users && cache.userProfile) { cache.users = { [DEMO_USER_ID]: Object.assign({ id: DEMO_USER_ID }, cache.userProfile) }; delete cache.userProfile; }
    if (!cache.drivers && cache.driver) { cache.drivers = { [DEMO_DRIVER_ID]: Object.assign({ id: DEMO_DRIVER_ID }, cache.driver) }; delete cache.driver; }
    if (!cache.users) cache.users = {};
    if (!cache.drivers) cache.drivers = {};
    if (!cache.wallet) cache.wallet = {};
    Object.values(cache.users).forEach((u) => { if (u.email === undefined) u.email = ""; });
    Object.values(cache.drivers).forEach((d) => { if (d.email === undefined) d.email = ""; });
    if (!cache.fareRates) cache.fareRates = seed_fareRates();
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

  function genId(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function normalizePhoneForMatch(p) { return (p || "").replace(/\D/g, ""); }
  function isEmailIdentifier(value) { return typeof value === "string" && value.includes("@"); }

  // ---- users (accounts) ----
  function findUserByIdentifier(identifier) {
    const db = load();
    if (isEmailIdentifier(identifier)) {
      const target = identifier.trim().toLowerCase();
      return Object.values(db.users).find((u) => u.email && u.email.toLowerCase() === target) || null;
    }
    const target = normalizePhoneForMatch(identifier);
    return Object.values(db.users).find((u) => u.phone && normalizePhoneForMatch(u.phone) === target) || null;
  }
  function registerUser(name, identifier) {
    const db = load();
    if (findUserByIdentifier(identifier)) return { ok: false, reason: "already_registered" };
    const isEmail = isEmailIdentifier(identifier);
    const id = genId("u_");
    db.users[id] = { id, name, phone: isEmail ? "" : identifier, email: isEmail ? identifier.trim().toLowerCase() : "", bankName: "—", bankAccount: "—", suspended: false };
    db.wallet[id] = 100000; // small welcome balance so a new account can try a booking immediately
    save(db);
    setCurrentUserId(id);
    return { ok: true, user: db.users[id] };
  }
  function loginUser(identifier) {
    const u = findUserByIdentifier(identifier);
    if (!u) return { ok: false, reason: "not_found" };
    if (u.suspended) return { ok: false, reason: "suspended" };
    setCurrentUserId(u.id);
    return { ok: true, user: u };
  }
  function setCurrentUserId(id) { currentUserId = id; try { localStorage.setItem("wayme_user_id", id); localStorage.setItem("wayme_user_last_active", String(Date.now())); } catch (e) {} }
  function getCurrentUserId() { return currentUserId; }
  function getCurrentUser() { return currentUserId ? load().users[currentUserId] || null : null; }
  function logoutUser() { currentUserId = null; try { localStorage.removeItem("wayme_user_id"); } catch (e) {} }
  function listUsers() { return Object.values(load().users); }
  function getUserById(id) { return load().users[id] || null; }
  function setUserSuspended(id, isSuspended) { const db = load(); if (!db.users[id]) return; db.users[id].suspended = isSuspended; save(db); }
  function setUserBankAccount(id, bankName, bankAccount) { const db = load(); if (!db.users[id]) return; db.users[id].bankName = bankName; db.users[id].bankAccount = bankAccount; save(db); }

  // ---- drivers (accounts) ----
  function findDriverByIdentifier(identifier) {
    const db = load();
    if (isEmailIdentifier(identifier)) {
      const target = identifier.trim().toLowerCase();
      return Object.values(db.drivers).find((d) => d.email && d.email.toLowerCase() === target) || null;
    }
    const target = normalizePhoneForMatch(identifier);
    return Object.values(db.drivers).find((d) => d.phone && normalizePhoneForMatch(d.phone) === target) || null;
  }
  function registerDriver(name, identifier, vehicle) {
    const db = load();
    if (findDriverByIdentifier(identifier)) return { ok: false, reason: "already_registered" };
    const isEmail = isEmailIdentifier(identifier);
    const id = genId("d_");
    db.drivers[id] = { id, name, phone: isEmail ? "" : identifier, email: isEmail ? identifier.trim().toLowerCase() : "", vehicle, rating: 5.0, online: false, suspended: false, bankName: "—", bankAccount: "—", lat: HOME_LAT + (Math.random() - 0.5) * 0.02, lng: HOME_LNG + (Math.random() - 0.5) * 0.02 };
    db.wallet[id] = 0;
    save(db);
    setCurrentDriverId(id);
    return { ok: true, driver: db.drivers[id] };
  }
  function loginDriver(identifier) {
    const d = findDriverByIdentifier(identifier);
    if (!d) return { ok: false, reason: "not_found" };
    if (d.suspended) return { ok: false, reason: "suspended" };
    setCurrentDriverId(d.id);
    return { ok: true, driver: d };
  }
  function setCurrentDriverId(id) { currentDriverId = id; try { localStorage.setItem("wayme_driver_id", id); localStorage.setItem("wayme_driver_last_active", String(Date.now())); } catch (e) {} }
  function getCurrentDriverId() { return currentDriverId; }
  function getCurrentDriver() { return currentDriverId ? load().drivers[currentDriverId] || null : null; }
  function logoutDriver() { currentDriverId = null; try { localStorage.removeItem("wayme_driver_id"); } catch (e) {} }
  function listDrivers() { return Object.values(load().drivers); }
  function getDriverById(id) { return load().drivers[id] || null; }
  function setDriverSuspended(id, isSuspended) { const db = load(); if (!db.drivers[id]) return; db.drivers[id].suspended = isSuspended; if (isSuspended) db.drivers[id].online = false; save(db); }
  function setDriverBankAccount(id, bankName, bankAccount) { const db = load(); if (!db.drivers[id]) return; db.drivers[id].bankName = bankName; db.drivers[id].bankAccount = bankAccount; save(db); }
  function setDriverOnline(id, isOnline) { const db = load(); if (!db.drivers[id]) return; db.drivers[id].online = isOnline; save(db); }
  function updateDriverLocation(id, lat, lng) {
    if (!cache.drivers[id]) return;
    cache.drivers[id].lat = lat; cache.drivers[id].lng = lng;
    _emit("db_updated", {});
    if (socket && connected) socket.emit("driver_location", { driverId: id, lat, lng });
  }

  // ---- bookings ----
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

  function getCommissionRate() { return load().commissionRate; }
  function setCommissionRate(rate) { const db = load(); db.commissionRate = Math.max(0, Math.min(1, rate)); save(db); }
  function getDiscountRate() { return load().discountRate; }
  function setDiscountRate(rate) { const db = load(); db.discountRate = Math.max(0, Math.min(1, rate)); save(db); }
  function getPlatformCommissionEarned() { return load().platformCommissionEarned || 0; }

  function setAnnouncement(text) { const db = load(); db.announcement = { text, ts: Date.now() }; save(db); }
  function getAnnouncement() { return load().announcement; }

  function sendMessage(bookingId, from, text) { const db = load(); if (!db.chats[bookingId]) db.chats[bookingId] = []; db.chats[bookingId].push({ from, text, ts: Date.now() }); save(db); }
  function getMessages(bookingId) { return load().chats[bookingId] || []; }

  // Settlement now looks up the SPECIFIC user/driver involved in this booking
  // (booking.userId / booking.driverId), since there can be many of each now —
  // not the old hardcoded single "user"/"driver" wallet slots.
  function settleBooking(bookingId) {
    const db = load(); const b = db.bookings[bookingId];
    if (!b) return { ok: false, reason: "not_found" };
    if (b.settled) return { ok: true, already: true, amount: b.fare || b.total || 0 };
    const amount = b.fare || b.total || 0;
    const userId = b.userId, driverId = b.driverId;
    if ((b.payMethod || "wallet") === "wallet") {
      if (userId) {
        if ((db.wallet[userId] || 0) < amount) return { ok: false, reason: "insufficient_balance" };
        db.wallet[userId] -= amount;
      }
    }
    const commissionRate = db.commissionRate || 0;
    const commission = Math.round(amount * commissionRate);
    const driverEarning = amount - commission;
    if (driverId) db.wallet[driverId] = (db.wallet[driverId] || 0) + driverEarning;
    db.platformCommissionEarned = (db.platformCommissionEarned || 0) + commission;
    db.bookings[bookingId].settled = true;
    db.bookings[bookingId].commission = commission;
    db.bookings[bookingId].driverEarning = driverEarning;
    save(db);
    return { ok: true, amount, commission, driverEarning };
  }
  function reverseCommission(amount) { const db = load(); db.platformCommissionEarned = Math.max(0, (db.platformCommissionEarned || 0) - amount); save(db); }

  function getWallet(id) { return load().wallet[id] || 0; }
  function topUp(id, amount) { const db = load(); db.wallet[id] = (db.wallet[id] || 0) + amount; save(db); return db.wallet[id]; }
  function pay(id, amount) { const db = load(); if ((db.wallet[id] || 0) < amount) return { ok: false, reason: "insufficient_balance" }; db.wallet[id] -= amount; save(db); return { ok: true, balance: db.wallet[id] }; }

  function fmtIDR(n) { return "Rp" + Math.round(n).toLocaleString("id-ID"); }

  return {
    HOME_LAT, HOME_LNG, DEMO_DRIVER_ID, DEMO_USER_ID, on,
    createBooking, getBooking, listBookings, updateBooking, cancelBooking,
    findUserByIdentifier, registerUser, loginUser, getCurrentUserId, getCurrentUser, logoutUser, listUsers, getUserById, setUserSuspended, setUserBankAccount,
    findDriverByIdentifier, registerDriver, loginDriver, getCurrentDriverId, getCurrentDriver, logoutDriver, listDrivers, getDriverById,
    setDriverSuspended, setDriverBankAccount, setDriverOnline, updateDriverLocation,
    getCommissionRate, setCommissionRate, getDiscountRate, setDiscountRate, getPlatformCommissionEarned, reverseCommission,
    sendMessage, getMessages, settleBooking,
    getWallet, topUp, pay,
    getFareRates, setFareRates, setAnnouncement, getAnnouncement,
    haversineMeters, isInsideGeofence, estimateFare, fmtIDR,
    isConnected,
    touchUserSession, touchDriverSession, isUserSessionExpired, isDriverSessionExpired,
    hasUserPin, setUserPin, verifyUserPin, hasDriverPin, setDriverPin, verifyDriverPin,
    _load: load,
  };
})();
