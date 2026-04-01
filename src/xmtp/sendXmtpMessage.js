import { OpenClawXMTP } from './OpenClawXMTP.js';

/**
 * 🚀 sendXmtpMessage.js
 * Script para que el agente de OpenClaw envíe mensajes vía XMTP.
 * Uso: npx tsx src/sendXmtpMessage.js <destinatario_xmtp> "<mensaje>"
 */

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Uso: npx tsx src/sendXmtpMessage.js <destinatario_xmtp_o_inboxid> "<mensaje>"');
    process.exit(1);
  }

  const [to, message] = args;

  // Configuración base (igual a miAgenteChat.js)
  const config = {
    walletClawAddress: '0x0000000000000000000000000000000000000000', // Placeholder
    chainId: 43113, 
    env: 'dev'
  };

  const agent = new OpenClawXMTP({
    walletClawAddress: config.walletClawAddress,
    chainId: config.chainId,
    env: config.env
  });

  try {
    await agent.init();
    
    // El destinatario puede ser un Address o un InboxID de XMTP V3
    await agent.send(to, message);
    
    console.info(`✅ Mensaje enviado exitosamente a ${to}`);
    process.exit(0);
  } catch (e) {
    console.error(`❌ Error al enviar mensaje XMTP:`, e.message);
    process.exit(1);
  }
}

main();
