// Los dos modos donde el buscador se queda abierto mostrando una respuesta:
// - "ia": conversación con Ollama. Lo que escribas después es una pregunta de seguimiento.
// - "comando": corre un comando y muestra su salida. Puedes escribir otro y Enter.
// Escape sale del modo y regresa a la búsqueda.

import Gio from 'gi://Gio';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';

import {argvTerminal, correr} from './comando.js';
import {Ollama} from './ollama.js';

const esCancelado = e => e?.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED);

export class Modos {
    constructor(settings, respuesta, entrada, alSalir) {
        this._ollama = new Ollama(settings);
        this._respuesta = respuesta;
        this._entrada = entrada;
        this._alSalir = alSalir;
        this._modo = null;
        this._mensajes = []; // conversación con la IA
        this._ultimo = null; // última pregunta o comando, para reintentar
        this._cancelable = null;
    }

    get activo() {
        return this._modo !== null;
    }

    entrar(modo, valor, alterno) {
        if (modo === 'comando' && alterno) {
            const argv = argvTerminal(valor);
            if (argv)
                Util.spawn(argv);
            else
                Main.notifyError('Buscador', 'No encontré una terminal instalada (ghostty, ptyxis, kgx o gnome-terminal).');
            return;
        }
        this._modo = modo;
        this._mensajes = [];
        this._respuesta.monoespacio(modo === 'comando');
        this._entrada.text = '';
        this._entrada.hint_text = modo === 'ia'
            ? 'Pregunta de seguimiento… (Esc para volver)' : '> otro comando… (Esc para volver)';
        this._ejecutar(valor);
    }

    // Devuelve 'terminal' si abrió el comando en una terminal (el panel debe cerrarse).
    enviar(alterno) {
        const texto = this._entrada.text.trim().replace(this._modo === 'comando' ? /^>\s*/ : /^\?\s*/, '');
        if (this._modo === 'comando' && alterno && (texto || this._ultimo)) {
            this.entrar('comando', texto || this._ultimo, true);
            return 'terminal';
        }
        if (!texto) {
            this.reintentar();
            return null;
        }
        this._entrada.text = '';
        this._ejecutar(texto);
        return null;
    }

    reintentar() {
        if (!this._ultimo)
            return;
        // En la IA se quita la pregunta que falló para no mandarla dos veces.
        if (this._modo === 'ia' && this._mensajes.at(-1)?.role === 'user')
            this._mensajes.pop();
        this._ejecutar(this._ultimo);
    }

    _ejecutar(valor) {
        this._cancelable?.cancel();
        this._cancelable = new Gio.Cancellable();
        this._ultimo = valor;
        if (this._modo === 'ia')
            this._preguntar(valor, this._cancelable);
        else
            this._correr(valor, this._cancelable);
    }

    async _preguntar(pregunta, cancelable) {
        this._mensajes.push({role: 'user', content: pregunta});
        const modelo = this._ollama.modelo;
        this._respuesta.cargando(pregunta, `${modelo} está pensando`,
            'La primera pregunta tarda más: Ollama está cargando el modelo en memoria.');
        try {
            const final = await this._ollama.preguntar(this._mensajes, t => {
                if (!cancelable.is_cancelled())
                    this._respuesta.texto(t, `${modelo} escribiendo…`);
            }, cancelable);
            this._mensajes.push({role: 'assistant', content: final});
            this._respuesta.texto(final || '(sin respuesta)');
            this._respuesta.terminado(`${modelo} · Enter con texto para seguir preguntando`);
        } catch (e) {
            if (esCancelado(e))
                return;
            const extra = e.tipo === 'apagado'
                ? '\n\n¿Está corriendo? Inícialo con: systemctl start ollama' : '';
            this._respuesta.error(`${e.message}${extra}`);
        }
    }

    async _correr(comando, cancelable) {
        this._respuesta.cargando(`> ${comando}`, 'Corriendo');
        try {
            const {salida, codigo, cortado} = await correr(comando, cancelable);
            this._respuesta.texto(salida || '(no imprimió nada)');
            const fin = cortado ? 'Se cortó a los 15 s' : codigo === 0 ? 'Terminó bien' : `Terminó con error (código ${codigo})`;
            this._respuesta.terminado(`${fin} · Ctrl+Enter para abrirlo en terminal`);
        } catch (e) {
            if (!esCancelado(e))
                this._respuesta.error(`No se pudo correr el comando: ${e.message}`);
        }
    }

    salir(volver) {
        this._cancelable?.cancel();
        this._cancelable = null;
        if (!this._modo)
            return;
        this._modo = null;
        this._mensajes = [];
        this._ultimo = null;
        this._respuesta.ocultar();
        this._entrada.text = '';
        if (volver)
            this._alSalir();
    }

    destruir() {
        this.salir(false);
        this._ollama.destruir();
    }
}
