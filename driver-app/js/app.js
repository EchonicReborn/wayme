/* WAYME Partner (Driver) App — vanilla JS, no build step (WebView-friendly) */
const DriverApp = (function () {
  const MAIN_TABS = ["dashboard", "earnings", "chat", "profile"];

  const state = {
    name: "Andi Pratama", plate: "B 3921 WAY", online: false,
    activeBookingId: null, pendingRequestId: null, declinedIds: new Set(),
    tripPhase: null, pollTimer: null, requestTimer: null,
    tripsToday: 0, earnedToday: 0, lastAnnouncementTs: 0,
  };

  let dashMap, dashMarker;
  let tripMap, tripDriverMarker, tripRouteLine;

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
    if (id === "dashboard") { initDashMap(); refreshDashboard(); }
    if (id === "earnings") refreshEarnings();
    if (id === "chat") renderChatList();
    if (id === "chat-active") renderChatMessages();
    if (id === "profile") renderProfile();
  }
  function switchTab(t) { go(t); }

  function login() {
    const phone = $("phoneInput").value.trim(); const plate = $("plateInput").value.trim();
    if (!phone || !plate) { toast("Enter your phone and vehicle plate"); return; }
    state.plate = plate;
    $("driverNameHeader").textContent = state.name;
    $("profilePlate").textContent = "Honda Vario · " + plate;
    go("dashboard");
  }
  function logout() { WAYME.setDriverOnline(false); $("onlineToggle").checked = false; clearInterval(state.pollTimer); go("login"); }

  function toggleOnline(isOn) {
    const d = WAYME.getDriver();
    if (isOn && d.suspended) { toast("🚫 Your account is suspended by WAYME admin — contact support"); $("onlineToggle").checked = false; return; }
    state.online = isOn; WAYME.setDriverOnline(isOn);
    $("statusBanner").textContent = isOn ? "You're online — waiting for requests…" : "You're offline — go online to receive requests.";
    $("statusBanner").classList.toggle("online", isOn);
    if (isOn) startPolling(); else clearInterval(state.pollTimer);
  }
  function initDashMap() {
    if (dashMap) { WayMaps.resize(dashMap); return; }
    const d = WAYME.getDriver();
    WayMaps.ready(() => { dashMap = WayMaps.createMap("mapDashboard", { lat: d.lat, lng: d.lng }, 15); dashMarker = WayMaps.emojiMarker(dashMap, { lat: d.lat, lng: d.lng }, "🛵"); });
  }
  function refreshDashboard() {
    $("earnToday").textContent = WAYME.fmtIDR(state.earnedToday);
    $("tripsToday").textContent = String(state.tripsToday);
    renderRecentTrips();
    const d = WAYME.getDriver();
    $("onlineToggle").disabled = !!d.suspended;
    if (d.suspended) { $("onlineToggle").checked = false; $("statusBanner").textContent = "🚫 Your account is suspended by WAYME admin — contact support."; $("statusBanner").classList.remove("online"); }
    else if (!state.online) $("statusBanner").textContent = "You're offline — go online to receive requests.";
  }
  function renderRecentTrips() {
    const list = WAYME.listBookings().filter((b) => b.status === "completed").slice(0, 5);
    const el = $("recentTrips");
    if (!list.length) { el.innerHTML = '<p class="muted">No trips yet today.</p>'; return; }
    el.innerHTML = list.map((b) => `<div class="card" style="margin-bottom:10px; display:flex; justify-content:space-between;"><div><strong>${b.vehicle ? "🛵 Ride" : "Trip"}</strong><p class="muted" style="margin:2px 0 0;">${b.id}</p></div><strong>+${WAYME.fmtIDR(b.fare || b.total || 0)}</strong></div>`).join("");
  }

  function refreshEarnings() {
    $("driverBalanceBig").textContent = WAYME.fmtIDR(WAYME.getWallet("driver"));
    const rate = WAYME.getCommissionRate();
    $("commissionNote").textContent = "Platform commission: " + Math.round(rate * 100) + "% (deducted automatically from each fare — set by admin)";
    const list = WAYME.listBookings().filter((b) => b.status === "completed");
    const el = $("earningsHistory");
    if (!list.length) { el.innerHTML = '<p class="muted">No completed trips yet.</p>'; return; }
    el.innerHTML = list.map((b) => `<div class="card" style="margin-bottom:10px; display:flex; justify-content:space-between;"><div><strong>${b.id}</strong><p class="muted" style="margin:2px 0 0;">${new Date(b.createdAt).toLocaleString()}</p></div><strong>+${WAYME.fmtIDR(b.driverEarning != null ? b.driverEarning : (b.fare || b.total || 0))}</strong></div>`).join("");
  }
  function cashOut() { toast("Cash-out requested — funds arrive in your bank within 1 business day (demo)"); }
  function renderProfile() { const d = WAYME.getDriver(); $("profileBankInfo").textContent = d.bankName + " · " + d.bankAccount; }

  function startPolling() { clearInterval(state.pollTimer); state.pollTimer = setInterval(checkForRequests, 1500); checkForRequests(); }
  function checkForRequests() {
    if (!state.online || state.activeBookingId || state.pendingRequestId) return;
    const candidate = WAYME.listBookings().find((b) => b.type === "ride" && b.status === "searching" && !state.declinedIds.has(b.id));
    if (candidate) showRequest(candidate);
  }
  function showRequest(booking) {
    state.pendingRequestId = booking.id;
    $("reqPickup").textContent = "Pickup " + booking.pickup.lat.toFixed(4) + ", " + booking.pickup.lng.toFixed(4);
    $("reqDrop").textContent = "Drop-off " + booking.drop.lat.toFixed(4) + ", " + booking.drop.lng.toFixed(4);
    $("reqFare").textContent = WAYME.fmtIDR(booking.fare);
    $("sheetRequest").classList.add("open"); $("scrim").classList.add("open");
    let pct = 100; clearInterval(state.requestTimer); $("requestTimerBar").style.transform = "scaleX(1)";
    state.requestTimer = setInterval(() => {
      pct -= 100 / 15; $("requestTimerBar").style.transform = "scaleX(" + Math.max(0, pct / 100) + ")";
      if (pct <= 0) { clearInterval(state.requestTimer); declineRequest(); }
    }, 1000);
  }
  function hideRequestSheet() { $("sheetRequest").classList.remove("open"); $("scrim").classList.remove("open"); clearInterval(state.requestTimer); }
  function declineRequest() { if (state.pendingRequestId) state.declinedIds.add(state.pendingRequestId); state.pendingRequestId = null; hideRequestSheet(); }
  async function acceptRequest() {
    const id = state.pendingRequestId; if (!id) return;
    const existing = WAYME.getBooking(id);
    if (!existing || existing.status !== "searching") { hideRequestSheet(); state.pendingRequestId = null; return; }
    const booking = WAYME.updateBooking(id, { status: "matched", driverName: state.name, driverVehicle: "Honda Vario · " + state.plate, driverRating: 4.9 });
    WAYME.setDriverOnline(true);
    const rawLat = booking.pickup.lat + (Math.random() - 0.5) * 0.01;
    const rawLng = booking.pickup.lng + (Math.random() - 0.5) * 0.01;
    const snapped = await WayMaps.snapToRoads([{ lat: rawLat, lng: rawLng }]);
    const dLat = snapped[0] ? snapped[0].lat : rawLat, dLng = snapped[0] ? snapped[0].lng : rawLng;
    WAYME.updateDriverLocation(dLat, dLng);
    state.pendingRequestId = null; state.activeBookingId = id;
    hideRequestSheet(); startTrip(booking);
  }

  async function startTrip(booking) {
    state.tripPhase = "toPickup";
    $("tripStatusChip").textContent = "Heading to pickup";
    $("tripVehicleInfo").textContent = "Requested " + (booking.vehicle === "car" ? "Car" : booking.vehicle === "air" ? "Air Taxi" : "Motorbike") + " ride";
    $("tripPickupText").textContent = "Pickup point"; $("tripDropText").textContent = "Drop-off point";
    $("tripFare").textContent = WAYME.fmtIDR(booking.fare);
    $("tripDistance").textContent = "…"; $("tripActionBtn").textContent = "Arrived at pickup";
    $("geofenceBanner").style.display = "none";
    go("trip"); initTripMap(booking);
    const route = await WayMaps.computeRoute(booking.pickup, booking.drop);
    $("tripDistance").textContent = route ? route.distanceText : ((WAYME.haversineMeters(booking.pickup, booking.drop) / 1000) * 1.3).toFixed(1) + " km";
  }
  function initTripMap(booking) {
    const p = booking.pickup, d = booking.drop, driver = WAYME.getDriver();
    WayMaps.ready(() => {
      tripMap = WayMaps.createMap("mapTrip", p, 14);
      WayMaps.fitBounds(tripMap, [p, d]);
      WayMaps.dotMarker(tripMap, p, "#0EA5E9");
      WayMaps.dotMarker(tripMap, d, "#FBBF24");
      WayMaps.circle(tripMap, d, 300, { strokeColor: "#FBBF24", fillColor: "#FBBF24", fillOpacity: 0.12, strokeWeight: 1.5 });
      tripDriverMarker = WayMaps.emojiMarker(tripMap, driver, "🛵");
      drawRoute(driver, p);
    });
  }
  async function drawRoute(from, to) {
    if (tripRouteLine) tripRouteLine.setMap(null);
    const route = await WayMaps.computeRoute(from, to);
    const path = route ? route.path : [from, to];
    tripRouteLine = WayMaps.polyline(tripMap, path, { strokeColor: "#075985", strokeWeight: 4 });
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
  function advanceTrip() {
    const booking = WAYME.getBooking(state.activeBookingId); if (!booking) return;
    if (state.tripPhase === "toPickup") {
      animateMarkerTo(tripDriverMarker, booking.pickup, () => {
        state.tripPhase = "atPickup"; WAYME.updateBooking(state.activeBookingId, { status: "arrived" });
        $("tripStatusChip").textContent = "Arrived at pickup"; $("tripActionBtn").textContent = "Start trip";
      });
    } else if (state.tripPhase === "atPickup") {
      state.tripPhase = "ongoing"; WAYME.updateBooking(state.activeBookingId, { status: "ongoing" });
      $("tripStatusChip").textContent = "Trip in progress"; $("tripActionBtn").textContent = "Complete trip";
      drawRoute(booking.pickup, booking.drop);
    } else if (state.tripPhase === "ongoing") {
      const near = { lat: booking.pickup.lat + (booking.drop.lat - booking.pickup.lat) * 0.9, lng: booking.pickup.lng + (booking.drop.lng - booking.pickup.lng) * 0.9 };
      if (WAYME.isInsideGeofence(booking.drop, 300, near)) $("geofenceBanner").style.display = "block";
      animateMarkerTo(tripDriverMarker, booking.drop, () => completeTrip(booking));
    }
  }
  function completeTrip(booking) {
    WAYME.updateBooking(state.activeBookingId, { status: "completed" });
    const result = WAYME.settleBooking(booking.id);
    if (result.ok) { state.tripsToday += 1; state.earnedToday += result.amount; toast("Trip complete — " + WAYME.fmtIDR(result.amount) + " added to your balance"); }
    state.activeBookingId = null; state.tripPhase = null;
    $("geofenceBanner").style.display = "none"; go("dashboard");
  }
  function sosAlert() { toast("🛟 Safety centre notified (demo)"); }
  function callUser() { toast("📞 Calling user… (demo)"); }
  function openChat() { go("chat-active"); }
  function openNavigation() {
    const booking = WAYME.getBooking(state.activeBookingId); if (!booking) return;
    const driver = WAYME.getDriver();
    const dest = state.tripPhase === "toPickup" ? booking.pickup : booking.drop;
    WayMaps.openNavigation(dest.lat, dest.lng, driver.lat, driver.lng);
  }

  function renderChatMessages() {
    const msgs = state.activeBookingId ? WAYME.getMessages(state.activeBookingId) : [];
    const el = $("chatMessages");
    el.innerHTML = msgs.map((m) => `<div class="chat-bubble ${m.from === "driver" ? "me" : "them"}">${escapeHtml(m.text)}<span class="chat-time">${new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></div>`).join("") || '<p class="muted">Say hi to your user 👋</p>';
    el.scrollTop = el.scrollHeight;
  }
  function sendChat() {
    const input = $("chatInput"); const text = input.value.trim();
    if (!text || !state.activeBookingId) return;
    WAYME.sendMessage(state.activeBookingId, "driver", text); input.value = ""; renderChatMessages();
  }
  function renderChatList() {
    const el = $("chatListBody");
    if (!state.activeBookingId) { el.innerHTML = '<p class="muted">Chat with your user appears here once you have an active trip.</p>'; return; }
    el.innerHTML = `<div class="chat-list-item" onclick="DriverApp.openChat()">
      <div class="avatar" style="width:44px;height:44px;display:flex;align-items:center;justify-content:center;background:var(--sky-900);color:white;font-weight:700;">U</div>
      <div style="flex:1;"><strong>User</strong><p class="muted" style="margin:2px 0 0;">Tap to open chat</p></div>
    </div>`;
  }

  function wireRealtime() {
    WAYME.on("db_updated", () => {
      if ($("screen-chat-active").classList.contains("active")) renderChatMessages();
      if ($("screen-earnings").classList.contains("active")) refreshEarnings();
      if ($("screen-dashboard").classList.contains("active")) refreshDashboard();
      const d = WAYME.getDriver();
      if (d.suspended && state.online) { state.online = false; clearInterval(state.pollTimer); toast("🚫 WAYME admin suspended your account"); }
      const ann = WAYME.getAnnouncement();
      if (ann && ann.ts > state.lastAnnouncementTs) { state.lastAnnouncementTs = ann.ts; toast("📣 " + ann.text); }
      if (state.activeBookingId) {
        const b = WAYME.getBooking(state.activeBookingId);
        if (b && b.status === "cancelled") { toast("User cancelled the trip"); state.activeBookingId = null; state.tripPhase = null; go("dashboard"); }
      }
    });
  }

  function init() {
    setTimeout(() => go("login"), 1500);
    const ann = WAYME.getAnnouncement(); if (ann) state.lastAnnouncementTs = ann.ts;
    wireRealtime();
    $("chatInput") && $("chatInput").addEventListener("keydown", (e) => { if (e.key === "Enter") sendChat(); });
  }
  document.addEventListener("DOMContentLoaded", init);

  return {
    go, switchTab, login, logout, toggleOnline, cashOut,
    acceptRequest, declineRequest, advanceTrip, sosAlert, callUser, openChat, sendChat, openNavigation,
  };
})();
