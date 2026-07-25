/* =========================================================
   WAYME — Verification Service (client)
   ---------------------------------------------------------
   Sends/verifies sign-up codes via the server's /api/send-code and
   /api/verify-code endpoints. Real delivery (email via SMTP, or
   WhatsApp via Meta's Cloud API) only happens if the server has been
   configured with the right environment variables — see server.js's
   header comment. Without that, the server hands the code straight
   back in its response (result.demoCode below) so the flow still
   works end to end for testing.

   This reuses the same SERVER_URL/ACCESS_KEY as mock-backend.js —
   nothing new to configure here.
   ========================================================= */

const WayVerify = (function () {
  // Keep these in sync with shared/js/mock-backend.js.
  const SERVER_URL = "http://localhost:3000";
  const ACCESS_KEY = "wayme-demo-2026";

  async function sendCode(destination, channel) {
    try {
      const res = await fetch(SERVER_URL + "/api/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Wayme-Key": ACCESS_KEY },
        body: JSON.stringify({ destination, channel }),
      });
      return await res.json();
    } catch (e) {
      return { ok: false, error: "Couldn't reach the server — check your connection." };
    }
  }

  async function verifyCode(destination, code) {
    try {
      const res = await fetch(SERVER_URL + "/api/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Wayme-Key": ACCESS_KEY },
        body: JSON.stringify({ destination, code }),
      });
      return await res.json();
    } catch (e) {
      return { ok: false, reason: "network_error" };
    }
  }

  return { sendCode, verifyCode };
})();
