/* TO DO:
	Make all datachannel UDP like sendObject or setupDataChannel's async check for sequence to ensure no dropped packets.
	Rearrange NetworkAPI to make the class methods and attributes more readable
	Allow for multiple different games to seperate what is sent to users (likely going to be mainly logic in server.py)
	Allow for ID to remain between connections EX resetting the page. (though, likely apart of game account logic seperately)
*/

class NetworkAPI {
	/* 	socket is comment-worthy as the theoretical only purpose of the entire NetworkAPI class,
		All we essentially do is interact with this WebSocket. 
		If the class does something else, it isn't this class, and you should make a new one!
	*/
	#socket
	#id
	#peers
	#pendingIceCandidates
	onmessage

	// Should never be used by anything but constructNetworkAPI due to us requiring an ID.
	constructor(socket, id) {
		this.#socket = socket
		this.#id = id
		this.#peers = {
			peerId : {
				connection: RTCPeerConnection,
				channel: RTCDataChannel
			}
		}
		this.#pendingIceCandidates = []
		this.onmessage = null
	}


	get id() {
		return this.#id
	}


	/*	sendJson
		Sends a JavaScript object as json to all connected peers, as to be collected via the opening of onmessage. 

		This expects the object to not include a "from" variable, as these are automatically added.
		We do not add a "to," as the reciever knows how it is. A  "to" only is needed for a third server, like in .#send
	*/
	sendObject(object) {
		message = JSON.stringify({
			from: this.#id,
			...object
		})
        for (const peer of Object.values(this.#peers)) {
            if (peer.channel && peer.channel.readyState === "open") {
				peer.channel.send(message)
			}
        }
	}

	/* 	sendStringifiedJson
		If you have already stringified json you want to send, use this over sendObject.
		Not recommended as compared to sendObject due to less efficiently adding the object, but creates the same message.
		Likely has optimizations to make it less bad, but it will seemingly forever be slightly worse in anycase.
	*/
	sendStringifiedJson(json) {
		json = JSON.parse(json)
		json.from = this.#id
		json = JSON.stringify(json)
        for (const peer of Object.values(this.#peers)) {
            if (peer.channel && peer.channel.readyState === "open") {
				peer.channel.send(json)
			}
        }
	}


	#setupDataChannel(dataChannel) {
		/*	The below might be too clever for our own non-JavaScript programmer good, but I also feel it makes sense.

			Essentially, it allows syntax of NetworkAPI.onmessage = (data, dataChannel) => {} to create a function
			So, all messages just get handled by that. When this is called, your function will be called.
			It should be async.

			This is weird since critical logic should not be handled outside the class, but it is our current plan;
			All this class really does, and should ever do, is allow the sending and retreval of dataChannel messages.
			How to handle them really seems like the purview of whatever needs the networking, not the networking itself.
			Likely will change later when we get a better idea on the overall design, but for now, this seems right.

			BTW, it is for this reason I decided to include the entire messageEvent and dataChannel, as its open-ended.
			messageEvent.data should give the contents of the message.  
		*/
		dataChannel.onmessage = (messageEvent) => { this.onmessage(messageEvent, dataChannel) }
	}

	
	/*	createConnection
		Handles the creation of a peers{} peerConnection, including the data channel and managing ice connections.
		Essentially, this is where a peerConnection is recognized.
		
		When initiator is passed as true, a dataChannel is created, and the session descriptions are sent out.
		
		The function is notable that it returns the connection to the caller, as to handle particular connection requirements.
		Particularly, the #send method we call depends on the #socket being initialized,
		Thus, the caller of createConnection is expected to handle the connection, making the #socket handle #send
	*/
	createConnection(peerId, initiator) {
		// If we already have a connection, then we do not need to create one!
		// Admitedly somewhat questionable, since we did call this function to create a connection anyway...
		// But in the few awkward scenarios this occurs, this solution doesn't fail, and works fairly well. 
		// At the very least, we have countless better things to do in life then meticulously handle such rare edge cases.
		if (this.#peers[peerId]) { return this.#peers[peerId] }

		this.#peers[peerId] = {
			connection: null,
			channel: null
		};

		

		const newConnection = new RTCPeerConnection({

			/*	Ice servers are for finding the best peer to peer connection, connecting both sides through the internet.
				This is a bit unintuitive, since it's just a STUN server, which really just tells what public IP you have.
				In reality, "ice servers" do not exist. 
				This is just a list of servers which WebRTC's ice logic uses to find a connection, and a STUN is all it needs.

				Also, the STUN server here is a free service by Google just to help make the web better, so that's awesome!
				We might eventually consider adding our cloud service as a TURN server as a relay for TCP, but its unneeded.
			*/
			iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
		})
		

		// The below are all functions that are called on event from peer connection.

		// Occurs when the peerConnection tries any iceConnection, I believe usually by .setLocalDescription
		newConnection.onicecandidate = (peerConnectionIceEvent) => {
			if (peerConnectionIceEvent.candidate) {
				this.#send(peerId, {candidate: peerConnectionIceEvent.candidate})
			}
		}

		// Occurs when another peer has .createDataChannel
		newConnection.ondatachannel = (dataChannelEvent) => {
			this.#peers[peerId].channel = dataChannelEvent.channel
			this.#setupDataChannel(dataChannelEvent.channel)
		}

		if (initiator) {
			// As you may see, the next two bits are ways the two above events occur. 
			const dataChannel = newConnection.createDataChannel({
				// The below help ensure packets are sent, despite dataChannels being UDP over TCP.
				ordered: true, // We make sure any packets sent wait for prior packets to be sent first.
				maxPacketLifeTime: 2000 // We give two seconds to send the packet over. Usually, packets take at most 200 ms.
			})
			this.#peers[peerId].channel = dataChannel
			this.#setupDataChannel(dataChannel)
			
			// Unintuitively, this below is subtly very tricky;
			// Essentially, createOffer() returns a promise, and so we have to .then() to ensure it all works,
			// Therefore we want until it can be set as the local description, and for us to send that description as an offer
			newConnection.createOffer()
				.then(sessionDescription => newConnection.setLocalDescription(sessionDescription))
				.then(() => {this.#send(peerId, {offer : newConnection.localDescription })})
		}

		this.#peers[peerId].connection = newConnection

		// Returning the wrapper itself is needed due to scripting language shenanigans.
		return this.#peers[peerId].connection
	}



	/* 	setupMessageHandler
		Creates the async response to any socket message. 
		Thus, this is where we handle incoming offers.

		Awkwardly made and could use polish, but fine enough where I have to write this comment to remember it is bad lol
	*/
	setupMessageHandler() {
		this.#socket.onmessage = async(event) => {
			const data = JSON.parse(event.data)

			if (data.type === "new-peer") {
				this.createConnection(data.id, false)
				return
			}

			if (data.offer) {
				const peerConnection = this.createConnection(data.from, false).connection
				await peerConnection.setRemoteDescription(data.offer)

				for (const iceCandidate of this.#pendingIceCandidates) {
					await peerConnection.addIceCandidate(iceCandidate);
				} 
				this.#pendingIceCandidates.length = 0

				const answer = await peerConnection.createAnswer()
				await peerConnection.setLocalDescription(answer)

				this.#send(data.from, {answer})
				return
			}

			if (data.answer) {
				await this.#peers[data.from].connection.setRemoteDescription(data.answer)

				for (const iceCandidate of this.#pendingIceCandidates) {
					await this.#peers[data.from].connection.addIceCandidate(iceCandidate);
				} 
				this.#pendingIceCandidates.length = 0

				return
			}
			
			if (data.candidate) {
				if (this.#peers[data.from].connection.remoteDescription) { // If we have a remote description, we can have IceCandidates
					await this.#peers[data.from].connection.addIceCandidate(data.candidate)
				} else { // Otherwise, we'll have to handle it later when we have a remote description!
					this.#pendingIceCandidates.push(data.candidate)
				}
				return
			}
		}
	}



	#send(to, json) {
		this.#socket.send(JSON.stringify({
			to,
			from: this.id,
			...json
		}))
	}
}




