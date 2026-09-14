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
import { useEffect, useRef, useState, type FormEvent } from "react";
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
const LANGUAGE_KEY = "emparejao-language";
const LANGUAGE = {
  ES: "es",
  EN: "en",
} as const;
const TICKET_COLOR = {
  RED: "red",
  BLUE: "blue",
} as const;
const NOTIFICATION_CAPABILITY = {
  CHECKING: "checking",
  READY: "ready",
  INSECURE: "insecure",
  UNSUPPORTED: "unsupported",
  IOS_INSTALL: "ios-install",
} as const;

type View = (typeof VIEW)[keyof typeof VIEW];
type Language = (typeof LANGUAGE)[keyof typeof LANGUAGE];
type NotificationCapability =
  (typeof NOTIFICATION_CAPABILITY)[keyof typeof NOTIFICATION_CAPABILITY];

const ES_COPY = {
  languageLabel: "Idioma",
  supportAria: "Apoyar a Pulse Routines en Instagram",
  supportQuestion: "¿Te gustó Emparejao?",
  supportTitle: "Apoya este emprendimiento maracucho",
  peopleConnected: "personas conectadas",
  peopleInRoom: "Personas en la sala",
  exit: "Salir",
  removeAccessTitle: "¿Quieres eliminar tu acceso?",
  removeAccessBody: "La sala seguirá activa durante 24 horas, pero este dispositivo perderá el acceso para administrarla. Si solo quieres cerrar la ventana, no necesitas salir.",
  keepAccess: "Conservar acceso",
  exitRemoveAccess: "Salir y eliminar acceso",
  hostPanel: "Panel del organizador",
  hostHeadlineTop: "Que todos entren",
  hostHeadlineBottom: "a la misma sala.",
  roomPin: "PIN de la sala",
  linkCopied: "Enlace copiado",
  copyLink: "Copiar enlace",
  linkReady: "Enlace listo",
  shareLink: "Compartir enlace",
  roomPersistence: "Puedes cerrar esta ventana: la sala seguirá activa por 24 horas y volverá a abrirse en este dispositivo.",
  qrAlt: "Código QR para entrar a la sala",
  creatingQr: "Creando QR",
  scanToJoin: "Escanea para entrar",
  liveRoom: "Sala en vivo",
  drawComplete: "Sorteo completado",
  waitingForGroup: "Esperando al grupo",
  namesAppear: "Los nombres aparecerán aquí cuando entren.",
  wildcardCard: "Tu tarjeta de comodín",
  red: "ROJO",
  blue: "AZUL",
  emptyRoom: "Aún no hay nadie en la sala.",
  drawSent: "Sorteo enviado",
  startDraw: "Iniciar sorteo",
  missing: "Faltan",
  closeCapacityWith: "Cerrar cupo con",
  present: "presentes",
  closeCapacityTitle: "¿Cerrar el cupo con",
  peopleQuestion: "personas?",
  closeCapacityBodyStart: "La sala esperaba",
  closeCapacityBodyEnd: "Se sortearán únicamente las personas presentes y ya no podrá entrar nadie más.",
  keepWaiting: "Seguir esperando",
  closeAndDraw: "Cerrar y sortear",
  oddGroupHint: "Hay un número impar. Puedes esperar 1 persona más o entrar tú como comodín.",
  joinAsWildcard: "Sumarme como comodín",
  wildcardTitle: "¿Entrar al sorteo como comodín?",
  wildcardBodyStart: "Serán",
  wildcardBodyEnd: "personas. El cupo se cerrará y tu tarjeta aparecerá en el panel del organizador.",
  joinAndDraw: "Sumarme y sortear",
  findingMatch: "Buscando tu pareja…",
  shufflingCards: "Mezclando las tarjetas",
  virtualCard: "Tu tarjeta virtual",
  ready: "¡Listo",
  matchInstruction: "Tu ficha tiene un color y número únicos. Busca la combinación indicada debajo.",
  yourNumber: "Tu número",
  yourMatch: "Busca",
  privateCard: "Solo tú puedes ver esta tarjeta",
  inside: "Ya estás dentro",
  hello: "Hola",
  participant: "participante",
  cardWillAppear: "Tu tarjeta aparecerá aquí cuando el organizador inicie el sorteo.",
  room: "Sala",
  secureTitle: "Necesitas una conexión segura",
  secureBody: "Abre Emparejao con HTTPS o desde localhost para activar avisos.",
  unsupportedTitle: "Avisos no disponibles aquí",
  unsupportedBody: "Abre el enlace en Chrome, Safari, Firefox o Edge.",
  iosTitle: "En iPhone: añádela a Inicio",
  iosBody: "Toca Compartir, elige “Añadir a pantalla de inicio”, abre Emparejao desde el icono y activa el aviso allí.",
  notificationsReady: "Te avisaremos aunque cierres la app",
  testNotification: "Probar aviso",
  finishNotifications: "Completar avisos",
  notifyWhenStarts: "Avisarme cuando empiece",
  notificationsBlocked: "Notificaciones bloqueadas",
  notificationsBlockedBody: "Permítelas desde los ajustes del sitio en tu navegador y recarga la página.",
  capacityControl: "Tú defines el cupo",
  liveNoPaper: "Sorteos en vivo, sin papelitos",
  heroTop: "Encuentra a tu",
  heroEmphasis: "pareja",
  heroBottom: "en vivo.",
  heroBody: "Crea una sala, invita al grupo y revela todas las parejas al mismo tiempo.",
  oneRoom: "sala",
  noMess: "enredos",
  whatToDo: "¿Qué quieres hacer?",
  underMinute: "Empieza en menos de un minuto.",
  createDraw: "Crear un sorteo",
  createDrawHelp: "Organiza y controla la sala",
  joinRoom: "Entrar a una sala",
  joinRoomHelp: "Usa el PIN del organizador",
  back: "Volver",
  createRoom: "Crea tu sala",
  createRoomHelp: "Tú decides el cupo exacto. Debe ser un número par.",
  participantCount: "Cantidad de participantes",
  maximum: "Máximo 800",
  people: "personas",
  evenHelp: "Elige cualquier número par entre 2 y 800.",
  createRoomButton: "Crear sala",
  enterRoom: "Entra a la sala",
  askPin: "Pide el PIN al organizador.",
  sixDigitPin: "PIN de 6 dígitos",
  yourName: "Tu nombre",
  namePlaceholder: "Ej. Andrea",
  enterNow: "Entrar ahora",
  footer: "Privado, rápido y sin descargas.",
  shareInvite: "Únete a mi sala de Emparejao. PIN:",
  drawNotificationTitle: "¡El sorteo comenzó!",
  drawNotificationBody: "Tu tarjeta ya está lista. Vuelve para descubrir tu pareja.",
  enabledNotificationTitle: "Notificaciones activadas",
  enabledNotificationBody: "Te avisaremos aunque cierres Emparejao.",
  testNotificationTitle: "Emparejao está listo",
  testNotificationBody: "Este es tu aviso de prueba.",
  connectionInterrupted: "Conexión interrumpida.",
  createFailed: "No pudimos crear la sala.",
  joinFailed: "No pudimos entrar a la sala.",
  drawFailed: "No pudimos iniciar el sorteo.",
  pushPartial: "El sorteo se completó, pero algunos avisos push podrían no haberse enviado.",
  copyFailed: "No pudimos copiar el enlace. Intenta compartirlo directamente.",
  shareCopyFailed: "No pudimos compartir ni copiar el enlace en este navegador.",
  shareMenuFailed: "No pudimos abrir el menú para compartir. Puedes copiar el enlace.",
  notificationsUnsupported: "Este navegador no admite notificaciones.",
  notificationsDenied: "Las notificaciones están bloqueadas. Puedes activarlas desde los ajustes del navegador.",
  notificationTestFailed: "La suscripción quedó activa, pero el aviso de prueba no pudo mostrarse.",
  pushFailed: "No pudimos completar la suscripción push.",
  browserNotificationFailed: "El navegador no pudo mostrar la notificación de prueba.",
} as const;

