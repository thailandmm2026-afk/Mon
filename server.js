/**
 * Ultra Bet — one link for everything (777/CK direct + 7S via built-in proxy)
 * Open: http://YOUR_HOST:PORT/
 * No separate proxy URL. No file:// open.
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const S7_BASE = process.env.S7_BASE || 'https://www.78840182.com';
const HTML_FILE = path.join(__dirname, 'ultra_bet_7scrown.html');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Merchant, Language, Encryption, Device, Accept, X-Requested-With');
}

function sendHtml(res) {
  let html = fs.readFileSync(HTML_FILE, 'utf8');
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(html);
}

function proxyS7(req, res, bodyBuf) {
  const u = new URL(S7_BASE + req.url.slice(3)); // /s7/...
  const headers = { ...req.headers };
  delete headers.host;
  delete headers.origin;
  delete headers.referer;
  delete headers['accept-encoding'];
  headers.host = u.hostname;
  if (bodyBuf && bodyBuf.length) headers['content-length'] = bodyBuf.length;

  const preq = https.request({
    hostname: u.hostname,
    path: u.pathname + u.search,
    method: req.method,
    headers,
    timeout: 30000
  }, (pres) => {
    cors(res);
    res.writeHead(pres.statusCode || 502, {
      'content-type': pres.headers['content-type'] || 'application/json'
    });
    pres.pipe(res);
  });
  preq.on('error', (e) => {
    cors(res);
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ success: false, message: e.message }));
  });
  preq.on('timeout', () => {
    preq.destroy();
    cors(res);
    res.writeHead(504, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ success: false, message: 'timeout' }));
  });
  if (bodyBuf && bodyBuf.length) preq.write(bodyBuf);
  preq.end();
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    cors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/' || req.url.startsWith('/index') || req.url.startsWith('/ultra')) {
    try {
      return sendHtml(res);
    } catch (e) {
      res.writeHead(500);
      return res.end('HTML missing: ' + e.message);
    }
  }

  if (req.url.startsWith('/s7/')) {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => proxyS7(req, res, Buffer.concat(chunks)));
    return;
  }

  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('Ultra Bet running → http://0.0.0.0:' + PORT + '/');
  console.log('7S proxy path → /s7/*  →  ' + S7_BASE);
});
