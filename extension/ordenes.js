// Entiende frases para controlar la computadora ("volumen 50", "baja el brillo", "apaga el wifi",
// "modo oscuro") y devuelve las órdenes posibles. Solo interpreta texto: quien las ejecuta es
// sistema.js. Si la frase trae palabras que no conoce, no devuelve nada (es una búsqueda normal).

import GLib from 'gi://GLib';

const PASO = 10; // % que sube o baja "subir volumen" / "bajar brillo"

// Frases de varias palabras que se juntan en una sola antes de leer.
const FRASES = [
    [/\bno molestar\b/g, 'nomolestar'], [/\bluz nocturna\b/g, 'nocturna'], [/\bmodo avion\b/g, 'avion'],
    [/\bmodo (oscuro|claro)\b/g, '$1'], [/\btema (oscuro|claro)\b/g, '$1'],
    [/\bquita(r)? (el )?silencio\b/g, 'desilenciar'], [/\bwi[- ]fi\b/g, 'wifi'],
];

const DISPOSITIVOS = {
    volumen: ['volumen', 'sonido', 'audio', 'bocinas'],
    brillo: ['brillo'],
    wifi: ['wifi', 'wlan'],
    bluetooth: ['bluetooth', 'bt'],
    avion: ['avion'],
    nocturna: ['nocturna'],
    nomolestar: ['nomolestar', 'dnd'],
    oscuro: ['oscuro', 'dark'],
    claro: ['claro', 'light'],
};

const INTENCIONES = {
    prender: ['prende', 'prender', 'prendan', 'enciende', 'encender', 'activa', 'activar', 'on', 'conecta', 'conectar'],
    apagar: ['apaga', 'apagar', 'desactiva', 'desactivar', 'off', 'desconecta', 'desconectar'],
    subir: ['sube', 'subir', 'subele', 'mas', 'aumenta', 'aumentar', 'alto'],
    bajar: ['baja', 'bajar', 'bajale', 'menos', 'reduce', 'reducir', 'bajo'],
    silenciar: ['silencio', 'silencia', 'silenciar', 'mute', 'mutea', 'calla'],
    desilenciar: ['desilenciar', 'unmute'],
};

const RELLENO = new Set(['el', 'la', 'los', 'al', 'a', 'de', 'del', 'en', 'modo', 'pon', 'poner', 'ponle', 'cambia',
    'cambiar', 'tema', 'por', 'favor', 'porfa', 'ciento', 'porciento', 'un', 'poco', 'todo', 'y']);

const NOMBRE = {wifi: 'el wifi', bluetooth: 'el Bluetooth', avion: 'el modo avión', nocturna: 'la luz nocturna',
    nomolestar: 'No molestar'};

const ICONO = {
    volumen: 'audio-volume-high-symbolic', silencio: 'audio-volume-muted-symbolic',
    brillo: 'display-brightness-symbolic', wifi: 'network-wireless-symbolic',
    'wifi-apagado': 'network-wireless-disabled-symbolic', bluetooth: 'bluetooth-active-symbolic',
    'bluetooth-apagado': 'bluetooth-disabled-symbolic', avion: 'airplane-mode-symbolic',
    nocturna: 'night-light-symbolic', nomolestar: 'notifications-disabled-symbolic',
    oscuro: 'weather-clear-night-symbolic', claro: 'preferences-desktop-appearance-symbolic',
};

// Una palabra coincide con una clave si es igual o, con 3 letras o más, el inicio de la clave
// (así "vol" ya ofrece el volumen mientras escribes).
const coincide = (palabra, claves) => claves.some(c => c === palabra || (palabra.length >= 3 && c.startsWith(palabra)));

function buscarEn(tabla, palabra) {
    return Object.keys(tabla).find(k => coincide(palabra, tabla[k])) ?? null;
}

