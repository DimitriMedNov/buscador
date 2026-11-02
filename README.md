# Buscador

Extensión de GNOME con un buscador al centro de la pantalla, al estilo de Spotlight de macOS.
Pulsa **Super + Espacio** y escribe: abre apps y archivos, hace cuentas y conversiones, controla el
volumen, el brillo y el wifi, corre comandos y le pregunta a Claude con tu suscripción (busca en internet y no gasta tu RAM) o, si prefieres,
a un modelo local con [Ollama](https://ollama.com/).

![Apps](capturas/apps.png)

| Cuentas | Comandos | Preguntas a la IA |
|---|---|---|
| ![Cuenta](capturas/cuenta.png) | ![Comando](capturas/comando.png) | ![IA](capturas/ia.png) |

## Qué hace
- **Apps:** las mismas que encuentra GNOME, ordenadas por las que más usas.
- **Archivos y carpetas:** con LocalSearch, el índice que GNOME ya mantiene (el mismo de Archivos).
  Enter abre el archivo; **Ctrl+Enter** abre la carpeta donde está.
- **Cuentas:** `2+2*3`, `2^10`, `15% de 300`, `sqrt 81`, `(1+2)*3`. Enter copia el resultado.
- **Conversiones:** `5 km a millas`, `100 f a c`, `2 gb a mb`, `90 min a horas`, `3 tazas a ml`,
  `100 km/h a mph`. Longitud, peso, temperatura, volumen, velocidad, datos, tiempo y área. Salen al
  instante, sin internet. Enter copia el resultado.
- **Monedas:** `100 usd a mxn`, `100 euros a pesos`, `1000 cop a mxn` (cualquier código de 3 letras).
  `50 dolares` a secas convierte a pesos, y `200 pesos` a dólares. El tipo de cambio es de
  [ExchangeRate-API](https://www.exchangerate-api.com), se baja una vez cada 12 horas y se guarda
  en `~/.cache/buscador/tasas.json`, así que después sale al instante.
- **Controlar la computadora:** escribe lo que quieres y Enter. Sale el aviso de GNOME, como con las
  teclas de volumen.

  | Escribe | Hace |
  |---|---|
  | `volumen 50`, `sube el volumen`, `baja el volumen`, `silencio`, `quita el silencio` | Volumen |
  | `brillo 70`, `sube el brillo`, `baja el brillo` | Brillo de la pantalla (GNOME 49 o más nuevo) |
  | `apaga el wifi`, `prende el wifi` | Wifi |
  | `apaga el bluetooth`, `prende bt` | Bluetooth |
  | `modo oscuro`, `modo claro` | Tema de GNOME |
  | `prende la luz nocturna`, `activa no molestar`, `modo avion` | Luz nocturna, No molestar, modo avión |

  Basta empezar a escribir: `vol` ya ofrece subir, bajar o silenciar.
- **Acciones del sistema:** bloquear, suspender, reiniciar, apagar, cerrar sesión, captura de pantalla.
- **Comandos:** empieza con `>`. `> df -h` lo corre ahí mismo y muestra lo que imprime (se corta a
  los 15 s). **Ctrl+Enter** lo abre en una terminal nueva (Ghostty, Ptyxis, Consola o GNOME Terminal).
  Después puedes escribir otro comando y Enter.
- **Preguntas a la IA:** empieza con `?`, o elige la fila «Preguntar a…» que sale en toda búsqueda.
  La respuesta aparece conforme el modelo la escribe. Lo que escribas después es una pregunta de
  seguimiento: el modelo recuerda la conversación hasta que pulses Escape.
- **Buscar en la web:** la última fila abre la búsqueda en tu navegador.

## Teclas
| Tecla | Qué hace |
|---|---|
| Super + Espacio | Abre o cierra el buscador |
| ↑ ↓ (o Tab, Ctrl+N, Ctrl+P) | Elige resultado |
| Enter | Abre el resultado |
| Ctrl + Enter | Archivo: abre su carpeta. Comando: lo abre en una terminal |
| Escape | Sale de la respuesta; si no, borra el texto; si está vacío, cierra |

Clic fuera de la caja también la cierra.

## Instalar
```bash
git clone https://github.com/DimitriMedNov/buscador.git
cd buscador
./install.sh
```
Cierra sesión y vuelve a entrar. Funciona en GNOME 48 a 51.

**Ojo con el teclado:** en GNOME, Super + Espacio cambia el idioma del teclado. El instalador mueve
ese cambio a **Alt + Shift** para dejarle Super + Espacio al buscador. `./install.sh --quitar` quita
la extensión y regresa Super + Espacio al cambio de idioma.

## IA con Claude (de fábrica)
Usa el programa `claude` ([Claude Code](https://claude.com/claude-code)) con la sesión que ya
tienes iniciada, así que no necesitas clave de API. Responde con datos actuales: busca en internet
y consulta el clima en [Open-Meteo](https://open-meteo.com/). Si le pides «abre YouTube en Brave», lo
abre. Solo puede buscar en internet y usar `curl`, `gtk-launch` (abrir apps), `gio open` (abrir
enlaces o archivos) y `ls`; ningún otro comando. Cada pregunta cuenta para los límites de tu suscripción.

En los ajustes (`gnome-extensions prefs buscador@dimitrimednov.github.io`) eliges el modelo
(Haiku, el más rápido; Sonnet u Opus) y tu ciudad para las preguntas de clima.

## IA con Ollama (opcional, sin internet)
En los ajustes cambia **Responde** a «Ollama (local)». El modelo corre en tu computadora y usa
su RAM (qwen3:8b ocupa unos 6 GB).

```bash
sudo pacman -S ollama-vulkan        # Arch; Vulkan aprovecha gráficas AMD/Intel integradas
sudo systemctl enable --now ollama
ollama pull qwen3:8b                # unos 5 GB
```

De fábrica usa `qwen3:8b`. Para cambiar de modelo:
`gnome-extensions prefs buscador@dimitrimednov.github.io`. Ahí salen los modelos que ya
descargaste para elegir uno con **Usar**.

![Ajustes](capturas/ajustes.png)

La primera pregunta tarda más porque Ollama carga el modelo en memoria; el buscador te avisa. Si
Ollama no está corriendo o falta el modelo, te dice qué pasó, cómo arreglarlo y te da **Reintentar**.

## Cambiar el atajo
```bash
gsettings --schemadir ~/.local/share/gnome-shell/extensions/buscador@dimitrimednov.github.io/schemas \
  set org.gnome.shell.extensions.buscador atajo-buscador "['<Super>Return']"
```

## Licencia
MIT
