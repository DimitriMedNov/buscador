// La lista de resultados: pinta las filas y lleva cuál está elegida (↑↓).

import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {crearFila} from './fila.js';

export class Lista {
    constructor(alPulsar) {
        this._alPulsar = alPulsar;
        this.actor = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: 'bs-lista', visible: false});
        this.items = [];
        this._filas = [];
        this.sel = 0;
    }

    // mantener: resultado que debe seguir elegido si sigue en la lista (al llegar los archivos).
    pintar(items, mantener = null) {
        this.actor.destroy_all_children();
        this.items = items;
        this._filas = items.map((item, i) => {
            const fila = crearFila(item, () => this._alPulsar(i));
            this.actor.add_child(fila);
            return fila;
        });
        this.actor.visible = items.length > 0;
        this.sel = 0;
        this.elegir(Math.max(0, mantener ? items.indexOf(mantener) : 0));
    }

    elegir(i) {
        if (this._filas.length === 0)
            return;
        this._filas[this.sel]?.remove_style_pseudo_class('selected');
        this.sel = (i + this._filas.length) % this._filas.length;
        this._filas[this.sel].add_style_pseudo_class('selected');
    }

    mover(paso) {
        this.elegir(this.sel + paso);
    }

    get elegido() {
        return this.items[this.sel] ?? null;
    }
}

// GNOME 50+: un KeyController en fase de captura recibe Enter antes que la caja de texto
// (si no, la caja se lo queda). En versiones anteriores basta la señal key-press-event.
export function escucharTeclas(entrada, alTecla) {
    if (Clutter.KeyController) {
        const control = new Clutter.KeyController();
        control.connect('key-press', () => {
            const [, tecla] = control.get_key();
            const [, presionadas, fijas, bloqueadas] = control.get_state();
            return alTecla(tecla, presionadas | fijas | bloqueadas);
        });
        entrada.add_action_full('buscador-teclas', Clutter.EventPhase.CAPTURE, control);
    } else {
        entrada.clutter_text.connect('key-press-event', (_a, ev) => alTecla(ev.get_key_symbol(), ev.get_state()));
    }
}
