import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import http from 'http';

/**
 * WalletClaw Bridge — El puente real entre OpenClaw y tu Navegador.
 * ───────────────────────────────────────────────────────────────────
 * Puertos:
 *   - 3000: API REST para OpenClaw (POST /sign)
 *   - 7777: WebSocket para OpenClaw (Agentes locales)
 *   - 8000: WebSocket para WalletClaw UI (Control Panel)
 */

const app = express();
app.use(cors());
app.use(express.json());

// Puertos configurables
const REST_PORT = 3000;
const AGENT_WS_PORT = 7777;
const UI_WS_PORT = 8000;

// Estado del puente
let uiSocket = null; // Conexión con el navegador (WalletClaw)
let activeApiKey = null; // Se sincroniza desde el navegador

// ─── 1. SERVIDOR REST PARA OPENCLAW (Port 3000) ───────────────────────────

app.post('/sign', (req, res) => {
    const receivedKey = req.headers['x-api-key'];
    
    // Validación de API Key
    if (!activeApiKey || receivedKey !== activeApiKey) {
        console.log(`[REST] 🔴 Intento de firma bloqueado: API Key inválida o no configurada.`);
        return res.status(401).json({ error: 'Unauthorized: Invalid or missing API Key' });
    }

    if (!uiSocket || uiSocket.readyState !== WebSocket.OPEN) {
        console.log(`[REST] ⚠️  Solicitud de firma ignorada: WalletClaw no está abierto en el navegador.`);
        return res.status(503).json({ error: 'Service Unavailable: WalletClaw UI not connected' });
    }

    console.log(`[REST] 🦾 Solicitud de firma recibida de OpenClaw. Enviando al navegador...`);

    // Enviamos al navegador y esperamos respuesta
    const requestId = Date.now().toString();
    uiSocket.send(JSON.stringify({
        type: 'SIGN_REQUEST',
        id: requestId,
        payload: req.body
    }));

    // El navegador responderá vía UI_WS, necesitamos manejar callbacks asíncronos si quisiéramos esperar,
    // pero para simplificar, el bridge solo actúa como relay de ida. 
    // OpenClaw debería consultar el estado o esperar a que se procese.
    res.json({ status: 'sent_to_wallet', requestId });
});

const restServer = app.listen(REST_PORT, () => {
    console.log(`\n╔══════════════════════════════════════════════╗`);
    console.log(`║    WalletClaw Bridge — ¡ONLINE!  🦾🦞       ║`);
    console.log(`╚══════════════════════════════════════════════╝`);
    console.log(`[REST]  Escuchando en http://localhost:${REST_PORT}/sign`);
});


// ─── 2. WEBSOCKET PARA EL NAVEGADOR (Port 8000) ───────────────────────────

const uiWss = new WebSocketServer({ port: UI_WS_PORT });

uiWss.on('connection', (ws) => {
    console.log(`[UI]    🟢 WalletClaw (Navegador) conectado.`);
    uiSocket = ws;

    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data);
            
            // 1. Sincronización de API Key desde el Navegador
            if (msg.type === 'SYNC_API_KEY') {
                activeApiKey = msg.key;
                console.log(`[UI]    🦾 API Key sincronizada y ACTIVA.`);
            }

            // 2. Respuesta de Firma del usuario
            if (msg.type === 'SIGN_RESPONSE') {
                console.log(`[UI]    ✅ Firma procesada por el usuario: ${msg.status}`);
                // Aquí podrías notificar al agente si la conexión fuera persistente
            }
        } catch (e) {
            console.error('[UI]    ❌ Error procesando mensaje de UI:', e.message);
        }
    });

    ws.on('close', () => {
        console.log(`[UI]    🔴 WalletClaw desconectado.`);
        uiSocket = null;
    });
});

console.log(`[UI_WS] Escuchando en ws://localhost:${UI_WS_PORT}`);


// ─── 3. WEBSOCKET PARA AGENTES OPENCLAW (Port 7777) ────────────────────────

const agentWss = new WebSocketServer({ port: AGENT_WS_PORT });

agentWss.on('connection', (ws, req) => {
    // En WS la key podría venir en la URL: ws://localhost:7777?key=...
    const url = new URL(req.url, `http://${req.headers.host}`);
    const receivedKey = url.searchParams.get('key');

    if (!activeApiKey || receivedKey !== activeApiKey) {
        console.log(`[WS_AGENT] 🔴 Conexión rechazada: API Key inválida.`);
        ws.terminate();
        return;
    }

    console.log(`[WS_AGENT] 🟢 Agente OpenClaw conectado vía WebSocket.`);

    ws.on('message', (data) => {
        if (!uiSocket) return;
        console.log(`[WS_AGENT] 🦾 Mensaje recibido del agente. Propagando a UI...`);
        uiSocket.send(data.toString());
    });
});

console.log(`[WS_AGENT] Escuchando en ws://localhost:${AGENT_WS_PORT}\n`);
