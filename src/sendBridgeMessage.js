import { OpenClawWS } from './OpenClawWS.js';

/**
 * 🚀 sendBridgeMessage.js
 * Una herramienta CLI para que el Agente OpenClaw mande mensajes instantáneos 
 * al Bridge de WalletClaw vía WebSocket.
 * 
 * Uso: npx tsx src/sendBridgeMessage.js "Tu mensaje aquí"
 */

const message = process.argv[2];

if (!message) {
    console.error("❌ Falta el mensaje. Uso: npx tsx src/sendBridgeMessage.js \"Hola\"");
    process.exit(1);
}

const config = {
    bridgeUrl: process.env.BRIDGE_URL || 'ws://192.168.1.33:18789/ws-agent',
    apiKey: process.argv[3] || process.env.API_KEY || 'CLAW_BRIDGE_SECRET'
};

const agent = new OpenClawWS({
    bridgeUrl: config.bridgeUrl,
    apiKey: config.apiKey
});

async function run() {
    try {
        console.log(`[BRIDGE_CLI] 📤 Enviando al Bridge: "${message.substring(0, 30)}..."`);
        await agent.connect();

        // El Bridge espera un CHAT_MESSAGE. OpenClawWS.send ya lo envuelve si es string.
        await agent.send(message);

        console.log("✅ Mensaje disparado con éxito.");

        // Pequeño delay para asegurar que el buffer del socket se limpie
        setTimeout(() => {
            agent.disconnect();
            process.exit(0);
        }, 100);

    } catch (e) {
        console.error("❌ Error en Bridge CLI:", e.message);
        process.exit(1);
    }
}

run();
