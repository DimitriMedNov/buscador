// Comandos de terminal desde el buscador: "> comando" lo corre y muestra lo que imprime;
// con Ctrl+Enter lo abre en una terminal nueva para comandos largos o interactivos.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async');

const LIMITE = 15; // s: después se corta el comando
const MAX_SALIDA = 20000; // caracteres que se muestran

// Devuelve {salida, codigo, cortado}. Lanza si el comando no se pudo iniciar o se canceló.
export async function correr(comando, cancelable) {
    const proceso = Gio.Subprocess.new(['bash', '-c', comando],
        Gio.SubprocessFlags.STDIN_PIPE | Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_MERGE);
    let cortado = false;
    const reloj = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, LIMITE, () => {
        cortado = true;
        proceso.force_exit();
        return GLib.SOURCE_REMOVE;
    });
    const alCancelar = cancelable?.connect(() => proceso.force_exit());
    try {
        const [salida] = await proceso.communicate_utf8_async(null, null);
        let texto = salida ?? '';
        if (texto.length > MAX_SALIDA)
            texto = `${texto.slice(0, MAX_SALIDA)}\n… (salida recortada)`;
        cancelable?.set_error_if_cancelled();
        return {salida: texto.replace(/\s+$/, ''), codigo: proceso.get_exit_status(), cortado};
    } finally {
        if (!cortado)
            GLib.source_remove(reloj);
        if (alCancelar)
            cancelable.disconnect(alCancelar);
    }
}

// Terminal preferida: la que esté instalada, en este orden.
const TERMINALES = [
    ['ghostty', c => ['ghostty', '-e', 'bash', '-c', c]],
    ['ptyxis', c => ['ptyxis', '--new-window', '--', 'bash', '-c', c]],
    ['kgx', c => ['kgx', '--', 'bash', '-c', c]],
    ['gnome-terminal', c => ['gnome-terminal', '--', 'bash', '-c', c]],
];

export function argvTerminal(comando) {
    // Al terminar, la ventana se queda abierta con tu shell para que veas el resultado.
    const envuelto = `${comando}\necho\nexec "\${SHELL:-bash}"`;
    for (const [nombre, armar] of TERMINALES) {
        if (GLib.find_program_in_path(nombre))
            return armar(envuelto);
    }
    return null;
}
