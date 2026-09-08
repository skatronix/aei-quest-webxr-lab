import fs from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import osc from 'osc';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(HERE, '../dist');
const WS_PORT = Number(process.env.AEI_WS_PORT || 8443);
const OSC_HOST = process.env.AEI_OSC_HOST || '127.0.0.1';
const OSC_PORT = Number(process.env.AEI_OSC_PORT || 9000);
const CERT = process.env.AEI_CERT || path.join(HERE, 'certs/cert.pem');
const KEY = process.env.AEI_KEY || path.join(HERE, 'certs/key.pem');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

function localIPv4() {
  const out = [];
  for (const [name, entries] of Object.entries(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) out.push({ name, address: entry.address });
    }
  }
  return out;
}

function serveStatic(req, res) {
  if (!fs.existsSync(DIST)) {
    res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('AEI XR build missing. From repo root run: npm install && npm run build');
    return;
  }

  const requestPath = decodeURIComponent(new URL(req.url, 'https://local').pathname);
  const relative = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
  const candidate = path.resolve(DIST, relative);
  if (!candidate.startsWith(`${DIST}${path.sep}`) && candidate !== path.join(DIST, 'index.html')) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  const filePath = fs.existsSync(candidate) && fs.statSync(candidate).isFile()
    ? candidate
    : path.join(DIST, 'index.html');
  const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
  fs.createReadStream(filePath).pipe(res);
}

if (!fs.existsSync(CERT) || !fs.existsSync(KEY)) {
  console.error('TLS certificate missing. Run: zsh gen-cert.sh <MAC_LAN_IP>');
  process.exit(1);
}

const udp = new osc.UDPPort({
  localAddress: '0.0.0.0',
  localPort: 0,
  remoteAddress: OSC_HOST,
  remotePort: OSC_PORT,
  metadata: true,
});
udp.on('ready', () => console.log(`[OSC] ready -> udp://${OSC_HOST}:${OSC_PORT}`));
udp.on('error', (error) => console.error('[OSC] error', error));
udp.open();

const server = https.createServer(
  { cert: fs.readFileSync(CERT), key: fs.readFileSync(KEY) },
  serveStatic
);

const wss = new WebSocketServer({ server });
let clientCounter = 0;

wss.on('connection', (ws, req) => {
  const clientId = ++clientCounter;
  console.log(`[WS] client ${clientId} connected from ${req.socket.remoteAddress}`);

  ws.on('message', (data) => {
    const bridgeRx = performance.now();
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      console.warn(`[WS] client ${clientId}: ignored non-JSON message`);
      return;
    }

    if (msg.type === 'hello') {
      ws.send(JSON.stringify({ type: 'hello-ack', bridge: 'AEI MBP OSC Bridge 01' }));
      return;
    }

    if (msg.type !== 'control') return;
    if (msg.address !== '/aei/fader/1') return;
    if (typeof msg.value !== 'number' || !Number.isFinite(msg.value)) return;

    const value = Math.min(1, Math.max(0, msg.value));
    udp.send({ address: msg.address, args: [{ type: 'f', value }] });

    const bridgeTx = performance.now();
    console.log(`[OSC] ${msg.address} ${value.toFixed(3)}`);
    ws.send(JSON.stringify({
      type: 'ack',
      address: msg.address,
      value,
      clientSentAt: msg.clientSentAt,
      bridgeRx,
      bridgeTx,
    }));
  });

  ws.on('close', () => console.log(`[WS] client ${clientId} disconnected`));
  ws.on('error', (error) => console.error(`[WS] client ${clientId} error`, error.message));
});

server.listen(WS_PORT, '0.0.0.0', () => {
  console.log('\nAEI Quest OSC Bridge 01');
  console.log(`OSC destination: udp://${OSC_HOST}:${OSC_PORT}`);
  for (const nic of localIPv4()) {
    console.log(`[${nic.name}] Quest Control Demo: https://${nic.address}:${WS_PORT}`);
    console.log(`[${nic.name}] WebSocket:          wss://${nic.address}:${WS_PORT}`);
  }
  console.log('Open the HTTPS URL in Quest Browser, accept the local certificate warning once, then CONNECT BRIDGE.');
  console.log('Keep this terminal open during the Quest test.\n');
});
