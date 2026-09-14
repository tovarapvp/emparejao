import { errorDetails, logEvent } from "../lib/observability";

const JSON_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
};

export async function enforceRateLimit(
  limiter: RateLimit | undefined,
  key: string,
  route: string,
) {
  if (!limiter) {
    logEvent("error", "rate_limit_binding_missing", { route });
    return null;
  }

  const { success } = await limiter.limit({ key });
  if (success) return null;

  logEvent("warn", "rate_limit_blocked", { route });
  return Response.json(
    { error: "Demasiados intentos. Espera un minuto y vuelve a intentar." },
    {
      status: 429,
      headers: { ...JSON_HEADERS, "Retry-After": "60" },
    },
  );
}

export async function sendOperationalAlert(
  env: Cloudflare.Env,
  event: string,
  message: string,
  details: Record<string, boolean | number | string | null> = {},
) {
  if (!env.ALERT_WEBHOOK_URL) return;

  if (env.ALERT_LIMITER) {
    const { success } = await env.ALERT_LIMITER.limit({ key: event });
    if (!success) return;
  }

  const text = `[Emparejao] ${message}`;

  try {
    const response = await fetch(env.ALERT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        content: text,
        event,
        timestamp: new Date().toISOString(),
        details,
      }),
    });

    if (!response.ok) {
      logEvent("error", "operational_alert_delivery_failed", {
        event,
        status: response.status,
      });
    }
  } catch (error) {
    logEvent("error", "operational_alert_delivery_failed", {
      event,
      ...errorDetails(error),
    });
  }
}

export async function healthResponse(env: Cloudflare.Env) {
  const startedAt = Date.now();

  try {
    if (!env.DB) throw new Error("D1 binding unavailable");
    await env.DB.prepare("SELECT 1 AS healthy").first();

    return Response.json(
      { status: "ok", database: "ok", timestamp: new Date().toISOString() },
      { headers: JSON_HEADERS },
    );
  } catch (error) {
    logEvent("error", "health_check_failed", {
      durationMs: Date.now() - startedAt,
      ...errorDetails(error),
    });

    return Response.json(
      { status: "error", database: "unavailable" },
      { status: 503, headers: JSON_HEADERS },
    );
  }
}
