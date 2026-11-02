// Buscador: un buscador al centro de la pantalla al estilo de Spotlight de macOS.
// Super+Espacio lo abre: apps, archivos, acciones del sistema, cuentas, comandos y preguntas a Ollama.

import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Panel} from './panel.js';

export default class Buscador extends Extension {
    enable() {
        this._panel = new Panel(this);
        Main.wm.addKeybinding('atajo', this.getSettings(), Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW | Shell.ActionMode.SYSTEM_MODAL,
            () => this._panel.alternar());
    }

    disable() {
        Main.wm.removeKeybinding('atajo');
        this._panel?.destruir();
        this._panel = null;
    }
}
