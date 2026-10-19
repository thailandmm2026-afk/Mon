/**
 * Ultra Bet V3.3 — Render-ready
 * Serves HTML + proxies /s7/* to 7S Crown with correct headers
 */
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = process.env.PORT || 3000;
const S7_BASES = [
  process.env.S7_BASE || "https://www.78840182.com",
  "https://www.78840182.com",
  "https://www.7scrown48.xyz",
  "https://www.7scrown27.xyz"
];
const HTML_FILE = path.join(__dirname, "ultra_bet_7scrown.html");

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, Merchant, Language, Encryption, encryption, Device, device, Accept, X-Requested-With, X-Timestamp, x-timestamp, x-rsa, X-Rsa, x-digest, X-Digest, Referer, Origin"
  );
}

function sendHtml(res) {
  const html = fs.readFileSync(HTML_FILE, "utf8");
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(html);
}

/** Build upstream headers with proper casing for 7S */
function upstreamHeaders(req, bodyLen) {
  const h = req.headers || {};
  const out = {
    Accept: h.accept || "application/json, text/plain, */*",
    "Content-Type": h["content-type"] || "application/json",
    "User-Agent":
      h["user-agent"] ||
      "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/147.0.0.0 Mobile Safari/537.36",
    "x-requested-with": "prod.app_7smmkf5.com"
  };
  // merchant / language
  if (h.merchant) out.Merchant = h.merchant;
  if (h.language) out.Language = h.language;
  // token
  if (h.authorization) out.Authorization = h.authorization;
  // encryption headers (login)
  const enc = h.encryption || h.Encryption;
  if (enc) {
    out.Encryption = enc;
    out.encryption = enc;
  }
  const xrsa = h["x-rsa"] || h["X-Rsa"];
  if (xrsa) out["x-rsa"] = xrsa;
  const xdig = h["x-digest"] || h["X-Digest"];
  if (xdig) out["x-digest"] = xdig;
  const xts = h["x-timestamp"] || h["X-Timestamp"];
  if (xts) out["x-timestamp"] = xts;
  if (h.device || h.Device) out.Device = h.device || h.Device;
  if (bodyLen != null) out["Content-Length"] = String(bodyLen);
  // Referer helps some checks
  out.Referer = (process.env.S7_BASE || S7_BASES[0]) + "/m/login";
  out.Origin = process.env.S7_BASE || S7_BASES[0];
  return out;
}

function proxyOnce(base, req, res, bodyBuf) {
  return new Promise((resolve) => {
    const targetPath = req.url.slice(3) || "/"; // strip /s7
    let u;
    try {
      u = new URL(base.replace(/\/+$/, "") + targetPath);
    } catch (e) {
      resolve({ ok: false, status: 500, err: e.message });
      return;
    }
    const headers = upstreamHeaders(req, bodyBuf ? bodyBuf.length : 0);
    headers.Host = u.hostname;

    const preq = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: req.method,
        headers,
        timeout: 30000
      },
      (pres) => {
        const chunks = [];
        pres.on("data", (c) => chunks.push(c));
        pres.on("end", () => {
          resolve({
            ok: true,
            status: pres.statusCode || 502,
            headers: pres.headers,
            body: Buffer.concat(chunks)
          });
        });
      }
    );
    preq.on("error", (e) => resolve({ ok: false, status: 502, err: e.message }));
    preq.on("timeout", () => {
      preq.destroy();
      resolve({ ok: false, status: 504, err: "timeout" });
    });
    if (bodyBuf && bodyBuf.length) preq.write(bodyBuf);
    preq.end();
  });
}

async function proxyS7(req, res, bodyBuf) {
  const bases = [...new Set(S7_BASES.filter(Boolean))];
  let last = null;
  for (const base of bases) {
    const r = await proxyOnce(base, req, res, bodyBuf);
    last = r;
    if (!r.ok) continue;
    // success or meaningful 4xx from upstream (don't rotate on 400 login fail)
    if (r.status < 500) {
      cors(res);
      const ct = (r.headers && r.headers["content-type"]) || "application/json";
      res.writeHead(r.status, { "Content-Type": ct, "X-S7-Base": base });
      res.end(r.body);
      return;
    }
  }
  cors(res);
  res.writeHead((last && last.status) || 502, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      success: false,
      message: (last && last.err) || "proxy failed",
      status: last && last.status
    })
  );
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", () => resolve(Buffer.alloc(0)));
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      cors(res);
      res.writeHead(204);
      return res.end();
    }

    const url = req.url || "/";

    if (url === "/" || url.startsWith("/index") || url.startsWith("/ultra")) {
      try {
        return sendHtml(res);
      } catch (e) {
        res.writeHead(500);
        return res.end("HTML missing: " + e.message);
      }
    }

    if (url.startsWith("/s7")) {
      const body = await readBody(req);
      return proxyS7(req, res, body);
    }

    // health
    if (url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: true, s7: S7_BASES[0] }));
    }

    res.writeHead(404);
    res.end("Not found");
  } catch (e) {
    cors(res);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: false, message: e.message }));
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("Ultra Bet listening on " + PORT + " S7=" + S7_BASES[0]);
});
