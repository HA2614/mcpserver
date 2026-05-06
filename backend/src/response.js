import { randomUUID } from "node:crypto";

export function attachRequestId(req, res, next) {
  req.requestId = req.headers["x-request-id"] || randomUUID();
  res.setHeader("x-request-id", req.requestId);
  next();
}

export function ok(res, data, meta = null, status = 200) {
  const payload = { ok: true, data };
  if (meta) payload.meta = meta;
  return res.status(status).json(payload);
}

export function fail(res, error, statusCode = 500, code = "INTERNAL_ERROR", details = null) {
  const payload = {
    ok: false,
    error: {
      code,
      message: error,
      details
    }
  };
  return res.status(statusCode).json(payload);
}