type TranslationKey = keyof typeof ES_COPY;

const EN_COPY: Record<TranslationKey, string> = {
  languageLabel: "Language",
  supportAria: "Support Pulse Routines on Instagram",
  supportQuestion: "Enjoying Emparejao?",
  supportTitle: "Support this Maracaibo-made project",
  peopleConnected: "people connected",
  peopleInRoom: "People in the room",
  exit: "Exit",
  removeAccessTitle: "Remove your access?",
  removeAccessBody: "The room will stay active for 24 hours, but this device will lose access to manage it. If you only want to close the window, you do not need to exit.",
  keepAccess: "Keep access",
  exitRemoveAccess: "Exit and remove access",
  hostPanel: "Host dashboard",
  hostHeadlineTop: "Bring everyone into",
  hostHeadlineBottom: "the same room.",
  roomPin: "Room PIN",
  linkCopied: "Link copied",
  copyLink: "Copy link",
  linkReady: "Link ready",
  shareLink: "Share link",
  roomPersistence: "You can close this window: the room will stay active for 24 hours and reopen on this device.",
  qrAlt: "QR code to join room",
  creatingQr: "Creating QR code",
  scanToJoin: "Scan to join",
  liveRoom: "Live room",
  drawComplete: "Draw complete",
  waitingForGroup: "Waiting for the group",
  namesAppear: "Names will appear here as people join.",
  wildcardCard: "Your wildcard card",
  red: "RED",
  blue: "BLUE",
  emptyRoom: "No one has joined yet.",
  drawSent: "Draw sent",
  startDraw: "Start draw",
  missing: "Missing",
  closeCapacityWith: "Close entry with",
  present: "present",
  closeCapacityTitle: "Close entry with",
  peopleQuestion: "people?",
  closeCapacityBodyStart: "The room expected",
  closeCapacityBodyEnd: "Only the people currently present will be included, and no one else will be able to join.",
  keepWaiting: "Keep waiting",
  closeAndDraw: "Close and draw",
  oddGroupHint: "The group is odd. Wait for 1 more person or join as the wildcard.",
  joinAsWildcard: "Join as wildcard",
  wildcardTitle: "Join the draw as a wildcard?",
  wildcardBodyStart: "There will be",
  wildcardBodyEnd: "people. Entry will close and your card will appear on the host dashboard.",
  joinAndDraw: "Join and draw",
  findingMatch: "Finding your match…",
  shufflingCards: "Shuffling the cards",
  virtualCard: "Your virtual card",
  ready: "Ready",
  matchInstruction: "Your ticket has a unique color and number. Find the combination shown below.",
  yourNumber: "Your number",
  yourMatch: "Find",
  privateCard: "Only you can see this card",
  inside: "You’re in",
  hello: "Hi",
  participant: "participant",
  cardWillAppear: "Your card will appear here when the host starts the draw.",
  room: "Room",
  secureTitle: "A secure connection is required",
  secureBody: "Open Emparejao over HTTPS or from localhost to enable notifications.",
  unsupportedTitle: "Notifications are unavailable here",
  unsupportedBody: "Open the link in Chrome, Safari, Firefox, or Edge.",
  iosTitle: "On iPhone: add it to Home Screen",
  iosBody: "Tap Share, choose “Add to Home Screen,” open Emparejao from the icon, and enable notifications there.",
  notificationsReady: "We’ll notify you even if you close the app",
  testNotification: "Test notification",
  finishNotifications: "Finish setup",
  notifyWhenStarts: "Notify me when it starts",
  notificationsBlocked: "Notifications blocked",
  notificationsBlockedBody: "Allow them in your browser’s site settings, then reload the page.",
  capacityControl: "You set the capacity",
  liveNoPaper: "Live draws, no paper slips",
  heroTop: "Find your",
  heroEmphasis: "match",
  heroBottom: "live.",
  heroBody: "Create a room, invite the group, and reveal every match at the same time.",
  oneRoom: "room",
  noMess: "mix-ups",
  whatToDo: "What would you like to do?",
  underMinute: "Get started in under a minute.",
  createDraw: "Create a draw",
  createDrawHelp: "Host and manage the room",
  joinRoom: "Join a room",
  joinRoomHelp: "Use the host’s PIN",
  back: "Back",
  createRoom: "Create your room",
  createRoomHelp: "You choose the exact capacity. It must be an even number.",
  participantCount: "Number of participants",
  maximum: "Maximum 800",
  people: "people",
  evenHelp: "Choose any even number from 2 to 800.",
  createRoomButton: "Create room",
  enterRoom: "Join the room",
  askPin: "Ask the host for the PIN.",
  sixDigitPin: "6-digit PIN",
  yourName: "Your name",
  namePlaceholder: "E.g. Andrea",
  enterNow: "Join now",
  footer: "Private, fast, and no downloads.",
  shareInvite: "Join my Emparejao room. PIN:",
  drawNotificationTitle: "The draw has started!",
  drawNotificationBody: "Your card is ready. Come back to discover your match.",
  enabledNotificationTitle: "Notifications enabled",
  enabledNotificationBody: "We’ll notify you even if you close Emparejao.",
  testNotificationTitle: "Emparejao is ready",
  testNotificationBody: "This is your test notification.",
  connectionInterrupted: "Connection interrupted.",
  createFailed: "We couldn’t create the room.",
  joinFailed: "We couldn’t join the room.",
  drawFailed: "We couldn’t start the draw.",
  pushPartial: "The draw finished, but some push notifications may not have been delivered.",
  copyFailed: "We couldn’t copy the link. Try sharing it directly.",
  shareCopyFailed: "This browser couldn’t share or copy the link.",
  shareMenuFailed: "We couldn’t open the share menu. You can copy the link instead.",
  notificationsUnsupported: "This browser does not support notifications.",
  notificationsDenied: "Notifications are blocked. You can enable them in your browser settings.",
  notificationTestFailed: "Your subscription is active, but the test notification could not be displayed.",
  pushFailed: "We couldn’t finish the push notification setup.",
  browserNotificationFailed: "The browser could not display the test notification.",
};

