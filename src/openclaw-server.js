/**
 * openclaw-server.js
 * Script de servidor principal de OpenClaw Agent.
 * Usa XMTP para comunicarse de forma segura con la instancia WalletClaw.
 * Basado en ClawKeyStore y OpenClawXMTP v2.
 */

import "dotenv/config";
import { OpenClawXMTP } from "./OpenClawXMTP.js";

// 1. Cargar configuración desde .env
const WALLET_CLAW_ADDRESS = process.env.WALLET_CLAW_ADDRESS;
const CHAIN_ID = Number(process.env.CHAIN_ID || 11155111);
const XMTP_ENV = process.env.XMTP_ENV || "dev";

if (!WALLET_CLAW_ADDRESS) {
  console.error("❌ ERROR: WALLET_CLAW_ADDRESS no está definido en el archivo .env");
  process.exit(1);
}

async function main() {
  console.log("---------------------------------------------------------");
  console.log("🤖 Iniciando Servidor de OpenClaw Agent (Node.js)");
  console.log(`🔗 Red (Chain ID): ${CHAIN_ID}`);
  console.log(`🏠 WalletClaw: ${WALLET_CLAW_ADDRESS}`);
  console.log(`🌐 XMTP Env: ${XMTP_ENV}`);
  console.log("---------------------------------------------------------");

  // 2. Definir callback de mensajes entrantes
  const onReceived = async ({ from, payload }) => {
    console.info(`\n📥 [RECIBIDO] de ${from}:`, payload);

    // Responder si es un mensaje de chat (JSON) o un string plano
    if (payload.type === "CHAT_MESSAGE" || typeof payload === "string") {
      const query = typeof payload === "string" ? payload : payload.content;
      console.info(`💬 Pregunta: "${query}"`);

      // Mock de procesamiento — Aquí iría la lógica de tu IA
      const answer = `✅ Hola! Soy tu agente OpenClaw. Me has enviado: "${query}". (XMTP E2EE Active)`;

      await agent.send(from, {
        type: "CHAT_MESSAGE",
        content: answer,
        timestamp: Date.now(),
      });
      console.info(`📤 [RESPONDIDO] → ${from}`);
    } else if (payload.type === "claw:handshake") {
      console.info("🤝 Handshake recibido del usuario.");
    }
  };

  // 3. Inicializar OpenClawXMTP
  const agent = new OpenClawXMTP({
    walletClawAddress: WALLET_CLAW_ADDRESS,
    chainId: CHAIN_ID,
    env: XMTP_ENV,
    onMessage: onReceived
  });

  try {
    await agent.init();
    console.log(`✅ Agente inicializado como: ${agent.address}`);

    // 4. Enviar handshake automático al iniciar
    console.log(`🤝 Enviando Handshake a WalletClaw (${WALLET_CLAW_ADDRESS})...`);
    await agent.handshake(WALLET_CLAW_ADDRESS);

    console.log("\n🚀 OpenClaw listo! Escuchando mensajes en la red XMTP...");
  } catch (err) {
    console.error("❌ Fallo crítico al iniciar el agente:", err.message);
    process.exit(1);
  }
}

// Manejo de cierres limpios
process.on("SIGINT", async () => {
    console.log("\n👋 Cerrando sesión de OpenClaw...");
    process.exit(0);
});

main();
