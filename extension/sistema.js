// Ejecuta las órdenes que arma ordenes.js: volumen (wpctl), brillo (el de GNOME Shell), wifi
// (nmcli), Bluetooth y modo avión (el interruptor de GNOME), modo oscuro, luz nocturna y
// No molestar (ajustes de GNOME). Al terminar muestra el aviso de GNOME (el de las teclas de volumen).

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const SALIDA = '@DEFAULT_AUDIO_SINK@';

function correr(argv) {
    return new Promise((resolver, rechazar) => {
        let proceso;
        try {
            proceso = Gio.Subprocess.new(argv, Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_MERGE);
        } catch (e) {
            rechazar(new Error(`No pude correr «${argv[0]}»: ${e.message}`));
            return;
        }
        proceso.communicate_utf8_async(null, null, (_p, res) => {
            try {
                const [, salida] = proceso.communicate_utf8_finish(res);
                if (proceso.get_successful())
                    resolver(salida ?? '');
                else
                    rechazar(new Error(`«${argv.join(' ')}» falló: ${(salida ?? '').trim()}`));
            } catch (e) {
                rechazar(e);
            }
        });
    });
}

// Interruptores de radio de GNOME (los mismos que usa el menú de la barra).
function rfkill(propiedad, valor) {
    return new Promise((resolver, rechazar) => {
        Gio.DBus.session.call('org.gnome.SettingsDaemon.Rfkill', '/org/gnome/SettingsDaemon/Rfkill',
            'org.freedesktop.DBus.Properties', 'Set',
            new GLib.Variant('(ssv)', ['org.gnome.SettingsDaemon.Rfkill', propiedad, new GLib.Variant('b', valor)]),
            null, Gio.DBusCallFlags.NONE, -1, null, (con, res) => {
                try {
                    con.call_finish(res);
                    resolver();
                } catch (e) {
                    rechazar(new Error(`No pude cambiar ${propiedad}: ${e.message}`));
                }
            });
    });
}

function aviso(icono, texto, nivel = null) {
    const gicon = Gio.ThemedIcon.new_with_default_fallbacks(icono);
    if (Main.osdWindowManager.showAll)
        Main.osdWindowManager.showAll(gicon, texto, nivel, nivel === null ? -1 : 1);
    else
        Main.osdWindowManager.show(-1, gicon, texto, nivel, nivel === null ? -1 : 1);
}

async function volumen(o) {
    if (o.silencio !== undefined) {
        await correr(['wpctl', 'set-mute', SALIDA, o.silencio ? '1' : '0']);
    } else {
        await correr(['wpctl', 'set-mute', SALIDA, '0']);
        const valor = o.nivel !== undefined ? `${o.nivel}%` : `${Math.abs(o.paso)}%${o.paso > 0 ? '+' : '-'}`;
        await correr(['wpctl', 'set-volume', '-l', '1.0', SALIDA, valor]);
    }
    // "Volume: 0.45" o "Volume: 0.45 [MUTED]"
    const salida = await correr(['wpctl', 'get-volume', SALIDA]);
    const nivel = parseFloat(salida.match(/[\d.]+/)?.[0] ?? '0');
    const mudo = salida.includes('MUTED');
    aviso(mudo ? 'audio-volume-muted-symbolic' : 'audio-volume-high-symbolic',
        mudo ? 'Silenciado' : `Volumen ${Math.round(nivel * 100)}%`, mudo ? 0 : nivel);
}

function brillo(o) {
    // GNOME 49+ maneja el brillo dentro del Shell; si la pantalla no lo permite, no hay escala.
    const escala = Main.brightnessManager?.globalScale;
    if (!escala)
        throw new Error('Esta pantalla no deja cambiar el brillo desde GNOME.');
    const nuevo = o.nivel !== undefined ? o.nivel / 100 : escala.value + o.paso / 100;
    escala.value = Math.min(1, Math.max(0, nuevo));
    aviso('display-brightness-symbolic', `Brillo ${Math.round(escala.value * 100)}%`, escala.value);
}

function ajuste(esquema, clave, valor) {
    const s = new Gio.Settings({schema_id: esquema});
    if (typeof valor === 'boolean')
        s.set_boolean(clave, valor);
    else
        s.set_string(clave, valor);
}

async function ejecutar(o) {
    const encendido = o.prender ? 'prendido' : 'apagado';
    switch (o.tipo) {
    case 'volumen':
        return volumen(o);
    case 'brillo':
        return brillo(o);
    case 'wifi':
        await correr(['nmcli', 'radio', 'wifi', o.prender ? 'on' : 'off']);
        return aviso(o.prender ? 'network-wireless-symbolic' : 'network-wireless-disabled-symbolic', `Wifi ${encendido}`);
    case 'bluetooth':
        await rfkill('BluetoothAirplaneMode', !o.prender);
        if (o.prender) // tras quitar el bloqueo, el adaptador tarda un momento en aparecer
            GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
                correr(['bluetoothctl', 'power', 'on']).catch(() => {});
                return GLib.SOURCE_REMOVE;
            });
        return aviso(o.prender ? 'bluetooth-active-symbolic' : 'bluetooth-disabled-symbolic', `Bluetooth ${encendido}`);
    case 'avion':
        await rfkill('AirplaneMode', o.prender);
        return aviso('airplane-mode-symbolic', `Modo avión ${encendido}`);
    case 'oscuro':
        ajuste('org.gnome.desktop.interface', 'color-scheme', o.prender ? 'prefer-dark' : 'default');
        return aviso(o.prender ? 'weather-clear-night-symbolic' : 'preferences-desktop-appearance-symbolic',
            o.prender ? 'Modo oscuro' : 'Modo claro');
    case 'nocturna':
        ajuste('org.gnome.settings-daemon.plugins.color', 'night-light-enabled', o.prender);
        return aviso('night-light-symbolic', `Luz nocturna ${o.prender ? 'prendida' : 'apagada'}`);
    case 'nomolestar':
        ajuste('org.gnome.desktop.notifications', 'show-banners', !o.prender);
        return aviso('notifications-disabled-symbolic', `No molestar ${o.prender ? 'activado' : 'desactivado'}`);
    default:
        throw new Error(`Orden desconocida: ${o.tipo}`);
    }
}

// Lo llama la fila al pulsar Enter; si algo falla, lo avisa con una notificación.
export function hacer(orden) {
    ejecutar(orden).catch(e => Main.notifyError('Buscador', e.message));
}
