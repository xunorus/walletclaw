import fs from 'fs';
import path from 'path';

/**
 * 🦒 OpenClawHistory.js (v1.2.0)
 * Sistema de persistencia para el "Cerebro" de OpenClaw.
 * 
 * NOTA: Como no tenemos sqlite3 instalado, usaremos un archivo JSON estructurado 
 * que emula una base de datos para asegurar compatibilidad inmediata sin 'npm install'.
 */

export class OpenClawHistory {
    constructor(dbPath = './openclaw_brain.json') {
        this._path = path.resolve(dbPath);
        this._initStore();
    }

    _initStore() {
        if (!fs.existsSync(this._path)) {
            fs.writeFileSync(this._path, JSON.stringify({ messages: [], metadata: { created: new Date().toISOString() } }, null, 2));
        }
    }

    /** Guarda un nuevo mensaje en el historial */
    async addMessage(from, content, type = 'chat') {
        try {
            const data = JSON.parse(fs.readFileSync(this._path, 'utf8'));
            const newMsg = {
                id: Date.now(),
                timestamp: new Date().toISOString(),
                from,
                content,
                type
            };

            data.messages.push(newMsg);

            // Mantenemos solo los últimos 1000 mensajes para no explotar el JSON
            if (data.messages.length > 1000) data.messages.shift();

            fs.writeFileSync(this._path, JSON.stringify(data, null, 2));
            return newMsg;
        } catch (e) {
            console.error("[HISTORY_DB] ❌ Error guardando mensaje:", e.message);
        }
    }

    /** Recupera los últimos N mensajes para darle contexto a la IA */
    async getRecent(limit = 10) {
        try {
            const data = JSON.parse(fs.readFileSync(this._path, 'utf8'));
            return data.messages.slice(-limit);
        } catch (e) {
            return [];
        }
    }

    /** Limpia el historial si el Jefe lo ordena */
    clear() {
        fs.writeFileSync(this._path, JSON.stringify({ messages: [] }, null, 2));
    }
}
