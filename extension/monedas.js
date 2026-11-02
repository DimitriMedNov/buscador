// Tipo de cambio de ExchangeRate-API (gratis, sin clave, se actualiza una vez al día).
// Se baja una sola tabla (todo contra el dólar) y se guarda en ~/.cache/buscador/tasas.json,
// así que casi todas las conversiones salen al instante y sin internet.

import GLib from 'gi://GLib';
import Soup from 'gi://Soup';

import {redondear} from './conversion.js';

const URL = 'https://open.er-api.com/v6/latest/USD';
const VIGENCIA = 12 * 3600; // s: después se vuelve a bajar
const ESPERA_TRAS_FALLO = 60; // s: no reintentar en cada tecla si no hay internet
const ARCHIVO = GLib.build_filenamev([GLib.get_user_cache_dir(), 'buscador', 'tasas.json']);

const ahora = () => Math.floor(Date.now() / 1000);

export class Monedas {
    constructor() {
        this._sesion = new Soup.Session({timeout: 10});
        this.tasas = null;
        this.actualizado = 0; // fecha de las tasas según el proveedor (unix)
        this._bajadas = 0; // cuándo las bajamos nosotros
        this._fallo = 0;
        this.error = null;
        this._cargando = null;
        this._leerCache();
    }

    _leerCache() {
        try {
            const [, bytes] = GLib.file_get_contents(ARCHIVO);
            const d = JSON.parse(new TextDecoder().decode(bytes));
            if (d.tasas?.USD === 1) {
                this.tasas = d.tasas;
                this.actualizado = d.actualizado;
                this._bajadas = d.bajadas;
            }
        } catch {
            // sin caché todavía: se baja la primera vez que haga falta
        }
    }

    // ¿Hace falta bajar (o volver a bajar) las tasas?
    get viejas() {
        if (this._cargando)
            return true;
        if (ahora() - this._fallo < ESPERA_TRAS_FALLO)
            return false;
        return !this.tasas || ahora() - this._bajadas > VIGENCIA;
    }

    // {valor, tasa} o null si aún no hay tasas o no conoce alguna de las monedas.
    convertir({cantidad, de, a}) {
        const td = this.tasas?.[de], ta = this.tasas?.[a];
        if (!td || !ta)
            return null;
        const valor = cantidad * ta / td;
        return {valor: redondear(valor, Math.abs(valor) >= 1 ? 2 : null), tasa: redondear(ta / td)};
    }

    get fecha() {
        return this.actualizado ? GLib.DateTime.new_from_unix_local(this.actualizado).format('%d/%m/%Y') : '';
    }

    // Baja las tasas si están viejas. Nunca lanza: si falla, deja el motivo en this.error.
    cargar() {
        if (!this.viejas)
            return Promise.resolve();
        this._cargando ??= this._bajar().finally(() => {
            this._cargando = null;
        });
        return this._cargando;
    }

    async _bajar() {
        try {
            const msg = Soup.Message.new('GET', URL);
            const bytes = await new Promise((resolver, rechazar) => {
                this._sesion.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null, (s, res) => {
                    try {
                        resolver(s.send_and_read_finish(res));
                    } catch (e) {
                        rechazar(e);
                    }
                });
            });
            if (msg.get_status() !== Soup.Status.OK)
                throw new Error(`el servidor respondió ${msg.get_status()}`);
            const d = JSON.parse(new TextDecoder().decode(bytes.get_data()));
            if (d.result !== 'success' || d.rates?.USD !== 1)
                throw new Error('respuesta inesperada del servidor');
            this.tasas = d.rates;
            this.actualizado = d.time_last_update_unix;
            this._bajadas = ahora();
            this.error = null;
            GLib.mkdir_with_parents(GLib.path_get_dirname(ARCHIVO), 0o755);
            GLib.file_set_contents(ARCHIVO,
                JSON.stringify({tasas: this.tasas, actualizado: this.actualizado, bajadas: this._bajadas}));
        } catch (e) {
            this._fallo = ahora();
            this.error = e.message;
            console.warn(`Buscador: no pude bajar el tipo de cambio: ${e.message}`);
        }
    }

    destruir() {
        this._sesion.abort();
    }
}
