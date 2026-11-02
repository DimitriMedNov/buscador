// Una fila de resultado: ícono, título, subtítulo y, a la derecha, de qué tipo es.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import Pango from 'gi://Pango';
import St from 'gi://St';

export function crearFila(item, alPulsar) {
    const boton = new St.Button({style_class: 'bs-fila', x_expand: true, can_focus: false,
        accessible_name: `${item.titulo}. ${item.tipo}`});
    const caja = new St.BoxLayout({x_expand: true, style_class: 'bs-fila-caja'});

    const icono = new St.Icon({style_class: 'bs-fila-icono', icon_size: 30, y_align: Clutter.ActorAlign.CENTER});
    if (item.gicon)
        icono.gicon = item.gicon;
    else
        icono.gicon = Gio.ThemedIcon.new_with_default_fallbacks(item.icono ?? 'application-x-executable-symbolic');
    caja.add_child(icono);

    const textos = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true,
        y_align: Clutter.ActorAlign.CENTER});
    const titulo = new St.Label({text: item.titulo, style_class: 'bs-fila-titulo'});
    titulo.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    textos.add_child(titulo);
    if (item.subtitulo) {
        const sub = new St.Label({text: item.subtitulo.split('\n')[0], style_class: 'bs-fila-sub'});
        sub.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        textos.add_child(sub);
    }
    caja.add_child(textos);

    caja.add_child(new St.Label({text: item.tipo, style_class: 'bs-fila-tipo', y_align: Clutter.ActorAlign.CENTER}));
    boton.set_child(caja);
    boton.connect('clicked', () => alPulsar());
    return boton;
}