// Devuelve [{titulo, icono, orden}] (vacío si el texto no es una orden).
export function leerOrdenes(texto) {
    let t = GLib.str_to_ascii(texto, null).toLowerCase().replace(/%/g, ' ').trim();
    for (const [re, por] of FRASES)
        t = t.replace(re, por);
    const palabras = t.split(/\s+/).filter(Boolean);
    if (palabras.length === 0)
        return [];

    let dispositivo = null, intencion = null, nivel = null;
    for (const p of palabras) {
        if (/^\d{1,3}$/.test(p) && nivel === null) {
            nivel = Number(p);
            continue;
        }
        if (RELLENO.has(p))
            continue;
        // Primero el dispositivo: "bajo" sería intención, pero "bt" o "brillo" no.
        const d = dispositivo ? null : buscarEn(DISPOSITIVOS, p);
        if (d) {
            dispositivo = d;
            continue;
        }
        const i = intencion ? null : buscarEn(INTENCIONES, p);
        if (i) {
            intencion = i;
            continue;
        }
        return []; // palabra desconocida: no es una orden
    }

    // "silencio" o "mute" a secas hablan del volumen.
    if (!dispositivo && (intencion === 'silenciar' || intencion === 'desilenciar'))
        dispositivo = 'volumen';
    if (!dispositivo)
        return [];
    if (nivel !== null && (nivel > 100 || !['volumen', 'brillo'].includes(dispositivo)))
        return [];

    if (dispositivo === 'volumen' || dispositivo === 'brillo')
        return ordenesDeNivel(dispositivo, intencion, nivel);
    if (dispositivo === 'oscuro' || dispositivo === 'claro')
        return ordenesDeTema(dispositivo, intencion);
    return ordenesDeInterruptor(dispositivo, intencion);
}

function ordenesDeNivel(d, intencion, nivel) {
    const nombre = d === 'volumen' ? 'Volumen' : 'Brillo';
    const fila = (titulo, orden, icono = ICONO[d]) => ({titulo, icono, orden: {tipo: d, ...orden}});
    if (nivel !== null)
        return [fila(`${nombre} al ${nivel}%`, {nivel})];
    const subir = fila(`Subir ${nombre.toLowerCase()}`, {paso: PASO});
    const bajar = fila(`Bajar ${nombre.toLowerCase()}`, {paso: -PASO});
    if (d === 'volumen') {
        const silenciar = fila('Silenciar', {silencio: true}, ICONO.silencio);
        const quitar = fila('Quitar silencio', {silencio: false});
        if (intencion === 'silenciar' || intencion === 'apagar')
            return [silenciar];
        if (intencion === 'desilenciar' || intencion === 'prender')
            return [quitar];
        if (intencion === 'subir')
            return [subir];
        if (intencion === 'bajar')
            return [bajar];
        return [subir, bajar, silenciar, quitar];
    }
    if (intencion === 'subir' || intencion === 'prender')
        return [subir];
    if (intencion === 'bajar' || intencion === 'apagar')
        return [bajar];
    return intencion ? [] : [subir, bajar];
}

function ordenesDeTema(d, intencion) {
    // "apaga el modo oscuro" = modo claro.
    const oscuro = (d === 'oscuro') !== (intencion === 'apagar');
    if (intencion && !['prender', 'apagar'].includes(intencion))
        return [];
    return [{titulo: oscuro ? 'Modo oscuro' : 'Modo claro', icono: ICONO[oscuro ? 'oscuro' : 'claro'],
        orden: {tipo: 'oscuro', prender: oscuro}}];
}

function ordenesDeInterruptor(d, intencion) {
    const prender = {titulo: `Prender ${NOMBRE[d]}`, icono: ICONO[d], orden: {tipo: d, prender: true}};
    const apagar = {titulo: `Apagar ${NOMBRE[d]}`, icono: ICONO[`${d}-apagado`] ?? ICONO[d],
        orden: {tipo: d, prender: false}};
    if (intencion === 'prender')
        return [prender];
    if (intencion === 'apagar')
        return [apagar];
    return intencion ? [] : [prender, apagar];
}
