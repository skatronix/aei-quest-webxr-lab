import fs from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import process from 'node:process';
import { WebSocketServer } from 'ws';
import osc from 'osc';

const WS_PORT = Number(process.env.AEI_WS_PORT || 8443);
const OSC_HOST = process.env.AEI_OSC_HOST || '127.0.0.1';
const OSC_PORT = Number(process.env.AEI_OSC_PORT || 9000);
const CERT = process.env.AEI_CERT || new URL('./certs/cert.pem', import.meta.url);
const KEY = process.env.AEI_KEY || new URL('./certs/key.pem', import.meta.url);

function localIPv4() {
  const out = [];
  for (const [name, entries] of Object.entries(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) out.push({ name, address: entry.address });
    }
  }
  return out;
}

if (!fs.existsSync(CERT) || !fs.existsSync(KEY)) {
  console.error('TLS certificate missing. Run: ./gen-cert.sh <MAC_LAN_IP>');
  process.exit(1);
}

const udp = new osc.UDPPort({
  localAddress: '0.0.0.0',
  localPort: 0,
  remoteAddress: OSC_HOST,
  remotePort: OSC_PORT,
  metadata: true,
});

udp.on('ready', () => {
  console.log(`[OSC] ready -> udp://${OSC_HOST}:${OSC_PORT}`);
});
udp.on('error', (error) => console.error('[OSC] error', error));
udp.open();

const server = https.createServer(
  { cert: fs.readFileSync(CERT), key: fs.readFileSync(KEY) },
  (req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><meta charset="utf-8"><title>AEI Quest OSC Bridge</title>
      <style>body{font:16px system-ui;background:#080a0f;color:#f5f7fb;max-width:720px;margin:60px auto;padding:24px}code{color:#7fd8ff}</style>
      <h1>AEI Quest OSC Bridge</h1>
      <p>TLS endpoint is running. If Quest Browser showed a certificate warning, accept it once on this page.</p>
      <p>WebSocket endpoint: <code>wss://${req.headers.host}</code></p>
      <p>OSC destination: <code>udp://${OSC_HOST}:${OSC_PORT}</code></p>`);
  }
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
    udp.send({
      address: msg.address,
      args: [{ type: 'f', value }],
    });

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
  console.log(`\nAEI Quest OSC Bridge 01`);
  console.log(`WSS port: ${WS_PORT}`);
  for (const nic of localIPv4()) {
    console.log(`Quest certificate page: https://${nic.address}:${WS_PORT}`);
    console.log(`Quest WebSocket URL:    wss://${nic.address}:${WS_PORT}`);
  }
  console.log('Keep this terminal open during the Quest test.\n');
});
