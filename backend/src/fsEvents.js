import { watch } from "node:fs";
import path from "node:path";
import { resolveSafePath } from "./structure.js";

const clients = new Set();
const watchers = new Map();

function sendEvent(res, event) {
  res.write(`event: fs\n`);
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

function ensureWatcher(rootPath) {
  const safe = resolveSafePath(rootPath);
  if (watchers.has(safe)) {
    watchers.get(safe).count += 1;
    return safe;
  }
  const entry = { count: 1, watcher: null };
  entry.watcher = watch(safe, { recursive: true }, (eventType, filename) => {
    const changedPath = filename ? path.resolve(safe, filename.toString()) : safe;
    const payload = {
      type: eventType === "rename" ? "renamed" : "updated",
      root: safe,
      path: changedPath,
      ts: new Date().toISOString()
    };
    for (const c of clients) {
      if (changedPath.startsWith(c.root)) sendEvent(c.res, payload);
    }
  });
  watchers.set(safe, entry);
  return safe;
}

function releaseWatcher(rootPath) {
  const item = watchers.get(rootPath);
  if (!item) return;
  item.count -= 1;
  if (item.count <= 0) {
    item.watcher.close();
    watchers.delete(rootPath);
  }
}

export function registerFsEventStream(req, res) {
  const rootParam = String(req.query.root || "").trim() || process.env.FS_BASE_PATH || process.cwd();
  const root = ensureWatcher(rootParam);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  const client = { res, root };
  clients.add(client);
  sendEvent(res, { type: "connected", root, ts: new Date().toISOString() });
  const ping = setInterval(() => {
    res.write(": ping\n\n");
  }, 15000);
  req.on("close", () => {
    clearInterval(ping);
    clients.delete(client);
    releaseWatcher(root);
  });
}
