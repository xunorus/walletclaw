import { OpenClawXMTP } from './OpenClawXMTP.js';
import { OpenClawWS } from './OpenClawWS.js';

/**
 * 🤖 MiAgenteChat.js
 * Un agente OpenClaw minimalista que chatea vía XMTP.
 */

// 1. Configuración (ajusta estos valores si es necesario)
const config = {
  walletClawAddress: '0x0000000000000000000000000000000000000000', // Pon aquí tu address de WalletClaw
  chainId: 43113,      // Avalanche Fuji Testnet (dev env)
  env: 'dev'           // 'dev' para que coincida con WalletClaw dev mode
};

console.log("\n╔════════════════════════════════════════╗");
console.log("║    🤖 OpenClaw Chat Agent — v1.1.2     ║");
console.log("╚════════════════════════════════════════╝\n");

// 2. Inicializar agentes XMTP y WS
let agentXMTP = null;
let agentWS = null;

// Callback for incoming messages from both channels
const onReceived = async ({ from, payload }) => {
  const isLocal = from === 'LocalBridge';
  const senderLabel = isLocal ? '🌉 Bridge' : `🚀 XMTP (${from.slice(0, 10)}...)`;
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
  console.log(`[MSG] De: ${senderLabel} Contenido: ${text}`);

  // Ignore automatic events
  if (typeof payload === 'object' && payload.event) return;

  try {
    const responseText = `🤖 Héctor dice: "${text}". ¿En qué más puedo ayudarte? 🦾🦞`;
    // Send response back via same channel
    if (isLocal && agentWS) {
      await agentWS.send({ type: 'CHAT_MESSAGE', content: responseText });
    } else if (agentXMTP) {
      await agentXMTP.send(from, { type: 'CHAT_MESSAGE', content: responseText });
    }
    console.log(`[RES] Respuesta enviada a ${senderLabel}`);
  } catch (e) {
    console.error(`[SYS] Error al responder: ${e.message}`);
  }
};

// 3. Start connections
(async () => {
  // Connect WS (bridge) first
  try {
    agentWS = new OpenClawWS({
      bridgeUrl: 'ws://localhost:18789/ws-agent', // adjust if needed
      apiKey: 'wc_your_key_here', // ensure matches WalletClaw config
      onMessage: onReceived,
    });
    await agentWS.connect();
    console.log('✅ Conectado al Bridge Local via WS');
  } catch (e) {
    console.warn('⚠️ No se pudo conectar al Bridge Local:', e.message);
  }

  // Initialize XMTP agent
  agentXMTP = new OpenClawXMTP({
    walletClawAddress: config.walletClawAddress,
    chainId: config.chainId,
    env: config.env,
    onMessage: onReceived,
  });
  try {
    await agentXMTP.init();
    console.log(`✅ XMTP agente iniciado: ${agentXMTP.address}`);
    // Optional handshake
    if (config.walletClawAddress !== '0x0000000000000000000000000000000000000000') {
      await agentXMTP.handshake(config.walletClawAddress);
    }
  } catch (e) {
    console.error('❌ Error iniciando XMTP:', e.message);
  }
})();

// 3. Arrancar
try {
  await agent.init();
  console.log(`🟢 AGENTE ONLINE: ${agent.address}`);
  console.log(`👉 Copia este address y chatea con él desde WalletClaw.`);
  console.log(`📌 Recuerda en WalletClaw configurar el AGENT_ADDR en Settings para verlo en la lista.\n`);

  // --- Realizar Handshake proactivo ---
  if (config.walletClawAddress !== '0x0000000000000000000000000000000000000000') {
    console.info(`[SYS] Iniciando handshake con el Boss (${config.walletClawAddress})...`);
    await agent.handshake(config.walletClawAddress);
  } else {
    console.warn("[SYS] No se pudo enviar handshake: walletClawAddress no configurada en miAgenteChat.js (línea 10)");
  }
} catch (e) {
  console.error("❌ Error al iniciar el agente:", e.message);
}