/*	constructNetworkAPI
	The only way you are allowed to make a NetWorkAPI class, 
	This is since we have asynchronous requirements class constructors do not allow.
*/
async function constructNetworkAPI(
	// Defaults to our signaling servers IP, but theoretically could be manual to any server.
	signalingURL = "wss://flying-casino-brakftgmdhbca5cy.canadacentral-01.azurewebsites.net/"
) {
	const socket = new WebSocket(signalingURL)

	// Fairly new to JavaScript, so apologies for this over-explanatory comment:
	// Essentially, "I promise the socket will open. Await until then" 
	await new Promise(resolve => socket.onopen = resolve)

	// Same as above, but now we promise we are nabbing the mandatory returning welcome JSON.
	const welcome = await new Promise(resolve => {
		socket.onmessage = (event) => {
			const welcomeData = JSON.parse(event.data)
			if (welcomeData.type === "welcome") {
				resolve(welcomeData)
			}
		}
	})
	const network = new NetworkAPI(socket, welcome.id)

	network.setupMessageHandler()

	for (const peerId of welcome.peers) {
		if (peerId !== network.id) {
			network.createConnection(peerId, true)
		}
	}

	return network
}

/* 
	To be deleted later, but currently just commented out for usage for local testing in this early stage of development.
	To do so: 
		1. Run server.py locally with websockets.serve(handler, "localhost", 8765)
		2. Remove "export" from constructNetworkAPI 
		3. Replace index.html's script with just <script src="network.js"></script>
		4. Drag and drop the project folder into a browser, and then go to index.html
	And there you will have it. 
	In my experience having multiple browsers do it, like chrome and firefox, best shows off networking features,
	Otherwise, there can be weird bugs with it.
*/
async function init() {
	// localhost can be removed to use the actual signaling server
	const network = await constructNetworkAPI()

	const input = document.getElementById("messageInput")
	const button = document.getElementById("sendMessage")
	const messages = document.getElementById("messageBox")
	
	button.onclick = () => {
		network.sendStringifiedJson(JSON.stringify({
			text: input.value
		}))
		input.value = ""
	}

	network.onmessage = (message) => {
		const p = document.createElement ("p")
		p.innerText = "From: " + JSON.parse(message.data).from + "\n" + JSON.parse(message.data).text
		messages.appendChild(p)
	}
}

init()