// core/mesh/server.js
const WebSocket = require("ws");

// --------------------------------------------------
// ENV CONFIG
// --------------------------------------------------
const PORT = process.env.PORT || 5000;
const REGISTRY_BASE =
  process.env.REGISTRY_HEARTBEAT_URL || "http://localhost:4000/twin";
const SERVICE_TOKEN = process.env.REGISTRY_SERVICE_TOKEN || "mesh-secret";

// --------------------------------------------------
// WebSocket Mesh
// --------------------------------------------------
const wss = new WebSocket.Server({ port: PORT });
const clients = new Map();       // ws → { twinId, subscriptions }

console.log(`🌐  Twin Event Mesh running on ws://localhost:${PORT}`);

// helper: POST heartbeat
async function postHeartbeat(twinId) {
  try {
    await fetch(`${REGISTRY_BASE}/${twinId}/heartbeat`, {
      method: "POST",
      headers: { "x-mesh-token": SERVICE_TOKEN }
    });
  } catch (err) {
    console.error(`⚠️  Heartbeat failed for ${twinId}:`, err.message);
  }
}

wss.on("connection", (ws) => {
  console.log("🔌  Twin connected");
  clients.set(ws, { twinId: null, subscriptions: [] });

  ws.on("message", async (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch (err) {
      console.error("⚠️  Invalid JSON:", err);
      return;
    }

    // ── Registration ─────────────────────────────
    if (data.type === "register") {
      const meta = clients.get(ws);
      meta.twinId = data.twinId;
      clients.set(ws, meta);
      console.log(`✅  Registered Twin: ${data.twinId}`);
      return;
    }

    // ── Subscriptions ────────────────────────────
    if (data.type === "subscribe") {
      const meta = clients.get(ws);
      meta.subscriptions = data.topics || [];
      clients.set(ws, meta);
      console.log(
        `📡  Twin ${meta.twinId} subscribed to: ${meta.subscriptions.join(", ")}`
      );
      return;
    }

    // ── Publish Event  (includes heartbeat) ──────
    if (data.type === "event") {
      const { topic, payload } = data;
      const sender = clients.get(ws);

      // 1. broadcast to subscribers
      for (const [client, meta] of clients.entries()) {
        if (client !== ws && meta.subscriptions.includes(topic)) {
          client.send(
            JSON.stringify({
              type: "event",
              topic,
              payload,
              from: sender?.twinId || "unknown"
            })
          );
        }
      }
      console.log(`📤  Event '${topic}' sent from ${sender?.twinId}`);

      // 2. heartbeat ping
      if (sender?.twinId) {
        postHeartbeat(sender.twinId);      // ← NEW
      }
      return;
    }
  });

  ws.on("close", () => {
    console.log("❌  Twin disconnected");
    clients.delete(ws);
  });
});