const COPY: Record<Language, Record<TranslationKey, string>> = {
  [LANGUAGE.ES]: ES_COPY,
  [LANGUAGE.EN]: EN_COPY,
};

const EN_SERVER_ERRORS: Record<string, string> = {
  "No pudimos completar la acción.": "We couldn’t complete that action.",
  "Acceso inválido.": "Invalid access.",
  "La sala ya no está disponible.": "This room is no longer available.",
  "Tu acceso a la sala no es válido.": "Your room access is invalid.",
  "Demasiados intentos. Espera un minuto y vuelve a intentar.": "Too many attempts. Wait one minute and try again.",
  "Solo el organizador puede iniciar el sorteo.": "Only the host can start the draw.",
  "Este sorteo ya fue realizado.": "This draw has already been completed.",
  "El sorteo ya está en proceso.": "The draw is already in progress.",
  "Escribe un nombre y un PIN válidos.": "Enter a valid name and PIN.",
  "Esa sala no existe o ya venció.": "That room does not exist or has expired.",
  "El sorteo de esta sala ya comenzó.": "This room’s draw has already started.",
  "La sala está completa, ya comenzó o ese nombre ya está registrado.": "The room is full, has already started, or that name is already registered.",
  "No se pudo reservar tu lugar. Intenta otra vez.": "We couldn’t reserve your spot. Try again.",
  "El grupo actual es impar. Espera una persona más o súmate como comodín.": "The current group is odd. Wait for one more person or join as the wildcard.",
  "El organizador solo puede sumarse cuando el grupo es impar.": "The host can only join when the group is odd.",
  "Necesitas al menos 2 personas para realizar el sorteo.": "You need at least 2 people to run the draw.",
  "Elige una cantidad par entre 2 y 800.": "Choose an even number from 2 to 800.",
  "No pudimos crear el PIN. Intenta de nuevo.": "We couldn’t create the PIN. Try again.",
  "Solo el organizador puede enviar los avisos.": "Only the host can send notifications.",
  "El sorteo todavía no ha comenzado.": "The draw has not started yet.",
  "La suscripción push no es válida.": "The push subscription is invalid.",
  "Los avisos push aún no están configurados en este servidor.": "Push notifications are not configured on this server yet.",
  "El servicio de salas no está disponible.": "The room service is unavailable.",
  "Web Push no está configurado en el servidor.": "Web Push is not configured on the server.",
  "No se pudieron completar todos los lotes de avisos.": "Some notification batches could not be completed.",
};

