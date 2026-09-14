const BASE_URL = (process.argv[2] ?? "http://127.0.0.1:8787").replace(/\/$/, "");
const CLIENTS = Number(process.argv[3] ?? 800);
const CONCURRENCY = 25;
const SOCKET_URL = BASE_URL.replace(/^http/, "ws");

if (!Number.isInteger(CLIENTS) || CLIENTS < 2 || CLIENTS > 800 || CLIENTS % 2 !== 0) {
  throw new Error("La cantidad debe ser un número par entre 2 y 800.");
}

async function request(path, init) {
  const response = await fetch(`${BASE_URL}${path}`, init);
  const body = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${body.error ?? path}`);
  return body;
}

function waitForMessage(socket, expectedType, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`No llegó ${expectedType} antes del límite.`));
    }, timeoutMs);
    function cleanup() {
      clearTimeout(timer);
      socket.removeEventListener("message", onMessage);
      socket.removeEventListener("error", onError);
    }
    function onMessage(event) {
      const message = JSON.parse(String(event.data));
      if (message.type !== expectedType) return;
      cleanup();
      resolve(message);
    }
    function onError() {
      cleanup();
      reject(new Error(`Falló una conexión WebSocket esperando ${expectedType}.`));
    }
    socket.addEventListener("message", onMessage);
    socket.addEventListener("error", onError);
  });
}

async function connect(code, token) {
  const startedAt = performance.now();
  const socket = new WebSocket(
    `${SOCKET_URL}/api/rooms/${code}/socket`,
    ["emparejao", token],
  );
  const snapshot = waitForMessage(socket, "room_snapshot");
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  await snapshot;
  return { socket, latency: performance.now() - startedAt };
}

function percentile(values, percentage) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * percentage) - 1)];
}

const testStartedAt = performance.now();
const room = await request("/api/rooms", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ expectedParticipants: CLIENTS }),
});
console.log(`Sala de prueba: ${room.code}`);
const host = await connect(room.code, room.hostToken);
const participantSockets = [];
const connectionLatencies = [host.latency];
const runId = Date.now();

for (let start = 0; start < CLIENTS; start += CONCURRENCY) {
  const size = Math.min(CONCURRENCY, CLIENTS - start);
  const participants = await Promise.all(
    Array.from({ length: size }, (_, offset) => {
      const number = start + offset + 1;
      return request(`/api/rooms/${room.code}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: `Socket ${runId}-${number}` }),
      });
    }),
  );
  const connections = await Promise.all(
    participants.map((participant) => connect(room.code, participant.participantToken)),
  );
  participantSockets.push(...connections.map((connection) => connection.socket));
  connectionLatencies.push(...connections.map((connection) => connection.latency));
  console.log(`Conectados: ${participantSockets.length}/${CLIENTS}`);
}

const drawEvents = participantSockets.map((socket) => waitForMessage(socket, "draw_started"));
const drawStartedAt = performance.now();
await request(`/api/rooms/${room.code}/start`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${room.hostToken}`,
    "content-type": "application/json",
  },
  body: "{}",
});
await Promise.all(drawEvents);
const drawDeliveryMs = performance.now() - drawStartedAt;

host.socket.close();
for (const socket of participantSockets) socket.close();

console.log(`OK: ${CLIENTS} participantes mantuvieron el socket y recibieron el sorteo.`);
console.log(
  `Conexión p50=${percentile(connectionLatencies, 0.5).toFixed(0)}ms ` +
    `p95=${percentile(connectionLatencies, 0.95).toFixed(0)}ms ` +
    `p99=${percentile(connectionLatencies, 0.99).toFixed(0)}ms.`,
);
console.log(`Entrega del sorteo a todos: ${drawDeliveryMs.toFixed(0)}ms.`);
console.log(`Tiempo total: ${((performance.now() - testStartedAt) / 1000).toFixed(2)}s.`);
