"use client";

import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  Clock3,
  DoorOpen,
  LoaderCircle,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Ticket,
  Users,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import styles from "./admin.module.css";

const ROOM_STATUS = {
  LOBBY: "lobby",
  DRAWING: "drawing",
  DRAWN: "drawn",
} as const;

interface AdminStatus {
  setupRequired: boolean;
  setupConfigured: boolean;
  authenticated: boolean;
  email: string;
}

interface AdminRoom {
  id: string;
  code: string;
  status: string;
  active: boolean;
  expectedParticipants: number;
  participantCount: number;
  createdAt: number;
  expiresAt: number;
}

interface AdminParticipant {
  id: string;
  name: string;
  redNumber: number | null;
  blueNumber: number | null;
  joinedAt: number;
}

interface AdminPairParticipant {
  id: string;
  name: string;
  number: number;
}

interface AdminPair {
  id: string;
  first: AdminPairParticipant;
  second: AdminPairParticipant;
}

interface AdminRoomDetail {
  room: AdminRoom & { version: number };
  participants: AdminParticipant[];
  pairs: AdminPair[];
  unmatched: AdminParticipant[];
}

async function adminApi<T>(path: string, init?: RequestInit) {
  const response = await fetch(path, { ...init, cache: "no-store" });
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "No se pudo completar la acción.");
  return body;
}

