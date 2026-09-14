const TEST_PARTICIPANTS = 800;
const CONCURRENCY = 25;
const BASE_URL = "http://localhost:5173";

async function request(path, init) {
  const response = await fetch(`${BASE_URL}${path}`, init);
  const body = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${body.error ?? path}`);
  return body;
}

const room = await request("/api/rooms", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ expectedParticipants: TEST_PARTICIPANTS }),
});

const participants = [];
for (let start = 0; start < TEST_PARTICIPANTS; start += CONCURRENCY) {
  const joins = Array.from(
    { length: Math.min(CONCURRENCY, TEST_PARTICIPANTS - start) },
    (_, offset) => {
      const number = start + offset + 1;
      return request(`/api/rooms/${room.code}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: `Participante ${number}` }),
      });
    },
  );
  participants.push(...(await Promise.all(joins)));
}

await request(`/api/rooms/${room.code}/start`, {
  method: "POST",
  headers: { authorization: `Bearer ${room.hostToken}` },
});

const results = [];
for (let start = 0; start < TEST_PARTICIPANTS; start += CONCURRENCY) {
  const reads = participants.slice(start, start + CONCURRENCY).map((participant) =>
    request(`/api/rooms/${room.code}`, {
      headers: { authorization: `Bearer ${participant.participantToken}` },
    }),
  );
  results.push(...(await Promise.all(reads)));
}

if (results.some((item) => !item.result)) {
  throw new Error("Uno o más resultados privados no fueron publicados.");
}

const byRed = new Map(results.map((item) => [item.result.redNumber, item.result]));
for (const item of results) {
  const partner = byRed.get(item.result.blueNumber);
  if (!partner || partner.blueNumber !== item.result.redNumber) {
    throw new Error("El emparejamiento no es simétrico.");
  }
  if (item.result.redNumber === item.result.blueNumber) {
    throw new Error("Una persona fue emparejada consigo misma.");
  }
}

console.log(`OK: ${TEST_PARTICIPANTS} participantes creados, emparejados y verificados.`);

const partialRoom = await request("/api/rooms", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ expectedParticipants: 8 }),
});

for (let number = 1; number <= 6; number += 1) {
  await request(`/api/rooms/${partialRoom.code}/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: `Presente ${number}` }),
  });
}

await request(`/api/rooms/${partialRoom.code}/start`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${partialRoom.hostToken}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({ closeWithPresent: true }),
});

const partialStatus = await request(`/api/rooms/${partialRoom.code}`, {
  headers: { authorization: `Bearer ${partialRoom.hostToken}` },
});
if (partialStatus.status !== "drawn" || partialStatus.expectedParticipants !== 6) {
  throw new Error("El cierre anticipado no actualizó correctamente el cupo.");
}

console.log("OK: cierre anticipado verificado con 6 de 8 personas presentes.");

const oddRoom = await request("/api/rooms", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ expectedParticipants: 8 }),
});

for (let number = 1; number <= 5; number += 1) {
  await request(`/api/rooms/${oddRoom.code}/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: `Grupo impar ${number}` }),
  });
}

const oddAttempt = await fetch(`${BASE_URL}/api/rooms/${oddRoom.code}/start`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${oddRoom.hostToken}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({ closeWithPresent: true }),
});
if (oddAttempt.status !== 409) {
  throw new Error("Un grupo impar pudo iniciar el sorteo.");
}

const oddStatus = await request(`/api/rooms/${oddRoom.code}`, {
  headers: { authorization: `Bearer ${oddRoom.hostToken}` },
});
if (oddStatus.status !== "lobby") {
  throw new Error("La sala impar no volvió correctamente al lobby.");
}

console.log("OK: grupo impar bloqueado y devuelto al lobby.");
