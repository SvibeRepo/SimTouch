/**
 * Read-only preset store. Serves applications/web/store on 127.0.0.1:8081.
 * GET /presets/<folder>/ lists *.json names. GET /presets/<folder>/<file>.json returns the file.
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
const FILE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*\.json$/;
const LAB_ORIGINS = new Set([
  "http://127.0.0.1:8080",
  "http://localhost:8080",
]);

function allowOrigin(req, res) {
  const origin = req.headers.origin;
  if (origin && LAB_ORIGINS.has(origin)) {
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

function folderFromUrl(url) {
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] !== "presets" || parts.length < 2 || parts.length > 3) return null;
  if (!FOLDERS.has(parts[1])) return null;
  if (parts.length === 3 && !FILE_NAME.test(parts[2])) return null;
  return parts;
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

  const parts = folderFromUrl(url);
  if (!parts) {
    send(res, 404, "Not found", "text/plain; charset=utf-8");
    return;
  }

  const dir = path.resolve(STORE_ROOT, "presets", parts[1]);
  const root = path.resolve(STORE_ROOT);
  if (!dir.startsWith(root + path.sep)) {
    send(res, 400, "Bad request", "text/plain; charset=utf-8");
    return;
  }

  if (parts.length === 2) {
    let names = [];
    try {
      names = fs.readdirSync(dir).filter((name) => FILE_NAME.test(name)).sort();
    } catch (error) {
      if (error.code !== "ENOENT") {
        send(res, 500, "Store read failed", "text/plain; charset=utf-8");
        return;
      }
    }
    send(res, 200, JSON.stringify(names), "application/json; charset=utf-8");
    return;
  }

  const filePath = path.resolve(dir, parts[2]);
  if (!filePath.startsWith(dir + path.sep)) {
    send(res, 400, "Bad request", "text/plain; charset=utf-8");
    return;
  }
  try {
    const body = fs.readFileSync(filePath);
    send(res, 200, body, "application/json; charset=utf-8");
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
