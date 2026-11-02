// Calculadora del buscador: evalúa cuentas como "12*(3+4)", "2^10", "15% de 300" o "sqrt 81"
// con un analizador propio (nunca eval). Devuelve null si el texto no es una cuenta.

function fichas(texto) {
    const t = texto.toLowerCase()
        .replace(/\s+de\s+/g, '*') // "15% de 300" → "15%*300"
        .replace(/[x×]/g, '*').replace(/÷/g, '/').replace(/√/g, 'sqrt')
        .replace(/(\d),(\d{3})(?!\d)/g, '$1$2'); // 1,000 → 1000
    const lista = [];
    const re = /\s*(\d+\.?\d*|\.\d+|sqrt|pi|[+\-*/^()%])/gy;
    let m;
    while (re.lastIndex < t.length) {
        m = re.exec(t);
        if (!m)
            return t.slice(re.lastIndex).trim() === '' ? lista : null;
        lista.push(m[1]);
    }
    return lista;
}

// Gramática: suma → producto (± producto)*; producto → potencia (*|/ potencia)*;
// potencia → unario (^ potencia)?; unario → -unario | sqrt unario | primario %?
function analizar(lista) {
    let i = 0;
    const ver = () => lista[i];
    const tomar = () => lista[i++];
    const esNumero = f => f !== undefined && /^[\d.]/.test(f);

    function primario() {
        const f = tomar();
        let v;
        if (esNumero(f))
            v = parseFloat(f);
        else if (f === 'pi')
            v = Math.PI;
        else if (f === '(') {
            v = suma();
            if (tomar() !== ')')
                throw new Error('paréntesis');
        } else
            throw new Error('falta número');
        while (ver() === '%') {
            tomar();
            v /= 100;
        }
        // "2(3+4)" o "2pi": multiplicación implícita
        if (ver() === '(' || ver() === 'pi')
            v *= primario();
        return v;
    }
    function unario() {
        if (ver() === '-') {
            tomar();
            return -unario();
        }
        if (ver() === '+') {
            tomar();
            return unario();
        }
        if (ver() === 'sqrt') {
            tomar();
            return Math.sqrt(unario());
        }
        return primario();
    }
    function potencia() {
        const base = unario();
        if (ver() === '^') {
            tomar();
            return base ** potencia();
        }
        return base;
    }
    function producto() {
        let v = potencia();
        while (ver() === '*' || ver() === '/')
            v = tomar() === '*' ? v * potencia() : v / potencia();
        return v;
    }
    function suma() {
        let v = producto();
        while (ver() === '+' || ver() === '-')
            v = tomar() === '+' ? v + producto() : v - producto();
        return v;
    }

    const v = suma();
    if (i !== lista.length)
        throw new Error('sobra texto');
    return v;
}

export function formatear(n) {
    if (Number.isInteger(n) && Math.abs(n) < 1e15)
        return n.toLocaleString('en-US');
    const corto = parseFloat(n.toPrecision(12));
    return Math.abs(corto) >= 1e15 || (Math.abs(corto) < 1e-6 && corto !== 0)
        ? corto.toExponential(6) : corto.toLocaleString('en-US', {maximumFractionDigits: 10});
}

// Devuelve {valor, texto} o null.
export function calcular(texto) {
    const limpio = texto.trim().replace(/^=/, '');
    if (!/\d|pi/i.test(limpio))
        return null;
    const lista = fichas(limpio);
    // Sin operador no es cuenta ("2026" a secas es una búsqueda normal).
    if (!lista || !lista.some(f => /^[+\-*/^%]$|sqrt/.test(f)))
        return null;
    try {
        const valor = analizar(lista);
        return Number.isFinite(valor) ? {valor, texto: formatear(valor)} : null;
    } catch {
        return null;
    }
}