function dateTime(value: number) {
  return new Intl.DateTimeFormat("es-VE", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function roomStatusLabel(room: AdminRoom) {
  if (!room.active) return "Vencida";
  if (room.status === ROOM_STATUS.DRAWN) return "Sorteada";
  if (room.status === ROOM_STATUS.DRAWING) return "Procesando";
  return "En espera";
}

export default function AdminPage() {
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [rooms, setRooms] = useState<AdminRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [detail, setDetail] = useState<AdminRoomDetail | null>(null);
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [error, setError] = useState("");

  async function loadStatus() {
    try {
      const nextStatus = await adminApi<AdminStatus>("/api/admin/status");
      setStatus(nextStatus);
      setError("");
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "No se pudo abrir el panel.");
    }
  }

  async function loadRooms(silent = false) {
    if (!silent) setLoadingRooms(true);
    try {
      const response = await adminApi<{ rooms: AdminRoom[] }>("/api/admin/rooms");
      setRooms(response.rooms);
      setSelectedRoomId((current) =>
        response.rooms.some((room) => room.id === current) ? current : response.rooms[0]?.id || "",
      );
      setError("");
    } catch (roomsError) {
      setError(roomsError instanceof Error ? roomsError.message : "No se pudieron cargar las salas.");
    } finally {
      setLoadingRooms(false);
    }
  }

  async function loadDetail(roomId: string, silent = false) {
    if (!roomId) {
      setDetail(null);
      return;
    }
    try {
      const response = await adminApi<AdminRoomDetail>(`/api/admin/rooms/${roomId}`);
      setDetail(response);
      if (!silent) setSelectedParticipants([]);
      setError("");
    } catch (detailError) {
      setError(detailError instanceof Error ? detailError.message : "No se pudo cargar la sala.");
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void loadStatus(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!status?.authenticated) return;
    const initialTimer = window.setTimeout(() => void loadRooms(), 0);
    const refreshTimer = window.setInterval(() => void loadRooms(true), 10_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(refreshTimer);
    };
  }, [status?.authenticated]);

  useEffect(() => {
    if (!status?.authenticated || !selectedRoomId) return;
    const initialTimer = window.setTimeout(() => void loadDetail(selectedRoomId), 0);
    const refreshTimer = window.setInterval(() => void loadDetail(selectedRoomId, true), 7_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(refreshTimer);
    };
  }, [selectedRoomId, status?.authenticated]);

  async function submitAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!status) return;
    if (status.setupRequired && password !== passwordConfirmation) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const endpoint = status.setupRequired ? "/api/admin/setup" : "/api/admin/login";
      await adminApi(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: status.email,
          password,
          ...(status.setupRequired ? { setupToken } : {}),
        }),
      });
      setPassword("");
      setPasswordConfirmation("");
      setSetupToken("");
      await loadStatus();
    } catch (accessError) {
      setError(accessError instanceof Error ? accessError.message : "No se pudo validar el acceso.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    try {
      await adminApi("/api/admin/logout", { method: "POST" });
      setRooms([]);
      setDetail(null);
      setSelectedRoomId("");
      await loadStatus();
    } finally {
      setBusy(false);
    }
  }

  function toggleParticipant(participantId: string) {
    setSelectedParticipants((current) => {
      if (current.includes(participantId)) return current.filter((id) => id !== participantId);
      if (current.length >= 2) return [current[1], participantId];
      return [...current, participantId];
    });
  }

  async function matchSelected() {
    if (!detail || selectedParticipants.length !== 2) return;
    setBusy(true);
    setError("");
    try {
      await adminApi(`/api/admin/rooms/${detail.room.id}/match`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          firstParticipantId: selectedParticipants[0],
          secondParticipantId: selectedParticipants[1],
        }),
      });
      setSelectedParticipants([]);
      await Promise.all([loadRooms(true), loadDetail(detail.room.id, true)]);
    } catch (matchError) {
      setError(matchError instanceof Error ? matchError.message : "No se pudo guardar la pareja.");
    } finally {
      setBusy(false);
    }
  }

  if (!status) {
    return (
      <main className={styles.centered}>
        <LoaderCircle className={styles.spin} />
        <p>{error || "Comprobando acceso seguro…"}</p>
      </main>
    );
  }

  if (!status.authenticated) {
    return (
      <main className={styles.authShell}>
        <section className={styles.authCard}>
          <div className={styles.adminMark}><ShieldCheck /></div>
          <span className={styles.kicker}>Emparejao · acceso privado</span>
          <h1>{status.setupRequired ? "Configura tu superadmin" : "Panel superadmin"}</h1>
          <p>
            {status.setupRequired
              ? "Crea la contraseña que usarás para revisar las salas y resolver incidencias."
              : "Entra para supervisar salas, participantes y parejas."}
          </p>
          {status.setupRequired && !status.setupConfigured && (
            <div className={styles.warning}>
              <AlertTriangle />
              <span>Primero configura el secreto <strong>ADMIN_SETUP_TOKEN</strong> en Cloudflare.</span>
            </div>
          )}
          <form className={styles.authForm} onSubmit={submitAccess}>
            <label>
              Correo del superadmin
              <Input value={status.email} disabled />
            </label>
            {status.setupRequired && (
              <label>
                Clave inicial de configuración
                <Input
                  type="password"
                  autoComplete="one-time-code"
                  value={setupToken}
                  onChange={(event) => setSetupToken(event.target.value)}
                  required
                />
              </label>
            )}
            <label>
              {status.setupRequired ? "Crea una contraseña" : "Contraseña"}
              <Input
                type="password"
                autoComplete={status.setupRequired ? "new-password" : "current-password"}
                minLength={12}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            {status.setupRequired && (
              <label>
                Repite la contraseña
                <Input
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  value={passwordConfirmation}
                  onChange={(event) => setPasswordConfirmation(event.target.value)}
                  required
                />
              </label>
            )}
            {error && <p className={styles.formError} role="alert">{error}</p>}
            <Button type="submit" disabled={busy || (status.setupRequired && !status.setupConfigured)}>
              {busy ? <LoaderCircle className={styles.spin} /> : <ShieldCheck />}
              {status.setupRequired ? "Crear acceso seguro" : "Entrar al panel"}
            </Button>
          </form>
        </section>
      </main>
    );
  }

  const activeRooms = rooms.filter((room) => room.active).length;
  const liveParticipants = rooms
    .filter((room) => room.active)
    .reduce((total, room) => total + room.participantCount, 0);
  const roomHasIssues = detail?.room.status === ROOM_STATUS.DRAWN && detail.unmatched.length > 0;

  return (
    <main className={styles.dashboard}>
      <header className={styles.header}>
        <div>
          <span className={styles.brand}><Ticket /> Emparejao</span>
          <h1>Control de salas</h1>
          <p>{status.email}</p>
        </div>
        <div className={styles.headerActions}>
          <Button variant="outline" onClick={() => void loadRooms()} disabled={loadingRooms}>
            <RefreshCw className={loadingRooms ? styles.spin : ""} /> Actualizar
          </Button>
          <Button variant="outline" onClick={() => void logout()} disabled={busy}>
            <LogOut /> Salir
          </Button>
        </div>
      </header>

      <section className={styles.metrics}>
        <article><DoorOpen /><div><strong>{activeRooms}</strong><span>salas activas</span></div></article>
        <article><Users /><div><strong>{liveParticipants}</strong><span>personas activas</span></div></article>
        <article><CheckCircle2 /><div><strong>{rooms.filter((room) => room.status === ROOM_STATUS.DRAWN).length}</strong><span>salas sorteadas</span></div></article>
      </section>

      {error && <div className={styles.globalError} role="alert"><AlertTriangle /> {error}</div>}

      <section className={styles.workspace}>
        <aside className={styles.roomsPanel}>
          <div className={styles.panelHeading}>
            <div><span>Últimas 100</span><h2>Salas creadas</h2></div>
            <span className={styles.countPill}>{rooms.length}</span>
          </div>
          <div className={styles.roomList}>
            {rooms.map((room) => (
              <button
                type="button"
                key={room.id}
                className={`${styles.roomButton} ${selectedRoomId === room.id ? styles.selectedRoom : ""}`}
                onClick={() => setSelectedRoomId(room.id)}
              >
                <div>
                  <strong>PIN {room.code}</strong>
                  <span className={`${styles.statusDot} ${room.active ? styles.activeDot : ""}`}>
                    {roomStatusLabel(room)}
                  </span>
                </div>
                <p><Users /> {room.participantCount} de {room.expectedParticipants}</p>
                <small>{dateTime(room.createdAt)}</small>
              </button>
            ))}
            {!rooms.length && <p className={styles.empty}>Todavía no hay salas registradas.</p>}
          </div>
        </aside>

        <section className={styles.detailPanel}>
          {!detail ? (
            <div className={styles.emptyDetail}><DoorOpen /><p>Selecciona una sala para ver su actividad.</p></div>
          ) : (
            <>
              <div className={styles.detailHeader}>
                <div>
                  <span className={styles.kicker}>Sala {detail.room.code}</span>
                  <h2>{detail.room.participantCount} participantes</h2>
                  <p>Creada {dateTime(detail.room.createdAt)} · vence {dateTime(detail.room.expiresAt)}</p>
                </div>
                <span className={`${styles.roomState} ${detail.room.active ? styles.liveState : ""}`}>
                  {roomStatusLabel(detail.room)}
                </span>
              </div>

              {detail.room.status === ROOM_STATUS.LOBBY && (
                <div className={styles.infoBanner}><Clock3 /> El grupo sigue entrando. Las parejas aparecerán cuando el host realice el sorteo.</div>
              )}

              {roomHasIssues && (
                <section className={styles.issuePanel}>
                  <div className={styles.issueHeading}>
                    <AlertTriangle />
                    <div><h3>{detail.unmatched.length} personas sin una pareja válida</h3><p>Selecciona exactamente dos para unirlas manualmente.</p></div>
                  </div>
                  <div className={styles.unmatchedGrid}>
                    {detail.unmatched.map((participant) => (
                      <button
                        type="button"
                        key={participant.id}
                        className={`${styles.unmatchedPerson} ${selectedParticipants.includes(participant.id) ? styles.personSelected : ""}`}
                        onClick={() => toggleParticipant(participant.id)}
                      >
                        <span>{participant.name.slice(0, 1).toUpperCase()}</span>
                        <div><strong>{participant.name}</strong><small>Número: {participant.redNumber ?? "sin asignar"}</small></div>
                        {selectedParticipants.includes(participant.id) && <CheckCircle2 />}
                      </button>
                    ))}
                  </div>
                  <Button disabled={busy || selectedParticipants.length !== 2} onClick={() => void matchSelected()}>
                    {busy ? <LoaderCircle className={styles.spin} /> : <ArrowLeftRight />}
                    Emparejar seleccionados
                  </Button>
                  {detail.unmatched.length === 1 && (
                    <p className={styles.singleWarning}>Hay una sola persona libre. Para no romper otra pareja, utiliza “Cambiar parejas” desde el panel del host.</p>
                  )}
                </section>
              )}

              {detail.room.status === ROOM_STATUS.DRAWN && !roomHasIssues && (
                <div className={styles.successBanner}><CheckCircle2 /> Todos tienen una pareja válida.</div>
              )}

              <div className={styles.sectionHeading}>
                <div><span>Resultado</span><h3>Parejas agrupadas</h3></div>
                <strong>{detail.pairs.length}</strong>
              </div>
              <div className={styles.pairGrid}>
                {detail.pairs.map((pair) => (
                  <article className={styles.pairCard} key={pair.id}>
                    <div><span>#{pair.first.number}</span><strong>{pair.first.name}</strong></div>
                    <ArrowLeftRight />
                    <div><span>#{pair.second.number}</span><strong>{pair.second.name}</strong></div>
                  </article>
                ))}
                {detail.room.status === ROOM_STATUS.DRAWN && !detail.pairs.length && (
                  <p className={styles.empty}>Todavía no hay parejas válidas para mostrar.</p>
                )}
              </div>

              <div className={styles.sectionHeading}>
                <div><span>Registro en vivo</span><h3>Personas en la sala</h3></div>
                <strong>{detail.participants.length}</strong>
              </div>
              <div className={styles.peopleTable}>
                {detail.participants.map((participant, index) => (
                  <div key={participant.id}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <strong>{participant.name}</strong>
                    <small>{participant.redNumber === null ? "Esperando sorteo" : `Número ${participant.redNumber}`}</small>
                  </div>
                ))}
                {!detail.participants.length && <p className={styles.empty}>Nadie ha entrado todavía.</p>}
              </div>
            </>
          )}
        </section>
      </section>
    </main>
  );
}
