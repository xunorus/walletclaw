/**
 * ClawKeyStore.js
 * Almacenamiento persistente y cifrado de la clave privada de OpenClaw.
 * La clave se cifra con una encryptionKey derivada del address+chainId
 * de la instancia de WalletClaw. Sin esos datos, no se puede descifrar.
 *
 * Node.js only — usa el módulo nativo `crypto`.
 * Ethers v6.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { ethers } from "ethers";

const STORE_VERSION = 1;
const KEY_LENGTH = 32;      // AES-256
const IV_LENGTH = 12;       // GCM estándar
const SALT_LENGTH = 32;
const HKDF_INFO = Buffer.from("openclaw-identity-v1");

export class ClawKeyStore {
  /**
   * @param {object} opts
   * @param {string} opts.walletClawAddress  - Address del contrato/wallet de WalletClaw
   * @param {number} opts.chainId            - Chain ID de la red
   * @param {string} [opts.storePath]        - Ruta del archivo cifrado (default: .openclaw/identity.enc)
   */
  constructor({ walletClawAddress, chainId, storePath }) {
    if (!walletClawAddress || !chainId) {
      throw new Error("[ClawKeyStore] walletClawAddress y chainId son requeridos.");
    }
    this._address = walletClawAddress.toLowerCase();
    this._chainId = Number(chainId);
    this._storePath = storePath ?? path.join(process.cwd(), ".openclaw", "identity.enc");
  }

  /**
   * Carga o crea la identidad de OpenClaw.
   * - Si existe archivo → descifra y devuelve el wallet.
   * - Si no existe → genera nuevo wallet, cifra, guarda y devuelve.
   *
   * @returns {Promise<ClawIdentityHandle>} Handle con address y signer (sin exponer privateKey)
   */
  async loadOrCreate() {
    let privateKey;

    try {
      privateKey = await this._load();
      console.info("[ClawKeyStore] Identidad existente cargada.");
    } catch {
      // No existe o no se pudo descifrar → generar nueva
      const wallet = ethers.Wallet.createRandom();
      privateKey = wallet.privateKey;
      await this._save(privateKey);
      console.info("[ClawKeyStore] Nueva identidad generada y guardada.");
    }

    return this._buildHandle(privateKey);
  }

  /**
   * Elimina la identidad guardada (rotación de clave).
   * La próxima llamada a loadOrCreate() generará una nueva.
   */
  async rotate() {
    try {
      await fs.rm(this._storePath);
      console.info("[ClawKeyStore] Identidad eliminada. Próxima sesión generará una nueva.");
    } catch {
      // Ya no existía
    }
  }

  // ─── Privados ────────────────────────────────────────────────────────────────

  /**
   * Construye el handle público — la privateKey queda en closure.
   * @private
   */
  _buildHandle(privateKey) {
    const wallet = new ethers.Wallet(privateKey);

    const signer = {
      getAddress: () => Promise.resolve(wallet.address),
      signMessage: (msg) => wallet.signMessage(msg),
    };

    return {
      address: wallet.address,
      signer,
      signMessage: (msg) => wallet.signMessage(msg),
      // Nunca se expone privateKey
      toString: () => `ClawIdentity { address: ${wallet.address} }`,
    };
  }

  /**
   * Deriva la encryption key a partir del address y chainId de WalletClaw.
   * Usa HKDF-SHA256. El salt es parte del archivo cifrado (único por instancia).
   * @private
   */
  _deriveKey(salt) {
    // IKM = address + chainId como identificador único de la instancia WalletClaw
    const ikm = Buffer.from(`${this._address}:${this._chainId}`, "utf8");

    return new Promise((resolve, reject) => {
      crypto.hkdf("sha256", ikm, salt, HKDF_INFO, KEY_LENGTH, (err, key) => {
        if (err) reject(err);
        else resolve(Buffer.from(key));
      });
    });
  }

  /**
   * Cifra y guarda la privateKey en disco.
   * Formato del archivo JSON:
   * {
   *   v: 1,
   *   salt: "<hex>",
   *   iv:   "<hex>",
   *   data: "<hex>",   // privateKey cifrada
   *   tag:  "<hex>"    // GCM auth tag
   * }
   * @private
   */
  async _save(privateKey) {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);
    const encKey = await this._deriveKey(salt);

    const cipher = crypto.createCipheriv("aes-256-gcm", encKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(privateKey, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    const payload = {
      v: STORE_VERSION,
      salt: salt.toString("hex"),
      iv: iv.toString("hex"),
      data: encrypted.toString("hex"),
      tag: tag.toString("hex"),
    };

    await fs.mkdir(path.dirname(this._storePath), { recursive: true });
    await fs.writeFile(this._storePath, JSON.stringify(payload), { mode: 0o600 });
    // mode 0o600 = solo lectura/escritura para el owner del proceso
  }

  /**
   * Lee y descifra la privateKey del disco.
   * Lanza error si el archivo no existe o si la auth tag falla
   * (lo que significaría que el address/chainId son distintos).
   * @private
   */
  async _load() {
    const raw = await fs.readFile(this._storePath, "utf8");
    const payload = JSON.parse(raw);

    if (payload.v !== STORE_VERSION) {
      throw new Error(`[ClawKeyStore] Versión de archivo incompatible: ${payload.v}`);
    }

    const salt = Buffer.from(payload.salt, "hex");
    const iv = Buffer.from(payload.iv, "hex");
    const data = Buffer.from(payload.data, "hex");
    const tag = Buffer.from(payload.tag, "hex");

    const encKey = await this._deriveKey(salt);

    const decipher = crypto.createDecipheriv("aes-256-gcm", encKey, iv);
    decipher.setAuthTag(tag);

    // Si el address/chainId no coinciden → auth tag falla → lanza error
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString("utf8");
  }
}
