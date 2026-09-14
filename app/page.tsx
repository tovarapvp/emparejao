"use client";

import {
  ArrowLeft,
  Check,
  Copy,
  Crown,
  LoaderCircle,
  ScanLine,
  Sparkles,
  Ticket,
  Users,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const VIEW = {
  HOME: "home",
  CREATE: "create",
  JOIN: "join",
  HOST: "host",
  PARTICIPANT: "participant",
} as const;

type View = (typeof VIEW)[keyof typeof VIEW];

interface SessionData {
  role: "host" | "participant";
  code: string;
  token: string;
}

interface ParticipantSummary {
  id: string;
  name: string;
  joined_at: number;
}

interface HostRoom {
  status: "lobby" | "drawn";
  expectedParticipants: number;
  participants: ParticipantSummary[];
}

interface DrawResult {
  redNumber: number;
  blueNumber: number;
}

interface ParticipantRoom {
  name: string;
  status: "lobby" | "drawn";
  expectedParticipants: number;
  participantCount: number;
  result: DrawResult | null;
}

declare global {
  interface Document {
    modelContext?: {
      registerTool: (
        tool: {
          name: string;
          title: string;
          description: string;
          inputSchema: object;
          annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
          execute: (input: unknown) => unknown;
        },
        options: { signal: AbortSignal },
      ) => void | Promise<void>;
    };
  }
}

function isSessionData(value: unknown): value is SessionData {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    (item.role === "host" || item.role === "participant") &&
    typeof item.code === "string" &&
    typeof item.token === "string"
  );
}

async function api<T>(path: string, init?: RequestInit) {
  const response = await fetch(path, init);
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "No pudimos completar la acción.");
  return body;
}

function Brand() {
  return (
    <div
      className="brand-lockup"
    >
      <span className="brand-mark"><Ticket aria-hidden="true" /></span>
      <span>Pareo</span>
    </div>
  );
}

function RoomCounter({ current, total }: { current: number; total: number }) {
  const percentage = total ? Math.min(100, (current / total) * 100) : 0;
  return (
    <div className="counter-block" aria-label={`${current} de ${total} personas conectadas`}>
      <div className="counter-copy">
        <span><Users aria-hidden="true" /> Personas en la sala</span>
        <strong>{current}<small> / {total}</small></strong>
      </div>
      <div className="progress-track"><span style={{ width: `${percentage}%` }} /></div>
    </div>
  );
}

