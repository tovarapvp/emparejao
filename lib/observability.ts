type LogLevel = "info" | "warn" | "error";
type LogDetails = Record<string, boolean | number | string | null | undefined>;

export function errorDetails(error: unknown): LogDetails {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
    };
  }

  return { errorMessage: String(error) };
}

export function logEvent(level: LogLevel, event: string, details: LogDetails = {}) {
  const payload = JSON.stringify({
    level,
    event,
    timestamp: new Date().toISOString(),
    ...details,
  });

  if (level === "error") {
    console.error(payload);
    return;
  }

  if (level === "warn") {
    console.warn(payload);
    return;
  }

  console.log(payload);
}
