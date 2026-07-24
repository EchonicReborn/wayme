/* WAYME Admin Dashboard — vanilla JS, no build step */
const AdminApp = (function () {
  const PANELS = ["overview", "live-map", "bookings", "drivers", "users", "wallet", "settings"];
  const PANEL_TITLES = { overview: "Overview", "live-map": "Live map", bookings: "Bookings", drivers: "Drivers & partners", users: "Users", wallet: "Wallet & payouts", settings: "Settings" };

  const state = { bookingFilter: "all", liveMap: null };

  const sampleDrivers = [
    { name: "Sari Kusuma", vehicle: "Yamaha NMAX · B 2210 QRS", rating: 4.8, balance: 940000 },
    { name: "Budi Santoso", vehicle: "Toyota Avanza · B 1187 CAR", rating: 4.6, balance: 2210000 },
    { name: "Dewi Lestari", vehicle: "Honda Beat · B 5502 WAY", rating: 4.9, balance: 610000 },
  ];
  const sampleUsers = [
    { name: "Putri Amelia", phone: "+62 813 2211 9090", balance: 180000, trips: 12 },
    { name: "Fajar Ramadhan", phone: "+62 856 7712 4400", balance: 95000, trips: 4 },
    { name: "Nadia Ayu", phone: "+62 878 4432 1120", balance: 320000, trips: 21 },
  ];

  function $(id) { return document.getElementById(id); }
  function toast(msg) {
    const t = $("toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._tm); toast._tm = setTimeout(() => t.classList.remove("show"), 2600);
  }
  function labelForType(t) { return { ride: "🛵 Ride", food: "🍜 Food", package: "📦 Package", place: "🏨 Stay" }[t] || t; }
  function escapeHtml(s) { return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

  function login() { $("screen-login").classList.remove("active"); $("adminShell").style.display = "flex"; go("overview"); }
  function logout() { $("adminShell").style.display = "none"; $("screen-login").classList.add("active"); $("adminEmail").value = ""; $("adminPass").value = ""; }

  function go(panel) {
    document.querySelectorAll(".admin-panel").forEach((p) => p.classList.remove("active"));
    $("panel-" + panel).classList.add("active");
    document.querySelectorAll(".side-link").forEach((b) => b.classList.toggle("active", b.dataset.p === panel));
    $("pageTitle").textContent = PANEL_TITLES[panel];
    closeSidebar();
    if (panel === "overview") renderOverview();
    if (panel === "live-map") renderLiveMap();
    if (panel === "bookings") renderBookings();
    if (panel === "drivers") renderDrivers();
    if (panel === "users") renderUsers();
    if (panel === "wallet") renderWallet();
    if (panel === "settings") renderSettings();
  }
  function toggleSidebar() { $("adminSidebar").classList.toggle("open"); $("adminScrim").classList.toggle("open"); }
  function closeSidebar() { $("adminSidebar").classList.remove("open"); $("adminScrim").classList.remove("open"); }

  function openModal(html) {
    $("modalBox").innerHTML = '<button class="modal-close" onclick="AdminApp.closeModal()">✕</button>' + html;
    $("modalBox").classList.add("open"); $("modalBackdrop").classList.add("open");
  }
  function closeModal() { $("modalBox").classList.remove("open"); $("modalBackdrop").classList.remove("open"); }

  function renderOverview() {
    const bookings = WAYME.listBookings(); const driver = WAYME.getDriver();
    const activeStatuses = ["searching", "matched", "arrived", "ongoing", "confirmed"];
    const active = bookings.filter((b) => activeStatuses.includes(b.status));
    const revenue = bookings.filter((b) => b.settled).reduce((sum, b) => sum + (b.fare || b.total || 0), 0);
    $("kpiTotalBookings").textContent = String(bookings.length);
    $("kpiActiveTrips").textContent = String(active.length);
    $("kpiRevenue").textContent = WAYME.fmtIDR(revenue);
    $("kpiOnlineDrivers").textContent = driver.online && !driver.suspended ? "1" : "0";
    const byType = {}; bookings.forEach((b) => { byType[b.type] = (byType[b.type] || 0) + 1; });
    $("breakdownByType").innerHTML = renderBarChart(byType, labelForType);
    const byStatus = {}; bookings.forEach((b) => { byStatus[b.status] = (byStatus[b.status] || 0) + 1; });
    $("breakdownByStatus").innerHTML = renderBarChart(byStatus, (k) => k);
    const byPayment = {}; bookings.forEach((b) => { const m = b.payMethod || "unpaid"; byPayment[m] = (byPayment[m] || 0) + 1; });
    const paymentLabels = { wallet: "💳 Wallet", card: "💳 Card", qr: "🔳 QR Code", unpaid: "— Unpaid" };
    $("breakdownByPayment").innerHTML = renderBarChart(byPayment, (k) => paymentLabels[k] || k);
    const recent = bookings.slice(0, 6);
    $("recentBookingsTable").innerHTML = recent.length
      ? '<table class="data-table"><thead><tr><th>ID</th><th>Type</th><th>Status</th><th>Amount</th></tr></thead><tbody>' +
        recent.map((b) => `<tr><td>${b.id}</td><td>${labelForType(b.type)}</td><td>${b.status}</td><td>${WAYME.fmtIDR(b.fare || b.total || 0)}</td></tr>`).join("") + "</tbody></table>"
      : '<p class="muted">No bookings yet — try creating one in the user app.</p>';
  }
  function renderBarChart(counts, labelFn) {
    const keys = Object.keys(counts); if (!keys.length) return '<p class="muted">No data yet.</p>';
    const max = Math.max(...Object.values(counts));
    return keys.map((k) => `<div class="bar-row"><span class="bar-label">${labelFn(k)}</span><span class="bar-track"><span class="bar-fill" style="width:${(counts[k] / max) * 100}%;"></span></span><span class="bar-value">${counts[k]}</span></div>`).join("");
  }

  function renderLiveMap() {
    const driver = WAYME.getDriver();
    WayMaps.ready(() => {
      if (!state.liveMap) state.liveMap = WayMaps.createMap("mapLive", { lat: driver.lat, lng: driver.lng }, 13);
      const driverMarker = WayMaps.emojiMarker(state.liveMap, { lat: driver.lat, lng: driver.lng }, driver.online ? "🛵" : "⚪");
      const activeStatuses = ["searching", "matched", "arrived", "ongoing"];
      const active = WAYME.listBookings().filter((b) => b.type === "ride" && activeStatuses.includes(b.status));
      active.forEach((b) => {
        if (b.pickup) WayMaps.dotMarker(state.liveMap, b.pickup, "#0EA5E9");
        if (b.drop) WayMaps.dotMarker(state.liveMap, b.drop, "#FBBF24");
        if (b.pickup && b.drop) WayMaps.polyline(state.liveMap, [b.pickup, b.drop], { strokeColor: "#0369A1", strokeWeight: 3 });
      });
      renderActiveTripsList(active, driver);
    });
  }
  async function renderActiveTripsList(active, driver) {
    const listEl = $("activeTripsList");
    if (!active.length) { listEl.innerHTML = '<p class="muted">No active trips right now.</p>'; return; }
    const candidates = active.filter((b) => b.pickup).map((b) => ({ id: b.id, point: b.pickup, booking: b }));
    const ranked = candidates.length ? await WayMaps.rankByDrivingDistance({ lat: driver.lat, lng: driver.lng }, candidates) : [];
    const rankedIds = ranked.map((r) => r.id);
    const ordered = active.slice().sort((a, b) => rankedIds.indexOf(a.id) - rankedIds.indexOf(b.id));
    listEl.innerHTML = ordered.map((b) => {
      const r = ranked.find((x) => x.id === b.id);
      const distLabel = r && r.distanceMeters !== Infinity ? (r.distanceMeters / 1000).toFixed(1) + " km from driver" : "";
      return `<div class="trip-mini-card" onclick="AdminApp.flyToBooking('${b.id}')"><strong>${b.id}</strong> <span class="chip">${b.status}</span><p class="muted" style="margin:6px 0 0;">${b.vehicle || "ride"} · ${WAYME.fmtIDR(b.fare || 0)}${distLabel ? " · " + distLabel : ""}</p></div>`;
    }).join("");
  }
  function flyToBooking(id) {
    const b = WAYME.getBooking(id);
    if (b && b.pickup && state.liveMap) { state.liveMap.setView([b.pickup.lat, b.pickup.lng], 15); }
  }

  function filterBookings(f) {
    state.bookingFilter = f;
    document.querySelectorAll("#bookingFilterTabs .filter-tab").forEach((t) => t.classList.toggle("active", t.dataset.f === f));
    renderBookings();
  }
  function renderBookings() {
    let list = WAYME.listBookings();
    if (state.bookingFilter !== "all") list = list.filter((b) => b.type === state.bookingFilter);
    const el = $("bookingsTableBody");
    if (!list.length) { el.innerHTML = '<tr><td colspan="7" class="muted-cell">No bookings match this filter.</td></tr>'; return; }
    el.innerHTML = list.map((b) => `
      <tr>
        <td>${b.id}</td><td>${labelForType(b.type)}</td><td>${b.status}${b.refunded ? " · refunded" : ""}</td>
        <td>${WAYME.fmtIDR(b.fare || b.total || 0)}</td><td>${b.payMethod || "—"}</td><td>${new Date(b.createdAt).toLocaleString()}</td>
        <td><button class="table-action" onclick="AdminApp.viewBooking('${b.id}')">View</button></td>
      </tr>`).join("");
  }
  function viewBooking(id) {
    const b = WAYME.getBooking(id); if (!b) return;
    const msgs = WAYME.getMessages(id);
    const chatHtml = msgs.length ? msgs.map((m) => `<div style="margin-bottom:6px;"><strong>${m.from}:</strong> ${escapeHtml(m.text)} <span class="muted">(${new Date(m.ts).toLocaleTimeString()})</span></div>`).join("") : '<p class="muted">No chat messages for this booking.</p>';
    const canRefund = b.settled && !b.refunded;
    openModal(`
      <h3>${b.id} — ${labelForType(b.type)}</h3>
      <p class="muted">Status: <strong>${b.status}</strong>${b.refunded ? " · refunded" : ""}</p>
      <div class="card" style="margin-top:10px;">
        <p style="margin:0 0 6px;"><strong>Amount:</strong> ${WAYME.fmtIDR(b.fare || b.total || 0)} (${b.payMethod || "—"})</p>
        ${b.driverName ? `<p style="margin:0 0 6px;"><strong>Driver:</strong> ${b.driverName}</p>` : ""}
        ${b.pickup ? `<p style="margin:0 0 6px;"><strong>Pickup:</strong> ${b.pickup.lat.toFixed(4)}, ${b.pickup.lng.toFixed(4)}</p>` : ""}
        ${b.drop ? `<p style="margin:0;"><strong>Drop-off:</strong> ${b.drop.lat.toFixed(4)}, ${b.drop.lng.toFixed(4)}</p>` : ""}
      </div>
      <h4 style="margin:14px 0 6px;">Chat transcript</h4>
      <div class="card">${chatHtml}</div>
      <button class="btn btn-danger btn-block" style="margin-top:14px;" ${canRefund ? "" : "disabled"} onclick="AdminApp.refundBooking('${b.id}')">${b.refunded ? "Already refunded" : "Refund this booking"}</button>
    `);
  }
  function refundBooking(id) {
    const b = WAYME.getBooking(id);
    if (!b || !b.settled || b.refunded) return;
    const amount = b.fare || b.total || 0;
    const driverEarning = b.driverEarning != null ? b.driverEarning : amount;
    if ((b.payMethod || "wallet") === "wallet") {
      WAYME.pay("driver", driverEarning);
      WAYME.reverseCommission(b.commission || 0);
      WAYME.topUp("user", amount);
    }
    WAYME.updateBooking(id, { refunded: true });
    closeModal(); toast("Refunded " + WAYME.fmtIDR(amount) + " for " + id); renderBookings();
  }

  function renderDrivers() {
    const d = WAYME.getDriver();
    let rows = `
      <tr>
        <td>${d.name}</td><td>${d.vehicle}</td>
        <td>${d.suspended ? '<span class="badge-danger">Suspended</span>' : d.online ? '<span class="badge-success">Online</span>' : "Offline"}</td>
        <td>⭐ ${d.rating}</td><td>${WAYME.fmtIDR(WAYME.getWallet("driver"))}</td><td>${d.bankName} · ${d.bankAccount}</td>
        <td>${d.suspended ? `<button class="table-action" onclick="AdminApp.reinstateDriver()">Reinstate</button>` : `<button class="table-action danger" onclick="AdminApp.suspendDriver()">Suspend</button>`}<button class="table-action" onclick="AdminApp.manageDriverBank()">Bank details</button></td>
      </tr>`;
    rows += sampleDrivers.map((s) => `<tr class="row-sample"><td>${s.name} <span class="muted">(sample)</span></td><td>${s.vehicle}</td><td>Offline</td><td>⭐ ${s.rating}</td><td>${WAYME.fmtIDR(s.balance)}</td><td>—</td><td><button class="table-action" disabled>Suspend</button></td></tr>`).join("");
    $("driversTableBody").innerHTML = rows;
  }
  function suspendDriver() { WAYME.setDriverSuspended(true); toast("Driver suspended — they can no longer go online"); renderDrivers(); }
  function reinstateDriver() { WAYME.setDriverSuspended(false); toast("Driver reinstated"); renderDrivers(); }
  function manageDriverBank() {
    const d = WAYME.getDriver();
    openModal(`<h3>Driver payout bank account</h3><p class="muted">Visible to the driver in their Profile tab.</p><div class="bank-edit-row"><input class="input" id="mBankName" placeholder="Bank name" value="${escapeHtml(d.bankName)}" /><input class="input" id="mBankAccount" placeholder="Account number" value="${escapeHtml(d.bankAccount)}" /></div><button class="btn btn-primary btn-block" style="margin-top:14px;" onclick="AdminApp.saveDriverBank()">Save</button>`);
  }
  function saveDriverBank() { WAYME.setDriverBankAccount($("mBankName").value.trim(), $("mBankAccount").value.trim()); closeModal(); toast("Driver bank account updated"); renderDrivers(); }

  function renderUsers() {
    const tripsCount = WAYME.listBookings().length; const u = WAYME.getUserProfile();
    let rows = `
      <tr>
        <td>${u.name} <span class="muted">(live demo user)</span></td><td>${u.phone}</td><td>${WAYME.fmtIDR(WAYME.getWallet("user"))}</td><td>${u.bankName} · ${u.bankAccount}</td><td>${tripsCount}</td>
        <td>
          <button class="table-action" onclick="AdminApp.adjustUser(50000)">+ Rp50,000</button>
          <button class="table-action danger" onclick="AdminApp.adjustUser(-50000)">− Rp50,000</button><br/>
          ${u.suspended ? `<button class="table-action" onclick="AdminApp.reinstateUser()">Reinstate</button>` : `<button class="table-action danger" onclick="AdminApp.suspendUser()">Suspend</button>`}
          <button class="table-action" onclick="AdminApp.manageUserBank()">Bank details</button>
        </td>
      </tr>`;
    rows += sampleUsers.map((r) => `<tr class="row-sample"><td>${r.name} <span class="muted">(sample)</span></td><td>${r.phone}</td><td>${WAYME.fmtIDR(r.balance)}</td><td>—</td><td>${r.trips}</td><td><button class="table-action" disabled>Adjust</button></td></tr>`).join("");
    $("usersTableBody").innerHTML = rows;
  }
  function adjustUser(amount) {
    if (amount >= 0) WAYME.topUp("user", amount);
    else { const r = WAYME.pay("user", -amount); if (!r.ok) { toast("User balance too low to deduct that much"); return; } }
    toast((amount >= 0 ? "Added " : "Deducted ") + WAYME.fmtIDR(Math.abs(amount)) + " for the user wallet"); renderUsers();
  }
  function suspendUser() { WAYME.setUserSuspended(true); toast("User suspended — they can no longer book anything"); renderUsers(); }
  function reinstateUser() { WAYME.setUserSuspended(false); toast("User reinstated"); renderUsers(); }
  function manageUserBank() {
    const u = WAYME.getUserProfile();
    openModal(`<h3>User bank account</h3><p class="muted">Visible to the user in their Profile tab.</p><div class="bank-edit-row"><input class="input" id="mBankName" placeholder="Bank name" value="${escapeHtml(u.bankName)}" /><input class="input" id="mBankAccount" placeholder="Account number" value="${escapeHtml(u.bankAccount)}" /></div><button class="btn btn-primary btn-block" style="margin-top:14px;" onclick="AdminApp.saveUserBank()">Save</button>`);
  }
  function saveUserBank() { WAYME.setUserBankAccount($("mBankName").value.trim(), $("mBankAccount").value.trim()); closeModal(); toast("User bank account updated"); renderUsers(); }

  function renderWallet() {
    const bookings = WAYME.listBookings().filter((b) => b.settled);
    const revenue = bookings.reduce((sum, b) => sum + (b.fare || b.total || 0), 0);
    $("walletPlatformRevenue").textContent = WAYME.fmtIDR(revenue);
    $("walletDriverBalance").textContent = WAYME.fmtIDR(WAYME.getWallet("driver"));
    $("walletCommissionEarned").textContent = WAYME.fmtIDR(WAYME.getPlatformCommissionEarned());
    const el = $("ledgerList");
    if (!bookings.length) { el.innerHTML = '<p class="muted">No settled transactions yet.</p>'; return; }
    el.innerHTML = bookings.map((b) => `<div class="card" style="display:flex; justify-content:space-between; margin-bottom:10px;"><div><strong>${b.id}</strong><p class="muted" style="margin:2px 0 0;">${labelForType(b.type)} · ${new Date(b.createdAt).toLocaleString()}${b.commission ? " · commission " + WAYME.fmtIDR(b.commission) : ""}</p></div><strong>${WAYME.fmtIDR(b.fare || b.total || 0)}${b.refunded ? " (refunded)" : ""}</strong></div>`).join("");
  }
  function processPayout() {
    const bal = WAYME.getWallet("driver");
    if (bal <= 0) { toast("Nothing to pay out — driver balance is Rp0"); return; }
    WAYME.pay("driver", bal); toast("Payout of " + WAYME.fmtIDR(bal) + " sent to the driver's bank (demo)"); renderWallet();
  }

  const rateLabels = { moto: "Motorbike", car: "Car", air: "Air Taxi", food: "Food delivery", package: "Package" };
  function renderSettings() {
    $("commissionInput").value = Math.round(WAYME.getCommissionRate() * 100);
    $("discountInput").value = Math.round(WAYME.getDiscountRate() * 100);
    const rates = WAYME.getFareRates();
    $("fareRateEditor").innerHTML = `<div class="rate-row"><label></label><label>Base fare</label><label>Per km</label><label>Minimum</label></div>` +
      Object.keys(rateLabels).map((k) => `<div class="rate-row"><label>${rateLabels[k]}</label><input class="input" type="number" id="rate-${k}-base" value="${rates[k].base}" /><input class="input" type="number" id="rate-${k}-perKm" value="${rates[k].perKm}" /><input class="input" type="number" id="rate-${k}-min" value="${rates[k].min}" /></div>`).join("");
    const ann = WAYME.getAnnouncement();
    $("lastAnnouncementInfo").textContent = ann ? 'Last sent: "' + ann.text + '" · ' + new Date(ann.ts).toLocaleString() : "No announcement sent yet this session.";
  }
  function saveEconomics() {
    const commission = Math.max(0, Math.min(100, Number($("commissionInput").value) || 0));
    const discount = Math.max(0, Math.min(100, Number($("discountInput").value) || 0));
    WAYME.setCommissionRate(commission / 100); WAYME.setDiscountRate(discount / 100);
    toast("Commission set to " + commission + "% · discount set to " + discount + "%");
  }
  function saveFareRates() {
    Object.keys(rateLabels).forEach((k) => {
      WAYME.setFareRates(k, { base: Number($("rate-" + k + "-base").value) || 0, perKm: Number($("rate-" + k + "-perKm").value) || 0, min: Number($("rate-" + k + "-min").value) || 0 });
    });
    toast("Fare rates updated");
  }
  function broadcastAnnouncement() {
    const text = $("announcementText").value.trim();
    if (!text) { toast("Write an announcement first"); return; }
    WAYME.setAnnouncement(text); $("announcementText").value = ""; toast("Announcement sent to user and driver apps"); renderSettings();
  }

  function wireRealtime() {
    WAYME.on("db_updated", () => {
      const active = document.querySelector(".admin-panel.active"); if (!active) return;
      const id = active.id.replace("panel-", "");
      if (id === "overview") renderOverview();
      if (id === "live-map") renderLiveMap();
      if (id === "bookings") renderBookings();
      if (id === "drivers") renderDrivers();
      if (id === "users") renderUsers();
      if (id === "wallet") renderWallet();
    });
    updateConnectionPill(); setInterval(updateConnectionPill, 2000);
  }
  function updateConnectionPill() {
    const pill = $("connectionPill"); if (!pill) return;
    const online = WAYME.isConnected();
    pill.classList.toggle("offline", !online);
    pill.innerHTML = '<span class="pulse-dot"></span> ' + (online ? "Live" : "Offline — check server");
  }
  document.addEventListener("DOMContentLoaded", wireRealtime);

  return {
    login, logout, go, toggleSidebar, closeSidebar, closeModal,
    filterBookings, viewBooking, refundBooking, flyToBooking,
    suspendDriver, reinstateDriver, manageDriverBank, saveDriverBank,
    adjustUser, suspendUser, reinstateUser, manageUserBank, saveUserBank,
    processPayout, saveFareRates, saveEconomics, broadcastAnnouncement,
  };
})();
