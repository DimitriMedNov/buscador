// La ventana del buscador: caja de texto al centro con resultados debajo, al estilo de Spotlight.
// Teclado: ↑↓ elige, Enter abre, Ctrl+Enter alterno (carpeta / terminal), Escape regresa o cierra.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Archivos} from './archivos.js';
import {deArchivos, MAX_ARCHIVOS, ponerCarpetaIconos, resultados} from './fuentes.js';
import {escucharTeclas, Lista} from './lista.js';
import {Modos} from './modos.js';
import {Respuesta} from './respuesta.js';

const ANCHO = 680;
const ESPERA_BUSQUEDA = 60; // ms entre teclas antes de buscar
const PISTA = 'Buscar apps y archivos · 2+2 · > comando · ? pregunta';

export class Panel {
    constructor(ext) {
        this._settings = ext.getSettings();
        ponerCarpetaIconos(`${ext.path}/iconos`);
        this._archivos = new Archivos();
        this._grab = null;
        this._espera = 0;
        this._cancelable = null;

        this._fondo = new St.Widget({reactive: true, visible: false, style_class: 'bs-fondo'});
        this._fondo.connect('button-press-event', () => {
            this.cerrar();
            return Clutter.EVENT_STOP;
        });

        this._caja = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: 'bs-caja', reactive: true});
        this._caja.connect('button-press-event', () => Clutter.EVENT_STOP);
        this._caja.add_effect_with_name('desenfoque',
            new Shell.BlurEffect({mode: Shell.BlurMode.BACKGROUND, radius: 60, brightness: 0.75}));

        this._entrada = new St.Entry({style_class: 'bs-entrada', hint_text: PISTA, can_focus: true, x_expand: true,
            primary_icon: new St.Icon({icon_name: 'system-search-symbolic', style_class: 'bs-lupa'})});
        this._entrada.clutter_text.connect('text-changed', () => this._alEscribir());
        escucharTeclas(this._entrada, (tecla, estado) => this._alTecla(tecla, estado));
        this._caja.add_child(this._entrada);

        this._lista = new Lista(i => this._activar(i, false));
        this._caja.add_child(this._lista.actor);

        this._respuesta = new Respuesta({alReintentar: () => this._modos.reintentar()});
        this._caja.add_child(this._respuesta.actor);
        this._modos = new Modos(this._settings, this._respuesta, this._entrada, () => this._alSalirDeModo());

        this._fondo.add_child(this._caja);
        Main.layoutManager.uiGroup.add_child(this._fondo);
    }

    get abierto() {
        return this._fondo.visible;
    }

    abrir() {
        if (this.abierto || Main.modalCount > 0)
            return;
        const monitor = Main.layoutManager.monitors[global.display.get_current_monitor()] ?? Main.layoutManager.primaryMonitor;
        this._fondo.set_position(monitor.x, monitor.y);
        this._fondo.set_size(monitor.width, monitor.height);
        const ancho = Math.min(ANCHO, monitor.width - 32);
        this._caja.set_width(ancho);
        this._caja.set_position(Math.round((monitor.width - ancho) / 2), Math.round(monitor.height * 0.22));

        this._grab = Main.pushModal(this._fondo, {actionMode: Shell.ActionMode.SYSTEM_MODAL});
        this._fondo.get_parent().set_child_above_sibling(this._fondo, null);
        this._fondo.show();
        this._caja.opacity = 0;
        this._caja.scale_x = this._caja.scale_y = 0.97;
        this._caja.set_pivot_point(0.5, 0);
        this._caja.ease({opacity: 255, scale_x: 1, scale_y: 1, duration: 120, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
        this._entrada.grab_key_focus();
        this._entrada.clutter_text.set_selection(0, -1);
    }

    cerrar() {
        if (!this.abierto)
            return;
        this._modos.salir(false);
        this._entrada.text = '';
        this._cancelar();
        this._lista.pintar([]);
        if (this._grab)
            Main.popModal(this._grab);
        this._grab = null;
        this._fondo.hide();
    }

    alternar() {
        if (this.abierto)
            this.cerrar();
        else
            this.abrir();
    }

    _cancelar() {
        if (this._espera)
            GLib.source_remove(this._espera);
        this._espera = 0;
        this._cancelable?.cancel();
        this._cancelable = null;
    }

    _alSalirDeModo() {
        this._entrada.hint_text = PISTA;
        this._buscar();
    }

    _alEscribir() {
        if (this._modos.activo)
            return;
        this._cancelar();
        this._espera = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ESPERA_BUSQUEDA, () => {
            this._espera = 0;
            this._buscar();
            return GLib.SOURCE_REMOVE;
        });
    }

    async _buscar() {
        this._cancelar();
        const texto = this._entrada.text;
        const {antes, despues} = resultados(texto, this._settings.get_string('modelo'));
        this._lista.pintar([...antes, ...despues]);

        const t = texto.trim();
        if (antes.length + despues.length === 0 || /^[>?]/.test(t))
            return;
        const cancelable = this._cancelable = new Gio.Cancellable();
        const encontrados = await this._archivos.buscar(t, MAX_ARCHIVOS, cancelable);
        if (cancelable.is_cancelled() || encontrados.length === 0)
            return;
        this._lista.pintar([...antes, ...deArchivos(encontrados), ...despues], this._lista.elegido);
    }



    _activar(i, alterno) {
        const item = this._lista.items[i];
        if (!item)
            return;
        if (item.accion) {
            this._lista.actor.hide();
            this._modos.entrar(item.accion, item.valor, alterno);
            if (item.accion === 'comando' && alterno)
                this.cerrar();
            return;
        }
        this.cerrar();
        try {
            (alterno && item.abrirAlterno ? item.abrirAlterno : item.abrir)();
        } catch (e) {
            Main.notifyError('Buscador', `No se pudo abrir «${item.titulo}»: ${e.message}`);
        }
    }


    _alTecla(tecla, estado) {
        const ctrl = (estado & Clutter.ModifierType.CONTROL_MASK) !== 0;
        if (tecla === Clutter.KEY_Escape) {
            if (this._modos.activo)
                this._modos.salir(true);
            else if (this._entrada.text)
                this._entrada.text = '';
            else
                this.cerrar();
            return Clutter.EVENT_STOP;
        }
        if (tecla === Clutter.KEY_Return || tecla === Clutter.KEY_KP_Enter || tecla === Clutter.KEY_ISO_Enter) {
            if (this._modos.activo) {
                if (this._modos.enviar(ctrl) === 'terminal')
                    this.cerrar();
            } else
                this._activar(this._lista.sel, ctrl);
            return Clutter.EVENT_STOP;
        }
        if (this._modos.activo)
            return Clutter.EVENT_PROPAGATE;
        if (tecla === Clutter.KEY_Down || tecla === Clutter.KEY_Tab || (ctrl && tecla === Clutter.KEY_n)) {
            this._lista.mover(1);
            return Clutter.EVENT_STOP;
        }
        if (tecla === Clutter.KEY_Up || tecla === Clutter.KEY_ISO_Left_Tab || (ctrl && tecla === Clutter.KEY_p)) {
            this._lista.mover(-1);
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }

    destruir() {
        this.cerrar();
        this._modos.destruir();
        this._respuesta.destruir();
        this._fondo.destroy();
    }
}
