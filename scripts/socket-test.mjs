const BASE_URL = (process.argv[2] ?? "http://127.0.0.1:8787").replace(/\/$/, "");
const SOCKET_URL = BASE_URL.replace(/^http/, "ws");
const TIMEOUT_MS = 5_000;

async function request(path, init) {
  const response = await fetch(`${BASE_URL}${path}`, init);
  const body = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${body.error ?? path}`);
  return body;
}

function waitForSocket(socket, expectedType) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`No llegó el evento ${expectedType}.`));
    }, TIMEOUT_MS);
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
      reject(new Error("Falló la conexión WebSocket."));
    }
    socket.addEventListener("message", onMessage);
    socket.addEventListener("error", onError);
  });
}

async function connect(code, token) {
  const socket = new WebSocket(
    `${SOCKET_URL}/api/rooms/${code}/socket`,
    ["emparejao", token],
  );
  const snapshot = waitForSocket(socket, "room_snapshot");
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  await snapshot;
  return socket;
}

const room = await request("/api/rooms", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ expectedParticipants: 2 }),
});
const hostSocket = await connect(room.code, room.hostToken);

const first = await request(`/api/rooms/${room.code}/join`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: `Socket Uno ${Date.now()}` }),
});
const participantSocket = await connect(room.code, first.participantToken);

const hostRoomUpdated = waitForSocket(hostSocket, "room_updated");
const participantRoomUpdated = waitForSocket(participantSocket, "room_updated");
await request(`/api/rooms/${room.code}/join`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: `Socket Dos ${Date.now()}` }),
});
const [hostUpdate, participantUpdate] = await Promise.all([
  hostRoomUpdated,
  participantRoomUpdated,
]);
if (hostUpdate.participantCount !== 2 || participantUpdate.participantCount !== 2) {
  throw new Error("El contador WebSocket no llegó a 2 en todas las vistas.");
}

const drawStarted = waitForSocket(participantSocket, "draw_started");
await request(`/api/rooms/${room.code}/start`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${room.hostToken}`,
    "content-type": "application/json",
  },
  body: "{}",
});
await drawStarted;

hostSocket.close();
participantSocket.close();
console.log("OK: conexión, contador en vivo y aviso de sorteo por WebSocket verificados.");
