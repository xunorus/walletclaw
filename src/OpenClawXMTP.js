/**
 * OpenClawXMTP.js — v0.8.1 (V3 Protocol)
 * ─────────────────────────────────────────────────────────────
 * Migrado a XMTP V3 (MLS/LibXMTP) para Node.js.
 * Utiliza @xmtp/node-sdk para mayor seguridad y persistencia.
 */

import { Client } from "@xmtp/node-sdk";
import { ClawKeyStore } from "./ClawKeyStore.js";
import { ethers } from "ethers";

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
    this._dbPath = `${storeFolder}/agent_${walletClawAddress.toLowerCase()}.db`;
    this._xmtp = null;
    this._identity = null;
    this._isStreaming = false;
  }

  async init() {
    if (this._xmtp) return this;

    // 1. Cargar o crear identidad EOA
    this._identity = await this._store.loadOrCreate();
    console.info(`[OpenClawXMTP] Identidad V3: ${this._identity.address}`);

    // 2. Crear Cliente V3
    // Adaptamos el signer al formato que espera node-sdk
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
      let conv = await this._xmtp.conversations.createDmWithIdentifier({
        identifier: toAddress.toLowerCase(),
        identifierKind: 0
      });
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
    console.info("[OpenClawXMTP] Escuchando mensajes (Streaming)...");

    try {
      const stream = await this._xmtp.conversations.streamAllMessages();
      for await (const message of stream) {
        if (message.senderAddress.toLowerCase() === this.address.toLowerCase()) continue;
        
        let parsed = message.content;
        try { parsed = JSON.parse(message.content); } catch (e) {}

        this._onMessage?.({ 
          from: message.senderAddress, 
          payload: parsed, 
          raw: message 
        });
      }
    } catch (e) {
      console.error("[OpenClawXMTP] Error en stream:", e.message);
      this._isStreaming = false;
    }
  }
}
