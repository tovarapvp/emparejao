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

export function createPairAssignments(
  participants: readonly DrawParticipant[],
): DrawAssignment[] {
  if (participants.length < 2 || participants.length % 2 !== 0) {
    throw new Error("El sorteo necesita una cantidad par de participantes.");
  }

  const shuffled = participants.map((participant, index) => ({
    ...participant,
    redNumber: index + 1,
  }));

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = secureIndex(index);
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }

  const partnerNumberById = new Map<string, number>();
  for (let index = 0; index < shuffled.length; index += 2) {
    const first = shuffled[index];
    const second = shuffled[index + 1];
    partnerNumberById.set(first.id, second.redNumber);
    partnerNumberById.set(second.id, first.redNumber);
  }

  return participants.map((participant, index) => ({
    participantId: participant.id,
    redNumber: index + 1,
    blueNumber: partnerNumberById.get(participant.id) ?? 0,
  }));
}
