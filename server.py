import asyncio
import websockets
import json
import uuid
import os

"""
	Dictionary for id to websockets. 
	Sadly, websockets are technically not unique! They are an arbitrary variable.
"""
clients = {}

# Inevitably, the signaling server has to do some relaying.
# However, it is exclusively for signaling. Thus, colloquially, it is a signaling server, not a relay server.
# Though, in my opinion, a signaling server is thus definitely just a type / subset of relay server, but what do I know?
async def handler(websocket):
	# We need this id so that we can ensure signaling is targeted.
	peer_id = str(uuid.uuid4())[:8]
	clients[peer_id] = websocket

	await websocket.send(json.dumps({
		"type": "welcome",
		"id": peer_id,
		"peers": list(clients.keys())
	}))


    # Tell everyone else we've joined
	for id, socket in clients.items():
		if id != peer_id:
			await socket.send(json.dumps({
				"type": "new-peer",
				"id": peer_id
			}))


	try:
		async for message in websocket:
			data = json.loads(message)
			
			target = data.get("to")

			if target in clients:
				await clients[target].send(message)

	finally:
	    del clients[peer_id]


port = int(os.environ.get("PORT", 8765)) # Needed for Azure

async def main():
	# Replace "0.0.0.0" with "localhost", and this can be a local server connected to, and port with 8765
	# Just then also set network.js's signalingURL to "ws://localhost:8765"
	# Plus, you'll want to connect to the server through the static website via two browsers. At least in my experience!
	async with websockets.serve(handler, "0.0.0.0", port):
		await asyncio.Future()

asyncio.run(main())