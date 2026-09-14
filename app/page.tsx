"use client";

import {
  ArrowLeft,
  AtSign,
  Bell,
  BellRing,
  Check,
  Copy,
  Crown,
  LoaderCircle,
  ScanLine,
  Share2,
  Sparkles,
  Ticket,
  Users,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const VIEW = {
  HOME: "home",
  CREATE: "create",
  JOIN: "join",
  HOST: "host",
  PARTICIPANT: "participant",
} as const;

const SESSION_KEY = "emparejao-session";
const LEGACY_SESSION_KEY = "pareo-session";
const NOTIFICATION_CAPABILITY = {
  CHECKING: "checking",
  READY: "ready",
  INSECURE: "insecure",
  UNSUPPORTED: "unsupported",
  IOS_INSTALL: "ios-install",
} as const;

type View = (typeof VIEW)[keyof typeof VIEW];
type NotificationCapability =
  (typeof NOTIFICATION_CAPABILITY)[keyof typeof NOTIFICATION_CAPABILITY];

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
  result: DrawResult | null;
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

interface BrowserNotificationMessage {
  title: string;
  body: string;
  tag: string;
  url?: string;
}

interface PushPublicKeyResponse {
  publicKey: string;
}

interface PushBatchResponse {
  attempted: number;
  delivered: number;
  next: string | null;
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

function isIosWithoutHomeScreen() {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const standalone = window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && navigator.standalone === true);
  return ios && !standalone;
}

function decodeApplicationServerKey(value: string) {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
  const decoded = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

async function api<T>(path: string, init?: RequestInit) {
  const response = await fetch(path, init);
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "No pudimos completar la acción.");
  return body;
}

async function copyText(value: string) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const field = document.createElement("textarea");
  field.value = value;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.append(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  if (!copied) throw new Error("Copy command failed");
}

async function savePushSubscription(session: SessionData, subscription: PushSubscription) {
  await api(`/api/rooms/${session.code}/push-subscription`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${session.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(subscription.toJSON()),
  });
}

async function subscribeToPush(session: SessionData) {
  const { publicKey } = await api<PushPublicKeyResponse>("/api/push/public-key", {
    cache: "no-store",
  });
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: decodeApplicationServerKey(publicKey),
  });
  await savePushSubscription(session, subscription);
}

async function notifyParticipants(session: SessionData) {
  let after = "";
  for (let batch = 0; batch < 25; batch += 1) {
    const result = await api<PushBatchResponse>(`/api/rooms/${session.code}/notify`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${session.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ after }),
    });
    if (!result.next) return;
    after = result.next;
  }
  throw new Error("No se pudieron completar todos los lotes de avisos.");
}

async function showBrowserNotification(message: BrowserNotificationMessage) {
  if (!("Notification" in window) || Notification.permission !== "granted") return false;

  const options: NotificationOptions = {
    body: message.body,
    icon: "/favicon.svg",
    tag: message.tag,
    data: { url: message.url ?? "/" },
  };

  try {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(message.title, options);
      return true;
    }
    new Notification(message.title, options);
    return true;
  } catch {
    return false;
  }
}

function showDrawNotification(roomCode: string) {
  return showBrowserNotification({
    title: "¡El sorteo comenzó!",
    body: "Tu tarjeta ya está lista. Vuelve para descubrir tu pareja.",
    tag: `emparejao-draw-${roomCode}`,
    url: `/?room=${roomCode}`,
  });
}

function Brand() {
  return (
    <div
      className="brand-lockup"
    >
      <span className="brand-mark"><Ticket aria-hidden="true" /></span>
      <span>Emparejao</span>
    </div>
  );
}

