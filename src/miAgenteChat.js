import { OpenClawXMTP } from './OpenClawXMTP.js';

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
console.log("║    🤖 OpenClaw Chat Agent — v0.93      ║");
console.log("╚════════════════════════════════════════╝\n");

// 2. Inicializar agente
const agent = new OpenClawXMTP({
  walletClawAddress: config.walletClawAddress,
  chainId: config.chainId,
  env: config.env,
  onMessage: async ({ from, payload }) => {
    // Si recibimos un mensaje, respondemos como un bot
    const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
    console.log(`[MSG] De: ${from.slice(0, 10)}... Contenido: ${text}`);

    // Solo respondemos si no es nuestro propio mensaje
    if (from.toLowerCase() !== agent.address.toLowerCase()) {
      const responseText = `🤖 Recibido: "${text}". ¿En qué más puedo ayudarte? 🦾🦞`;
      await agent.send(from, responseText);
      console.log(`[RES] Respuesta enviada a ${from.slice(0, 10)}...`);
    }
  }
});

// 3. Arrancar
try {
  await agent.init();
  console.log(`🟢 AGENTE ONLINE: ${agent.address}`);
  console.log(`👉 Copia este address y chatea con él desde WalletClaw.`);
  console.log(`📌 Recuerda en WalletClaw configurar el AGENT_ADDR en Settings para verlo en la lista.\n`);
} catch (e) {
  console.error("❌ Error al iniciar el agente:", e.message);
}
