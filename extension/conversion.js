// Conversiones: "5 km a millas", "100 f en c", "2 gb a mb" (al instante, sin internet) y
// "100 usd a mxn", "50 dolares" (monedas; el tipo de cambio lo trae monedas.js).
// Solo interpreta texto y hace la cuenta; devuelve null si el texto no es una conversión.

import GLib from 'gi://GLib';

// [símbolo que se muestra, factor a la unidad base, nombres que se aceptan]
// Los nombres de 3 letras o más aceptan también plural con "s" o "es".
const CATEGORIAS = {
    longitud: [
        ['mm', 0.001, ['mm', 'milimetro']], ['cm', 0.01, ['cm', 'centimetro']], ['m', 1, ['m', 'mt', 'metro']],
        ['km', 1000, ['km', 'kilometro']], ['in', 0.0254, ['in', 'pulgada', 'pulg', 'inch', 'inches']],
        ['ft', 0.3048, ['ft', 'pie', 'feet', 'foot']], ['yd', 0.9144, ['yd', 'yarda']],
        ['mi', 1609.344, ['mi', 'milla', 'mile']],
    ],
    masa: [
        ['mg', 1e-6, ['mg', 'miligramo']], ['g', 0.001, ['g', 'gr', 'gramo']], ['kg', 1, ['kg', 'kilo', 'kilogramo']],
        ['t', 1000, ['t', 'ton', 'tonelada']], ['oz', 0.028349523125, ['oz', 'onza']],
        ['lb', 0.45359237, ['lb', 'lbs', 'libra', 'pound']],
    ],
    volumen: [
        ['ml', 0.001, ['ml', 'mililitro']], ['L', 1, ['l', 'lt', 'litro', 'liter', 'litre']],
        ['gal', 3.785411784, ['gal', 'galon']], ['tazas', 0.2365882365, ['taza', 'cup']],
        ['fl oz', 0.0295735295625, ['floz', 'fl oz', 'onza liquida', 'onzas liquidas']], ['m³', 1000, ['m3', 'metro cubico', 'metros cubicos']],
    ],
    velocidad: [
        ['km/h', 1 / 3.6, ['km/h', 'kmh', 'kph']], ['mph', 0.44704, ['mph', 'mi/h']], ['m/s', 1, ['m/s']],
        ['nudos', 0.514444, ['nudo', 'kn', 'kt']],
    ],
    datos: [
        ['bytes', 1, ['byte']], ['KB', 1e3, ['kb']], ['MB', 1e6, ['mb', 'mega']], ['GB', 1e9, ['gb', 'giga']],
        ['TB', 1e12, ['tb', 'tera']], ['KiB', 1024, ['kib']], ['MiB', 1024 ** 2, ['mib']],
        ['GiB', 1024 ** 3, ['gib']], ['TiB', 1024 ** 4, ['tib']],
    ],
    tiempo: [
        ['ms', 0.001, ['ms', 'milisegundo']], ['s', 1, ['s', 'seg', 'segundo']], ['min', 60, ['min', 'minuto']],
        ['h', 3600, ['h', 'hr', 'hora']], ['días', 86400, ['d', 'dia']], ['semanas', 604800, ['sem', 'semana']],
        ['años', 31557600, ['ano', 'year']],
    ],
    area: [
        ['cm²', 1e-4, ['cm2']], ['m²', 1, ['m2', 'metro cuadrado', 'metros cuadrados']], ['km²', 1e6, ['km2']],
        ['ha', 1e4, ['ha', 'hectarea']], ['acres', 4046.8564224, ['acre']], ['ft²', 0.09290304, ['ft2', 'pie cuadrado', 'pies cuadrados']],
    ],
};

// La temperatura no es un factor: va por su cuenta.
const TEMPERATURA = {
    c: {simbolo: '°C', nombres: ['c', 'celsius', 'centigrado', 'grado'], aBase: v => v, deBase: v => v},
    f: {simbolo: '°F', nombres: ['f', 'fahrenheit'], aBase: v => (v - 32) * 5 / 9, deBase: v => v * 9 / 5 + 32},
    k: {simbolo: 'K', nombres: ['k', 'kelvin'], aBase: v => v - 273.15, deBase: v => v + 273.15},
};

// Monedas con nombre en español; además se acepta cualquier código de 3 letras (usd, eur, cop…).
const MONEDAS = {
    USD: ['usd', 'dolar', 'dolares', 'dls', 'dlls'], MXN: ['mxn', 'peso', 'pesos'], EUR: ['eur', 'euro', 'euros', '€'],
    GBP: ['gbp', 'esterlina', 'esterlinas'], JPY: ['jpy', 'yen', 'yenes'], CNY: ['cny', 'yuan', 'yuanes'],
    BRL: ['brl', 'real', 'reales'], CAD: ['cad', 'dolar canadiense', 'dolares canadienses'],
};
// Si escribes "100 dolares" sin decir a qué, se convierte a pesos (y los pesos, a dólares).
const MONEDA_LOCAL = 'MXN';

