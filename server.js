// core/mesh/server.js
const WebSocket = require("ws");

const wss = new WebSocket.Server({ port: 5000 });

const clients = new Map(); // key: socket, value: { twinId, subscriptions }

console.log("🌐 Twin Event Mesh running on ws://localhost:5000");

wss.on("connection", (ws) => {
  console.log("🔌 Twin connected");

  // Initialize metadata for this client
  clients.set(ws, { twinId: null, subscriptions: [] });

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);

      // Handle registration
      if (data.type === "register") {
        const meta = clients.get(ws);
        meta.twinId = data.twinId;
        clients.set(ws, meta);
        console.log(`✅ Registered Twin: ${data.twinId}`);
        return;
      }

      // Handle topic subscription
      if (data.type === "subscribe") {
        const meta = clients.get(ws);
        meta.subscriptions = data.topics || [];
        clients.set(ws, meta);
        console.log(`📡 Twin ${meta.twinId} subscribed to: ${meta.subscriptions.join(", ")}`);
        return;
      }

      // Handle event publishing
      if (data.type === "event") {
        const { topic, payload } = data;
        const sender = clients.get(ws);

        // Broadcast to all subscribers of the topic
        for (const [client, meta] of clients.entries()) {
          if (client !== ws && meta.subscriptions.includes(topic)) {
            client.send(JSON.stringify({
              type: "event",
              topic,
              payload,
              from: sender?.twinId || "unknown"
            }));
          }
        }
        console.log(`📤 Event on topic '${topic}' sent from ${sender?.twinId}`);
        return;
      }

    } catch (err) {
      console.error("⚠️ Error processing message:", err);
    }
  });

  ws.on("close", () => {
    console.log("❌ Twin disconnected");
    clients.delete(ws);
  });
});
