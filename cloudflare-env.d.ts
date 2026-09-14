declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    ROOM_HUB?: DurableObjectNamespace;
    ROOM_CREATE_LIMITER?: RateLimit;
    ROOM_JOIN_LIMITER?: RateLimit;
    ROOM_SOCKET_LIMITER?: RateLimit;
    ALERT_LIMITER?: RateLimit;
    BUCKET?: R2Bucket;
    ALERT_WEBHOOK_URL?: string;
    VAPID_PUBLIC_KEY?: string;
    VAPID_PRIVATE_KEY?: string;
    VAPID_SUBJECT?: string;
  }
}
