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
      // IMPORTANTE: Sincronizar antes de escuchar para que el nodo "vea" todas las conversaciones
      console.info("[OpenClawXMTP] Sincronizando conversaciones...");
      await this._xmtp.conversations.sync();
      
      console.info("[OpenClawXMTP] Escuchando mensajes (V3 Stream All)...");
      const stream = await this._xmtp.conversations.streamAllMessages();
      for await (const message of stream) {
        if (!message) continue;
        
        const fromId = message.senderInboxId;
        // Solo ignoramos si el remitente es exactamente nuestro propio InboxID
        if (this._xmtp && fromId === this._xmtp.inboxId) continue;
        
        console.info(`[OpenClawXMTP] 📩 Mensaje entrante de ${fromId.slice(0,10)}...`);
        
        let parsed = message.content;
        try { 
          if (typeof message.content === 'string' && message.content.startsWith('{')) {
            parsed = JSON.parse(message.content); 
          }
        } catch (e) {
          // No es JSON, lo tratamos como String
        }

        this._onMessage?.({ 
          from: fromId, 
          payload: parsed, 
          raw: message 
        });
      }
    } catch (e) {
      console.error("[OpenClawXMTP] Error en stream (V3):", e.message || e);
      this._isStreaming = false;
    }
  }
}
