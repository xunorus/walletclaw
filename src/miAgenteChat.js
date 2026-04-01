import { OpenClawHistory } from './OpenClawHistory.js';
import { OpenClawXMTP } from './xmtp/OpenClawXMTP.js';
import { OpenClawWS } from './OpenClawWS.js';

/**
 * 🤖 MiAgenteChat.js
 * Un agente OpenClaw minimalista que chatea vía XMTP.
 */

// 1. Configuración (ajusta estos valores si es necesario)
const config = {
  walletClawAddress: '0x111352e0242847478AB9232981BB517bC2c22aD8', // TU ADDRESS REAL
  chainId: 43113,      // Avalanche Fuji Testnet (dev env)
  env: 'dev'           // 'dev' para que coincida con WalletClaw dev mode
};

// --- CEREBRO DE HÉCTOR (HISTORIAL) ---
const brain = new OpenClawHistory('./openclaw_brain.json');

console.log("\n╔════════════════════════════════════════╗");
console.log("║    🤖 OpenClaw Chat Agent — v1.2.4     ║");
console.log("╚════════════════════════════════════════╝\n");

// 2. Inicializar agentes XMTP y WS
let agentXMTP = null;
let agentWS = null;

// Callback for incoming messages from both channels
const onReceived = async ({ from, payload }) => {
  const isLocal = from === 'LocalBridge';
  const senderLabel = isLocal ? '🌉 Bridge' : `🚀 XMTP (${from.slice(0, 10)}...)`;
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload);

  // --- HANDLER DE EVENTO: DESAFÍO DE SEGURIDAD (Handshake) ---
  if (typeof payload === 'object' && payload.event === 'connect.challenge') {
    const nonce = payload.payload?.nonce || payload.nonce;
    if (nonce) {
      try {
        // Firmamos el nonce con la identidad de Héctor para demostrar autenticidad
        const signature = await agentXMTP._identity.signer.signMessage(nonce);
        if (agentWS) {
          await agentWS.send({
            type: 'event',
            event: 'connect.response',
            payload: { signature }
          });
          console.log(`[SYS] 🛡️ Desafío de seguridad respondido (nonce: ${nonce.slice(0, 8)}...)`);
        }
      } catch (e) {
        console.error(`[SYS] ❌ Error al firmar desafío: ${e.message}`);
      }
      return; // No procesar como mensaje de chat
    }
  }

  // Log to file for Hector
  await brain.addMessage(from, text);
  console.log(`[CEREBRO] 📝 Pensamiento guardado en el historial estructurado.`);

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
  // --- PASO 1: Inicializar Identidad y XMTP primero ---
  agentXMTP = new OpenClawXMTP({
    walletClawAddress: config.walletClawAddress,
    chainId: config.chainId,
    env: config.env,
    onMessage: onReceived,
  });

  try {
    await agentXMTP.init();
    console.log(`✅ XMTP agente iniciado: ${agentXMTP.address}`);
  } catch (e) {
    console.error('❌ Error iniciando XMTP:', e.message);
  }

  // --- PASO 2: Conectar al Bridge (ya con la identidad cargada) ---
  try {
    agentWS = new OpenClawWS({
      bridgeUrl: config.bridgeUrl || 'ws://localhost:18789/ws-agent',
      apiKey: 'CLAW_BRIDGE_SECRET', // Unified ecosystem key v1.1.4
      onMessage: onReceived,
    });
    await agentWS.connect();
    console.log('✅ Conectado al Bridge Local via WS (CHAT RÁPIDO)');

    // Handshake automático tras el connect si tenemos address configurada
    if (config.walletClawAddress && config.walletClawAddress !== '0x0000000000000000000000000000000000000000') {
      console.log(`🤝 Enviando Handshake XMTP a WalletClaw...`);
      await agentXMTP.handshake(config.walletClawAddress);
    }
  } catch (e) {
    console.warn('⚠️ No se pudo conectar al Bridge Local (se usará XMTP como backup):', e.message);
  }
})();
