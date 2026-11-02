// Búsqueda de archivos y carpetas con LocalSearch, el índice que GNOME ya mantiene
// (el mismo que usan Archivos y la búsqueda de la vista de actividades).

import Gio from 'gi://Gio';
import Tsparql from 'gi://Tsparql';

Gio._promisify(Tsparql.SparqlConnection, 'bus_new_async');
Gio._promisify(Tsparql.SparqlStatement.prototype, 'execute_async');
Gio._promisify(Tsparql.SparqlCursor.prototype, 'next_async');

const SERVICIO = 'org.freedesktop.LocalSearch3';
const CONSULTA = `
SELECT ?url ?nombre ?mime WHERE {
  GRAPH tracker:FileSystem {
    ?f a nfo:FileDataObject ; nie:url ?url ; nfo:fileName ?nombre ; nfo:fileLastModified ?cambio .
    FILTER (CONTAINS(LCASE(?nombre), ~q) && !STRSTARTS(?nombre, "."))
  }
  OPTIONAL { ?f nie:interpretedAs ?ie . ?ie nie:mimeType ?mime }
} ORDER BY DESC(STRSTARTS(LCASE(?nombre), ~q)) DESC(?cambio) LIMIT ~limite`;

export class Archivos {
    constructor() {
        this._sentencia = null;
        this._falla = false; // si LocalSearch no existe, no se vuelve a intentar
    }

    async _preparar(cancelable) {
        if (!this._sentencia) {
            const conexion = await Tsparql.SparqlConnection.bus_new_async(SERVICIO, null, null, cancelable);
            this._sentencia = conexion.query_statement(CONSULTA, cancelable);
        }
        return this._sentencia;
    }

    // Devuelve [{url, nombre, mime}] (vacío si no hay índice o se canceló).
    async buscar(texto, limite, cancelable) {
        const q = texto.trim().toLowerCase();
        if (this._falla || q.length < 2)
            return [];
        try {
            const sentencia = await this._preparar(cancelable);
            sentencia.bind_string('q', q);
            sentencia.bind_int('limite', limite);
            const cursor = await sentencia.execute_async(cancelable);
            const lista = [];
            while (await cursor.next_async(cancelable))
                lista.push({url: cursor.get_string(0)[0], nombre: cursor.get_string(1)[0], mime: cursor.get_string(2)[0]});
            cursor.close();
            return lista;
        } catch (e) {
            if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)) {
                if (!this._sentencia)
                    this._falla = true;
                console.warn(`Buscador: búsqueda de archivos falló: ${e.message}`);
            }
            return [];
        }
    }
}

export function iconoDeArchivo(mime) {
    if (mime)
        return Gio.content_type_get_icon(Gio.content_type_from_mime_type(mime) ?? mime);
    return Gio.ThemedIcon.new('text-x-generic');
}
