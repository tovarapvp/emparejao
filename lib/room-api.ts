import { errorDetails, logEvent } from "@/lib/observability";

export const ROOM_STATUS = {
  LOBBY: "lobby",
  DRAWING: "drawing",
  DRAWN: "drawn",
} as const;

export type RoomStatus = (typeof ROOM_STATUS)[keyof typeof ROOM_STATUS];

export interface RoomRecord {
  id: string;
  code: string;
  host_token: string;
  expected_participants: number;
  status: RoomStatus;
  expires_at: number;
  version: number;
  join_locked?: number;
  archived_at?: number | null;
}

export interface ParticipantRecord {
  id: string;
  name: string;
  access_token: string;
  red_number: number | null;
  blue_number: number | null;
  joined_at: number;
  last_seen_at?: number | null;
  result_viewed_at?: number | null;
  notification_enabled?: number;
  pair_confirmed_at?: number | null;
}

export function normalizeCode(value: string) {
  return value.replace(/\D/g, "").slice(0, 6);
}

export function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 40);
}

export function roomError(error: unknown) {
  const message = error instanceof Error ? error.message : "Error inesperado";
  logEvent("error", "room_api_error", errorDetails(error));
  return Response.json(
    { error: message.includes("D1") ? "El servicio de salas no está disponible." : message },
    { status: 500 },
  );
}

export function bearerToken(request: Request) {
  const value = request.headers.get("authorization") ?? "";
  return value.startsWith("Bearer ") ? value.slice(7) : "";
}
