/**
 * OpenClawXMTP.js — v0.8.1 (V3 Protocol)
 * ─────────────────────────────────────────────────────────────
 * Migrado a XMTP V3 (MLS/LibXMTP) para Node.js.
 * Utiliza @xmtp/node-sdk para mayor seguridad y persistencia.
 */

import { Client } from "@xmtp/node-sdk";
import { ClawKeyStore } from "./ClawKeyStore.js";
import { ethers } from "ethers";
import path from "path";
import fs from "fs";

export class OpenClawXMTP {
  /**
   * @param {object} opts
   * @param {string}   opts.walletClawAddress - Address de WalletClaw (propietario)
   * @param {number}   opts.chainId           - Chain ID
   * @param {string}   [opts.env]             - "production" | "dev"
   * @param {string}   [opts.storeFolder]     - Folder para la DB de XMTP
   * @param {function} [opts.onMessage]       - Callback mensajes
   */
  constructor({ walletClawAddress, chainId, env = "dev", storeFolder = "./.xmtp", onMessage }) {
    this._walletClawAddress = walletClawAddress?.toLowerCase();
    this._store = new ClawKeyStore({ walletClawAddress, chainId });
    this._env = env;
    this._onMessage = onMessage;
    this._storeFolder = storeFolder;
    this._dbPath = null; // Se calculará después de obtener la dirección del agente
    this._xmtp = null;
    this._identity = null;
    this._isStreaming = false;
  }

  async init() {
    if (this._xmtp) return this;

    // 1. Cargar o crear identidad EOA
    this._identity = await this._store.loadOrCreate();
    const addr = this._identity.address.toLowerCase();
    
    // 2. Preparar Directorio de DB (Ruta absoluta para evitar Pool errors en node)
    const absoluteFolder = path.resolve(this._storeFolder);
    if (!fs.existsSync(absoluteFolder)) {
      fs.mkdirSync(absoluteFolder, { recursive: true });
    }
    this._dbPath = path.join(absoluteFolder, `agent_v3_${addr}.db`);
    
    console.info(`[OpenClawXMTP] Identidad V3: ${this._identity.address}`);
    console.info(`[OpenClawXMTP] DB Path: ${this._dbPath}`);

    // 3. Crear Cliente V3
    const walletSigner = {
      type: "EOA",
      getIdentifier: () => ({ identifier: this._identity.address, identifierKind: 0 }),
      signMessage: async (msg) => ethers.getBytes(await this._identity.signer.signMessage(msg)),
    };

    try {
      this._xmtp = await Client.create(walletSigner, {
        env: this._env,
        dbPath: this._dbPath
      });
      console.info("[OpenClawXMTP] Cliente V3 online.");
      console.info(`[OpenClawXMTP] 🔑 Mi Inbox ID: ${this._xmtp.inboxId}`);
      
      // Sincronizar conversaciones previas
      await this._xmtp.conversations.syncAll();

      this._startStream();
      return this;
    } catch (e) {
      console.error("[OpenClawXMTP] Error en init V3:", e.message);
      throw e;
    }
  }

  get address() {
    return this._identity?.address;
  }

  /** Envía mensaje a un address XMTP */
  async send(toAddress, payload) {
    if (!this._xmtp) throw new Error("No inicializado.");
    const content = typeof payload === "string" ? payload : JSON.stringify(payload);

    try {
      // En Node SDK V3 (MLS) el método correcto para DMs es newDm
      let conv;
      if (typeof this._xmtp.conversations.newDm === 'function') {
        conv = await this._xmtp.conversations.newDm(toAddress);
      } else if (typeof this._xmtp.conversations.newConversation === 'function') {
        conv = await this._xmtp.conversations.newConversation(toAddress);
      } else {
        throw new Error("No se encontró el método para crear conversaciones en el SDK.");
      }
      await conv.send(content);
    } catch (e) {
      console.error(`[OpenClawXMTP] Error enviando a ${toAddress}:`, e.message);
      throw e;
    }
  }

  /** Handshake firmado */
  async handshake(walletClawAddress) {
    const payload = {
      type: "claw:handshake",
      agentAddress: this.address,
      timestamp: Date.now(),
    };
    const signature = await this._identity.signer.signMessage(JSON.stringify(payload));
    await this.send(walletClawAddress, { ...payload, signature });
    console.info("[OpenClawXMTP] Handshake V3 enviado.");
  }

