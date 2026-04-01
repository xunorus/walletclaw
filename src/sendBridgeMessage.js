import { OpenClawWS } from './OpenClawWS.js';

/**
 * 🚀 sendBridgeMessage.js
 * Una herramienta CLI para que el Agente OpenClaw mande mensajes instantáneos 
 * al Bridge de WalletClaw vía WebSocket.
 * 
 * Uso: npx tsx src/sendBridgeMessage.js "Tu mensaje aquí"
 */

const message = process.argv[2];
const cliUrl  = process.argv[3];
const cliKey  = process.argv[4];

if (!message) {
    console.error("❌ Falta el mensaje. Uso: npx tsx src/sendBridgeMessage.js \"Hola\" [BRIDGE_URL] [API_KEY]");
    process.exit(1);
}

let finalUrl = cliUrl || process.env.BRIDGE_URL || 'ws://localhost:18789/ws-agent';

// Auto-fix: Asegurar que conectamos al canal de AGENTES, no de UI
if (finalUrl.endsWith('/ws-ui')) {
    finalUrl = finalUrl.replace('/ws-ui', '/ws-agent');
} else if (!finalUrl.includes('/ws-agent') && !finalUrl.includes('/ws-ui')) {
    // Si no tiene path, lo añadimos
    finalUrl = finalUrl.endsWith('/') ? finalUrl + 'ws-agent' : finalUrl + '/ws-agent';
}

const config = {
    bridgeUrl: finalUrl,
    apiKey:    cliKey  || process.env.API_KEY    || 'CLAW_BRIDGE_SECRET'
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

        // Esperar un poco para asegurar que el Bridge propague el mensaje
        setTimeout(() => {
            agent.disconnect();
            process.exit(0);
        }, 500);

    } catch (e) {
        console.error("❌ Error en Bridge CLI:", e.message);
        process.exit(1);
    }
}

run();
