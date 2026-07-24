/* =========================================================
   WAYME — Map Service Layer (OpenStreetMap Platform, free / no API key)
   ---------------------------------------------------------
   Leaflet.js + OpenStreetMap tiles, Nominatim geocoding/autocomplete,
   OSRM demo server for real driving routes and distance matrices.
   No API key, no billing account required anywhere in this file.

   ⚠️ FAIR USE: Nominatim/OSRM are free shared community infrastructure
   (~1 req/sec, not for production-scale traffic). Fine for this demo;
   self-host both or use a paid provider before shipping at real scale.
   ========================================================= */

const WayMaps = (function () {
  const OSRM_BASE = "https://router.project-osrm.org";
  const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";

  let leafletReady = typeof L !== "undefined";
  const readyCallbacks = [];
  function ready(cb) { if (leafletReady) cb(); else readyCallbacks.push(cb); }
  if (!leafletReady) {
    const poll = setInterval(() => {
      if (typeof L !== "undefined") { leafletReady = true; clearInterval(poll); readyCallbacks.splice(0).forEach((cb) => cb()); }
    }, 100);
    setTimeout(() => { if (!leafletReady) document.querySelectorAll(".map-box").forEach((el) => showMapFallback(el.id, "script")); }, 8000);
  }

  function showMapFallback(containerId, reason) {
    const el = document.getElementById(containerId);
    if (!el || el.querySelector(".map-fallback-msg")) return;
    const messages = {
      script: "📡 Map library didn't load<br><small>Check your internet connection — Leaflet is loaded from unpkg.com.</small>",
      tiles: "📡 Map tiles couldn't load<br><small>Check your internet connection. If you opened this file directly (file://), serve it from a local server instead.</small>",
    };
    const div = document.createElement("div");
    div.className = "map-fallback-msg";
    div.innerHTML = messages[reason] || messages.tiles;
    el.appendChild(div);
  }
  function hideMapFallback(containerId) { const el = document.getElementById(containerId); const msg = el && el.querySelector(".map-fallback-msg"); if (msg) msg.remove(); }

  function createMap(containerId, center, zoom) {
    hideMapFallback(containerId);
    const map = L.map(containerId, { zoomControl: true }).setView([center.lat, center.lng], zoom);
    const tiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap contributors", maxZoom: 19 });
    let loadedOnce = false, errorCount = 0;
    tiles.on("tileload", () => { loadedOnce = true; hideMapFallback(containerId); });
    tiles.on("tileerror", () => { errorCount++; if (!loadedOnce && errorCount > 3) showMapFallback(containerId, "tiles"); });
    tiles.addTo(map);
    setTimeout(() => map.invalidateSize(), 200);
    return map;
  }
  function resize(map, center) { map.invalidateSize(); if (center) map.setView([center.lat, center.lng]); }
  function marker(map, position, opts) { return L.marker([position.lat, position.lng], opts || {}).addTo(map); }
  function dotMarker(map, position, color) { return L.circleMarker([position.lat, position.lng], { radius: 8, color, fillColor: color, fillOpacity: 1, weight: 0 }).addTo(map); }
  function emojiMarker(map, position, emoji) {
    const icon = L.divIcon({ className: "", html: '<div style="font-size:22px; line-height:1;">' + emoji + "</div>", iconSize: [28, 28], iconAnchor: [14, 14] });
    return L.marker([position.lat, position.lng], { icon }).addTo(map);
  }
  function circle(map, center, radiusMeters, opts) {
    const o = opts || {};
    return L.circle([center.lat, center.lng], Object.assign({ radius: radiusMeters, color: o.strokeColor, fillColor: o.fillColor, fillOpacity: o.fillOpacity, weight: o.strokeWeight }, o)).addTo(map);
  }
  function polyline(map, path, opts) {
    const o = opts || {};
    return L.polyline(path.map((p) => [p.lat, p.lng]), { color: o.strokeColor || "#0369A1", weight: o.strokeWeight || 4 }).addTo(map);
  }
  function fitBounds(map, points) { map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng])), { padding: [50, 50] }); }

  function patchSetMap(layer, map) { layer.setMap = function (target) { if (target === null) map.removeLayer(layer); else map.addLayer(layer); }; return layer; }
  const _marker = marker, _dotMarker = dotMarker, _emojiMarker = emojiMarker, _circle = circle, _polyline = polyline;
  marker = function (map, position, opts) { return patchSetMap(_marker(map, position, opts), map); };
  dotMarker = function (map, position, color) { return patchSetMap(_dotMarker(map, position, color), map); };
  emojiMarker = function (map, position, emoji) { return patchSetMap(_emojiMarker(map, position, emoji), map); };
  circle = function (map, center, radiusMeters, opts) { return patchSetMap(_circle(map, center, radiusMeters, opts), map); };
  polyline = function (map, path, opts) { return patchSetMap(_polyline(map, path, opts), map); };

  async function reverseGeocode(lat, lng) {
    try {
      const res = await fetch(NOMINATIM_BASE + "/reverse?format=json&lat=" + lat + "&lon=" + lng, { headers: { Accept: "application/json" } });
      if (!res.ok) return null;
      const data = await res.json();
      return data.display_name || null;
    } catch (e) { return null; }
  }
  async function geocodeAddress(address) {
    try {
      const res = await fetch(NOMINATIM_BASE + "/search?format=json&limit=1&q=" + encodeURIComponent(address), { headers: { Accept: "application/json" } });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data.length) return null;
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), label: data[0].display_name };
    } catch (e) { return null; }
  }
  async function searchAddresses(query, biasCenter) {
    if (!query || query.trim().length < 3) return [];
    let url = NOMINATIM_BASE + "/search?format=json&addressdetails=0&limit=5&q=" + encodeURIComponent(query);
    if (biasCenter) { const d = 0.25; url += "&viewbox=" + (biasCenter.lng - d) + "," + (biasCenter.lat + d) + "," + (biasCenter.lng + d) + "," + (biasCenter.lat - d) + "&bounded=0"; }
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) return [];
      const data = await res.json();
      return data.map((d) => ({ label: d.display_name, lat: parseFloat(d.lat), lng: parseFloat(d.lon) }));
    } catch (e) { return []; }
  }

  const debounceTimers = new WeakMap();
  function attachAutocomplete(inputEl, biasCenter, onSelect) {
    if (inputEl.dataset.wayAutocompleteWired) return;
    inputEl.dataset.wayAutocompleteWired = "1";
    const box = document.createElement("div");
    box.className = "suggestions";
    inputEl.insertAdjacentElement("afterend", box);
    function escapeHtml(s) { return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
    function renderResults(results) {
      if (!results.length) { box.innerHTML = '<div class="suggestion-empty">No matches — check spelling, or try tapping the map instead</div>'; box.classList.add("open"); return; }
      box.innerHTML = results.map((r, i) => '<button type="button" class="suggestion-item" data-i="' + i + '">' + escapeHtml(r.label) + "</button>").join("");
      box.classList.add("open");
      Array.prototype.forEach.call(box.querySelectorAll(".suggestion-item"), (btn, i) => {
        btn.addEventListener("click", () => { onSelect(results[i]); box.classList.remove("open"); box.innerHTML = ""; });
      });
    }
    inputEl.addEventListener("input", () => {
      clearTimeout(debounceTimers.get(inputEl));
      const q = inputEl.value.trim();
      if (q.length < 3) { box.classList.remove("open"); box.innerHTML = ""; return; }
      const t = setTimeout(async () => renderResults(await searchAddresses(q, biasCenter)), 450);
      debounceTimers.set(inputEl, t);
    });
    document.addEventListener("click", (e) => { if (e.target !== inputEl && !box.contains(e.target)) { box.classList.remove("open"); box.innerHTML = ""; } });
  }

  async function computeRoute(origin, destination) {
    try {
      const url = OSRM_BASE + "/route/v1/driving/" + origin.lng + "," + origin.lat + ";" + destination.lng + "," + destination.lat + "?overview=full&geometries=geojson";
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      if (data.code !== "Ok" || !data.routes.length) return null;
      const route = data.routes[0];
      return {
        path: route.geometry.coordinates.map((c) => ({ lat: c[1], lng: c[0] })),
        distanceMeters: route.distance, durationSeconds: route.duration,
        distanceText: (route.distance / 1000).toFixed(1) + " km",
        durationText: Math.max(1, Math.round(route.duration / 60)) + " min",
      };
    } catch (e) { return null; }
  }
  async function computeRouteMatrix(origins, destinations) {
    try {
      const all = origins.concat(destinations);
      const coords = all.map((p) => p.lng + "," + p.lat).join(";");
      const sourceIdx = origins.map((_, i) => i).join(";");
      const destIdx = destinations.map((_, i) => origins.length + i).join(";");
      const url = OSRM_BASE + "/table/v1/driving/" + coords + "?sources=" + sourceIdx + "&destinations=" + destIdx + "&annotations=distance,duration";
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      if (data.code !== "Ok") return null;
      return data.distances.map((row, i) => row.map((distance, j) => ({
        distance: distance != null ? { value: distance, text: (distance / 1000).toFixed(1) + " km" } : null,
        duration: data.durations[i][j] != null ? { value: data.durations[i][j], text: Math.round(data.durations[i][j] / 60) + " min" } : null,
      })));
    } catch (e) { return null; }
  }
  async function rankByDrivingDistance(origin, candidates) {
    const matrix = await computeRouteMatrix([origin], candidates.map((c) => c.point));
    if (!matrix) return candidates;
    const elements = matrix[0];
    return candidates.map((c, i) => ({ ...c, distanceMeters: elements[i].distance ? elements[i].distance.value : Infinity, durationSeconds: elements[i].duration ? elements[i].duration.value : Infinity })).sort((a, b) => a.distanceMeters - b.distanceMeters);
  }
  async function snapToRoads(path) {
    try {
      return await Promise.all(path.map(async (p) => {
        const res = await fetch(OSRM_BASE + "/nearest/v1/driving/" + p.lng + "," + p.lat);
        if (!res.ok) return p;
        const data = await res.json();
        if (data.code !== "Ok" || !data.waypoints || !data.waypoints[0]) return p;
        const loc = data.waypoints[0].location;
        return { lat: loc[1], lng: loc[0] };
      }));
    } catch (e) { return path; }
  }
  function openNavigation(destLat, destLng, originLat, originLng) {
    const geoUrl = "geo:" + destLat + "," + destLng + "?q=" + destLat + "," + destLng + "(Destination)";
    const opened = window.open(geoUrl, "_blank");
    if (!opened) {
      let osmUrl = "https://www.openstreetmap.org/directions?engine=osrm_car&route=";
      osmUrl += (originLat != null ? originLat + "," + originLng : "") + ";" + destLat + "," + destLng;
      window.open(osmUrl, "_blank");
    }
  }

  return {
    ready, createMap, resize, marker, dotMarker, emojiMarker, circle, polyline, fitBounds,
    reverseGeocode, geocodeAddress, attachAutocomplete,
    computeRoute, computeRouteMatrix, rankByDrivingDistance, snapToRoads,
    openNavigation, showMapFallback, hideMapFallback,
  };
})();