function SupportCta() {
  return (
    <a
      className="support-cta"
      href="https://www.instagram.com/pulseroutines/"
      target="_blank"
      rel="noreferrer"
      aria-label="Apoyar a Pulse Routines en Instagram"
    >
      <span className="support-copy">
        <small>¿Te gustó Emparejao?</small>
        <strong>Apoya este emprendimiento maracucho</strong>
        <em><AtSign aria-hidden="true" /> pulseroutines</em>
      </span>
    </a>
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
  const [shared, setShared] = useState(false);
  const [error, setError] = useState("");
  const [revealing, setRevealing] = useState(false);
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermission>("default");
  const [notificationCapability, setNotificationCapability] =
    useState<NotificationCapability>(NOTIFICATION_CAPABILITY.CHECKING);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushRefreshSignal, setPushRefreshSignal] = useState(0);

  useEffect(() => {
    const permissionTimer = window.setTimeout(() => {
      if (isIosWithoutHomeScreen()) {
        setNotificationCapability(NOTIFICATION_CAPABILITY.IOS_INSTALL);
        return;
      }
      if (
        !("Notification" in window) ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window)
      ) {
        setNotificationCapability(NOTIFICATION_CAPABILITY.UNSUPPORTED);
        return;
      }
      if (!window.isSecureContext) {
        setNotificationCapability(NOTIFICATION_CAPABILITY.INSECURE);
        return;
      }
      setNotificationPermission(Notification.permission);
      setNotificationCapability(NOTIFICATION_CAPABILITY.READY);
    }, 0);
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    return () => window.clearTimeout(permissionTimer);
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !session || session.role !== "participant") return;
    const onPushMessage = (event: MessageEvent<unknown>) => {
      if (!event.data || typeof event.data !== "object") return;
      const message = event.data as Record<string, unknown>;
      if (message.type === "DRAW_STARTED" && message.roomCode === session.code) {
        setPushRefreshSignal((value) => value + 1);
      }
    };
    navigator.serviceWorker.addEventListener("message", onPushMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onPushMessage);
  }, [session]);

  useEffect(() => {
    if (
      notificationCapability !== NOTIFICATION_CAPABILITY.READY ||
      notificationPermission !== "granted" ||
      !session ||
      session.role !== "participant"
    ) return;
    let active = true;
    void navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then(async (subscription) => {
        if (!subscription) return;
        await savePushSubscription(session, subscription);
        if (active) setPushSubscribed(true);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [notificationCapability, notificationPermission, session]);

  useEffect(() => {
    const restoreTimer = window.setTimeout(() => {
      const roomFromUrl = new URLSearchParams(window.location.search).get("room") ?? "";
      const saved =
        sessionStorage.getItem(SESSION_KEY) ??
        localStorage.getItem(SESSION_KEY) ??
        sessionStorage.getItem(LEGACY_SESSION_KEY) ??
        localStorage.getItem(LEGACY_SESSION_KEY);
      if (saved) {
        try {
          const parsed: unknown = JSON.parse(saved);
          if (isSessionData(parsed)) {
            const storage = parsed.role === "host" ? localStorage : sessionStorage;
            storage.setItem(SESSION_KEY, saved);
            localStorage.removeItem(LEGACY_SESSION_KEY);
            sessionStorage.removeItem(LEGACY_SESSION_KEY);
            setSession(parsed);
            setCode(parsed.code);
            setView(parsed.role === "host" ? VIEW.HOST : VIEW.PARTICIPANT);
            return;
          }
        } catch {
          localStorage.removeItem(SESSION_KEY);
          sessionStorage.removeItem(SESSION_KEY);
          localStorage.removeItem(LEGACY_SESSION_KEY);
          sessionStorage.removeItem(LEGACY_SESSION_KEY);
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
    let previousStatus = session.role === "participant" ? "lobby" : "";

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
            if (document.hidden) void showDrawNotification(session.code);
          }
          previousStatus = participantData.status;
          setParticipantRoom(participantData);
        }
      } catch (refreshError) {
        if (!active) return;
        setError(refreshError instanceof Error ? refreshError.message : "Conexión interrumpida.");
      } finally {
        if (active) {
          const delay = session.role === "host" ? 1800 : document.hidden ? 45000 : 20000;
          timer = setTimeout(refresh, delay);
        }
      }
    }

    void refresh();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [session, pushRefreshSignal]);

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(
      context.registerTool(
        {
          name: "prepare_room_creation",
          title: "Preparar una sala",
          description: "Abre el formulario para configurar un nuevo sorteo de Emparejao.",
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
    if (session?.role === "host") {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(LEGACY_SESSION_KEY);
    } else {
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(LEGACY_SESSION_KEY);
    }
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
      localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
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
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
      setSession(nextSession);
      setView(VIEW.PARTICIPANT);
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "No pudimos entrar a la sala.");
    } finally {
      setBusy(false);
    }
  }

  async function startDraw(closeWithPresent = false, includeHost = false) {
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/rooms/${session.code}/start`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${session.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ closeWithPresent, includeHost }),
      });
      const updatedRoom = await api<HostRoom>(`/api/rooms/${session.code}`, {
        headers: { authorization: `Bearer ${session.token}` },
        cache: "no-store",
      });
      setHostRoom(updatedRoom);
      try {
        await notifyParticipants(session);
      } catch {
        setError("El sorteo se completó, pero algunos avisos push podrían no haberse enviado.");
      }
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "No pudimos iniciar el sorteo.");
    } finally {
      setBusy(false);
    }
  }

  async function copyInvite() {
    if (!session) return;
    try {
      await copyText(`${window.location.origin}/?room=${session.code}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("No pudimos copiar el enlace. Intenta compartirlo directamente.");
    }
  }

  async function shareInvite() {
    if (!session) return;
    const url = `${window.location.origin}/?room=${session.code}`;
    if (!navigator.share) {
      try {
        await copyText(url);
        setShared(true);
        window.setTimeout(() => setShared(false), 1800);
      } catch {
        setError("No pudimos compartir ni copiar el enlace en este navegador.");
      }
      return;
    }
    try {
      await navigator.share({
        title: "Emparejao",
        text: `Únete a mi sala de Emparejao. PIN: ${session.code}`,
        url,
      });
      setShared(true);
      window.setTimeout(() => setShared(false), 1800);
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === "AbortError") return;
      setError("No pudimos abrir el menú para compartir. Puedes copiar el enlace.");
    }
  }

  async function enableNotifications() {
    if (!("Notification" in window) || !session || session.role !== "participant") {
      setError("Este navegador no admite notificaciones.");
      return;
    }
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    if (permission === "denied") {
      setError("Las notificaciones están bloqueadas. Puedes activarlas desde los ajustes del navegador.");
    } else if (permission === "granted") {
      try {
        await subscribeToPush(session);
        setPushSubscribed(true);
        setError("");
        const displayed = await showBrowserNotification({
          title: "Notificaciones activadas",
          body: "Te avisaremos aunque cierres Emparejao.",
          tag: "emparejao-notifications-ready",
        });
        if (!displayed) {
          setError("La suscripción quedó activa, pero el aviso de prueba no pudo mostrarse.");
        }
      } catch (subscriptionError) {
        setPushSubscribed(false);
        setError(
          subscriptionError instanceof Error
            ? subscriptionError.message
            : "No pudimos completar la suscripción push.",
        );
      }
    }
  }

  async function testNotification() {
    const displayed = await showBrowserNotification({
      title: "Emparejao está listo",
      body: "Este es tu aviso de prueba.",
      tag: "emparejao-notifications-test",
    });
    if (!displayed) setError("El navegador no pudo mostrar la notificación de prueba.");
  }

  const participantCount = hostRoom?.participants.length ?? 0;
  const roomFull = Boolean(hostRoom && participantCount === hostRoom.expectedParticipants);
  const canCloseEarly = Boolean(
    hostRoom &&
    hostRoom.status === "lobby" &&
    participantCount >= 2 &&
    participantCount < hostRoom.expectedParticipants &&
    participantCount % 2 === 0,
  );
  const hasOddGroup = participantCount > 0 && participantCount % 2 !== 0;

  if (view === VIEW.HOST && session) {
    return (
      <main className="app-shell host-shell">
        <header className="topbar">
          <Brand />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button className="quiet-link" type="button">Salir</button>
            </AlertDialogTrigger>
            <AlertDialogContent className="close-dialog">
              <AlertDialogHeader>
                <AlertDialogTitle>¿Quieres eliminar tu acceso?</AlertDialogTitle>
                <AlertDialogDescription>
                  La sala seguirá activa durante 24 horas, pero este dispositivo perderá el acceso para administrarla. Si solo quieres cerrar la ventana, no necesitas salir.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Conservar acceso</AlertDialogCancel>
                <AlertDialogAction onClick={leaveSession}>Salir y eliminar acceso</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </header>
        <SupportCta />
        <section className="host-grid">
          <div className="invite-panel">
            <span className="eyebrow"><Crown aria-hidden="true" /> Panel del organizador</span>
            <h1>Que todos entren<br />a la misma sala.</h1>
            <div className="pin-card">
              <span>PIN de la sala</span>
              <strong>{session.code}</strong>
              <div className="invite-actions">
                <button type="button" onClick={copyInvite}>{copied ? <Check /> : <Copy />}{copied ? "Enlace copiado" : "Copiar enlace"}</button>
                <button type="button" onClick={shareInvite}>{shared ? <Check /> : <Share2 />}{shared ? "Enlace listo" : "Compartir enlace"}</button>
              </div>
            </div>
            <p className="room-persistence"><Check aria-hidden="true" /> Puedes cerrar esta ventana: la sala seguirá activa por 24 horas y volverá a abrirse en este dispositivo.</p>
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
            {hostRoom?.result && (
              <div className="host-result-card">
                <p>Tu tarjeta de comodín</p>
                <div>
                  <span><small>ROJO</small><strong>{hostRoom.result.redNumber}</strong></span>
                  <span><small>AZUL</small><strong>{hostRoom.result.blueNumber}</strong></span>
                </div>
              </div>
            )}
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
            <Button className="primary-action" size="lg" disabled={!roomFull || busy || hostRoom?.status === "drawn"} onClick={() => startDraw(false)}>
              {busy ? <LoaderCircle className="spin" /> : <Sparkles />}
              {hostRoom?.status === "drawn" ? "Sorteo enviado" : roomFull ? "Iniciar sorteo" : `Faltan ${(hostRoom?.expectedParticipants ?? 0) - participantCount}`}
            </Button>
            {canCloseEarly && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button className="early-close" variant="outline" disabled={busy}>
                    Cerrar cupo con {participantCount} presentes
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="close-dialog">
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Cerrar el cupo con {participantCount} personas?</AlertDialogTitle>
                    <AlertDialogDescription>
                      La sala esperaba {hostRoom?.expectedParticipants}. Se sortearán únicamente las personas presentes y ya no podrá entrar nadie más.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Seguir esperando</AlertDialogCancel>
                    <AlertDialogAction onClick={() => startDraw(true)}>Cerrar y sortear</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {!roomFull && hasOddGroup && hostRoom?.status === "lobby" && (
              <>
                <p className="lobby-hint">Hay un número impar. Puedes esperar 1 persona más o entrar tú como comodín.</p>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button className="host-wildcard" variant="outline" disabled={busy}>
                      Sumarme como comodín
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="close-dialog">
                    <AlertDialogHeader>
                      <AlertDialogTitle>¿Entrar al sorteo como comodín?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Serán {participantCount + 1} personas. El cupo se cerrará y tu tarjeta aparecerá en el panel del organizador.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Seguir esperando</AlertDialogCancel>
                      <AlertDialogAction onClick={() => startDraw(true, true)}>Sumarme y sortear</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
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
        <SupportCta />
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
              {notificationCapability === NOTIFICATION_CAPABILITY.INSECURE && (
                <div className="notification-help" role="status">
                  <Bell /> <span><strong>Necesitas una conexión segura</strong>Abre Emparejao con HTTPS o desde localhost para activar avisos.</span>
                </div>
              )}
              {notificationCapability === NOTIFICATION_CAPABILITY.UNSUPPORTED && (
                <div className="notification-help" role="status">
                  <Bell /> <span><strong>Avisos no disponibles aquí</strong>Abre el enlace en Chrome, Safari, Firefox o Edge.</span>
                </div>
              )}
              {notificationCapability === NOTIFICATION_CAPABILITY.IOS_INSTALL && (
                <div className="notification-help" role="status">
                  <Bell /> <span><strong>En iPhone: añádela a Inicio</strong>Toca Compartir, elige “Añadir a pantalla de inicio”, abre Emparejao desde el icono y activa el aviso allí.</span>
                </div>
              )}
              {notificationCapability === NOTIFICATION_CAPABILITY.READY && notificationPermission === "granted" && pushSubscribed && (
                <div className="notification-enabled"><BellRing /> Te avisaremos aunque cierres la app <button type="button" onClick={testNotification}>Probar aviso</button></div>
              )}
              {notificationCapability === NOTIFICATION_CAPABILITY.READY && (notificationPermission === "default" || (notificationPermission === "granted" && !pushSubscribed)) && (
                <button className="notification-button" type="button" onClick={enableNotifications}>
                  <Bell /> {notificationPermission === "granted" ? "Completar avisos" : "Avisarme cuando empiece"}
                </button>
              )}
              {notificationCapability === NOTIFICATION_CAPABILITY.READY && notificationPermission === "denied" && (
                <div className="notification-help blocked" role="status">
                  <Bell /> <span><strong>Notificaciones bloqueadas</strong>Permítelas desde los ajustes del sitio en tu navegador y recarga la página.</span>
                </div>
              )}
              {error && <p className="form-error" role="alert">{error}</p>}
            </div>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell landing-shell">
      <header className="topbar"><Brand /><span className="capacity-pill"><Crown /> Tú defines el cupo</span></header>
      <SupportCta />
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
              <div className="action-heading"><h2>Crea tu sala</h2><p>Tú decides el cupo exacto. Debe ser un número par.</p></div>
              <div className="field-label-row">
                <label className="field-label" htmlFor="expected">Cantidad de participantes</label>
                <span>Máximo 800</span>
              </div>
              <div className="number-field"><Input id="expected" inputMode="numeric" min="2" max="800" step="2" value={expected} onChange={(event) => setExpected(event.target.value.replace(/\D/g, "").slice(0, 3))} /><span>personas</span></div>
              <p className="field-help">Elige cualquier número par entre 2 y 800.</p>
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
      <footer><span>Emparejao</span><p>Privado, rápido y sin descargas.</p></footer>
    </main>
  );
}
