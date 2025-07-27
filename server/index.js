const { createServer } = require("http");
const { WebSocketServer } = require("ws");

const server = createServer();
const wss = new WebSocketServer({ server });

let subscribers = [];

wss.on("connection", (connection) => {
  addSubscriber(connection);
});

function addSubscriber(connection) {
  const subscriber = {
    id: Date.now(),
    connection,
    username: null
  };
  subscribers.push(subscriber);
  
  connection.addEventListener("close", () => removeSubscriber(subscriber.id));
  connection.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    handleMessage(subscriber, message);
  });
}

function handleMessage(subscriber, message) {
  switch (message.type) {
    case "authenticate":
      subscriber.username = message.payload.username;
      subscriber.connection.send(JSON.stringify({ type: "authenticated" }));
      broadcastUserList();
      break;
      
    case "call-request":
      const target = subscribers.find(s => s.username === message.payload.target);
      if (target) {
        target.connection.send(JSON.stringify({
          type: "call-request",
          payload: { caller: subscriber.username }
        }));
      }
      break;
      
    case "call-accepted":
      const caller = subscribers.find(s => s.username === message.payload.target);
      if (caller) {
        caller.connection.send(JSON.stringify({
          type: "call-accepted",
          payload: { target: subscriber.username }
        }));
      }
      break;
      
    case "call-rejected":
      const rejectedCaller = subscribers.find(s => s.username === message.payload.target);
      if (rejectedCaller) {
        rejectedCaller.connection.send(JSON.stringify({
          type: "call-rejected",
          payload: { target: subscriber.username }
        }));
      }
      break;
      
    case "offer":
      const offerTarget = subscribers.find(s => s.username === message.payload.target);
      if (offerTarget) {
        offerTarget.connection.send(JSON.stringify({
          type: "offer",
          payload: { offer: message.payload.offer, caller: subscriber.username }
        }));
      }
      break;
      
    case "answer":
      const answerTarget = subscribers.find(s => s.username === message.payload.target);
      if (answerTarget) {
        answerTarget.connection.send(JSON.stringify({
          type: "answer",
          payload: { answer: message.payload.answer, target: subscriber.username }
        }));
      }
      break;
      
    case "ice-candidate":
      const iceTarget = subscribers.find(s => s.username === message.payload.target);
      if (iceTarget) {
        iceTarget.connection.send(JSON.stringify({
          type: "ice-candidate",
          payload: { candidate: message.payload.candidate, target: subscriber.username }
        }));
      }
      break;
  }
}

function removeSubscriber(id) {
  const index = subscribers.findIndex(s => s.id === id);
  if (index !== -1) {
    subscribers.splice(index, 1);
    broadcastUserList();
  }
}

function broadcastUserList() {
  const userList = subscribers
    .filter(s => s.username)
    .map(s => ({ username: s.username }));
  
  const message = JSON.stringify({ type: "user-list", payload: { users: userList } });
  subscribers.forEach(s => {
    if (s.username) s.connection.send(message);
  });
}

server.listen(3000, () => console.log("Server listening on port 3000"));
