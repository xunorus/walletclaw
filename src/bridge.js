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
const REST_PORT = 18789; // Puerto único para REST, Agentes y UI (vía Caddy)

// Estado del puente
let uiSocket = null; // Conexión con el navegador (WalletClaw)
let activeAgentSocket = null; // Último agente conectado
let activeApiKey = null; // Se sincroniza desde el navegador

// ─── 1. SERVIDOR REST PARA OPENCLAW (Port 3000) ───────────────────────────

app.post('/sign', (req, res) => {
    const receivedKey = req.headers['x-api-key'] || (req.headers['authorization'] ? req.headers['authorization'].replace('Bearer ', '') : null);
    
    // Validación de API Key
    if (!activeApiKey || receivedKey !== activeApiKey) {
        console.log(`[REST] 🔴 Intento de firma bloqueado: API Key inválida o no configurada. Recibido: ${receivedKey}`);
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
    console.log(`[REST]      Escuchando en http://localhost:${REST_PORT}/sign`);
    console.log(`[AGENT_WS]  Escuchando en ws://localhost:${REST_PORT}/ws-agent`);
    console.log(`[UI_WS]     Escuchando en ws://localhost:${REST_PORT}/ws-ui`);
});


// ─── 2. WEBSOCKETS (noServer mode) ──────────────────────────────────────────

const uiWss = new WebSocketServer({ noServer: true });
const agentWss = new WebSocketServer({ noServer: true });

restServer.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    
    // Ruta para el Navegador (WalletClaw UI)
    if (url.pathname === '/ws-ui') {
        uiWss.handleUpgrade(request, socket, head, (ws) => {
            uiWss.emit('connection', ws, request);
        });
    } 
    // Ruta para Agentes OpenClaw
    else if (url.pathname === '/ws-agent' || url.pathname === '/') {
        agentWss.handleUpgrade(request, socket, head, (ws) => {
            agentWss.emit('connection', ws, request);
        });
    } 
    else {
        socket.destroy();
    }
});


// ─── 3. LÓGICA DE CONEXIÓN UI ───────────────────────────────────────────────

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
            if (msg.type === 'SIGN_RESPONSE' || msg.type === 'CHAT_MESSAGE') {
                if (activeAgentSocket && activeAgentSocket.readyState === WebSocket.OPEN) {
                    console.log(`[UI]    🦾 Propagando mensaje de UI al Agente...`);
                    activeAgentSocket.send(data.toString());
                } else {
                    console.log(`[UI]    ⚠️ No hay agente conectado para recibir el mensaje.`);
                }
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

agentWss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const queryKey = url.searchParams.get('key');
    const authHeader = req.headers['authorization'] ? req.headers['authorization'].replace('Bearer ', '') : null;
    const receivedKey = queryKey || authHeader;

    if (!activeApiKey || receivedKey !== activeApiKey) {
        console.log(`[WS_AGENT] 🔴 Conexión rechazada: API Key inválida (Recibido: ${receivedKey})`);
        ws.terminate();
        return;
    }

    console.log(`[WS_AGENT] 🟢 Agente OpenClaw conectado.`);
    activeAgentSocket = ws;

    ws.on('message', (data) => {
        if (!uiSocket || uiSocket.readyState !== WebSocket.OPEN) {
            console.log(`[WS_AGENT] ⚠️ UI no conectada. Mensaje del agente ignorado.`);
            return;
        }
        console.log(`[WS_AGENT] 🦾 Mensaje recibido del agente. Propagando a UI...`);
        uiSocket.send(data.toString());
    });

    ws.on('close', () => {
        console.log(`[WS_AGENT] 🔴 Agente OpenClaw desconectado.`);
        if (activeAgentSocket === ws) activeAgentSocket = null;
    });
});
