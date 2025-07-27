let username;
let websocket;
let myRPC;
let localStream;
let currentCall = null;

const iceServers = undefined;

document.getElementById("login").addEventListener("submit", function (event) {
  event.preventDefault();
  username = new FormData(event.currentTarget).get("username");
  document.getElementById("username").textContent = username;

  websocket = new WebSocket("ws://localhost:3000");
  websocket.addEventListener("open", () => {
    websocket.send(JSON.stringify({ type: "authenticate", payload: { username } }));
  });
  websocket.addEventListener("message", (message) => {
    const data = JSON.parse(message.data);
    handleMessage(data);
  });

  event.currentTarget.style.display = "none";
  document.getElementById("chat").style.display = "block";
});

function handleMessage(data) {
  switch (data.type) {
    case "authenticated":
      break;
    case "user-list":
      updateUserList(data.payload.users);
      break;
    case "call-request":
      handleIncomingCall(data.payload);
      break;
    case "call-accepted":
      handleCallAccepted();
      break;
    case "call-rejected":
      handleCallRejected();
      break;
    case "offer":
      handleOffer(data.payload);
      break;
    case "answer":
      handleAnswer(data.payload);
      break;
    case "ice-candidate":
      handleIceCandidate(data.payload);
      break;
  }
}

function updateUserList(users) {
  const usersContainer = document.getElementById("users");
  usersContainer.innerHTML = "";
  
  users.forEach(user => {
    if (user.username !== username) {
      const userItem = document.createElement("div");
      userItem.className = "user-item";
      userItem.innerHTML = `<span>${user.username}</span><button onclick="startCall('${user.username}')">Call</button>`;
      usersContainer.appendChild(userItem);
    }
  });
}

window.startCall = async function(targetUsername) {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    document.getElementById("local-video").srcObject = localStream;
    
    myRPC = new RTCPeerConnection({ iceServers });
    currentCall = { target: targetUsername };
    
    for (let track of localStream.getTracks()) {
      myRPC.addTrack(track, localStream);
    }
    
    myRPC.addEventListener("negotiationneeded", async function () {
      const offer = await myRPC.createOffer({ offerToReceiveVideo: true });
      await myRPC.setLocalDescription(offer);
      websocket.send(JSON.stringify({
        type: "offer",
        payload: { offer: offer, target: targetUsername }
      }));
    });
    
    myRPC.addEventListener("icecandidate", function (event) {
      if (event.candidate) {
        websocket.send(JSON.stringify({
          type: "ice-candidate",
          payload: { candidate: event.candidate, target: targetUsername }
        }));
      }
    });
    
    myRPC.addEventListener("track", function (event) {
      document.getElementById("remote-video").srcObject = event.streams[0];
    });
    
    websocket.send(JSON.stringify({ type: "call-request", payload: { target: targetUsername } }));
    showVideoContainer();
    
  } catch (error) {
    alert("Error accessing camera/microphone");
  }
}

function handleIncomingCall(payload) {
  document.getElementById("caller-name").textContent = payload.caller;
  document.getElementById("call-controls").style.display = "block";
  currentCall = { target: payload.caller, pendingOffers: [], pendingIceCandidates: [] };
}

document.getElementById("accept-call").addEventListener("click", async function() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    document.getElementById("local-video").srcObject = localStream;
    
    myRPC = new RTCPeerConnection({ iceServers });
    
    for (let track of localStream.getTracks()) {
      myRPC.addTrack(track, localStream);
    }
    
    myRPC.addEventListener("icecandidate", function (event) {
      if (event.candidate) {
        websocket.send(JSON.stringify({
          type: "ice-candidate",
          payload: { candidate: event.candidate, target: currentCall.target }
        }));
      }
    });
    
    myRPC.addEventListener("track", function (event) {
      document.getElementById("remote-video").srcObject = event.streams[0];
    });
    
    websocket.send(JSON.stringify({ type: "call-accepted", payload: { target: currentCall.target } }));
    
    if (currentCall.pendingOffers && currentCall.pendingOffers.length > 0) {
      for (let pendingOffer of currentCall.pendingOffers) {
        await handleOffer(pendingOffer);
      }
      currentCall.pendingOffers = [];
    }
    
    if (currentCall.pendingIceCandidates && currentCall.pendingIceCandidates.length > 0) {
      for (let pendingCandidate of currentCall.pendingIceCandidates) {
        handleIceCandidate(pendingCandidate);
      }
      currentCall.pendingIceCandidates = [];
    }
    
    document.getElementById("call-controls").style.display = "none";
    showVideoContainer();
    
  } catch (error) {
    alert("Error accessing camera/microphone");
  }
});

document.getElementById("reject-call").addEventListener("click", function() {
  websocket.send(JSON.stringify({
    type: "call-rejected",
    payload: { target: currentCall.target }
  }));
  document.getElementById("call-controls").style.display = "none";
  currentCall = null;
});

document.getElementById("end-call").addEventListener("click", endCall);

function endCall() {
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  if (myRPC) {
    myRPC.close();
    myRPC = null;
  }
  currentCall = null;
  hideVideoContainer();
}

function showVideoContainer() {
  document.getElementById("video-container").style.display = "block";
}

function hideVideoContainer() {
  document.getElementById("video-container").style.display = "none";
  document.getElementById("local-video").srcObject = null;
  document.getElementById("remote-video").srcObject = null;
}

async function handleOffer(payload) {
  if (!myRPC) {
    if (currentCall && currentCall.pendingOffers) {
      currentCall.pendingOffers.push(payload);
    }
    return;
  }
  await myRPC.setRemoteDescription(payload.offer);
  const answer = await myRPC.createAnswer();
  await myRPC.setLocalDescription(answer);
  websocket.send(JSON.stringify({
    type: "answer",
    payload: { answer: answer, target: payload.caller }
  }));
}

async function handleAnswer(payload) {
  if (!myRPC) return;
  await myRPC.setRemoteDescription(payload.answer);
}

function handleIceCandidate(payload) {
  if (!myRPC) {
    if (currentCall && currentCall.pendingIceCandidates) {
      currentCall.pendingIceCandidates.push(payload);
    }
    return;
  }
  myRPC.addIceCandidate(payload.candidate);
}

function handleCallAccepted() {
}

function handleCallRejected() {
  alert("Call was rejected");
  endCall();
}