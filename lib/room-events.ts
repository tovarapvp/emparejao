import { env } from "cloudflare:workers";

export const ROOM_EVENT = {
  UPDATED: "room_updated",
  DRAW_STARTED: "draw_started",
} as const;

export const ROOM_EVENT_TARGET = {
  HOST: "host",
  PARTICIPANT: "participant",
  ALL: "all",
} as const;

export type RoomEventTarget =
  (typeof ROOM_EVENT_TARGET)[keyof typeof ROOM_EVENT_TARGET];

export interface RoomUpdatedEvent {
  type: typeof ROOM_EVENT.UPDATED;
  participantCount: number;
}

export interface DrawStartedEvent {
  type: typeof ROOM_EVENT.DRAW_STARTED;
}

export type RoomEvent = RoomUpdatedEvent | DrawStartedEvent;

export async function publishRoomEvent(
  roomCode: string,
  event: RoomEvent,
  target: RoomEventTarget = ROOM_EVENT_TARGET.ALL,
) {
  const namespace = env.ROOM_HUB;
  if (!namespace) return;

  try {
    const response = await namespace.getByName(roomCode).fetch(
      "https://room-hub.internal/broadcast",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ event, target }),
      },
    );
    if (!response.ok) {
      console.error("room-events", await response.text());
    }
  } catch (error) {
    // D1 remains authoritative. Clients retain low-frequency polling as fallback.
    console.error("room-events", error);
  }
}
