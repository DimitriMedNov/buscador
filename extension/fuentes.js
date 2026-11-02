// Arma la lista de resultados para un texto: cuenta, apps, acciones del sistema, archivos,
// preguntar a la IA y buscar en la web. Cada resultado sabe cómo abrirse.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as SystemActions from 'resource:///org/gnome/shell/misc/systemActions.js';

import {calcular} from './calculo.js';
import {iconoDeArchivo} from './archivos.js';

const MAX_APPS = 6;
export const MAX_ARCHIVOS = 5;

// Palabras en español para las acciones del sistema de GNOME (las de GNOME vienen en inglés).
// [id, nombre, palabras, propiedad que dice si está disponible]
const ACCIONES = [
    ['lock-screen', 'Bloquear pantalla', ['bloquear', 'bloqueo', 'pantalla'], 'canLockScreen'],
    ['suspend', 'Suspender', ['suspender', 'dormir'], 'canSuspend'],
    ['restart', 'Reiniciar', ['reiniciar', 'reinicio'], 'canRestart'],
    ['power-off', 'Apagar', ['apagar', 'apagado'], 'canPowerOff'],
    ['logout', 'Cerrar sesión', ['cerrar', 'sesion', 'salir'], 'canLogout'],
    ['open-screenshot-ui', 'Captura de pantalla', ['captura', 'pantallazo'], null],
];

// Íconos propios (no dependen del tema de íconos que tengas).
let carpetaIconos = '';
export function ponerCarpetaIconos(ruta) {
    carpetaIconos = ruta;
}
const iconoPropio = nombre => Gio.FileIcon.new(Gio.File.new_for_path(`${carpetaIconos}/${nombre}-symbolic.svg`));

const normalizar = t => GLib.str_to_ascii(t, null).toLowerCase().trim();

export function lanzarUri(uri) {
    Gio.AppInfo.launch_default_for_uri(uri, global.create_app_launch_context(0, -1));
}

function copiar(texto) {
    St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, texto);
}

function apps(texto) {
    const sistema = Shell.AppSystem.get_default();
    const uso = Shell.AppUsage.get_default();
    const ids = Shell.AppSystem.search(texto).flatMap(grupo => grupo.sort((a, b) => uso.compare(a, b)));
    return ids.map(id => sistema.lookup_app(id)).filter(Boolean).slice(0, MAX_APPS).map(app => ({
        tipo: 'App', titulo: app.get_name(), subtitulo: app.get_description() ?? '',
        gicon: app.get_icon(), abrir: () => app.activate(),
    }));
}

function acciones(texto) {
    const sistema = SystemActions.getDefault();
    const palabras = normalizar(texto).split(/\s+/);
    const ids = new Set(sistema.getMatchingActions([texto]));
    for (const [id, , claves, disponible] of ACCIONES) {
        if ((!disponible || sistema[disponible]) && palabras.every(p => claves.some(c => c.startsWith(p))))
            ids.add(id);
    }
    const nombres = new Map(ACCIONES.map(([id, nombre]) => [id, nombre]));
    return [...ids].map(id => ({
        tipo: 'Sistema', titulo: nombres.get(id) ?? sistema.getName(id), subtitulo: '',
        icono: sistema.getIconName(id), abrir: () => sistema.activateAction(id),
    }));
}

export function deArchivos(lista) {
    return lista.map(({url, nombre, mime}) => {
        const archivo = Gio.File.new_for_uri(url);
        const carpeta = archivo.get_parent()?.get_path() ?? '';
        return {
            tipo: mime === 'inode/directory' ? 'Carpeta' : 'Archivo', titulo: nombre,
            subtitulo: carpeta.replace(GLib.get_home_dir(), '~'), gicon: iconoDeArchivo(mime),
            abrir: () => lanzarUri(url),
            abrirAlterno: () => archivo.get_parent() && lanzarUri(archivo.get_parent().get_uri()),
        };
    });
}

// Devuelve {antes, despues}: los archivos (que llegan después, son asíncronos) van en medio.
export function resultados(texto, modelo) {
    const t = texto.trim();
    if (!t)
        return {antes: [], despues: []};

    if (t.startsWith('>')) {
        const comando = t.slice(1).trim();
        return {antes: comando ? [{tipo: 'Comando', titulo: comando, subtitulo: 'Enter: correr aquí · Ctrl+Enter: abrir en terminal',
            icono: 'utilities-terminal-symbolic', accion: 'comando', valor: comando}] : [], despues: []};
    }
    const ia = {tipo: 'IA', titulo: `Preguntar a ${modelo}`, subtitulo: t, gicon: iconoPropio('ia'),
        accion: 'ia', valor: t};
    if (t.startsWith('?')) {
        ia.subtitulo = ia.valor = t.slice(1).trim();
        return {antes: ia.valor ? [ia] : [], despues: []};
    }

    const antes = [];
    const cuenta = calcular(t);
    if (cuenta) {
        antes.push({tipo: 'Cálculo', titulo: `= ${cuenta.texto}`, subtitulo: 'Enter: copiar el resultado',
            icono: 'accessories-calculator-symbolic', abrir: () => copiar(String(parseFloat(cuenta.valor.toPrecision(12))))});
    }
    antes.push(...apps(t), ...acciones(t));
    const web = {tipo: 'Web', titulo: `Buscar «${t}» en la web`, subtitulo: '', gicon: iconoPropio('web'),
        abrir: () => lanzarUri(`https://www.google.com/search?q=${encodeURIComponent(t)}`)};
    return {antes, despues: [ia, web]};
}
