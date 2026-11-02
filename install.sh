#!/usr/bin/env bash
# Instala Buscador en tu usuario (sin sudo). Uso: ./install.sh   |   ./install.sh --quitar
# Super+Espacio en GNOME cambia el idioma del teclado; el instalador mueve ese cambio a Alt+Shift
# para dejarle Super+Espacio al buscador. --quitar lo regresa como estaba.
set -euo pipefail
cd "$(dirname "$0")"

UUID="buscador@dimitrimednov.github.io"
EXT="$HOME/.local/share/gnome-shell/extensions/$UUID"
TECLAS="org.gnome.desktop.wm.keybindings"

if [ "${1:-}" = "--quitar" ]; then
  gnome-extensions disable "$UUID" 2>/dev/null || true
  rm -rf "$EXT"
  gsettings set "$TECLAS" switch-input-source "['<Super>space', 'XF86Keyboard']"
  gsettings set "$TECLAS" switch-input-source-backward "['<Shift><Super>space', '<Shift>XF86Keyboard']"
  echo "Buscador quitado. Super+Espacio vuelve a cambiar el idioma del teclado."
  exit 0
fi

command -v glib-compile-schemas >/dev/null || { echo "Falta glib-compile-schemas (paquete glib2)."; exit 1; }

# Si GNOME aún no conoce la extensión (recién copiada), "enable" falla: se agrega a mano a la lista
# de extensiones activas para que cargue al volver a entrar.
activar() {
  gnome-extensions enable "$UUID" 2>/dev/null && return
  python3 - "$UUID" <<'PY'
import ast, subprocess, sys
lista = ast.literal_eval(subprocess.check_output(["gsettings", "get", "org.gnome.shell", "enabled-extensions"], text=True).replace("@as ", ""))
if sys.argv[1] not in lista:
    subprocess.check_call(["gsettings", "set", "org.gnome.shell", "enabled-extensions", str(lista + [sys.argv[1]])])
PY
}

mkdir -p "$EXT/schemas"
cp extension/*.js extension/metadata.json extension/stylesheet.css "$EXT/"
cp extension/schemas/*.gschema.xml "$EXT/schemas/"
rm -rf "$EXT/iconos" && cp -r extension/iconos "$EXT/"
glib-compile-schemas "$EXT/schemas"
activar

# Cambio de idioma del teclado: de Super+Espacio a Alt+Shift (en cualquier orden).
gsettings set "$TECLAS" switch-input-source "['<Alt>Shift_L', '<Shift>Alt_L', 'XF86Keyboard']"
gsettings set "$TECLAS" switch-input-source-backward "['<Shift>XF86Keyboard']"

echo "Buscador instalado. Cierra sesión y vuelve a entrar; luego pulsa Super+Espacio."
echo "El idioma del teclado ahora se cambia con Alt+Shift."
command -v claude >/dev/null || [ -x "$HOME/.local/bin/claude" ] || echo "Aviso: no encontré Claude Code; las preguntas a la IA necesitan «claude» (o elige Ollama en los ajustes)."
