/**
 * Read-only store. Serves applications/web/store on 127.0.0.1:8081.
 * GET /presets/<folder>/ lists *.json. GET /presets/<folder>/<file>.json returns the file.
 * GET /splines/ lists *.svg. GET /splines/<file>.svg returns the file.
 */
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const HOST = "127.0.0.1";
const PORT = 8081;
const STORE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../store");
const FOLDERS = new Set([
  "master",
  "pulse",
  "input",
  "turbulence",
  "voronoi",
  "organic",
  "grid",
  "randomizer",
]);
const JSON_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*\.json$/;
const SVG_NAME = /^[^/\\]+\.svg$/i;

function allowOrigin(req, res) {
  const origin = req.headers.origin;
  if (origin && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Vary", "Origin");
}

function send(res, status, body, type) {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function underRoot(candidate) {
  const root = path.resolve(STORE_ROOT);
  const resolved = path.resolve(candidate);
  return resolved === root || resolved.startsWith(root + path.sep);
}

function routeFromUrl(url) {
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] === "presets") {
    if (parts.length < 2 || parts.length > 3) return null;
    if (!FOLDERS.has(parts[1])) return null;
    if (parts.length === 3 && !JSON_NAME.test(parts[2])) return null;
    return { kind: "presets", folder: parts[1], file: parts[2] || null };
  }
  if (parts[0] === "splines") {
    if (parts.length > 2) return null;
    if (parts.length === 2 && !SVG_NAME.test(parts[1])) return null;
    return { kind: "splines", file: parts[1] || null };
  }
  return null;
}

const server = http.createServer((req, res) => {
  allowOrigin(req, res);
  if (req.method === "OPTIONS") {
    res.writeHead(204, { "Access-Control-Allow-Methods": "GET, OPTIONS" });
    res.end();
    return;
  }
  if (req.method !== "GET") {
    send(res, 405, "Method not allowed", "text/plain; charset=utf-8");
    return;
  }

  let url;
  try {
    url = new URL(req.url, `http://${HOST}:${PORT}`);
  } catch {
    send(res, 400, "Bad request", "text/plain; charset=utf-8");
    return;
  }

  const route = routeFromUrl(url);
  if (!route) {
    send(res, 404, "Not found", "text/plain; charset=utf-8");
    return;
  }

  if (route.kind === "presets") {
    const dir = path.resolve(STORE_ROOT, "presets", route.folder);
    if (!underRoot(dir)) {
      send(res, 400, "Bad request", "text/plain; charset=utf-8");
      return;
    }
    if (!route.file) {
      let names = [];
      try {
        names = fs.readdirSync(dir).filter((name) => JSON_NAME.test(name)).sort();
      } catch (error) {
        if (error.code !== "ENOENT") {
          send(res, 500, "Store read failed", "text/plain; charset=utf-8");
          return;
        }
      }
      send(res, 200, JSON.stringify(names), "application/json; charset=utf-8");
      return;
    }
    const filePath = path.resolve(dir, route.file);
    if (!underRoot(filePath) || !filePath.startsWith(dir + path.sep)) {
      send(res, 400, "Bad request", "text/plain; charset=utf-8");
      return;
    }
    try {
      send(res, 200, fs.readFileSync(filePath), "application/json; charset=utf-8");
    } catch (error) {
      if (error.code === "ENOENT") {
        send(res, 404, "Not found", "text/plain; charset=utf-8");
        return;
      }
      send(res, 500, "Store read failed", "text/plain; charset=utf-8");
    }
    return;
  }

  const dir = path.resolve(STORE_ROOT, "splines");
  if (!underRoot(dir)) {
    send(res, 400, "Bad request", "text/plain; charset=utf-8");
    return;
  }
  if (!route.file) {
    let names = [];
    try {
      names = fs.readdirSync(dir).filter((name) => SVG_NAME.test(name)).sort();
    } catch (error) {
      if (error.code !== "ENOENT") {
        send(res, 500, "Store read failed", "text/plain; charset=utf-8");
        return;
      }
    }
    send(res, 200, JSON.stringify(names), "application/json; charset=utf-8");
    return;
  }
  const filePath = path.resolve(dir, route.file);
  if (!underRoot(filePath) || !filePath.startsWith(dir + path.sep)) {
    send(res, 400, "Bad request", "text/plain; charset=utf-8");
    return;
  }
  try {
    send(res, 200, fs.readFileSync(filePath), "image/svg+xml; charset=utf-8");
  } catch (error) {
    if (error.code === "ENOENT") {
      send(res, 404, "Not found", "text/plain; charset=utf-8");
      return;
    }
    send(res, 500, "Store read failed", "text/plain; charset=utf-8");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Preset store on http://${HOST}:${PORT} (${STORE_ROOT})`);
});