export default function Home() {
  const [view, setView] = useState<View>(VIEW.HOME);
  const [expected, setExpected] = useState("20");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [session, setSession] = useState<SessionData | null>(null);
  const [hostRoom, setHostRoom] = useState<HostRoom | null>(null);
  const [participantRoom, setParticipantRoom] = useState<ParticipantRoom | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [revealing, setRevealing] = useState(false);

  useEffect(() => {
    const restoreTimer = window.setTimeout(() => {
      const roomFromUrl = new URLSearchParams(window.location.search).get("room") ?? "";
      const saved = sessionStorage.getItem("pareo-session");
      if (saved) {
        try {
          const parsed: unknown = JSON.parse(saved);
          if (isSessionData(parsed)) {
            setSession(parsed);
            setCode(parsed.code);
            setView(parsed.role === "host" ? VIEW.HOST : VIEW.PARTICIPANT);
            return;
          }
        } catch {
          sessionStorage.removeItem("pareo-session");
        }
      }
      if (roomFromUrl) {
        setCode(roomFromUrl.replace(/\D/g, "").slice(0, 6));
        setView(VIEW.JOIN);
      }
    }, 0);
    return () => window.clearTimeout(restoreTimer);
  }, []);

  useEffect(() => {
    if (!session) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let previousStatus = "";

    async function refresh() {
      try {
        const data = await api<HostRoom | ParticipantRoom>(`/api/rooms/${session?.code}`, {
          headers: { authorization: `Bearer ${session?.token}` },
          cache: "no-store",
        });
        if (!active) return;
        setError("");
        if (session?.role === "host") {
          setHostRoom(data as HostRoom);
        } else {
          const participantData = data as ParticipantRoom;
          if (participantData.status === "drawn" && previousStatus === "lobby") {
            setRevealing(true);
            window.setTimeout(() => setRevealing(false), 1800);
          }
          previousStatus = participantData.status;
          setParticipantRoom(participantData);
        }
      } catch (refreshError) {
        if (!active) return;
        setError(refreshError instanceof Error ? refreshError.message : "Conexión interrumpida.");
      } finally {
        if (active) timer = setTimeout(refresh, document.hidden ? 5000 : 1800);
      }
    }

    void refresh();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [session]);

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(
      context.registerTool(
        {
          name: "prepare_room_creation",
          title: "Preparar una sala",
          description: "Abre el formulario para configurar un nuevo sorteo de Pareo.",
          inputSchema: { type: "object", properties: {}, additionalProperties: false },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          execute: () => {
            setView(VIEW.CREATE);
            setError("");
            return { view: "create-room" };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);
    return () => lifecycle.abort();
  }, []);

  useEffect(() => {
    if (!session || session.role !== "host") return;
    const joinUrl = `${window.location.origin}/?room=${session.code}`;
    void QRCode.toDataURL(joinUrl, {
      width: 360,
      margin: 1,
      color: { dark: "#151515", light: "#ffffff" },
      errorCorrectionLevel: "M",
    }).then(setQrDataUrl);
  }, [session]);

  function leaveSession() {
    sessionStorage.removeItem("pareo-session");
    setSession(null);
    setHostRoom(null);
    setParticipantRoom(null);
    setView(VIEW.HOME);
    setError("");
    window.history.replaceState({}, "", "/");
  }

  async function createRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await api<{ code: string; hostToken: string }>("/api/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedParticipants: Number(expected) }),
      });
      const nextSession: SessionData = { role: "host", code: data.code, token: data.hostToken };
      sessionStorage.setItem("pareo-session", JSON.stringify(nextSession));
      setCode(data.code);
      setSession(nextSession);
      setView(VIEW.HOST);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "No pudimos crear la sala.");
    } finally {
      setBusy(false);
    }
  }

  async function joinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const normalizedCode = code.replace(/\D/g, "").slice(0, 6);
      const data = await api<{ participantToken: string; name: string }>(
        `/api/rooms/${normalizedCode}/join`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name }),
        },
      );
      const nextSession: SessionData = {
        role: "participant",
        code: normalizedCode,
        token: data.participantToken,
      };
      sessionStorage.setItem("pareo-session", JSON.stringify(nextSession));
      setSession(nextSession);
      setView(VIEW.PARTICIPANT);
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "No pudimos entrar a la sala.");
    } finally {
      setBusy(false);
    }
  }

  async function startDraw() {
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/rooms/${session.code}/start`, {
        method: "POST",
        headers: { authorization: `Bearer ${session.token}` },
      });
      setHostRoom((current) => current ? { ...current, status: "drawn" } : current);
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "No pudimos iniciar el sorteo.");
    } finally {
      setBusy(false);
    }
  }

  async function copyInvite() {
    if (!session) return;
    await navigator.clipboard.writeText(`${window.location.origin}/?room=${session.code}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  const participantCount = hostRoom?.participants.length ?? 0;
  const roomFull = Boolean(hostRoom && participantCount === hostRoom.expectedParticipants);

  if (view === VIEW.HOST && session) {
    return (
      <main className="app-shell host-shell">
        <header className="topbar"><Brand /><button className="quiet-link" onClick={leaveSession}>Salir</button></header>
        <section className="host-grid">
          <div className="invite-panel">
            <span className="eyebrow"><Crown aria-hidden="true" /> Panel del organizador</span>
            <h1>Que todos entren<br />a la misma sala.</h1>
            <div className="pin-card">
              <span>PIN de la sala</span>
              <strong>{session.code}</strong>
              <button type="button" onClick={copyInvite}>{copied ? <Check /> : <Copy />}{copied ? "Enlace copiado" : "Copiar invitación"}</button>
            </div>
            <div className="qr-frame">
              {qrDataUrl ? <Image src={qrDataUrl} width={360} height={360} unoptimized alt={`Código QR para entrar a la sala ${session.code}`} /> : <LoaderCircle className="spin" aria-label="Creando QR" />}
              <p><ScanLine aria-hidden="true" /> Escanea para entrar</p>
            </div>
          </div>

          <div className="lobby-panel">
            <div>
              <span className="eyebrow"><span className="live-dot" /> Sala en vivo</span>
              <h2>{hostRoom?.status === "drawn" ? "Sorteo completado" : "Esperando al grupo"}</h2>
              <p className="muted">Los nombres aparecerán aquí cuando entren.</p>
            </div>
            <RoomCounter current={participantCount} total={hostRoom?.expectedParticipants ?? Number(expected)} />
            <div className="roster" aria-live="polite">
              {hostRoom?.participants.map((participant, index) => (
                <div className="person" key={participant.id}>
                  <span>{participant.name.slice(0, 1).toUpperCase()}</span>
                  <p>{participant.name}</p>
                  <small>#{String(index + 1).padStart(2, "0")}</small>
                </div>
              ))}
              {!participantCount && <div className="empty-roster"><Users /><p>Aún no hay nadie en la sala.</p></div>}
            </div>
            {error && <p className="form-error" role="alert">{error}</p>}
            <Button className="primary-action" size="lg" disabled={!roomFull || busy || hostRoom?.status === "drawn"} onClick={startDraw}>
              {busy ? <LoaderCircle className="spin" /> : <Sparkles />}
              {hostRoom?.status === "drawn" ? "Sorteo enviado" : roomFull ? "Iniciar sorteo" : `Faltan ${(hostRoom?.expectedParticipants ?? 0) - participantCount}`}
            </Button>
          </div>
        </section>
      </main>
    );
  }

  if (view === VIEW.PARTICIPANT && session) {
    const result = participantRoom?.result;
    return (
      <main className="app-shell participant-shell">
        <header className="topbar"><Brand /><button className="quiet-link" onClick={leaveSession}>Salir</button></header>
        <section className="participant-stage">
          {revealing ? (
            <div className="reveal-loader" aria-live="polite"><span><Sparkles /></span><h1>Buscando tu pareja…</h1><p>Mezclando las tarjetas</p></div>
          ) : result ? (
            <div className="result-wrap">
              <span className="eyebrow light"><Sparkles /> Tu tarjeta virtual</span>
              <h1>¡Listo, {participantRoom?.name}!</h1>
              <p>Busca a la persona cuyo número rojo coincide con tu número azul.</p>
              <div className="ticket-result">
                <div className="ticket-half red-half"><span>Tu número</span><strong>{result.redNumber}</strong><small>ROJO</small></div>
                <div className="ticket-half blue-half"><span>Tu pareja</span><strong>{result.blueNumber}</strong><small>AZUL</small></div>
              </div>
              <div className="privacy-note"><Check /> Solo tú puedes ver esta tarjeta</div>
            </div>
          ) : (
            <div className="waiting-card">
              <span className="waiting-orbit"><Users /></span>
              <span className="eyebrow"><span className="live-dot" /> Ya estás dentro</span>
              <h1>Hola, {participantRoom?.name ?? "participante"}.</h1>
              <p>Tu tarjeta aparecerá aquí cuando el organizador inicie el sorteo.</p>
              <RoomCounter current={participantRoom?.participantCount ?? 0} total={participantRoom?.expectedParticipants ?? 0} />
              <div className="room-chip">Sala <strong>{session.code}</strong></div>
              {error && <p className="form-error" role="alert">{error}</p>}
            </div>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell landing-shell">
      <header className="topbar"><Brand /><span className="capacity-pill"><span className="live-dot" /> Hasta 500 personas</span></header>
      <section className="landing-grid">
        <div className="intro-copy">
          <span className="eyebrow"><Sparkles aria-hidden="true" /> Sorteos en vivo, sin papelitos</span>
          <h1>Encuentra a tu<br /><em>pareja</em> en vivo.</h1>
          <p>Crea una sala, invita al grupo y revela todas las parejas al mismo tiempo.</p>
          <div className="mini-proof"><span>1</span> sala <i /> <span>1</span> PIN <i /> <span>0</span> enredos</div>
        </div>

        <div className="action-card">
          {view === VIEW.HOME && (
            <>
              <div className="action-heading"><h2>¿Qué quieres hacer?</h2><p>Empieza en menos de un minuto.</p></div>
              <Button className="choice primary-choice" onClick={() => setView(VIEW.CREATE)}><span><Crown /></span><span><strong>Crear un sorteo</strong><small>Organiza y controla la sala</small></span></Button>
              <button className="choice secondary-choice" onClick={() => setView(VIEW.JOIN)}><span><Users /></span><span><strong>Entrar a una sala</strong><small>Usa el PIN del organizador</small></span></button>
            </>
          )}

          {view === VIEW.CREATE && (
            <form onSubmit={createRoom}>
              <button type="button" className="back-button" onClick={() => setView(VIEW.HOME)}><ArrowLeft /> Volver</button>
              <div className="action-heading"><h2>Crea tu sala</h2><p>El número debe ser par para formar parejas.</p></div>
              <label className="field-label" htmlFor="expected">¿Cuántas personas participarán?</label>
              <div className="number-field"><Input id="expected" inputMode="numeric" min="2" max="500" step="2" value={expected} onChange={(event) => setExpected(event.target.value.replace(/\D/g, "").slice(0, 3))} /><span>personas</span></div>
              <div className="quick-counts">{[10, 20, 50, 100].map((count) => <button type="button" key={count} onClick={() => setExpected(String(count))}>{count}</button>)}</div>
              {error && <p className="form-error" role="alert">{error}</p>}
              <Button className="form-submit" size="lg" disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <Sparkles />} Crear sala</Button>
            </form>
          )}

          {view === VIEW.JOIN && (
            <form onSubmit={joinRoom}>
              <button type="button" className="back-button" onClick={() => setView(VIEW.HOME)}><ArrowLeft /> Volver</button>
              <div className="action-heading"><h2>Entra a la sala</h2><p>Pide el PIN al organizador.</p></div>
              <label className="field-label" htmlFor="code">PIN de 6 dígitos</label>
              <Input id="code" className="pin-input" inputMode="numeric" autoComplete="one-time-code" placeholder="000 000" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} />
              <label className="field-label" htmlFor="name">Tu nombre</label>
              <Input id="name" autoComplete="name" maxLength={40} placeholder="Ej. Andrea" value={name} onChange={(event) => setName(event.target.value)} />
              {error && <p className="form-error" role="alert">{error}</p>}
              <Button className="form-submit" size="lg" disabled={busy || code.length !== 6 || name.trim().length < 2}>{busy ? <LoaderCircle className="spin" /> : <Users />} Entrar ahora</Button>
            </form>
          )}
        </div>
      </section>
      <footer><span>Pareo</span><p>Privado, rápido y sin descargas.</p></footer>
    </main>
  );
}
