import asyncio
import json
import sys

import websockets

channel_id = sys.argv[1]
token1 = sys.argv[2]
token2 = sys.argv[3]

URI1 = f"ws://localhost:8000/ws/channels/{channel_id}?token={token1}"
URI2 = f"ws://localhost:8000/ws/channels/{channel_id}?token={token2}"


async def main():
    async with websockets.connect(URI1) as ws1, websockets.connect(URI2) as ws2:
        await ws1.send(json.dumps({"content": "Hey, can you review the PR today?"}))
        msg_for_1 = json.loads(await ws1.recv())
        msg_for_2 = json.loads(await ws2.recv())
        print("ws1 (sender) received:", msg_for_1["user_name"], "-", msg_for_1["content"])
        print("ws2 (other member) received:", msg_for_2["user_name"], "-", msg_for_2["content"])
        assert msg_for_1 == msg_for_2, "both sockets should see the identical broadcast message"

        await ws2.send(json.dumps({"content": "Sure, I'll look at it this hour."}))
        reply_for_1 = json.loads(await ws1.recv())
        reply_for_2 = json.loads(await ws2.recv())
        print("ws1 received reply:", reply_for_1["user_name"], "-", reply_for_1["content"])
        print("ws2 (sender) received reply:", reply_for_2["user_name"], "-", reply_for_2["content"])

    print("WEBSOCKET TEST PASSED")


asyncio.run(main())