  async _startStream() {
    if (this._isStreaming) return;
    this._isStreaming = true;
    
    try {
      // 1. Identificar al Boss (dueño del agente) con método resiliente
      let bossInboxId = null;
      let pairingCode = null;

      if (!this._walletClawAddress) {
        // MODO PAIRING: Si no hay address configurada, generamos un código de 6 dígitos
        pairingCode = Math.floor(100000 + Math.random() * 900000).toString();
        console.warn("\n╔════════════════════════════════════════════╗");
        console.warn("║ ⚠️  MODO DE EMPAREJAMIENTO ACTIVADO         ║");
        console.warn(`║ Envía este código a Héctor por XMTP: ${pairingCode} ║`);
        console.warn("╚════════════════════════════════════════════╝\n");
      } else {
        try {
          console.info(`[OpenClawXMTP] 🔍 Resolving Boss Inbox ID (${this._walletClawAddress})...`);
          
          if (typeof this._xmtp.getInboxIdByAddress === 'function') {
            bossInboxId = await this._xmtp.getInboxIdByAddress(this._walletClawAddress);
          }
          
          if (!bossInboxId && typeof this._xmtp.getInboxIdForAddress === 'function') {
            bossInboxId = await this._xmtp.getInboxIdForAddress(this._walletClawAddress);
          }

          if (bossInboxId) {
            console.info(`[OpenClawXMTP] 🛡️ Boss recognized: ${bossInboxId}`);
          } else {
             console.warn(`[OpenClawXMTP] ⚠️ Boss address ${this._walletClawAddress} not found on XMTP network.`);
          }
        } catch (e) {
          console.warn("[OpenClawXMTP] ⚠️ Identity resolution error:", e.message);
        }
      }

      // 2. Sincronización en segundo plano
      this._xmtp.conversations.sync().catch(e => { });

      console.info("[OpenClawXMTP] 🟢 Escuchando mensajes (MLS V3)...");
      const stream = await this._xmtp.conversations.streamAllMessages();
      for await (const message of stream) {
        if (!message) continue;
        
        const fromId = message.senderInboxId;
        if (this._xmtp && fromId === this._xmtp.inboxId) continue;
        
        // --- PROCESO DE PAIRING (HANDSHAKE) ---
        if (!bossInboxId && pairingCode) {
            let content = message.content || message.fallback || "";
            if (content.trim() === pairingCode) {
                bossInboxId = fromId;
                pairingCode = null; // Cerramos el modo pairing
                console.info("\n╔════════════════════════════════════════╗");
                console.info("║ 🎉 ¡EMPAREJAMIENTO EXITOSO!            ║");
                console.info(`║ Boss vinculado (InboxID): ${fromId} ║`);
                console.info("╚════════════════════════════════════════╝\n");
                
                // Confirmamos por XMTP
                try {
                  const conv = await this._xmtp.conversations.getConversationById(message.conversationId);
                  await conv.send("🤝 ¡Vínculo establecido! Hola, Boss. Soy Héctor, tu agente de OpenClaw. ¿En qué puedo ayudarte?");
                } catch (e) { }
                continue; // No procesamos el código como comando
            }
        }

        // --- FILTRO DE SEGURIDAD ---
        const isBoss = bossInboxId && fromId.toLowerCase() === bossInboxId.toLowerCase();
        
        if (bossInboxId && !isBoss) {
            // Ignoramos en silencio si ya tenemos un Boss y no es el que habla
            continue;
        }

        console.info(`[OpenClawXMTP] ✅ Mensaje del Boss recibido.`);
        
        // --- EXTRACCIÓN RESILIENTE DE CONTENIDO ---
        let payload = message.content;
        if (payload === undefined || payload === null) {
            payload = message.fallback || message.textBody || "";
        }

        let parsed = payload;
        try { 
          if (typeof payload === 'string' && payload.startsWith('{')) {
            parsed = JSON.parse(payload); 
          }
        } catch (e) { }

        this._onMessage?.({ 
          from: fromId, 
          payload: parsed, 
          raw: message,
          isBoss: isBoss
        }).catch(err => {
          console.error(`[OpenClawXMTP] ⚠️ Error en onMessage handler:`, err.message);
        });
      }
    } catch (e) {
      console.error("[OpenClawXMTP] ❌ Error fatal en stream:", e.message || e);
      this._isStreaming = false;
    }
  }
}
