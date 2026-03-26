/**
 * OpenClawXMTP.js  (v2 — con persistencia por instancia de WalletClaw)
 *
 * La identidad de OpenClaw persiste entre sesiones, cifrada con los datos
 * de la instancia WalletClaw. Mismo address XMTP siempre que sea la misma
 * instancia de WalletClaw en la misma chain.
 *
 * Node.js + ethers v6 + @xmtp/xmtp-js
 */

import { Client } from "@xmtp/xmtp-js";
import { ClawKeyStore } from "./ClawKeyStore.js";

export class OpenClawXMTP {
  /**
   * @param {object} opts
   * @param {string}   opts.walletClawAddress  - Address de la instancia WalletClaw
   * @param {number}   opts.chainId            - Chain ID
   * @param {string}   [opts.env]              - "production" | "dev"
   * @param {string}   [opts.storePath]        - Ruta archivo cifrado (opcional)
   * @param {function} [opts.onMessage]        - Callback mensajes entrantes
   */
  constructor({ walletClawAddress, chainId, env = "production", storePath, onMessage }) {
    this._store = new ClawKeyStore({ walletClawAddress, chainId, storePath });
    this._env = env;
    this._onMessage = onMessage;
    this._identity = null;
    this._xmtp = null;
    this._conversations = new Map();
    this._stream = null;
  }

  /**
   * Inicializa OpenClaw. Carga la identidad persistida (o genera una nueva)
   * y conecta a XMTP.
   */
  async init() {
    if (this._xmtp) return this;

    // Cargar o crear identidad — privateKey siempre en closure dentro del handle
    this._identity = await this._store.loadOrCreate();
    console.info(`[OpenClawXMTP] Identidad: ${this._identity.address}`);

    this._xmtp = await Client.create(this._identity.signer, { env: this._env });
    console.info("[OpenClawXMTP] XMTP conectado.");

    this._startStream();
    return this;
  }

  /** Address público de OpenClaw (estable entre sesiones para la misma WalletClaw instance) */
  get address() {
    this._assertReady();
    return this._identity.address;
  }

  /**
   * Envía mensaje o payload JSON a un address XMTP.
   * @param {string} toAddress
   * @param {string|object} payload
   */
  async send(toAddress, payload) {
    this._assertReady();
    const content = typeof payload === "string" ? payload : JSON.stringify(payload);

    let conv = this._conversations.get(toAddress);
    if (!conv) {
      const canMessage = await this._xmtp.canMessage(toAddress);
      if (!canMessage) throw new Error(`[OpenClawXMTP] ${toAddress} no tiene XMTP activo.`);
      conv = await this._xmtp.conversations.newConversation(toAddress);
      this._conversations.set(toAddress, conv);
    }

    await conv.send(content);
  }

  /**
   * Handshake firmado hacia WalletClaw.
   * WalletClaw puede verificar criptográficamente que quien habla es OpenClaw.
   * @param {string} walletClawAddress
   */
  async handshake(walletClawAddress) {
    this._assertReady();
    const payload = {
      type: "claw:handshake",
      agentAddress: this.address,
      timestamp: Date.now(),
    };
    const signature = await this._identity.signMessage(JSON.stringify(payload));
    await this.send(walletClawAddress, { ...payload, signature });
    console.info("[OpenClawXMTP] Handshake enviado →", walletClawAddress);
  }

  /**
   * Rota la identidad de OpenClaw: elimina la clave guardada.
   * La próxima llamada a init() generará un nuevo wallet con nuevo address XMTP.
   * ATENCIÓN: WalletClaw necesitará un nuevo handshake después de la rotación.
   */
  async rotateIdentity() {
    await this.destroy();
    await this._store.rotate();
    console.info("[OpenClawXMTP] Identidad rotada. Llamá init() para la nueva identidad.");
  }

  /** Cierra la sesión limpiamente. */
  async destroy() {
    if (this._stream) await this._stream.return?.();
    this._xmtp = null;
    this._identity = null;
    this._conversations.clear();
    this._stream = null;
    console.info("[OpenClawXMTP] Sesión cerrada.");
  }

  // ─── Privados ─────────────────────────────────────────────────────────────

  async _startStream() {
    this._stream = await this._xmtp.conversations.streamAllMessages();
    for await (const message of this._stream) {
      if (message.senderAddress === this._identity?.address) continue;
      try {
        const parsed = JSON.parse(message.content);
        this._onMessage?.({ from: message.senderAddress, payload: parsed, raw: message });
      } catch {
        this._onMessage?.({ from: message.senderAddress, payload: message.content, raw: message });
      }
    }
  }

  _assertReady() {
    if (!this._xmtp) throw new Error("[OpenClawXMTP] No inicializado. Llamá init() primero.");
  }
}