// Símbolos que son palabras: en singular cuando la cantidad es 1.
const SINGULAR = {tazas: 'taza', nudos: 'nudo', bytes: 'byte', 'días': 'día', semanas: 'semana', 'años': 'año', acres: 'acre'};
const nombrar = (simbolo, cantidad) => cantidad === 1 ? SINGULAR[simbolo] ?? simbolo : simbolo;

const plurales = n => n.length >= 3 && /^[a-z ]+$/.test(n) ? [n, `${n}s`, `${n}es`] : [n];

const UNIDADES = new Map(); // nombre → {categoria, simbolo, factor} o {temperatura}
for (const [categoria, lista] of Object.entries(CATEGORIAS)) {
    for (const [simbolo, factor, nombres] of lista) {
        for (const n of nombres.flatMap(plurales))
            UNIDADES.set(n, {categoria, simbolo, factor});
    }
}
for (const [clave, t] of Object.entries(TEMPERATURA)) {
    for (const n of t.nombres.flatMap(plurales))
        UNIDADES.set(n, {categoria: 'temperatura', simbolo: t.simbolo, temp: clave});
}
const NOMBRES_MONEDA = new Map();
for (const [codigo, nombres] of Object.entries(MONEDAS)) {
    for (const n of nombres)
        NOMBRES_MONEDA.set(n, codigo);
}

function normalizar(t) {
    return GLib.str_to_ascii(t.replace(/°/g, '').replace(/²/g, '2').replace(/³/g, '3').replace(/€/g, ' eur '), null)
        .toLowerCase().replace(/\s+/g, ' ').trim();
}

function numero(t) {
    const limpio = t.replace(/,(?=\d{3}(\D|$))/g, ''); // 1,000 → 1000
    return /^-?(\d+\.?\d*|\.\d+)$/.test(limpio) ? parseFloat(limpio) : NaN;
}

// "5 km a mi" → {cantidad: 5, de: 'km', a: 'mi'}; "50 dolares" → {cantidad: 50, de: 'dolares', a: null}
function partir(texto) {
    const m = normalizar(texto).match(/^(-?[\d.,]+)\s*(.+?)(?:\s+(?:a|en|to|->|=)\s+|\s*(?:->|→)\s*)(.+)$/) ??
        normalizar(texto).match(/^(-?[\d.,]+)\s*(.+)$/);
    if (!m)
        return null;
    const cantidad = numero(m[1]);
    return Number.isFinite(cantidad) ? {cantidad, de: m[2].trim(), a: m[3]?.trim() ?? null} : null;
}

// Redondea a 6 cifras significativas (y a centavos en dinero) y lo deja como texto.
export function redondear(v, decimales = null) {
    const r = decimales === null ? parseFloat(v.toPrecision(6)) : Math.round(v * 10 ** decimales) / 10 ** decimales;
    return Object.is(r, -0) ? 0 : r;
}

// Devuelve {cantidad, de, a, valor} (de y a son símbolos) o null.
export function convertirUnidades(texto) {
    const p = partir(texto);
    if (!p || !p.a)
        return null;
    const de = UNIDADES.get(p.de), a = UNIDADES.get(p.a);
    if (!de || !a || de.categoria !== a.categoria || de.simbolo === a.simbolo)
        return null;
    let valor;
    if (de.categoria === 'temperatura')
        valor = TEMPERATURA[a.temp].deBase(TEMPERATURA[de.temp].aBase(p.cantidad));
    else
        valor = p.cantidad * de.factor / a.factor;
    valor = redondear(valor);
    return {cantidad: p.cantidad, de: nombrar(de.simbolo, p.cantidad), a: nombrar(a.simbolo, valor), valor};
}

function codigoMoneda(nombre, soloConocidas) {
    if (NOMBRES_MONEDA.has(nombre))
        return NOMBRES_MONEDA.get(nombre);
    return !soloConocidas && /^[a-z]{3}$/.test(nombre) ? nombre.toUpperCase() : null;
}

// Devuelve {cantidad, de, a} con códigos de moneda (USD, MXN…) o null.
export function leerMoneda(texto) {
    const p = partir(texto);
    if (!p || p.cantidad < 0)
        return null;
    if (p.a === null) {
        const de = codigoMoneda(p.de, true);
        return de ? {cantidad: p.cantidad, de, a: de === MONEDA_LOCAL ? 'USD' : MONEDA_LOCAL} : null;
    }
    // Un código de 3 letras que también es unidad (min, seg…) no se toma como moneda.
    const de = codigoMoneda(p.de, UNIDADES.has(p.de)), a = codigoMoneda(p.a, UNIDADES.has(p.a));
    return de && a && de !== a ? {cantidad: p.cantidad, de, a} : null;
}
