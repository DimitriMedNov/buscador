// Cliente de Claude: corre el programa «claude» (Claude Code) en modo no interactivo con tu
// suscripción. No carga nada en tu RAM y puede buscar en internet (WebSearch/WebFetch) y
// consultar el clima con curl. Entrega la respuesta en trozos conforme llega.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const LIMITE = 180; // s: después se corta la pregunta

export class ErrorClaude extends Error {
    constructor(tipo, mensaje) {
        super(mensaje);
        this.tipo = tipo; // 'sin-claude' | 'otro'
    }
}

const NOMBRES = {haiku: 'Claude Haiku', sonnet: 'Claude Sonnet', opus: 'Claude Opus'};

function instrucciones(ciudad) {
    const ahora = GLib.DateTime.new_now_local().format('%Y-%m-%d %H:%M');
    return `Eres el asistente del buscador del escritorio Linux (GNOME) de quien te escribe. Vive en ${ciudad}. ` +
        `Fecha y hora local: ${ahora}. Responde en el idioma de la pregunta, directo y breve: primero la respuesta, ` +
        'luego el detalle si hace falta. Texto plano: sin markdown, sin tablas, sin encabezados. ' +
        'Si das un comando, ponlo solo en su propia línea. ' +
        'Si la respuesta depende de datos actuales (noticias, precios, resultados, horarios), búscalos con WebSearch; no inventes. ' +
        'Para el clima usa curl -s con Open-Meteo: primero las coordenadas con ' +
        "'https://geocoding-api.open-meteo.com/v1/search?name=<ciudad>&count=1&language=es' y luego " +
        "'https://api.open-meteo.com/v1/forecast?latitude=<lat>&longitude=<lon>&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto'.";
}

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

// GNOME Shell no siempre tiene ~/.local/bin en el PATH.
function rutaClaude() {
    return GLib.find_program_in_path('claude') ??
        [GLib.build_filenamev([GLib.get_home_dir(), '.local', 'bin', 'claude']),
            GLib.build_filenamev([GLib.get_home_dir(), '.claude', 'local', 'claude'])]
            .find(r => GLib.file_test(r, GLib.FileTest.IS_EXECUTABLE)) ?? null;
}

export class Claude {
    constructor(settings) {
        this._settings = settings;
        this._sesion = null; // id de la conversación, para las preguntas de seguimiento
    }

    get modelo() {
        const m = this._settings.get_string('modelo-claude');
        return NOMBRES[m] ?? m;
    }

    // Misma forma que Ollama.preguntar. Solo se manda la última pregunta: el historial lo guarda
    // Claude en la sesión (--resume).
    async preguntar(mensajes, alTrozo, cancelable) {
        const programa = rutaClaude();
        if (!programa)
            throw new ErrorClaude('sin-claude', 'No encontré el programa «claude» (Claude Code).');
        if (mensajes.length <= 1)
            this._sesion = null;

        const argv = [programa, '-p', mensajes.at(-1).content,
            '--model', this._settings.get_string('modelo-claude'),
            '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
            '--tools', 'WebSearch,WebFetch,Bash',
            '--allowedTools', 'WebSearch', 'WebFetch', 'Bash(curl:*)',
            '--strict-mcp-config', '--setting-sources', '',
            '--system-prompt', instrucciones(this._settings.get_string('ciudad'))];
        if (this._sesion)
            argv.push('--resume', this._sesion);

        // Carpeta neutra: así Claude no lee el CLAUDE.md de ningún proyecto.
        const carpeta = GLib.build_filenamev([GLib.get_user_cache_dir(), 'buscador']);
        GLib.mkdir_with_parents(carpeta, 0o755);
        const lanzador = new Gio.SubprocessLauncher({
            flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE});
        lanzador.set_cwd(carpeta);
        let proceso;
        try {
            proceso = lanzador.spawnv(argv);
        } catch (e) {
            throw new ErrorClaude('otro', `No se pudo iniciar claude: ${e.message}`);
        }

        let cortado = false;
        const reloj = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, LIMITE, () => {
            cortado = true;
            proceso.force_exit();
            return GLib.SOURCE_REMOVE;
        });
        const alCancelar = cancelable?.connect(() => proceso.force_exit());
        const lector = new Gio.DataInputStream({base_stream: proceso.get_stdout_pipe()});
        let texto = ''; // texto del mensaje que se está escribiendo
        let final = null;
        let fallo = null;
        try {
            for (;;) {
                const linea = await leerLinea(lector, null);
                if (linea === null)
                    break;
                let dato;
                try {
                    dato = JSON.parse(linea);
                } catch {
                    continue;
                }
                if (dato.session_id)
                    this._sesion = dato.session_id;
                const ev = dato.type === 'stream_event' ? dato.event : null;
                if (ev?.type === 'message_start') {
                    texto = '';
                } else if (ev?.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
                    texto += ev.delta.text;
                    alTrozo(texto.replace(/^\s+/, ''));
                } else if (ev?.type === 'content_block_start' && ev.content_block?.type === 'tool_use') {
                    alTrozo(ev.content_block.name === 'Bash' ? 'Consultando…' : 'Buscando en internet…');
                } else if (dato.type === 'result') {
                    if (dato.is_error)
                        fallo = dato.result || dato.subtype;
                    else
                        final = dato.result ?? texto;
                }
            }
        } finally {
            if (!cortado)
                GLib.source_remove(reloj);
            if (alCancelar)
                cancelable.disconnect(alCancelar);
        }
        cancelable?.set_error_if_cancelled();
        if (cortado)
            throw new ErrorClaude('otro', `Claude tardó más de ${LIMITE} s y se cortó.`);
        if (fallo)
            throw new ErrorClaude('otro', `Claude respondió con un error: ${fallo}`);
        if (final === null)
            throw new ErrorClaude('otro', 'Claude terminó sin responder. ¿Iniciaste sesión? Corre «claude» en una terminal una vez.');
        return final.trim();
    }

    destruir() {
        this._sesion = null;
    }
}
