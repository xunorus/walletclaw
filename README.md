# 🦞 WalletClaw: Human-Controlled Hot Wallet for AI Agents

> **WalletClaw no es una wallet para guardar tus ahorros de toda la vida; es un escudo de ejecución diseñado para que la IA no pueda vaciar tus fondos si el entorno es comprometido.**

[![Version](https://img.shields.io/badge/version-v0.8.5-e03530?style=flat-square)](./CHANGELOG.md)
[![Network](https://img.shields.io/badge/network-Avalanche%20|%20Custom-e84142?style=flat-square&logo=avalanche)](https://snowtrace.io)
[![License](https://img.shields.io/badge/license-MIT-ff8c42?style=flat-square)](#license)

-----

## The Vision: Signing Authority for Autonomous Agents

AI agents (like OpenClaw) live in untrusted environments. If you give an agent a private key in a `.env` file, that key is compromised by design.

**WalletClaw** solves this by acting as the **Authorized Signing Layer**:

1.  **Separation of Concerns**: The Agent proposes; the Human (via WalletClaw) disposes.
2.  **Beyond Crypto**: WalletClaw signs anything—transactions, contract calls, or arbitrary data (EIP-712/191).
3.  **MPC-Lite Architecture**: The private key never leaves the encrypted browser storage.
4.  **Human-in-the-Loop**: Un "firewall" humano para operaciones on-chain.

-----

## 🤖 Interfacing with OpenClaw

WalletClaw ofrece dos caminos principales para que tu agente solicite firmas, adaptándose a si el agente corre localmente o en la nube:

### ⚡ Opción A: Local REST Bridge (Baja Latencia)

Ideal para agentes corriendo en la misma máquina o red local. Es el método más rápido para testing y ejecución de alta frecuencia.

  * **Protocolo:** HTTP REST / WebSocket.
  * **Seguridad:** API Key local + Whitelist de IPs.

### 🌐 Opción B: XMTP Messaging (Soberanía Total)

El método recomendado para agentes remotos. OpenClaw envía una solicitud de firma como un mensaje encriptado on-chain.

  * **Protocolo:** XMTP (Extensible Message Transport Protocol).
  * **Ventaja:** No requiere abrir puertos, ni VPNs, ni conocer la IP del Dashboard. Comunicación puramente Web3.

-----

## 🚀 Quickstart (Dev Mode)

### 1. Clonar e Instalar

```bash
git clone https://github.com/xunorus/walletclaw.git
cd walletclaw
yarn install
```

### 2. Levantar el Ecosistema

Necesitarás dos terminales para correr la experiencia completa:

**Terminal 1: El Dashboard (Interfaz)**

```bash
# Lanza la UI para gestionar tus llaves y autorizar firmas
yarn dev
```

**Terminal 2: El Bridge (Motor de comunicación)**

```bash
# Activa el puente para que los agentes hablen con el Dashboard
yarn bridge
```

-----

## 🔐 Security Model & Technical Storage

| Layer | Technology | Security Detail |
|-------|-----------|-----------------|
| **Encryption** | WebCrypto API | **AES-256-GCM** (Native Performance). |
| **Derivation** | PBKDF2-SHA256 | **200,000 iterations** to derive keys from passwords. |
| **Storage** | Browser LocalStorage | La llave privada nunca toca el disco sin estar encriptada. |
| **Signing** | Ethers.js v6 | Firma local en el cliente (Client-side signing). |
| **Transport** | XMTP / Node.js | Encriptación de extremo a extremo para peticiones remotas. |

### 🔒 Technical Details (How it is secured)

*   **Password Handling**: El password se mantiene solo en memoria volátil. Si activas "Remember Session", se guarda en `sessionStorage` (muere al cerrar la pestaña), **nunca** en `localStorage`.
*   **Encrypted Storage**: Tu llave privada reside en `localStorage` pero siempre cifrada bajo el estándar de grado industrial **AES-256-GCM**.
*   **Agent Isolation**: El agente usa derivación de llave **HKDF-SHA256** vinculada a la dirección de la wallet y el `chainId`, evitando que los entornos comprometidos puedan reutilizar firmas fuera de contexto.

> [!CAUTION]
> **WalletClaw es una Hot Wallet.** Aunque el cifrado es de grado industrial, está diseñada para fondos operativos de agentes de IA. Mantén tus ahorros principales en una Cold Wallet.

-----

## ⚙️ Integrating with your Agent (Sign Request)

Para solicitar una firma desde tu agente (Python) usando el bridge REST:

```python
import requests

BRIDGE_URL = "http://localhost:18789/sign"
API_KEY = "your_wc_api_key"  # Obtenlo en la UI de WalletClaw

payload = {
    "to": "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
    "value": "0.01",  # En tokens nativos (AVAX, ETH, etc)
    "data": "0x",
    "agentId": "openclaw-agent-1"
}

headers = { "x-api-key": API_KEY }

# Enviar al bridge -> El Bridge lo enviará al Dashboard en el navegador
response = requests.post(BRIDGE_URL, json=payload, headers=headers)
print(f"Status: {response.json().get('status')}") # "sent_to_wallet"
```

-----

## Roadmap

  - [ ] **ERC-4337 Support** — Integración como Signer para Smart Accounts (Account Abstraction).
  - [ ] **Policy Engine** — Auto-aprobación basada en límites de gasto (ej: < 5 AVAX/día).
  - [ ] **Mobile Approval** — App nativa para aprobar transacciones desde el celular vía XMTP.
  - [ ] **Voice Sign** — Autorización mediante comandos de voz (Whisper STT).

-----

<div align="center">
Built with 🦞 at <b>Aleph Hackathon 2026</b><br>
<sub>Sovereignty · Privacy · Automation</sub>
</div>
