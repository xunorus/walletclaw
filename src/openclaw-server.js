/**
 * openclaw-server.js
 * Script de servidor principal de OpenClaw Agent.
 * Usa XMTP para comunicarse de forma segura con la instancia WalletClaw.
 * Basado en ClawKeyStore y OpenClawXMTP v2.
 */

import "dotenv/config";
import { OpenClawXMTP } from "./OpenClawXMTP.js";
import { OpenClawWS } from "./OpenClawWS.js";

// 1. Cargar configuración desde .env
const WALLET_CLAW_ADDRESS = process.env.WALLET_CLAW_ADDRESS;
const CHAIN_ID = Number(process.env.CHAIN_ID || 11155111);
const XMTP_ENV = process.env.XMTP_ENV || "dev";
const BRIDGE_URL = process.env.WALLETCLAW_BRIDGE_URL || "ws://localhost:18789/ws-agent";
const API_KEY = process.env.WALLETCLAW_API_KEY || "wc_your_key_here";

if (!WALLET_CLAW_ADDRESS) {
  console.warn("⚠️  WALLET_CLAW_ADDRESS no está definido. XMTP no se iniciará correctamente.");
}

async function main() {
  console.log("---------------------------------------------------------");
  console.log("🤖 Iniciando Servidor de OpenClaw Agent (Node.js)");
  console.log(`🔗 Red (Chain ID): ${CHAIN_ID}`);
  console.log(`🏠 WalletClaw (XMTP): ${WALLET_CLAW_ADDRESS || 'N/A'}`);
  console.log(`🌐 Bridge (Local): ${BRIDGE_URL}`);
  console.log("---------------------------------------------------------");

  // 2. Definir callback de mensajes entrantes (Unificado para XMTP y WS)
  const onReceived = async ({ from, payload }) => {
    const isLocal = from === 'LocalBridge';
    const senderLabel = isLocal ? '🌉 Bridge' : `🚀 XMTP (${from.slice(0, 10)}...)`;
    
    console.info(`\n📥 [RECIBIDO] de ${senderLabel}:`, payload);

    // Responder si es un mensaje de chat (JSON) o un string plano
    if (payload.type === "CHAT_MESSAGE" || typeof payload === "string") {
      const query = typeof payload === "string" ? payload : payload.content;
      console.info(`💬 Pregunta: "${query}"`);

      // Mock de procesamiento — Aquí iría la lógica de tu IA
      const answer = `✅ Hola! Soy tu agente OpenClaw. Me has enviado: "${query}". (${isLocal ? 'Local WS' : 'XMTP E2EE'} Active)`;

      const reply = {
          type: "CHAT_MESSAGE",
          content: answer,
          timestamp: Date.now(),
      };

      if (isLocal && agentWS) {
        await agentWS.send(reply);
      } else if (agentXMTP) {
        await agentXMTP.send(from, reply);
      }
      console.info(`📤 [RESPONDIDO] → ${senderLabel}`);
    } else if (payload.type === "claw:handshake") {
      console.info("🤝 Handshake recibido del usuario.");
    }
  };

  // 3. Inicializar Clientes (Concurrentes)
  let agentXMTP = null;
  let agentWS = null;

  // --- Iniciar Bridge Local (WebSocket) ---
  try {
    agentWS = new OpenClawWS({
        bridgeUrl: BRIDGE_URL,
        apiKey: API_KEY,
        onMessage: onReceived
    });
    await agentWS.connect();
    console.log(`✅ Agente conectado al Bridge Local en: ${BRIDGE_URL}`);
  } catch (err) {
    console.warn(`⚠️  No se pudo conectar al Bridge Local: ${err.message}. Continuando solo con XMTP...`);
  }

  // --- Iniciar XMTP ---
  if (WALLET_CLAW_ADDRESS) {
      agentXMTP = new OpenClawXMTP({
        walletClawAddress: WALLET_CLAW_ADDRESS,
        chainId: CHAIN_ID,
        env: XMTP_ENV,
        onMessage: onReceived
      });

      try {
        await agentXMTP.init();
        console.log(`✅ Agente XMTP inicializado como: ${agentXMTP.address}`);

        // Enviar handshake automático al iniciar
        console.log(`🤝 Enviando Handshake a WalletClaw (${WALLET_CLAW_ADDRESS})...`);
        await agentXMTP.handshake(WALLET_CLAW_ADDRESS);
      } catch (err) {
        console.error("❌ Fallo al iniciar el agente XMTP:", err.message);
      }
  }

  console.log("\n🚀 OpenClaw listo! Escuchando mensajes por WS y XMTP...");
}

// Manejo de cierres limpios
process.on("SIGINT", async () => {
    console.log("\n👋 Cerrando sesión de OpenClaw...");
    process.exit(0);
});

main();

