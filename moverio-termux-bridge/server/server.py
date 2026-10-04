import asyncio
import json
import os
from pathlib import Path

from aiohttp import web

HOST = os.environ.get("AEI_BRIDGE_HOST", "0.0.0.0")
PORT = int(os.environ.get("AEI_BRIDGE_PORT", "8080"))

ROOT = Path(__file__).resolve().parent
WEB_DIR = ROOT.parent / "web"

STATE = {
    "mode": "NETWORK",
    "nodeDensity": 24,
    "connectionRadius": 0.75,
    "movementSpeed": 1.0,
    "color": "cyan",
    "frozen": False,
}

CLIENTS = set()

LIMITS = {
    "nodeDensity": (4, 30),
    "connectionRadius": (0.10, 2.00),
    "movementSpeed": (0.00, 3.00),
}

MODES = {"NETWORK", "ORBITAL", "GRID", "HYBRID"}
COLORS = {"cyan", "amber", "magenta", "white"}


def state_message():
    return {"type": "state", **STATE}


async def broadcast_state():
    if not CLIENTS:
        return
    payload = json.dumps(state_message())
    dead = []
    for ws in CLIENTS:
        try:
            await ws.send_str(payload)
        except Exception:
            dead.append(ws)
    for ws in dead:
        CLIENTS.discard(ws)


def apply_value(key, value):
    if key == "mode":
        value = str(value).upper()
        if value in MODES:
            STATE[key] = value
            return True
        return False

    if key == "color":
        value = str(value).lower()
        if value in COLORS:
            STATE[key] = value
            return True
        return False

    if key == "frozen":
        STATE[key] = bool(value)
        return True

    if key in LIMITS:
        low, high = LIMITS[key]
        try:
            number = float(value)
        except (TypeError, ValueError):
            return False

        number = max(low, min(high, number))
        if key == "nodeDensity":
            number = int(round(number))
        STATE[key] = number
        return True

    return False


async def index(_request):
    return web.FileResponse(WEB_DIR / "index.html")


async def state_endpoint(_request):
    return web.json_response(state_message())


async def websocket(request):
    ws = web.WebSocketResponse(heartbeat=30)
    await ws.prepare(request)
    CLIENTS.add(ws)

    await ws.send_json(state_message())

    try:
        async for msg in ws:
            if msg.type != web.WSMsgType.TEXT:
                continue

            try:
                data = json.loads(msg.data)
            except json.JSONDecodeError:
                await ws.send_json({"type": "error", "message": "invalid_json"})
                continue

            msg_type = data.get("type")

            if msg_type == "set":
                if apply_value(data.get("key"), data.get("value")):
                    await broadcast_state()
                else:
                    await ws.send_json({"type": "error", "message": "invalid_value"})

            elif msg_type == "reset":
                STATE.update({
                    "mode": "NETWORK",
                    "nodeDensity": 24,
                    "connectionRadius": 0.75,
                    "movementSpeed": 1.0,
                    "color": "cyan",
                    "frozen": False,
                })
                await broadcast_state()

            elif msg_type == "get":
                await ws.send_json(state_message())

            else:
                await ws.send_json({"type": "error", "message": "unknown_message_type"})
    finally:
        CLIENTS.discard(ws)

    return ws


app = web.Application()
app.router.add_get("/", index)
app.router.add_get("/api/state", state_endpoint)
app.router.add_get("/ws", websocket)
app.router.add_static("/static/", WEB_DIR, show_index=False)


if __name__ == "__main__":
    print(f"AEI Moverio Termux Bridge listening on http://{HOST}:{PORT}")
    print("LAN only. Do not expose this service directly to the public internet.")
    web.run_app(app, host=HOST, port=PORT)