function errorMessage(error: unknown, fallback: string, language: Language) {
  if (!(error instanceof Error)) return fallback;
  if (language === LANGUAGE.ES) return error.message;
  const missingPeople = error.message.match(/^Faltan (\d+) personas por entrar\.$/);
  if (missingPeople) return `${missingPeople[1]} more people need to join.`;
  return EN_SERVER_ERRORS[error.message] ?? fallback;
}

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
  document.body.appendChild(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  if (!copied) throw new Error("Copy command failed");
}

function inviteUrl(roomCode: string, language: Language) {
  const url = new URL("/", window.location.origin);
  url.searchParams.set("room", roomCode);
  url.searchParams.set("lang", language);
  return url.toString();
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

function syncServiceWorkerLanguage(language: Language) {
  if (!("serviceWorker" in navigator)) return;
  void navigator.serviceWorker.ready
    .then((registration) => {
      registration.active?.postMessage({ type: "SET_LANGUAGE", language });
    })
    .catch(() => undefined);
}

function showDrawNotification(roomCode: string, copy: Record<TranslationKey, string>) {
  return showBrowserNotification({
    title: copy.drawNotificationTitle,
    body: copy.drawNotificationBody,
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

function LanguageSwitch({
  language,
  onChange,
  label,
}: {
  language: Language;
  onChange: (language: Language) => void;
  label: string;
}) {
  return (
    <div className="language-switch" role="group" aria-label={label}>
      <button
        type="button"
        className={language === LANGUAGE.ES ? "active" : undefined}
        aria-pressed={language === LANGUAGE.ES}
        onClick={() => onChange(LANGUAGE.ES)}
      >
        ES
      </button>
      <button
        type="button"
        className={language === LANGUAGE.EN ? "active" : undefined}
        aria-pressed={language === LANGUAGE.EN}
        onClick={() => onChange(LANGUAGE.EN)}
      >
        EN
      </button>
    </div>
  );
}

function SupportCta({ copy }: { copy: Record<TranslationKey, string> }) {
  return (
    <a
      className="support-cta"
      href="https://www.instagram.com/pulseroutines/"
      target="_blank"
      rel="noreferrer"
      aria-label={copy.supportAria}
    >
      <span className="support-copy">
        <small>{copy.supportQuestion}</small>
        <strong>{copy.supportTitle}</strong>
        <em><AtSign aria-hidden="true" /> pulseroutines</em>
      </span>
    </a>
  );
}

function RoomCounter({
  current,
  total,
  copy,
}: {
  current: number;
  total: number;
  copy: Record<TranslationKey, string>;
}) {
  const percentage = total ? Math.min(100, (current / total) * 100) : 0;
  return (
    <div className="counter-block" aria-label={`${current} / ${total} ${copy.peopleConnected}`}>
      <div className="counter-copy">
        <span><Users aria-hidden="true" /> {copy.peopleInRoom}</span>
        <strong>{current}<small> / {total}</small></strong>
      </div>
      <div className="progress-track"><span style={{ width: `${percentage}%` }} /></div>
    </div>
  );
}

export default function Home() {
  const [language, setLanguage] = useState<Language>(LANGUAGE.ES);
  const languageRef = useRef<Language>(LANGUAGE.ES);
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
  const [roomRefreshSignal, setRoomRefreshSignal] = useState(0);
  const [socketConnected, setSocketConnected] = useState(false);
  const copy = COPY[language];

  useEffect(() => {
    const languageTimer = window.setTimeout(() => {
      const languageFromUrl = new URLSearchParams(window.location.search).get("lang");
      const savedLanguage = localStorage.getItem(LANGUAGE_KEY);
      const nextLanguage = languageFromUrl === LANGUAGE.ES || languageFromUrl === LANGUAGE.EN
        ? languageFromUrl
        : savedLanguage === LANGUAGE.ES || savedLanguage === LANGUAGE.EN
        ? savedLanguage
        : navigator.language.toLowerCase().startsWith("en")
          ? LANGUAGE.EN
          : LANGUAGE.ES;
      setLanguage(nextLanguage);
      languageRef.current = nextLanguage;
      document.documentElement.lang = nextLanguage;
      syncServiceWorkerLanguage(nextLanguage);
    }, 0);
    return () => window.clearTimeout(languageTimer);
  }, []);

  function changeLanguage(nextLanguage: Language) {
    setLanguage(nextLanguage);
    languageRef.current = nextLanguage;
    localStorage.setItem(LANGUAGE_KEY, nextLanguage);
    document.documentElement.lang = nextLanguage;
    syncServiceWorkerLanguage(nextLanguage);
    setError("");
  }

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
        setRoomRefreshSignal((value) => value + 1);
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
    const activeSession = session;
    let active = true;
    let socket: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryAttempt = 0;

    function scheduleReconnect() {
      if (!active || document.hidden || retryTimer) return;
      const delay = Math.min(15_000, 1_000 * 2 ** retryAttempt);
      retryAttempt += 1;
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        openSocket();
      }, delay);
    }

    function openSocket() {
      if (!active || document.hidden) return;
      if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) {
        return;
      }

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(
        `${protocol}//${window.location.host}/api/rooms/${activeSession.code}/socket`,
        ["emparejao", activeSession.token],
      );
      socket.addEventListener("open", () => {
        if (!active) return;
        retryAttempt = 0;
        setSocketConnected(true);
      });
      socket.addEventListener("message", (event) => {
        if (!active || typeof event.data !== "string") return;
        try {
          const message = JSON.parse(event.data) as Record<string, unknown>;
          if (
            (message.type === "room_snapshot" || message.type === "room_updated") &&
            activeSession.role === "participant" &&
            typeof message.participantCount === "number"
          ) {
            setParticipantRoom((current) => current
              ? { ...current, participantCount: message.participantCount as number }
              : current);
          }
          if (message.type === "room_updated" && activeSession.role === "host") {
            setRoomRefreshSignal((value) => value + 1);
          }
          if (message.type === "draw_started" && activeSession.role === "participant") {
            setRoomRefreshSignal((value) => value + 1);
          }
        } catch {
          // Ignore malformed socket messages and keep the fallback polling active.
        }
      });
      socket.addEventListener("close", () => {
        if (!active) return;
        setSocketConnected(false);
        scheduleReconnect();
      });
      socket.addEventListener("error", () => socket?.close());
    }

    function reconnectWhenAvailable() {
      if (!document.hidden) openSocket();
    }

    document.addEventListener("visibilitychange", reconnectWhenAvailable);
    window.addEventListener("online", reconnectWhenAvailable);
    openSocket();
    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
      document.removeEventListener("visibilitychange", reconnectWhenAvailable);
      window.removeEventListener("online", reconnectWhenAvailable);
      socket?.close(1000, "Vista cerrada");
      setSocketConnected(false);
    };
  }, [session]);

  useEffect(() => {
    if (!session) return;
    const activeSession = session;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let refreshing = false;
    let refreshAgain = false;
    let previousStatus = activeSession.role === "participant" ? "lobby" : "";

    async function refresh() {
      if (!active) return;
      if (refreshing) {
        refreshAgain = true;
        return;
      }
      refreshing = true;
      const activeCopy = COPY[languageRef.current];
      try {
        const data = await api<HostRoom | ParticipantRoom>(`/api/rooms/${activeSession.code}`, {
          headers: { authorization: `Bearer ${activeSession.token}` },
          cache: "no-store",
        });
        if (!active) return;
        setError("");
        if (activeSession.role === "host") {
          setHostRoom(data as HostRoom);
        } else {
          const participantData = data as ParticipantRoom;
          if (participantData.status === "drawn" && previousStatus === "lobby") {
            setRevealing(true);
            window.setTimeout(() => setRevealing(false), 1800);
            if (document.hidden) void showDrawNotification(activeSession.code, activeCopy);
          }
          previousStatus = participantData.status;
          setParticipantRoom(participantData);
        }
      } catch (refreshError) {
        if (!active) return;
        setError(errorMessage(refreshError, activeCopy.connectionInterrupted, languageRef.current));
      } finally {
        refreshing = false;
        if (!active) return;
        if (refreshAgain) {
          refreshAgain = false;
          void refresh();
          return;
        }
        const delay = socketConnected
          ? 120_000
          : activeSession.role === "host"
            ? 1800
            : document.hidden
              ? 45000
              : 20000;
        timer = setTimeout(refresh, delay);
      }
    }

    function refreshNow() {
      if (timer) clearTimeout(timer);
      timer = undefined;
      void refresh();
    }

    function refreshWhenVisible() {
      if (!document.hidden) refreshNow();
    }

    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("pageshow", refreshNow);
    window.addEventListener("focus", refreshNow);
    window.addEventListener("online", refreshNow);
    void refresh();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("pageshow", refreshNow);
      window.removeEventListener("focus", refreshNow);
      window.removeEventListener("online", refreshNow);
    };
  }, [session, roomRefreshSignal, socketConnected]);

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
    const joinUrl = inviteUrl(session.code, language);
    void QRCode.toDataURL(joinUrl, {
      width: 360,
      margin: 1,
      color: { dark: "#151515", light: "#ffffff" },
      errorCorrectionLevel: "M",
    }).then(setQrDataUrl);
  }, [session, language]);

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
      setError(errorMessage(createError, copy.createFailed, language));
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
      setError(errorMessage(joinError, copy.joinFailed, language));
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
        setError(copy.pushPartial);
      }
    } catch (startError) {
      setError(errorMessage(startError, copy.drawFailed, language));
    } finally {
      setBusy(false);
    }
  }

  async function copyInvite() {
    if (!session) return;
    try {
      await copyText(inviteUrl(session.code, language));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError(copy.copyFailed);
    }
  }

  async function shareInvite() {
    if (!session) return;
    const url = inviteUrl(session.code, language);
    if (!navigator.share) {
      try {
        await copyText(url);
        setShared(true);
        window.setTimeout(() => setShared(false), 1800);
      } catch {
        setError(copy.shareCopyFailed);
      }
      return;
    }
    try {
      await navigator.share({
        title: "Emparejao",
        text: `${copy.shareInvite} ${session.code}`,
        url,
      });
      setShared(true);
      window.setTimeout(() => setShared(false), 1800);
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === "AbortError") return;
      setError(copy.shareMenuFailed);
    }
  }

  async function enableNotifications() {
    if (!("Notification" in window) || !session || session.role !== "participant") {
      setError(copy.notificationsUnsupported);
      return;
    }
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    if (permission === "denied") {
      setError(copy.notificationsDenied);
    } else if (permission === "granted") {
      try {
        await subscribeToPush(session);
        setPushSubscribed(true);
        setError("");
        const displayed = await showBrowserNotification({
          title: copy.enabledNotificationTitle,
          body: copy.enabledNotificationBody,
          tag: "emparejao-notifications-ready",
        });
        if (!displayed) {
          setError(copy.notificationTestFailed);
        }
      } catch (subscriptionError) {
        setPushSubscribed(false);
        setError(
          errorMessage(subscriptionError, copy.pushFailed, language),
        );
      }
    }
  }

  async function testNotification() {
    const displayed = await showBrowserNotification({
      title: copy.testNotificationTitle,
      body: copy.testNotificationBody,
      tag: "emparejao-notifications-test",
    });
    if (!displayed) setError(copy.browserNotificationFailed);
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
    const hostOwnsRed = hostRoom?.result
      ? hostRoom.result.redNumber > hostRoom.result.blueNumber
      : true;
    return (
      <main className="app-shell host-shell">
        <header className="topbar">
          <Brand />
          <div className="topbar-actions">
            <LanguageSwitch language={language} onChange={changeLanguage} label={copy.languageLabel} />
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button className="quiet-link" type="button">{copy.exit}</button>
              </AlertDialogTrigger>
              <AlertDialogContent className="close-dialog">
                <AlertDialogHeader>
                  <AlertDialogTitle>{copy.removeAccessTitle}</AlertDialogTitle>
                  <AlertDialogDescription>{copy.removeAccessBody}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{copy.keepAccess}</AlertDialogCancel>
                  <AlertDialogAction onClick={leaveSession}>{copy.exitRemoveAccess}</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </header>
        <SupportCta copy={copy} />
        <section className="host-grid">
          <div className="invite-panel">
            <span className="eyebrow"><Crown aria-hidden="true" /> {copy.hostPanel}</span>
            <h1>{copy.hostHeadlineTop}<br />{copy.hostHeadlineBottom}</h1>
            <div className="pin-card">
              <span>{copy.roomPin}</span>
              <strong>{session.code}</strong>
              <div className="invite-actions">
                <button type="button" onClick={copyInvite}>{copied ? <Check /> : <Copy />}{copied ? copy.linkCopied : copy.copyLink}</button>
                <button type="button" onClick={shareInvite}>{shared ? <Check /> : <Share2 />}{shared ? copy.linkReady : copy.shareLink}</button>
              </div>
            </div>
            <p className="room-persistence"><Check aria-hidden="true" /> {copy.roomPersistence}</p>
            <div className="qr-frame">
              {qrDataUrl ? <Image src={qrDataUrl} width={360} height={360} unoptimized alt={`${copy.qrAlt} ${session.code}`} /> : <LoaderCircle className="spin" aria-label={copy.creatingQr} />}
              <p><ScanLine aria-hidden="true" /> {copy.scanToJoin}</p>
            </div>
          </div>

          <div className="lobby-panel">
            <div>
              <span className="eyebrow"><span className="live-dot" /> {copy.liveRoom}</span>
              <h2>{hostRoom?.status === "drawn" ? copy.drawComplete : copy.waitingForGroup}</h2>
              <p className="muted">{copy.namesAppear}</p>
            </div>
            <RoomCounter current={participantCount} total={hostRoom?.expectedParticipants ?? Number(expected)} copy={copy} />
            {hostRoom?.result && (
              <div className="host-result-card">
                <p>{copy.wildcardCard}</p>
                <div>
                  <span className={`host-ticket ${hostOwnsRed ? TICKET_COLOR.RED : TICKET_COLOR.BLUE}`}>
                    <small>{hostOwnsRed ? copy.red : copy.blue}</small>
                    <strong>{hostRoom.result.redNumber}</strong>
                  </span>
                  <span className="host-match-target"><small>{copy.yourMatch} {hostOwnsRed ? copy.blue : copy.red}</small><strong>{hostRoom.result.blueNumber}</strong></span>
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
              {!participantCount && <div className="empty-roster"><Users /><p>{copy.emptyRoom}</p></div>}
            </div>
            {error && <p className="form-error" role="alert">{error}</p>}
            <Button className="primary-action" size="lg" disabled={!roomFull || busy || hostRoom?.status === "drawn"} onClick={() => startDraw(false)}>
              {busy ? <LoaderCircle className="spin" /> : <Sparkles />}
              {hostRoom?.status === "drawn" ? copy.drawSent : roomFull ? copy.startDraw : `${copy.missing} ${(hostRoom?.expectedParticipants ?? 0) - participantCount}`}
            </Button>
            {canCloseEarly && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button className="early-close" variant="outline" disabled={busy}>
                    {copy.closeCapacityWith} {participantCount} {copy.present}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="close-dialog">
                  <AlertDialogHeader>
                    <AlertDialogTitle>{copy.closeCapacityTitle} {participantCount} {copy.peopleQuestion}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {copy.closeCapacityBodyStart} {hostRoom?.expectedParticipants}. {copy.closeCapacityBodyEnd}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{copy.keepWaiting}</AlertDialogCancel>
                    <AlertDialogAction onClick={() => startDraw(true)}>{copy.closeAndDraw}</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {!roomFull && hasOddGroup && hostRoom?.status === "lobby" && (
              <>
                <p className="lobby-hint">{copy.oddGroupHint}</p>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button className="host-wildcard" variant="outline" disabled={busy}>
                      {copy.joinAsWildcard}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="close-dialog">
                    <AlertDialogHeader>
                      <AlertDialogTitle>{copy.wildcardTitle}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {copy.wildcardBodyStart} {participantCount + 1} {copy.wildcardBodyEnd}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{copy.keepWaiting}</AlertDialogCancel>
                      <AlertDialogAction onClick={() => startDraw(true, true)}>{copy.joinAndDraw}</AlertDialogAction>
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
    const ownsRed = result ? result.redNumber > result.blueNumber : true;
    return (
      <main className="app-shell participant-shell">
        <header className="topbar">
          <Brand />
          <div className="topbar-actions">
            <LanguageSwitch language={language} onChange={changeLanguage} label={copy.languageLabel} />
            <button className="quiet-link" onClick={leaveSession}>{copy.exit}</button>
          </div>
        </header>
        <SupportCta copy={copy} />
        <section className="participant-stage">
          {revealing ? (
            <div className="reveal-loader" aria-live="polite"><span><Sparkles /></span><h1>{copy.findingMatch}</h1><p>{copy.shufflingCards}</p></div>
          ) : result ? (
            <div className="result-wrap">
              <span className="eyebrow light"><Sparkles /> {copy.virtualCard}</span>
              <h1>{copy.ready}, {participantRoom?.name}!</h1>
              <p>{copy.matchInstruction}</p>
              <div className="ticket-result">
                <div className={`ticket-half ${ownsRed ? "red-half" : "blue-half"}`}>
                  <span>{copy.yourNumber}</span>
                  <strong>{result.redNumber}</strong>
                  <small>{ownsRed ? copy.red : copy.blue}</small>
                </div>
              </div>
              <div className={`match-target ${ownsRed ? TICKET_COLOR.BLUE : TICKET_COLOR.RED}`}>
                <span>{copy.yourMatch}</span>
                <strong>{result.blueNumber}</strong>
                <small>{ownsRed ? copy.blue : copy.red}</small>
              </div>
              <div className="privacy-note"><Check /> {copy.privateCard}</div>
            </div>
          ) : (
            <div className="waiting-card">
              <span className="waiting-orbit"><Users /></span>
              <span className="eyebrow"><span className="live-dot" /> {copy.inside}</span>
              <h1>{copy.hello}, {participantRoom?.name ?? copy.participant}.</h1>
              <p>{copy.cardWillAppear}</p>
              <RoomCounter current={participantRoom?.participantCount ?? 0} total={participantRoom?.expectedParticipants ?? 0} copy={copy} />
              <div className="room-chip">{copy.room} <strong>{session.code}</strong></div>
              {notificationCapability === NOTIFICATION_CAPABILITY.INSECURE && (
                <div className="notification-help" role="status">
                  <Bell /> <span><strong>{copy.secureTitle}</strong>{copy.secureBody}</span>
                </div>
              )}
              {notificationCapability === NOTIFICATION_CAPABILITY.UNSUPPORTED && (
                <div className="notification-help" role="status">
                  <Bell /> <span><strong>{copy.unsupportedTitle}</strong>{copy.unsupportedBody}</span>
                </div>
              )}
              {notificationCapability === NOTIFICATION_CAPABILITY.IOS_INSTALL && (
                <div className="notification-help" role="status">
                  <Bell /> <span><strong>{copy.iosTitle}</strong>{copy.iosBody}</span>
                </div>
              )}
              {notificationCapability === NOTIFICATION_CAPABILITY.READY && notificationPermission === "granted" && pushSubscribed && (
                <div className="notification-enabled"><BellRing /> {copy.notificationsReady} <button type="button" onClick={testNotification}>{copy.testNotification}</button></div>
              )}
              {notificationCapability === NOTIFICATION_CAPABILITY.READY && (notificationPermission === "default" || (notificationPermission === "granted" && !pushSubscribed)) && (
                <button className="notification-button" type="button" onClick={enableNotifications}>
                  <Bell /> {notificationPermission === "granted" ? copy.finishNotifications : copy.notifyWhenStarts}
                </button>
              )}
              {notificationCapability === NOTIFICATION_CAPABILITY.READY && notificationPermission === "denied" && (
                <div className="notification-help blocked" role="status">
                  <Bell /> <span><strong>{copy.notificationsBlocked}</strong>{copy.notificationsBlockedBody}</span>
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
      <header className="topbar">
        <Brand />
        <div className="topbar-actions">
          <LanguageSwitch language={language} onChange={changeLanguage} label={copy.languageLabel} />
          <span className="capacity-pill"><Crown /> {copy.capacityControl}</span>
        </div>
      </header>
      <SupportCta copy={copy} />
      <section className="landing-grid">
        <div className="intro-copy">
          <span className="eyebrow"><Sparkles aria-hidden="true" /> {copy.liveNoPaper}</span>
          <h1>{copy.heroTop}<br /><em>{copy.heroEmphasis}</em> {copy.heroBottom}</h1>
          <p>{copy.heroBody}</p>
          <div className="mini-proof"><span>1</span> {copy.oneRoom} <i /> <span>1</span> PIN <i /> <span>0</span> {copy.noMess}</div>
        </div>

        <div className="action-card">
          {view === VIEW.HOME && (
            <>
              <div className="action-heading"><h2>{copy.whatToDo}</h2><p>{copy.underMinute}</p></div>
              <Button className="choice primary-choice" onClick={() => setView(VIEW.CREATE)}><span><Crown /></span><span><strong>{copy.createDraw}</strong><small>{copy.createDrawHelp}</small></span></Button>
              <button className="choice secondary-choice" onClick={() => setView(VIEW.JOIN)}><span><Users /></span><span><strong>{copy.joinRoom}</strong><small>{copy.joinRoomHelp}</small></span></button>
            </>
          )}

          {view === VIEW.CREATE && (
            <form onSubmit={createRoom}>
              <button type="button" className="back-button" onClick={() => setView(VIEW.HOME)}><ArrowLeft /> {copy.back}</button>
              <div className="action-heading"><h2>{copy.createRoom}</h2><p>{copy.createRoomHelp}</p></div>
              <div className="field-label-row">
                <label className="field-label" htmlFor="expected">{copy.participantCount}</label>
                <span>{copy.maximum}</span>
              </div>
              <div className="number-field"><Input id="expected" inputMode="numeric" min="2" max="800" step="2" value={expected} onChange={(event) => setExpected(event.target.value.replace(/\D/g, "").slice(0, 3))} /><span>{copy.people}</span></div>
              <p className="field-help">{copy.evenHelp}</p>
              {error && <p className="form-error" role="alert">{error}</p>}
              <Button className="form-submit" size="lg" disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <Sparkles />} {copy.createRoomButton}</Button>
            </form>
          )}

          {view === VIEW.JOIN && (
            <form onSubmit={joinRoom}>
              <button type="button" className="back-button" onClick={() => setView(VIEW.HOME)}><ArrowLeft /> {copy.back}</button>
              <div className="action-heading"><h2>{copy.enterRoom}</h2><p>{copy.askPin}</p></div>
              <label className="field-label" htmlFor="code">{copy.sixDigitPin}</label>
              <Input id="code" className="pin-input" inputMode="numeric" autoComplete="one-time-code" placeholder="000 000" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} />
              <label className="field-label" htmlFor="name">{copy.yourName}</label>
              <Input id="name" autoComplete="name" maxLength={40} placeholder={copy.namePlaceholder} value={name} onChange={(event) => setName(event.target.value)} />
              {error && <p className="form-error" role="alert">{error}</p>}
              <Button className="form-submit" size="lg" disabled={busy || code.length !== 6 || name.trim().length < 2}>{busy ? <LoaderCircle className="spin" /> : <Users />} {copy.enterNow}</Button>
            </form>
          )}
        </div>
      </section>
      <footer><span>Emparejao</span><p>{copy.footer}</p></footer>
    </main>
  );
}
