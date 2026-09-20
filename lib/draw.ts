export interface DrawParticipant {
  id: string;
}

export interface DrawAssignment {
  participantId: string;
  redNumber: number;
  blueNumber: number;
}

function secureIndex(maxInclusive: number) {
  const limit = 0x1_0000_0000 - (0x1_0000_0000 % (maxInclusive + 1));
  const buffer = new Uint32Array(1);
  let value = 0;

  do {
    crypto.getRandomValues(buffer);
    value = buffer[0];
  } while (value >= limit);

  return value % (maxInclusive + 1);
}

function shuffle<T>(items: T[]) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const target = secureIndex(index);
    [items[index], items[target]] = [items[target], items[index]];
  }
}

function assignmentsFromPartners(
  participants: readonly DrawParticipant[],
  partnerById: ReadonlyMap<string, DrawParticipant>,
): DrawAssignment[] {
  const numberById = new Map(
    participants.map((participant, index) => [participant.id, index + 1]),
  );

  return participants.map((participant, index) => ({
    participantId: participant.id,
    redNumber: index + 1,
    blueNumber: numberById.get(partnerById.get(participant.id)?.id ?? "") ?? 0,
  }));
}

export function createPairAssignments(
  participants: readonly DrawParticipant[],
): DrawAssignment[] {
  if (participants.length < 2 || participants.length % 2 !== 0) {
    throw new Error("El sorteo necesita una cantidad par de participantes.");
  }

  const shuffled = [...participants];

  shuffle(shuffled);

  const partnerById = new Map<string, DrawParticipant>();
  for (let index = 0; index < shuffled.length; index += 2) {
    const first = shuffled[index];
    const second = shuffled[index + 1];
    partnerById.set(first.id, second);
    partnerById.set(second.id, first);
  }

  return assignmentsFromPartners(participants, partnerById);
}

export function createChangedPairAssignments(
  participants: readonly DrawParticipant[],
  previousPartnerById: ReadonlyMap<string, string>,
): DrawAssignment[] {
  if (participants.length < 4 || participants.length % 2 !== 0) {
    throw new Error("Se necesitan al menos 4 participantes para cambiar las parejas.");
  }

  const participantById = new Map(
    participants.map((participant) => [participant.id, participant]),
  );
  const visited = new Set<string>();
  const previousPairs: Array<[DrawParticipant, DrawParticipant]> = [];

  for (const participant of participants) {
    if (visited.has(participant.id)) continue;
    const partnerId = previousPartnerById.get(participant.id);
    const partner = partnerId ? participantById.get(partnerId) : undefined;
    if (!partner || previousPartnerById.get(partner.id) !== participant.id) {
      throw new Error("No se pudo reconstruir el sorteo anterior.");
    }
    visited.add(participant.id);
    visited.add(partner.id);
    previousPairs.push([participant, partner]);
  }

  shuffle(previousPairs);
  const orientedPairs: Array<[DrawParticipant, DrawParticipant]> = previousPairs.map(([first, second]) =>
    secureIndex(1) === 0 ? [first, second] : [second, first],
  );
  const partnerById = new Map<string, DrawParticipant>();

  for (let index = 0; index < orientedPairs.length; index += 1) {
    const first = orientedPairs[index][0];
    const second = orientedPairs[(index + 1) % orientedPairs.length][1];
    partnerById.set(first.id, second);
    partnerById.set(second.id, first);
  }

  return assignmentsFromPartners(participants, partnerById);
}
