/* WAYME User App — vanilla JS, no build step (WebView-friendly) */
const WayApp = (function () {
  const MAIN_TABS = ["home", "activity", "wallet", "chat", "profile"];

  const state = {
    phone: "", channel: "phone", signupName: null,
    ride: { pickup: null, drop: null, vehicle: "moto", fare: 0, distanceKm: 0, payMethod: "wallet" },
    food: { payMethod: "wallet" },
    package: { pickup: null, drop: null, fare: 0, payMethod: "wallet" },
    place: { selected: null, payMethod: "wallet" },
    payContext: null, pendingPayMethod: "wallet",
    bookingId: null, tripPhase: null, lastAnnouncementTs: 0,
    foodBookingId: null, foodOrderStep: 0, currentRestaurant: null, cart: {},
    transactions: [],
    restaurants: [
      { id: "r1", name: "Warung Bu Sari", cuisine: "Indonesian · Nasi & sambal", icon: "🍛", eta: "20–30 min", items: [{ id: "i1", name: "Nasi Campur", price: 22000 }, { id: "i2", name: "Ayam Geprek", price: 18000 }, { id: "i3", name: "Es Teh Manis", price: 5000 }] },
      { id: "r2", name: "Bakmi Jowo Pak To", cuisine: "Noodles · Javanese-Chinese", icon: "🍜", eta: "15–25 min", items: [{ id: "i4", name: "Bakmi Godog", price: 20000 }, { id: "i5", name: "Pangsit Goreng", price: 12000 }, { id: "i6", name: "Es Jeruk", price: 6000 }] },
      { id: "r3", name: "Loenpia Semarang 45", cuisine: "Local snacks", icon: "🥟", eta: "10–20 min", items: [{ id: "i7", name: "Loenpia Basah (2pcs)", price: 15000 }, { id: "i8", name: "Loenpia Goreng (2pcs)", price: 16000 }] },
    ],
    places: [
      { id: "p1", name: "Sky Horizon Hotel Semarang", icon: "🏨", price: 450000, rating: 4.7, address: "Jl. Pemuda, Semarang" },
      { id: "p2", name: "Kampoeng Batik Guesthouse", icon: "🏡", price: 280000, rating: 4.5, address: "Kampung Batik, Semarang" },
      { id: "p3", name: "Lawang Sewu View Suites", icon: "🏙️", price: 620000, rating: 4.8, address: "Jl. Pandanaran, Semarang" },
    ],
  };

  let rideMap, rideMarkerPickup, rideMarkerDrop, rideRouteLine;
  let findingMap;
  let tripMap, tripDriverMarker, tripRouteLine, geofenceCircle;
  let foodMap, pkgMap, pkgPickupMarker, pkgDropMarker, pkgRouteLine;

  function $(id) { return document.getElementById(id); }
  function escapeHtml(s) { return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function toast(msg) {
    const t = $("toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._tm); toast._tm = setTimeout(() => t.classList.remove("show"), 2400);
  }

  function go(id) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    const target = $("screen-" + id); if (target) target.classList.add("active");
    $("mainTabbar").classList.toggle("visible", MAIN_TABS.includes(id));
    if (MAIN_TABS.includes(id)) document.querySelectorAll(".tab-item").forEach((b) => b.classList.toggle("active", b.dataset.tab === id));
    if (!["login", "pin-lock", "pin-setup"].includes(id)) WAYME.touchUserSession();
    if (id === "home") { refreshWalletUI(); renderRecentHome(); setGreeting(); }
    if (id === "activity") renderActivity();
    if (id === "wallet") { refreshWalletUI(); renderWalletTx(); }
    if (id === "chat") renderChatList();
    if (id === "profile") renderProfile();
    if (id === "ride-setup") initRideMap();
    if (id === "package-form") initPkgMap();
    if (id === "places-list") renderPlaces();
    if (id === "food-home") renderRestaurants();
    if (id === "chat-active") renderChatMessages();
  }
  function switchTab(t) { go(t); }
  function setGreeting() {
    const h = new Date().getHours();
    $("homeGreeting").textContent = h < 11 ? "Good morning 👋" : h < 15 ? "Good afternoon 👋" : h < 19 ? "Good evening 👋" : "Good night 👋";
  }
  function renderProfile() {
    const profile = WAYME.getCurrentUser();
    if (profile) {
      $("profileBankInfo").textContent = profile.bankName + " · " + profile.bankAccount;
      $("profileName").textContent = profile.name;
      $("profilePhone").textContent = profile.phone;
      $("profileAvatar").textContent = (profile.name || "?").trim().charAt(0).toUpperCase();
    }
  }
  function isAccountSuspended() {
    const profile = WAYME.getCurrentUser();
    if (profile && profile.suspended) { toast("🚫 Your account is suspended by WAYME admin — contact support"); return true; }
    return false;
  }

  function selectChannel(ch) {
    state.channel = ch;
    $("tabPhone").classList.toggle("active", ch === "phone");
    $("tabEmail").classList.toggle("active", ch === "email");
    $("phoneFieldWrap").style.display = ch === "phone" ? "block" : "none";
    $("emailFieldWrap").style.display = ch === "email" ? "block" : "none";
  }
  function checkIdentifier() {
    let identifier;
    if (state.channel === "email") {
      const email = $("emailInput").value.trim();
      if (!email || !email.includes("@")) { toast("Enter a valid email address"); return; }
      identifier = email.toLowerCase();
    } else {
      const local = $("phoneInput").value.trim();
      if (!local) { toast("Enter your phone number"); return; }
      identifier = "+62 " + local;
    }
    state.phone = identifier; // reused by the existing returning-login OTP step below
    const existing = WAYME.findUserByIdentifier(identifier);
    $("loginStep1").style.display = "none";
    if (existing) {
      $("phoneEcho").textContent = identifier;
      $("loginStep2").style.display = "block";
    } else {
      $("loginStep1b").style.display = "block";
    }
  }
  function backToPhone() {
    $("loginStep1").style.display = "block";
    $("loginStep2").style.display = "none";
    $("loginStep1b").style.display = "none";
    $("loginStep1c").style.display = "none";
  }
  function verifyOtp() {
    const otp = $("otpInput").value.trim();
    if (otp.length < 4) { toast("Enter the 4-digit code"); return; }
    const r = WAYME.loginUser(state.phone);
    if (!r.ok) {
      toast(r.reason === "suspended" ? "🚫 This account is suspended — contact support" : "Couldn't find that account — check the number and try again");
      return;
    }
    afterLogin();
  }
  async function sendSignupCode() {
    const name = $("signupName").value.trim();
    if (!name) { toast("Enter your name"); return; }
    state.signupName = name;
    toast("Sending your verification code…");
    const result = await WayVerify.sendCode(state.phone, state.channel === "email" ? "email" : "whatsapp");
    if (!result.ok) { toast("Couldn't send the code — try again"); return; }
    $("loginStep1b").style.display = "none";
    $("loginStep1c").style.display = "block";
    if (result.delivered) {
      $("verifyChannelNote").textContent = (state.channel === "email" ? "We emailed a code to " : "We sent a WhatsApp code to ") + state.phone;
    } else {
      $("verifyChannelNote").innerHTML = "Demo mode — real " + (state.channel === "email" ? "email" : "WhatsApp") + " delivery isn't configured on the server, so here's your code: <strong>" + result.demoCode + "</strong>";
    }
  }
  async function verifySignupCode() {
    const code = $("signupCodeInput").value.trim();
    if (!code) { toast("Enter the code"); return; }
    const result = await WayVerify.verifyCode(state.phone, code);
    if (!result.ok) { toast(result.reason === "expired" ? "Code expired — go back and resend" : "Incorrect code"); return; }
    const r = WAYME.registerUser(state.signupName, state.phone);
    if (!r.ok) { toast("That's already registered — go back and log in instead"); return; }
    toast("Welcome to WAYME, " + state.signupName + "! Rp100,000 added to get you started.");
    afterLogin();
  }
  function afterLogin() {
    $("phoneInput").value = ""; $("emailInput").value = ""; $("otpInput").value = ""; $("signupName").value = ""; $("signupCodeInput").value = "";
    const uid = WAYME.getCurrentUserId();
    if (uid && !WAYME.hasUserPin(uid)) { go("pin-setup"); return; }
    go("home");
  }
  async function savePinSetup() {
    const pin = $("pinSetupInput").value.trim(); const confirm = $("pinSetupConfirm").value.trim();
    if (!/^\d{4}$/.test(pin)) { toast("Enter a 4-digit PIN"); return; }
    if (pin !== confirm) { toast("PINs don't match — try again"); return; }
    const uid = WAYME.getCurrentUserId();
    await WAYME.setUserPin(uid, pin);
    $("pinSetupInput").value = ""; $("pinSetupConfirm").value = "";
    toast("PIN set — your account is protected on this device");
    go("home");
  }
  function showPinLock() {
    const u = WAYME.getCurrentUser();
    if (u) { $("pinLockName").textContent = u.name; $("pinLockAvatar").textContent = (u.name || "?").trim().charAt(0).toUpperCase(); }
    $("pinLockInput").value = "";
    go("pin-lock");
  }
  async function unlockWithPin() {
    const pin = $("pinLockInput").value.trim();
    const uid = WAYME.getCurrentUserId();
    const ok = await WAYME.verifyUserPin(uid, pin);
    if (!ok) { toast("Incorrect PIN — try again"); $("pinLockInput").value = ""; return; }
    WAYME.touchUserSession();
    $("pinLockInput").value = "";
    go("home");
  }
  function logout() {
    WAYME.logoutUser();
    $("loginStep1").style.display = "block"; $("loginStep2").style.display = "none"; $("loginStep1b").style.display = "none"; $("loginStep1c").style.display = "none";
    $("phoneInput").value = ""; $("emailInput").value = ""; $("otpInput").value = ""; $("signupName").value = ""; $("signupCodeInput").value = "";
    go("login");
  }

  function refreshWalletUI() {
    const bal = WAYME.getWallet(WAYME.getCurrentUserId());
    $("homeWalletBalance").textContent = WAYME.fmtIDR(bal);
    $("walletBalanceBig").textContent = WAYME.fmtIDR(bal);
    if ($("payWalletBalance")) $("payWalletBalance").textContent = "Balance " + WAYME.fmtIDR(bal);
  }
  function renderWalletTx() {
    const el = $("walletTxList");
    if (!state.transactions.length) { el.innerHTML = '<p class="muted">No transactions yet.</p>'; return; }
    el.innerHTML = state.transactions.slice(0, 20).map((tx) => `
      <div class="card" style="display:flex; justify-content:space-between; margin-bottom:10px;">
        <div><strong>${escapeHtml(tx.label)}</strong><p class="muted" style="margin:2px 0 0;">${new Date(tx.ts).toLocaleString()}</p></div>
        <strong>-${WAYME.fmtIDR(tx.amount)}</strong>
      </div>`).join("");
  }
  function pushTransaction(label, amount) { state.transactions.unshift({ label, amount, ts: Date.now() }); }
  function openTopUp() { openSheet("sheetTopUp"); }
  function doTopUp(amount) { WAYME.topUp(WAYME.getCurrentUserId(), amount); refreshWalletUI(); closeSheets(); toast("Topped up " + WAYME.fmtIDR(amount)); }
  function processPayment(amount, method, label) {
    if (method === "wallet") { const r = WAYME.pay(WAYME.getCurrentUserId(), amount); if (!r.ok) { toast("Insufficient wallet balance — top up first"); return false; } }
    pushTransaction(label + " (" + method + ")", amount); refreshWalletUI(); return true;
  }

  function openSheet(id) { $(id).classList.add("open"); $("scrim").classList.add("open"); }
  function closeSheets() { document.querySelectorAll(".sheet").forEach((s) => s.classList.remove("open")); $("scrim").classList.remove("open"); }
  function openPaymentSheet(context) {
    state.payContext = context;
    const current = state[context === "ride" ? "ride" : context === "package" ? "package" : context].payMethod || "wallet";
    state.pendingPayMethod = current;
    document.querySelectorAll(".pay-option").forEach((el) => el.classList.toggle("selected", el.dataset.m === current));
    $("qrPreview").style.display = current === "qr" ? "block" : "none";
    $("payWalletBalance").textContent = "Balance " + WAYME.fmtIDR(WAYME.getWallet(WAYME.getCurrentUserId()));
    openSheet("sheetPayment");
  }
  function selectPayMethod(m) {
    state.pendingPayMethod = m;
    document.querySelectorAll(".pay-option").forEach((el) => el.classList.toggle("selected", el.dataset.m === m));
    $("qrPreview").style.display = m === "qr" ? "block" : "none";
  }
  function confirmPayMethod() {
    const m = state.pendingPayMethod;
    const label = m === "wallet" ? "💳 WAYME Wallet" : m === "card" ? "💳 Visa •••• 4821" : "🔳 QR Pay";
    if (state.payContext === "ride") { state.ride.payMethod = m; $("ridePayChip").textContent = label; }
    if (state.payContext === "food") { state.food.payMethod = m; $("foodPayChip").textContent = label; }
    if (state.payContext === "package") { state.package.payMethod = m; $("pkgPayChip").textContent = label; }
    if (state.payContext === "place") { state.place.payMethod = m; $("placePayChip").textContent = label; }
    closeSheets();
  }

  // ---------- ride setup + map (OpenStreetMap) ----------
  function initRideMap() {
    if (rideMap) { WayMaps.resize(rideMap); return; }
    WayMaps.ready(() => {
      rideMap = WayMaps.createMap("mapRideSetup", { lat: WAYME.HOME_LAT, lng: WAYME.HOME_LNG }, 14);
      rideMap.on("click", (e) => onRideMapClick(e.latlng.lat, e.latlng.lng));
      WayMaps.attachAutocomplete($("pickupLabel"), { lat: WAYME.HOME_LAT, lng: WAYME.HOME_LNG }, (r) => setRidePickup(r.lat, r.lng, r.label));
      WayMaps.attachAutocomplete($("dropLabel"), { lat: WAYME.HOME_LAT, lng: WAYME.HOME_LNG }, (r) => setRideDrop(r.lat, r.lng, r.label));
    });
  }
  function onRideMapClick(lat, lng) {
    if (!state.ride.pickup) setRidePickup(lat, lng, null);
    else if (!state.ride.drop) setRideDrop(lat, lng, null);
    else { resetRideSetup(); setRidePickup(lat, lng, null); }
  }
  function setRidePickup(lat, lng, label) {
    state.ride.pickup = { lat, lng };
    if (rideMarkerPickup) rideMarkerPickup.setMap(null);
    rideMarkerPickup = WayMaps.dotMarker(rideMap, { lat, lng }, "#0EA5E9");
    rideMap.panTo([lat, lng]);
    $("pickupLabel").value = label || lat.toFixed(4) + ", " + lng.toFixed(4);
    $("mapHint").innerHTML = "Now set your <strong>drop-off</strong> point.";
    if (!label) WayMaps.reverseGeocode(lat, lng).then((addr) => { if (addr) $("pickupLabel").value = addr; });
  }
  async function setRideDrop(lat, lng, label) {
    state.ride.drop = { lat, lng };
    if (rideMarkerDrop) rideMarkerDrop.setMap(null);
    rideMarkerDrop = WayMaps.dotMarker(rideMap, { lat, lng }, "#FBBF24");
    $("dropLabel").value = label || lat.toFixed(4) + ", " + lng.toFixed(4);
    $("mapHint").textContent = "Calculating your route…";
    if (!label) WayMaps.reverseGeocode(lat, lng).then((addr) => { if (addr) $("dropLabel").value = addr; });
    await updateFareEstimates();
    $("mapHint").innerHTML = "Great — pick your ride below.";
    $("confirmRideBtn").disabled = false; $("confirmRideBtn").textContent = "Confirm ride";
  }
  async function updateFareEstimates() {
    const route = await WayMaps.computeRoute(state.ride.pickup, state.ride.drop);
    const distKm = route ? route.distanceMeters / 1000 : (WAYME.haversineMeters(state.ride.pickup, state.ride.drop) / 1000) * 1.3;
    state.ride.distanceKm = distKm; state.ride.routePath = route ? route.path : null;
    $("fareMoto").textContent = WAYME.fmtIDR(WAYME.estimateFare("moto", distKm));
    $("fareCar").textContent = WAYME.fmtIDR(WAYME.estimateFare("car", distKm));
    $("fareAir").textContent = WAYME.fmtIDR(WAYME.estimateFare("air", distKm));
    if (rideRouteLine) rideRouteLine.setMap(null);
    if (route) { rideRouteLine = WayMaps.polyline(rideMap, route.path, { strokeColor: "#0369A1", strokeWeight: 4 }); WayMaps.fitBounds(rideMap, route.path); }
  }
  function selectVehicle(kind) {
    state.ride.vehicle = kind;
    document.querySelectorAll(".vehicle-tab").forEach((t) => t.classList.toggle("active", t.dataset.kind === kind));
  }
  function confirmRide() {
    if (!state.ride.pickup || !state.ride.drop) return;
    if (isAccountSuspended()) return;
    const fare = WAYME.estimateFare(state.ride.vehicle, state.ride.distanceKm);
    state.ride.fare = fare;
    const booking = WAYME.createBooking({ type: "ride", vehicle: state.ride.vehicle, pickup: state.ride.pickup, drop: state.ride.drop, fare, payMethod: state.ride.payMethod, userId: WAYME.getCurrentUserId() });
    state.bookingId = booking.id; state.matchHandled = false;
    go("finding"); initFindingMap();
    state.matchTimer = setTimeout(() => simulateMatch(), 6000);
  }
  function cancelSearch() {
    if (state.bookingId) WAYME.cancelBooking(state.bookingId, "user");
    clearTimeout(state.matchTimer); resetRideSetup(); go("home");
  }
  function resetRideSetup() {
    state.ride.pickup = null; state.ride.drop = null;
    if (rideMarkerPickup) rideMarkerPickup.setMap(null);
    if (rideMarkerDrop) rideMarkerDrop.setMap(null);
    if (rideRouteLine) rideRouteLine.setMap(null);
    if ($("pickupLabel")) $("pickupLabel").value = "";
    if ($("dropLabel")) $("dropLabel").value = "";
    if ($("confirmRideBtn")) { $("confirmRideBtn").disabled = true; $("confirmRideBtn").textContent = "Set pickup & drop-off"; }
    if ($("mapHint")) $("mapHint").innerHTML = "Type an address below, or tap the map to set your <strong>pickup</strong> point.";
  }

  function initFindingMap() {
    WayMaps.ready(() => {
      findingMap = WayMaps.createMap("mapFinding", state.ride.pickup, 15);
      findingMap.dragging.disable(); findingMap.scrollWheelZoom.disable();
      WayMaps.marker(findingMap, state.ride.pickup);
    });
  }
  async function simulateMatch() {
    if (state.matchHandled) return;
    const existing = WAYME.getBooking(state.bookingId);
    if (!existing || existing.status !== "searching") return;
    const demoDriver = WAYME.getDriverById(WAYME.DEMO_DRIVER_ID);
    const booking = WAYME.updateBooking(state.bookingId, { status: "matched", driverId: WAYME.DEMO_DRIVER_ID, driverName: demoDriver.name, driverVehicle: demoDriver.vehicle, driverRating: demoDriver.rating });
    WAYME.setDriverOnline(WAYME.DEMO_DRIVER_ID, true);
    const rawLat = state.ride.pickup.lat + (Math.random() - 0.5) * 0.01;
    const rawLng = state.ride.pickup.lng + (Math.random() - 0.5) * 0.01;
    const snapped = await WayMaps.snapToRoads([{ lat: rawLat, lng: rawLng }]);
    const dLat = snapped[0] ? snapped[0].lat : rawLat, dLng = snapped[0] ? snapped[0].lng : rawLng;
    WAYME.updateDriverLocation(WAYME.DEMO_DRIVER_ID, dLat, dLng);
    state.matchHandled = true; startTrip(booking);
  }

  async function startTrip(booking) {
    $("tripDriverName").textContent = booking.driverName;
    $("tripVehicleInfo").textContent = booking.driverVehicle + " · ⭐ " + booking.driverRating;
    $("tripPickupText").textContent = "Pickup point"; $("tripDropText").textContent = "Drop-off point";
    $("tripFare").textContent = WAYME.fmtIDR(booking.fare);
    $("tripStatusChip").textContent = "Driver arriving"; $("tripEta").textContent = "…";
    $("tripActionBtn").textContent = "Simulate: driver arrived";
    $("geofenceBanner").style.display = "none";
    state.tripPhase = "arriving";
    go("trip"); initTripMap(booking);
    const driver = WAYME.getDriverById(booking.driverId);
    const route = driver ? await WayMaps.computeRoute(driver, booking.pickup) : null;
    $("tripEta").textContent = route ? route.durationText : "~4 min";
  }
  function initTripMap(booking) {
    const p = booking.pickup, d = booking.drop, driver = WAYME.getDriverById(booking.driverId);
    WayMaps.ready(() => {
      tripMap = WayMaps.createMap("mapTrip", p, 14);
      WayMaps.fitBounds(tripMap, [p, d]);
      WayMaps.dotMarker(tripMap, p, "#0EA5E9");
      WayMaps.dotMarker(tripMap, d, "#FBBF24");
      geofenceCircle = WayMaps.circle(tripMap, d, 300, { strokeColor: "#FBBF24", fillColor: "#FBBF24", fillOpacity: 0.12, strokeWeight: 1.5 });
      tripDriverMarker = WayMaps.emojiMarker(tripMap, driver || p, "🛵");
      drawRoute(driver || p, p);
    });
  }
  async function drawRoute(from, to) {
    if (tripRouteLine) tripRouteLine.setMap(null);
    const reuse = state.ride.routePath && to === state.ride.drop;
    const route = reuse ? { path: state.ride.routePath } : await WayMaps.computeRoute(from, to);
    const path = route ? route.path : [from, to];
    tripRouteLine = WayMaps.polyline(tripMap, path, { strokeColor: "#0369A1", strokeWeight: 4 });
  }
  function animateMarkerTo(marker, target, cb) {
    const start = marker.getLatLng();
    const startLat = start.lat, startLng = start.lng;
    const steps = 20; let i = 0;
    const iv = setInterval(() => {
      i++;
      const lat = startLat + (target.lat - startLat) * (i / steps);
      const lng = startLng + (target.lng - startLng) * (i / steps);
      marker.setLatLng([lat, lng]);
      WAYME.updateDriverLocation(lat, lng);
      if (i >= steps) { clearInterval(iv); cb && cb(); }
    }, 55);
  }
  function driverSimAdvance() {
    const booking = WAYME.getBooking(state.bookingId);
    if (!booking) return;
    if (state.tripPhase === "arriving") {
      animateMarkerTo(tripDriverMarker, booking.pickup, () => {
        state.tripPhase = "arrived"; $("tripStatusChip").textContent = "Driver arrived"; $("tripActionBtn").textContent = "Simulate: start trip";
        WAYME.updateBooking(state.bookingId, { status: "arrived" });
      });
    } else if (state.tripPhase === "arrived") {
      state.tripPhase = "ongoing"; $("tripStatusChip").textContent = "On the way"; $("tripActionBtn").textContent = "Simulate: approach destination";
      WAYME.updateBooking(state.bookingId, { status: "ongoing" }); drawRoute(booking.pickup, booking.drop);
    } else if (state.tripPhase === "ongoing") {
      const mid = { lat: booking.pickup.lat + (booking.drop.lat - booking.pickup.lat) * 0.85, lng: booking.pickup.lng + (booking.drop.lng - booking.pickup.lng) * 0.85 };
      animateMarkerTo(tripDriverMarker, mid, () => {
        if (WAYME.isInsideGeofence(booking.drop, 300, mid)) $("geofenceBanner").style.display = "block";
        state.tripPhase = "near"; $("tripActionBtn").textContent = "Simulate: arrive at destination";
      });
    } else if (state.tripPhase === "near") {
      animateMarkerTo(tripDriverMarker, booking.drop, () => completeTrip(booking));
    }
  }
  function completeTrip(booking) {
    state.tripPhase = "done";
    WAYME.updateBooking(state.bookingId, { status: "completed" });
    const result = WAYME.settleBooking(booking.id);
    if (!result.ok && result.reason === "insufficient_balance") toast("Insufficient wallet balance — top up to settle this trip");
    else if (result.ok && !result.already) pushTransaction("Ride · " + booking.vehicle + " (" + (booking.payMethod || "wallet") + ")", result.amount);
    refreshWalletUI();
    $("rateDriverName").textContent = booking.driverName;
    $("rateFareAmount").textContent = WAYME.fmtIDR(booking.fare);
    $("geofenceBanner").style.display = "none";
    document.querySelectorAll("#ratingStars span").forEach((s) => s.classList.remove("on"));
    resetRideSetup(); go("rate");
  }
  function finishRating() { go("home"); }
  function minimizeTrip() { go("home"); }
  function sosAlert() { toast("🛟 Emergency contacts notified (demo)"); }
  function callDriver() { toast("📞 Calling driver… (demo)"); }
  function openChat() { go("chat-active"); }

  function renderChatMessages() {
    const msgs = state.bookingId ? WAYME.getMessages(state.bookingId) : [];
    const el = $("chatMessages");
    el.innerHTML = msgs.map((m) => `<div class="chat-bubble ${m.from === "user" ? "me" : "them"}">${escapeHtml(m.text)}<span class="chat-time">${new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></div>`).join("") || '<p class="muted">Say hi to your driver 👋</p>';
    el.scrollTop = el.scrollHeight;
  }
  function sendChat() {
    const input = $("chatInput"); const text = input.value.trim();
    if (!text || !state.bookingId) return;
    WAYME.sendMessage(state.bookingId, "user", text); input.value = ""; renderChatMessages();
  }
  function renderChatList() {
    const el = $("chatListBody");
    const booking = state.bookingId ? WAYME.getBooking(state.bookingId) : null;
    if (!booking || booking.type !== "ride") { el.innerHTML = '<p class="muted">Chat with your driver appears here once you have an active trip.</p>'; return; }
    el.innerHTML = `<div class="chat-list-item" onclick="WayApp.openChat()">
      <div class="avatar" style="width:44px;height:44px;display:flex;align-items:center;justify-content:center;background:var(--sky-500);color:white;font-weight:700;">A</div>
      <div style="flex:1;"><strong>${booking.driverName || "Driver"}</strong><p class="muted" style="margin:2px 0 0;">Tap to open chat</p></div>
    </div>`;
  }

  function labelForType(t) { return { ride: "🛵 Ride", food: "🍜 Food delivery", package: "📦 Package", place: "🏨 Stay reservation" }[t] || t; }
  function renderActivity() {
    const list = WAYME.listBookings(); const el = $("activityList");
    if (!list.length) { el.innerHTML = '<p class="muted">Nothing here yet.</p>'; return; }
    el.innerHTML = list.map((b) => `
      <div class="card" style="margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center;"><strong>${labelForType(b.type)}</strong><span class="chip">${b.status}</span></div>
        <p class="muted" style="margin:6px 0 0;">${b.id} · ${new Date(b.createdAt).toLocaleString()}</p>
        <p style="margin:6px 0 0; font-weight:700;">${WAYME.fmtIDR(b.fare || b.total || 0)}</p>
      </div>`).join("");
  }
  function renderRecentHome() {
    const list = WAYME.listBookings().slice(0, 3); const el = $("recentActivityList");
    if (!list.length) { el.innerHTML = '<p class="muted">No trips yet — book your first ride above.</p>'; return; }
    el.innerHTML = list.map((b) => `<div class="card"><div style="display:flex; justify-content:space-between;"><strong>${labelForType(b.type)}</strong><span class="chip">${b.status}</span></div></div>`).join("");
  }

  function renderRestaurants() {
    $("restaurantList").innerHTML = state.restaurants.map((r) => `
      <div class="restaurant-card" onclick="WayApp.openRestaurant('${r.id}')">
        <div class="restaurant-thumb">${r.icon}</div>
        <div style="flex:1;"><strong>${r.name}</strong><p class="muted" style="margin:2px 0;">${r.cuisine}</p><span class="chip">⏱ ${r.eta}</span></div>
      </div>`).join("");
  }
  function openRestaurant(id) {
    state.currentRestaurant = state.restaurants.find((r) => r.id === id); state.cart = {};
    $("menuRestaurantName").textContent = state.currentRestaurant.name;
    renderMenu(); updateCartBar(); go("food-menu");
  }
  function renderMenu() {
    $("menuList").innerHTML = state.currentRestaurant.items.map((it) => `
      <div class="menu-item">
        <div class="menu-item-info"><strong>${it.name}</strong><p class="muted" style="margin:2px 0 0;">${WAYME.fmtIDR(it.price)}</p></div>
        <div class="qty-control">
          <button class="qty-btn" onclick="WayApp.changeQty('${it.id}',-1)">−</button>
          <span id="qty-${it.id}">${state.cart[it.id] || 0}</span>
          <button class="qty-btn" onclick="WayApp.changeQty('${it.id}',1)">+</button>
        </div>
      </div>`).join("");
  }
  function changeQty(itemId, delta) {
    const next = Math.max(0, (state.cart[itemId] || 0) + delta);
    if (next === 0) delete state.cart[itemId]; else state.cart[itemId] = next;
    $("qty-" + itemId).textContent = state.cart[itemId] || 0; updateCartBar();
  }
  function cartTotal() {
    let total = 0;
    for (const id in state.cart) { const item = state.currentRestaurant.items.find((i) => i.id === id); total += item.price * state.cart[id]; }
    return total;
  }
  function updateCartBar() {
    const count = Object.values(state.cart).reduce((a, b) => a + b, 0); const bar = $("cartBar");
    if (count > 0) { bar.style.display = "flex"; $("cartSummary").textContent = count + " item" + (count > 1 ? "s" : "") + " · " + WAYME.fmtIDR(cartTotal()); }
    else bar.style.display = "none";
  }
  function goToFoodCheckout() {
    $("cartItemsList").innerHTML = Object.keys(state.cart).map((id) => {
      const item = state.currentRestaurant.items.find((i) => i.id === id);
      return `<div class="menu-item"><span>${item.name} × ${state.cart[id]}</span><strong>${WAYME.fmtIDR(item.price * state.cart[id])}</strong></div>`;
    }).join("");
    $("foodTotal").textContent = WAYME.fmtIDR(cartTotal() + 9000); go("food-checkout");
  }
  function placeFoodOrder() {
    if (isAccountSuspended()) return;
    const total = cartTotal() + 9000;
    if (total <= 9000) { toast("Add at least one item to your cart"); return; }
    const ok = processPayment(total, state.food.payMethod, "Food · " + state.currentRestaurant.name);
    if (ok === false) return;
    const booking = WAYME.createBooking({ type: "food", restaurant: state.currentRestaurant.name, total, status: "confirmed" });
    state.foodBookingId = booking.id; state.foodOrderStep = 0;
    go("food-tracking"); initFoodMap(); updateFoodProgress();
  }
  function initFoodMap() {
    WayMaps.ready(() => {
      foodMap = WayMaps.createMap("mapFood", { lat: WAYME.HOME_LAT, lng: WAYME.HOME_LNG }, 14);
      WayMaps.marker(foodMap, { lat: WAYME.HOME_LAT, lng: WAYME.HOME_LNG }, { title: "Delivery address" });
    });
  }
  function updateFoodProgress() {
    document.querySelectorAll("#foodProgress .op-step").forEach((el, i) => { el.classList.toggle("active", i === state.foodOrderStep); el.classList.toggle("done", i < state.foodOrderStep); });
  }
  function advanceFoodOrder() {
    state.foodOrderStep = Math.min(3, state.foodOrderStep + 1); updateFoodProgress();
    if (state.foodOrderStep === 3) { WAYME.updateBooking(state.foodBookingId, { status: "delivered" }); toast("Order delivered! Enjoy 🍽️"); }
  }

  function initPkgMap() {
    if (pkgMap) { WayMaps.resize(pkgMap); return; }
    WayMaps.ready(() => {
      pkgMap = WayMaps.createMap("mapPackage", { lat: WAYME.HOME_LAT, lng: WAYME.HOME_LNG }, 14);
      pkgMap.on("click", (e) => onPkgMapClick(e.latlng.lat, e.latlng.lng));
      WayMaps.attachAutocomplete($("pkgPickupLabel"), { lat: WAYME.HOME_LAT, lng: WAYME.HOME_LNG }, (r) => setPkgPickup(r.lat, r.lng, r.label));
      WayMaps.attachAutocomplete($("pkgDropLabel"), { lat: WAYME.HOME_LAT, lng: WAYME.HOME_LNG }, (r) => setPkgDrop(r.lat, r.lng, r.label));
    });
  }
  function onPkgMapClick(lat, lng) {
    if (!state.package.pickup) setPkgPickup(lat, lng, null);
    else if (!state.package.drop) setPkgDrop(lat, lng, null);
    else { resetPkgSetup(); setPkgPickup(lat, lng, null); }
  }
  function setPkgPickup(lat, lng, label) {
    state.package.pickup = { lat, lng };
    if (pkgPickupMarker) pkgPickupMarker.setMap(null);
    pkgPickupMarker = WayMaps.dotMarker(pkgMap, { lat, lng }, "#0EA5E9");
    pkgMap.panTo([lat, lng]);
    $("pkgPickupLabel").value = label || lat.toFixed(4) + ", " + lng.toFixed(4);
    $("pkgMapHint").innerHTML = "Now set <strong>drop-off</strong>.";
    if (!label) WayMaps.reverseGeocode(lat, lng).then((addr) => { if (addr) $("pkgPickupLabel").value = addr; });
  }
  async function setPkgDrop(lat, lng, label) {
    state.package.drop = { lat, lng };
    if (pkgDropMarker) pkgDropMarker.setMap(null);
    pkgDropMarker = WayMaps.dotMarker(pkgMap, { lat, lng }, "#FBBF24");
    $("pkgDropLabel").value = label || lat.toFixed(4) + ", " + lng.toFixed(4);
    $("pkgMapHint").textContent = "Calculating your route…";
    if (!label) WayMaps.reverseGeocode(lat, lng).then((addr) => { if (addr) $("pkgDropLabel").value = addr; });
    const route = await WayMaps.computeRoute(state.package.pickup, state.package.drop);
    const distKm = route ? route.distanceMeters / 1000 : (WAYME.haversineMeters(state.package.pickup, state.package.drop) / 1000) * 1.3;
    if (pkgRouteLine) pkgRouteLine.setMap(null);
    if (route) { pkgRouteLine = WayMaps.polyline(pkgMap, route.path, { strokeColor: "#0369A1", strokeWeight: 4 }); WayMaps.fitBounds(pkgMap, route.path); }
    state.package.fare = WAYME.estimateFare("package", distKm);
    $("pkgFare").textContent = WAYME.fmtIDR(state.package.fare);
    $("pkgMapHint").textContent = "Fill in package details below.";
    $("pkgConfirmBtn").disabled = false;
  }
  function resetPkgSetup() {
    if (pkgPickupMarker) pkgPickupMarker.setMap(null);
    if (pkgDropMarker) pkgDropMarker.setMap(null);
    if (pkgRouteLine) pkgRouteLine.setMap(null);
    state.package.pickup = null; state.package.drop = null;
    $("pkgPickupLabel").value = ""; $("pkgDropLabel").value = "";
    $("pkgConfirmBtn").disabled = true;
    $("pkgMapHint").innerHTML = "Type an address below, or tap the map — pickup first, then drop-off.";
  }
  function confirmPackage() {
    if (!state.package.pickup || !state.package.drop) return;
    if (isAccountSuspended()) return;
    const ok = processPayment(state.package.fare, state.package.payMethod, "Package delivery");
    if (ok === false) return;
    const type = $("pkgType").value; const notes = $("pkgNotes").value;
    WAYME.createBooking({ type: "package", pickup: state.package.pickup, drop: state.package.drop, packageType: type, notes, fare: state.package.fare, status: "courier assigned" });
    $("confirmTitle").textContent = "Courier assigned";
    $("confirmSubtitle").textContent = "A WAYME courier will pick up your package shortly.";
    resetPkgSetup(); go("booking-confirmed");
  }

  function renderPlaces() {
    $("placesList").innerHTML = state.places.map((p) => `
      <div class="place-card" onclick="WayApp.openPlace('${p.id}')">
        <div class="place-thumb" style="background:var(--sky-100);">${p.icon}</div>
        <div class="place-card-body"><strong>${p.name}</strong><p class="muted" style="margin:4px 0;">⭐ ${p.rating} · ${p.address}</p><strong>${WAYME.fmtIDR(p.price)}<span class="muted" style="font-weight:400;"> / night</span></strong></div>
      </div>`).join("");
  }
  function openPlace(id) {
    state.place.selected = state.places.find((p) => p.id === id);
    $("placeDetailName").textContent = state.place.selected.name;
    $("placeHero").textContent = state.place.selected.icon;
    $("placeHero").style.background = "var(--sky-100)";
    $("placeAddress").textContent = state.place.selected.address + " · ⭐ " + state.place.selected.rating;
    $("placeTotal").textContent = WAYME.fmtIDR(state.place.selected.price);
    go("place-detail");
  }
  function confirmPlace() {
    if (isAccountSuspended()) return;
    const total = state.place.selected.price;
    const ok = processPayment(total, state.place.payMethod, "Stay · " + state.place.selected.name);
    if (ok === false) return;
    WAYME.createBooking({ type: "place", place: state.place.selected.name, total, status: "reserved" });
    $("confirmTitle").textContent = "Reservation confirmed";
    $("confirmSubtitle").textContent = "See you at " + state.place.selected.name + "!";
    go("booking-confirmed");
  }

  function wireRealtime() {
    WAYME.on("db_updated", () => {
      const ann = WAYME.getAnnouncement();
      if (ann && ann.ts > state.lastAnnouncementTs) { state.lastAnnouncementTs = ann.ts; toast("📣 " + ann.text); }
      if (!state.bookingId) return;
      const b = WAYME.getBooking(state.bookingId);
      if (!b) return;
      if ($("screen-finding").classList.contains("active") && !state.matchHandled && b.status === "matched") {
        clearTimeout(state.matchTimer); state.matchHandled = true; startTrip(b); return;
      }
      if ($("screen-chat-active").classList.contains("active")) renderChatMessages();
      if ($("screen-trip").classList.contains("active")) {
        const driver = WAYME.getDriverById(b.driverId);
        if (tripDriverMarker && driver) tripDriverMarker.setLatLng([driver.lat, driver.lng]);
        if (b.status === "arrived" && state.tripPhase === "arriving") { state.tripPhase = "arrived"; $("tripStatusChip").textContent = "Driver arrived"; $("tripActionBtn").textContent = "Simulate: start trip"; }
        if (b.status === "ongoing" && state.tripPhase === "arrived") { state.tripPhase = "ongoing"; $("tripStatusChip").textContent = "On the way"; drawRoute(b.pickup, b.drop); }
        if (b.status === "completed" && state.tripPhase !== "done") completeTrip(b);
      }
    });
  }

  function init() {
    setTimeout(() => {
      const uid = WAYME.getCurrentUserId();
      if (!uid) { go("login"); return; }
      if (WAYME.isUserSessionExpired()) {
        WAYME.logoutUser();
        toast("You were logged out after 2 weeks of inactivity — please log in again.");
        go("login");
        return;
      }
      if (WAYME.hasUserPin(uid)) showPinLock();
      else go("pin-setup");
    }, 1500);
    const ann = WAYME.getAnnouncement(); if (ann) state.lastAnnouncementTs = ann.ts;
    wireRealtime();
    $("ratingStars").addEventListener("click", (e) => {
      const v = e.target.dataset.v; if (!v) return;
      document.querySelectorAll("#ratingStars span").forEach((s) => s.classList.toggle("on", Number(s.dataset.v) <= Number(v)));
    });
    $("chatInput").addEventListener("keydown", (e) => { if (e.key === "Enter") sendChat(); });
    $("pinLockInput").addEventListener("keydown", (e) => { if (e.key === "Enter") unlockWithPin(); });
  }
  document.addEventListener("DOMContentLoaded", init);

  return {
    go, switchTab, selectChannel, checkIdentifier, verifyOtp, backToPhone, sendSignupCode, verifySignupCode, logout,
    savePinSetup, unlockWithPin,
    openRideSetup: () => go("ride-setup"), selectVehicle, confirmRide, cancelSearch,
    minimizeTrip, sosAlert, callDriver, openChat, driverSimAdvance, sendChat, finishRating,
    openPaymentSheet, selectPayMethod, confirmPayMethod, closeSheets, openTopUp, doTopUp,
    openRestaurant, changeQty, goToFoodCheckout, placeFoodOrder, advanceFoodOrder,
    confirmPackage, openPlace, confirmPlace,
  };
})();
