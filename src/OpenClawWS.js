import { WebSocket } from 'ws';

/**
 * OpenClawWS.js
 * Cliente WebSocket para conectar agentes OpenClaw al Bridge local de WalletClaw.
 * Permite chat y solicitudes de firma en tiempo real sin latencia de red.
 */
export class OpenClawWS {
    /**
     * @param {object} opts
     * @param {string} opts.bridgeUrl - URL del bridge (ej. ws://localhost:18789/ws-agent)
     * @param {string} opts.apiKey    - API Key sincronizada con WalletClaw
     * @param {function} [opts.onMessage] - Callback para mensajes entrantes
     */
    constructor({ bridgeUrl, apiKey, onMessage }) {
        this._bridgeUrl = bridgeUrl;
        this._apiKey = apiKey;
        this._onMessage = onMessage;
        this._ws = null;
        this._isConnected = false;
    }

    /** Conecta al bridge local */
    async connect() {
        if (this._ws) return;

        const url = `${this._bridgeUrl}?apiKey=${this._apiKey}&a=${this._apiKey}`;
        console.info(`[OpenClawWS] Connecting to Bridge via ${this._bridgeUrl}...`);

        return new Promise((resolve, reject) => {
            try {
                this._ws = new WebSocket(url);

                this._ws.on('open', () => {
                    this._isConnected = true;
                    console.info('[OpenClawWS] Conectado al bridge local.');
                    resolve(this);
                });

                this._ws.on('message', (data) => {
                    try {
                        const parsed = JSON.parse(data.toString());
                        this._onMessage?.({ from: 'LocalBridge', payload: parsed });
                    } catch (e) {
                        this._onMessage?.({ from: 'LocalBridge', payload: data.toString() });
                    }
                });

                this._ws.on('close', () => {
                    this._isConnected = false;
                    this._ws = null;
                    console.info('[OpenClawWS] Conexión cerrada.');
                });

                this._ws.on('error', (err) => {
                    console.error('[OpenClawWS] Error:', err.message);
                    reject(err);
                });

            } catch (e) {
                reject(e);
            }
        });
    }

    /** Envía un mensaje al bridge (que lo propagará a la UI) */
    async send(payload) {
        if (!this._isConnected || !this._ws) {
            console.warn('[OpenClawWS] No conectado. Mensaje no enviado.');
            return;
        }
        const content = typeof payload === 'string' 
            ? JSON.stringify({ type: 'CHAT_MESSAGE', content: payload }) 
            : JSON.stringify(payload);
            
        this._ws.send(content);
    }

    /** Desconecta limpiamente */
    disconnect() {
        if (this._ws) {
            this._ws.close();
            this._ws = null;
        }
    }

    get isConnected() {
        return this._isConnected;
    }
}
