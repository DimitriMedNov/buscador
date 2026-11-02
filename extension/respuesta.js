// Zona de respuesta: muestra lo que contesta la IA (conforme llega) o lo que imprime un comando.
// Tiene sus estados: cargando, con texto, error con reintentar.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';

export class Respuesta {
    constructor({alReintentar}) {
        this.actor = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: 'bs-respuesta',
            visible: false, x_expand: true});

        this._pregunta = new St.Label({style_class: 'bs-resp-pregunta'});
        this._pregunta.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        this.actor.add_child(this._pregunta);

        this._texto = new St.Label({style_class: 'bs-resp-texto', x_expand: true});
        const ct = this._texto.clutter_text;
        ct.line_wrap = true;
        ct.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
        ct.ellipsize = Pango.EllipsizeMode.NONE;
        this._scroll = new St.ScrollView({style_class: 'bs-resp-scroll', hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC, overlay_scrollbars: true, x_expand: true,
            child: new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true})});
        this._scroll.child.add_child(this._texto);
        this.actor.add_child(this._scroll);

        const pie = new St.BoxLayout({style_class: 'bs-resp-pie'});
        this._estado = new St.Label({style_class: 'bs-resp-estado', x_expand: true, y_align: Clutter.ActorAlign.CENTER});
        pie.add_child(this._estado);
        this._reintentar = this._boton('Reintentar', 'view-refresh-symbolic', () => alReintentar());
        this._copiar = this._boton('Copiar', 'edit-copy-symbolic', () => this._alCopiar());
        pie.add_child(this._reintentar);
        pie.add_child(this._copiar);
        this.actor.add_child(pie);
        this._puntos = 0;
        this._latido = 0;
        this._aviso = 0;
    }

    _boton(texto, icono, accion) {
        const caja = new St.BoxLayout({style_class: 'bs-resp-boton-caja'});
        caja.add_child(new St.Icon({icon_name: icono, icon_size: 16}));
        caja.add_child(new St.Label({text: texto, y_align: Clutter.ActorAlign.CENTER}));
        const b = new St.Button({style_class: 'bs-resp-boton', child: caja, can_focus: true, accessible_name: texto});
        b.connect('clicked', accion);
        return b;
    }

    _alCopiar() {
        St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, this._texto.text);
        this._estado.text = 'Copiado';
    }

    _pararLatido() {
        if (this._latido)
            GLib.source_remove(this._latido);
        if (this._aviso)
            GLib.source_remove(this._aviso);
        this._latido = this._aviso = 0;
        this._texto.remove_style_class_name('bs-resp-cargando');
    }

    // Salida de comandos en letra de ancho fijo; respuestas de la IA en letra normal.
    monoespacio(si) {
        if (si)
            this._texto.add_style_class_name('bs-resp-mono');
        else
            this._texto.remove_style_class_name('bs-resp-mono');
    }

    // Estado 1: cargando. Puntos que se mueven y, si tarda, explica por qué.
    cargando(pregunta, mensaje, avisoLento) {
        this._pararLatido();
        this.actor.show();
        this._pregunta.text = pregunta;
        this._texto.add_style_class_name('bs-resp-cargando');
        this._texto.text = mensaje;
        this._estado.text = '';
        this._reintentar.hide();
        this._copiar.hide();
        this._latido = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 350, () => {
            this._puntos = (this._puntos + 1) % 4;
            this._texto.text = mensaje + '.'.repeat(this._puntos);
            return GLib.SOURCE_CONTINUE;
        });
        if (avisoLento) {
            this._aviso = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 4, () => {
                this._estado.text = avisoLento;
                this._aviso = 0;
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    // Estado 2: texto (se llama muchas veces mientras llega la respuesta).
    texto(texto, estado = '') {
        this._pararLatido();
        this._texto.text = texto;
        this._estado.text = estado;
        this._copiar.visible = texto.length > 0;
        // Baja al final para seguir lo que se va escribiendo.
        const adj = this._scroll.vadjustment;
        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            adj.value = adj.upper - adj.page_size;
            return GLib.SOURCE_REMOVE;
        });
    }

    terminado(estado) {
        this._estado.text = estado;
        this._reintentar.hide();
    }

    // Estado 3: error, con qué pasó y botón para reintentar.
    error(mensaje) {
        this._pararLatido();
        this._texto.text = mensaje;
        this._estado.text = 'Enter o el botón para reintentar';
        this._copiar.show();
        this._reintentar.show();
    }

    ocultar() {
        this._pararLatido();
        this.actor.hide();
        this._texto.text = '';
    }

    destruir() {
        this._pararLatido();
        this.actor.destroy();
    }
}
