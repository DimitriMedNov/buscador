// Cliente de Ollama: manda la conversación a /api/chat y va entregando la respuesta en trozos
// conforme el modelo la escribe (streaming), sin bloquear GNOME.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup';

Gio._promisify(Soup.Session.prototype, 'send_async');
Gio._promisify(Gio.InputStream.prototype, 'close_async');

const INSTRUCCIONES = 'Eres un asistente dentro del buscador del escritorio Linux (GNOME) de quien te escribe. ' +
    'Responde en el idioma de la pregunta, directo y breve: primero la respuesta, luego el detalle si hace falta. ' +
    'Texto plano: sin markdown, sin tablas, sin encabezados. Si das un comando, ponlo solo en su propia línea.';

// Lee una línea como texto. No se usa Gio._promisify: GNOME Shell ya promete read_line_async
// con otro "finish" que devuelve bytes, y la segunda promesa no se aplica.
function leerLinea(lector, cancelable) {
    return new Promise((resolver, rechazar) => {
        lector.read_line_async(GLib.PRIORITY_DEFAULT, cancelable, (_o, res) => {
            try {
                resolver(lector.read_line_finish_utf8(res)[0]);
            } catch (e) {
                rechazar(e);
            }
        });
    });
}

export class ErrorOllama extends Error {
    constructor(tipo, mensaje) {
        super(mensaje);
        this.tipo = tipo; // 'apagado' | 'sin-modelo' | 'otro'
    }
}

// Quita el bloque <think>…</think> de modelos que razonan en voz alta.
export function limpiarPensamiento(texto) {
    return texto.replace(/<think>[\s\S]*?(<\/think>\s*|$)/g, '').replace(/^\s+/, '');
}

export class Ollama {
    constructor(settings) {
        this._settings = settings;
        this._sesion = new Soup.Session({timeout: 300, idle_timeout: 30});
    }

    get modelo() {
        return this._settings.get_string('modelo');
    }

    // mensajes: [{role: 'user'|'assistant', content}]. alTrozo(textoAcumulado) se llama con cada trozo.
    // Devuelve el texto final. Lanza ErrorOllama; si se cancela, lanza el error CANCELLED de Gio.
    async preguntar(mensajes, alTrozo, cancelable, pensar = false) {
        const base = this._settings.get_string('ollama-url').replace(/\/+$/, '');
        const cuerpo = {model: this.modelo, stream: true,
            messages: [{role: 'system', content: INSTRUCCIONES}, ...mensajes]};
        if (pensar !== null)
            cuerpo.think = pensar;
        const msg = Soup.Message.new('POST', `${base}/api/chat`);
        if (!msg)
            throw new ErrorOllama('otro', `La dirección de Ollama no es válida: ${base}`);
        msg.set_request_body_from_bytes('application/json',
            new GLib.Bytes(new TextEncoder().encode(JSON.stringify(cuerpo))));

        let flujo;
        try {
            flujo = await this._sesion.send_async(msg, GLib.PRIORITY_DEFAULT, cancelable);
        } catch (e) {
            if (e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                throw e;
            throw new ErrorOllama('apagado', `No se pudo conectar con Ollama en ${base} (${e.message}).`);
        }

        const lector = new Gio.DataInputStream({base_stream: flujo});
        let texto = '';
        let fallo = null;
        try {
            for (;;) {
                const linea = await leerLinea(lector, cancelable);
                if (linea === null)
                    break;
                if (!linea.trim())
                    continue;
                let dato;
                try {
                    dato = JSON.parse(linea);
                } catch {
                    continue;
                }
                if (dato.error) {
                    fallo = dato.error;
                    break;
                }
                texto += dato.message?.content ?? '';
                alTrozo(limpiarPensamiento(texto));
                if (dato.done)
                    break;
            }
        } finally {
            lector.close_async(GLib.PRIORITY_DEFAULT, null).catch(() => {});
        }

        const estado = msg.get_status();
        if (fallo || estado !== Soup.Status.OK) {
            fallo ??= `HTTP ${estado}`;
            // Algunos modelos no aceptan el campo "think": se repite la pregunta sin él.
            if (/think/i.test(fallo) && pensar === false)
                return this.preguntar(mensajes, alTrozo, cancelable, null);
            if (estado === Soup.Status.NOT_FOUND || /not found|pull/i.test(fallo))
                throw new ErrorOllama('sin-modelo', `Falta el modelo ${this.modelo}. Descárgalo con: ollama pull ${this.modelo}`);
            throw new ErrorOllama('otro', `Ollama respondió con un error: ${fallo}`);
        }
        return limpiarPensamiento(texto);
    }

    destruir() {
        this._sesion.abort();
    }
}
