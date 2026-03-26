import { WebSocket } from 'ws';

// Cambia esto por tu API Key de WalletClaw
const API_KEY = "wc_2ba6bfaa89abe581b12fd1f8e7b6ce3e5dbb"; 
const URL = `ws://localhost:18789/ws-agent?key=${API_KEY}`;

console.log(`🤖 Iniciando agente de prueba en ${URL}...`);

const ws = new WebSocket(URL);

ws.on('open', () => {
    console.log("🟢 [AGENT] Conectado al Bridge.");
    // Enviar primer mensaje al chat
    ws.send(JSON.stringify({ 
        type: 'CHAT_MESSAGE', 
        content: '🤖 ¡Hola! Soy el agente de prueba. Estoy listo para chatear.' 
    }));
});

ws.on('message', (data) => {
    try {
        const msg = JSON.parse(data);
        console.log("📥 [AGENT] Mensaje recibido:", msg);

        if (msg.type === 'CHAT_MESSAGE') {
            console.log(`💬 Contenido: ${msg.content}`);
            // Responder automáticamente
            const reply = { 
                type: 'CHAT_MESSAGE', 
                content: `✅ Recibido en el agente: "${msg.content}"` 
            };
            console.log("📤 [AGENT] Enviando respuesta...");
            ws.send(JSON.stringify(reply));
        }
    } catch (e) {
        console.error("❌ [AGENT] Error parseando mensaje:", e.message);
    }
});

ws.on('error', (err) => {
    console.error("❌ [AGENT] Error de WebSocket:", err.message);
});

ws.on('close', () => {
    console.log("🔴 [AGENT] Conexión cerrada.");
});
