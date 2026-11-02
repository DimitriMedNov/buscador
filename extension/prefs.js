// Ajustes del Buscador: qué modelo de Ollama usar y dónde está Ollama.
// Lista los modelos que ya tienes descargados para elegir con un clic.

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import Soup from 'gi://Soup';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

Gio._promisify(Soup.Session.prototype, 'send_and_read_async');

export default class BuscadorAjustes extends ExtensionPreferences {
    fillPreferencesWindow(ventana) {
        const ajustes = this.getSettings();
        const sesion = new Soup.Session({timeout: 10});
        ventana.connect('close-request', () => sesion.abort());

        const pagina = new Adw.PreferencesPage({title: 'Buscador', icon_name: 'system-search-symbolic'});
        ventana.add(pagina);

        const grupo = new Adw.PreferencesGroup({title: 'Ollama',
            description: 'Las preguntas con «?» o la fila «Preguntar a…» van a este modelo, en tu computadora.'});
        const modelo = new Adw.EntryRow({title: 'Modelo', text: ajustes.get_string('modelo'), show_apply_button: true});
        modelo.connect('apply', () => ajustes.set_string('modelo', modelo.text.trim()));
        const url = new Adw.EntryRow({title: 'Dirección de Ollama', text: ajustes.get_string('ollama-url'), show_apply_button: true});
        url.connect('apply', () => {
            ajustes.set_string('ollama-url', url.text.trim());
            cargar();
        });
        grupo.add(modelo);
        grupo.add(url);
        pagina.add(grupo);

        const instalados = new Adw.PreferencesGroup({title: 'Modelos descargados'});
        const recargar = new Gtk.Button({icon_name: 'view-refresh-symbolic', valign: Gtk.Align.CENTER,
            tooltip_text: 'Volver a leer la lista', css_classes: ['flat']});
        recargar.update_property([Gtk.AccessibleProperty.LABEL], ['Volver a leer la lista']);
        recargar.connect('clicked', () => cargar());
        instalados.set_header_suffix(recargar);
        pagina.add(instalados);

        let filas = [];
        let senales = [];
        ventana.connect('close-request', () => senales.forEach(id => ajustes.disconnect(id)));
        const poner = fila => {
            instalados.add(fila);
            filas.push(fila);
        };
        const cargar = async () => {
            senales.forEach(id => ajustes.disconnect(id));
            senales = [];
            filas.forEach(f => instalados.remove(f));
            filas = [];
            poner(new Adw.ActionRow({title: 'Buscando modelos…'}));
            const base = ajustes.get_string('ollama-url').replace(/\/+$/, '');
            let lista;
            try {
                const msg = Soup.Message.new('GET', `${base}/api/tags`);
                const bytes = await sesion.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null);
                if (msg.get_status() !== Soup.Status.OK)
                    throw new Error(`HTTP ${msg.get_status()}`);
                lista = JSON.parse(new TextDecoder().decode(bytes.get_data())).models ?? [];
            } catch (e) {
                filas.forEach(f => instalados.remove(f));
                filas = [];
                poner(new Adw.ActionRow({title: 'No se pudo hablar con Ollama',
                    subtitle: `${e.message}. ¿Está corriendo? systemctl start ollama`}));
                return;
            }
            filas.forEach(f => instalados.remove(f));
            filas = [];
            if (lista.length === 0)
                poner(new Adw.ActionRow({title: 'No tienes modelos', subtitle: 'Descarga uno con: ollama pull qwen3:8b'}));
            for (const m of lista) {
                const gb = (m.size / 1e9).toFixed(1);
                const fila = new Adw.ActionRow({title: m.name, subtitle: `${gb} GB`});
                const usar = new Gtk.Button({label: 'Usar', valign: Gtk.Align.CENTER});
                const marcar = () => {
                    const actual = ajustes.get_string('modelo') === m.name;
                    usar.sensitive = !actual;
                    usar.label = actual ? 'En uso' : 'Usar';
                };
                usar.connect('clicked', () => {
                    ajustes.set_string('modelo', m.name);
                    modelo.text = m.name;
                });
                senales.push(ajustes.connect('changed::modelo', marcar));
                marcar();
                fila.add_suffix(usar);
                poner(fila);
            }
        };
        cargar();
    }
}
