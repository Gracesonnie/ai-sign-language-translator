const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8081 }, () => {
    console.log("🚀 WebRTC Signaling Server running locally on port 8081");
});

let clients = [];

wss.on('connection', (ws) => {
    clients.push(ws);
    console.log(`Node joined. Total clients connected: ${clients.length}`);

    ws.on('message', (message) => {
        // Broadcast incoming structural payloads to everyone else in the LAN room
        clients.forEach(client => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(message.toString());
            }
        });
    });

    ws.on('close', () => {
        clients = clients.filter(client => client !== ws);
        console.log(`Node disconnected. Total clients remaining: ${clients.length}`);
    });
});