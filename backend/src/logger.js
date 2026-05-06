export function logEvent(level, event, context = {}) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    ...context
  };
  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}

export function logInfo(event, context) {
  logEvent("info", event, context);
}

export function logWarn(event, context) {
  logEvent("warn", event, context);
}

export function logError(event, context) {
  logEvent("error", event, context);
}
