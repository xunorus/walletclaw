import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import http from 'http';

/**
 * WalletClaw Bridge — El puente real entre OpenClaw y tu Navegador.
 * ───────────────────────────────────────────────────────────────────
 */

const BRIDGE_VERSION = 'v0.7.8';

const app = express();
app.use(cors());
app.use(express.json());

// Puertos configurables
const REST_PORT = 18789; // Puerto único para REST, Agentes y UI (vía Caddy)

// Estado del puente
let uiSocket = null; // Conexión con el navegador (WalletClaw)
let activeAgentSocket = null; // Último agente conectado
let activeApiKey = null; // Se sincroniza desde el navegador
let activeWalletAddress = null; // Se sincroniza desde el navegador

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

// Endpoint para obtener la dirección de la wallet conectada. 
// Soporta múltiples alias para compatibilidad máxima con agentes.
app.get(['/wallet', '/wallet/address', '/address', '/api/wallet', '/api/wallet/address', '/api/v1/wallet/address'], (req, res) => {
    const receivedKey = req.headers['x-api-key'] || (req.headers['authorization'] ? req.headers['authorization'].replace('Bearer ', '') : null);
    
    // Validación de API Key
    if (!activeApiKey || receivedKey !== activeApiKey) {
        return res.status(401).json({ error: 'Unauthorized: Invalid or missing API Key' });
    }

    if (!activeWalletAddress) {
        return res.status(404).json({ error: 'Not Found: Wallet address not synced yet. Please connect the UI.' });
    }

    res.json({ address: activeWalletAddress });
});

const HOST = process.argv[2] || '0.0.0.0';

const restServer = app.listen(REST_PORT, HOST, () => {
    console.log(`\n╔══════════════════════════════════════════════╗`);
    console.log(`║    WalletClaw Bridge — ¡ONLINE!  🦾🦞       ║`);
    console.log(`║    Versión: ${BRIDGE_VERSION}                    ║`);
    console.log(`╚══════════════════════════════════════════════╝`);
    console.log(`\n[REST]      Escuchando en http://${HOST}:${REST_PORT}/api/wallet`);
    console.log(`[REST]      Escuchando en http://${HOST}:${REST_PORT}/sign`);
    console.log(`[AGENT_WS]  Escuchando en ws://${HOST}:${REST_PORT}/ws-agent`);
    console.log(`[UI_WS]     Escuchando en ws://${HOST}:${REST_PORT}/ws-ui`);
    console.log(`[NOTE]      Puedes cambiar la IP ejecutando: node src/bridge.js <IP>`);
}).on('error', (err) => {
    if (err.code === 'EADDRNOTAVAIL') {
        console.error(`\n❌ ERROR: La IP ${HOST} no está disponible en esta máquina.`);
        console.error(`💡 Intenta usar 127.0.0.1 o no pases ningún parámetro para usar 0.0.0.0`);
    } else if (err.code === 'EADDRINUSE') {
        console.error(`\n❌ ERROR: El puerto ${REST_PORT} ya está en uso.`);
    } else {
        console.error(`\n❌ ERROR CRÍTICO:`, err.message);
    }
    process.exit(1);
});


// ─── 2. WEBSOCKETS (noServer mode) ──────────────────────────────────────────

const uiWss = new WebSocketServer({ noServer: true });
const agentWss = new WebSocketServer({ noServer: true });

restServer.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    console.log(`[BRIDGE] 🛰️  Intento de conexión WS: ${url.pathname} desde ${request.headers.origin || 'N/A'}`);
    
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
        console.log(`[BRIDGE] 🔴 Ruta WS desconocida: ${url.pathname}. Destruyendo socket.`);
        socket.destroy();
    }
});


// ─── 3. LÓGICA DE CONEXIÓN UI ───────────────────────────────────────────────

uiWss.on('connection', (ws) => {
    console.log(`[UI]    🟢 WalletClaw (Navegador) conectado.`);
    uiSocket = ws;

    // Send handshake
    ws.send(JSON.stringify({
        type: 'BRIDGE_WELCOME',
        version: BRIDGE_VERSION,
        status: 'ready'
    }));

    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data);
            
            // 1. Sincronización de API Key y Dirección desde el Navegador
            if (msg.type === 'SYNC_API_KEY') {
                activeApiKey = msg.key;
                console.log(`[UI]    🦾 API Key sincronizada y ACTIVA.`);
            }

            if (msg.type === 'SYNC_WALLET_ADDRESS') {
                activeWalletAddress = msg.address;
                console.log(`[UI]    🏦 Dirección de Wallet sincronizada: ${activeWalletAddress}`);
            }

            // 2. Respuesta de Firma o Chat del usuario
            if (msg.type === 'SIGN_RESPONSE' || msg.type === 'CHAT_MESSAGE') {
                if (activeAgentSocket && activeAgentSocket.readyState === WebSocket.OPEN) {
                    console.log(`[UI]    🦾 Propagando ${msg.type} de UI al Agente...`);
                    activeAgentSocket.send(data.toString());
                } else {
                    console.log(`[UI]    ⚠️ No hay agente conectado para recibir el ${msg.type}.`);
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
