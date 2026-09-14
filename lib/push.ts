import { buildPushPayload, type PushSubscription } from "@block65/webcrypto-web-push";
import { env } from "cloudflare:workers";

export interface PushSubscriptionRecord {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushDeliveryResult {
  delivered: boolean;
  expired: boolean;
}

export function getVapidPublicKey() {
  return env.VAPID_PUBLIC_KEY?.trim() ?? "";
}

function getVapidKeys() {
  const publicKey = getVapidPublicKey();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim() ?? "";
  const subject = env.VAPID_SUBJECT?.trim() ?? "";

  if (!publicKey || !privateKey || !subject) {
    throw new Error("Web Push no está configurado en el servidor.");
  }

  return { publicKey, privateKey, subject };
}

export async function sendDrawPush(
  subscriptionRecord: PushSubscriptionRecord,
  roomCode: string,
): Promise<PushDeliveryResult> {
  const subscription: PushSubscription = {
    endpoint: subscriptionRecord.endpoint,
    expirationTime: null,
    keys: {
      p256dh: subscriptionRecord.p256dh,
      auth: subscriptionRecord.auth,
    },
  };
  const payload = await buildPushPayload(
    {
      data: JSON.stringify({
        titleEs: "¡El sorteo comenzó!",
        bodyEs: "Tu tarjeta ya está lista. Toca para descubrir tu pareja.",
        titleEn: "The draw has started!",
        bodyEn: "Your card is ready. Tap to discover your match.",
        tag: `emparejao-draw-${roomCode}`,
        url: `/?room=${roomCode}`,
        roomCode,
      }),
      options: { ttl: 300, urgency: "high", topic: `draw-${roomCode}` },
    },
    subscription,
    getVapidKeys(),
  );
  const response = await fetch(subscription.endpoint, payload);

  return {
    delivered: response.ok,
    expired: response.status === 404 || response.status === 410,
  };
}
