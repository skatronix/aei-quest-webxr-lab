"""
Optional AEI Moverio OSC -> WebSocket bridge.

This process is NOT started automatically.
Install:
    python -m pip install python-osc aiohttp

Run on a trusted local network only:
    python osc_bridge.py

Default OSC input:
    UDP 9000

Supported addresses:
    /aei/moverio/mode             string
    /aei/moverio/nodeDensity      int/float
    /aei/moverio/connectionRadius float
    /aei/moverio/movementSpeed    float
    /aei/moverio/color            string
    /aei/moverio/freeze           int/bool
    /aei/moverio/yaw              float
    /aei/moverio/pitch            float
    /aei/moverio/roll             float

The bridge forwards commands to the existing local WebSocket server.
"""

import asyncio
import json
import os

from aiohttp import ClientSession
from pythonosc.dispatcher import Dispatcher
from pythonosc.osc_server import AsyncIOOSCUDPServer

OSC_HOST = os.environ.get("AEI_OSC_HOST", "0.0.0.0")
OSC_PORT = int(os.environ.get("AEI_OSC_PORT", "9000"))
WS_URL = os.environ.get("AEI_WS_URL", "http://127.0.0.1:8080/ws")

QUEUE = asyncio.Queue()

MAP = {
    "/aei/moverio/mode": "mode",
    "/aei/moverio/nodeDensity": "nodeDensity",
    "/aei/moverio/connectionRadius": "connectionRadius",
    "/aei/moverio/movementSpeed": "movementSpeed",
    "/aei/moverio/color": "color",
    "/aei/moverio/freeze": "frozen",
    "/aei/moverio/yaw": "yaw",
    "/aei/moverio/pitch": "pitch",
    "/aei/moverio/roll": "roll",
}


def on_osc(address, *args):
    if not args:
        return
    key = MAP.get(address)
    if not key:
        return

    value = args[0]
    if key == "frozen":
        value = bool(value)

    if key in {"yaw", "pitch", "roll"}:
        payload = {"type": "sensor", "enabled": True, key: value}
    else:
        payload = {"type": "set", "key": key, "value": value}

    QUEUE.put_nowait(payload)


async def websocket_sender():
    async with ClientSession() as session:
        while True:
            try:
                async with session.ws_connect(WS_URL, heartbeat=30) as ws:
                    print("OSC bridge connected to", WS_URL)
                    while True:
                        payload = await QUEUE.get()
                        await ws.send_str(json.dumps(payload))
            except Exception as exc:
                print("WebSocket unavailable:", exc)
                await asyncio.sleep(2)


async def main():
    loop = asyncio.get_running_loop()
    dispatcher = Dispatcher()
    for address in MAP:
        dispatcher.map(address, on_osc)

    server = AsyncIOOSCUDPServer((OSC_HOST, OSC_PORT), dispatcher, loop)
    transport, _protocol = await server.create_serve_endpoint()

    print(f"AEI Moverio OSC bridge listening on udp://{OSC_HOST}:{OSC_PORT}")
    print("Trusted LAN only. OSC bridge is optional and separately launched.")

    try:
        await websocket_sender()
    finally:
        transport.close()


if __name__ == "__main__":
    asyncio.run(main())
