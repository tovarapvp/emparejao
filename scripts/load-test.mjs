const TEST_PARTICIPANTS = 500;
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
