# Abentura-mapa · notas para Claude Code

Especificación original completa: `docs/PROMPT_MAESTRO.md`. Este archivo recoge **las decisiones vigentes**, que mandan sobre el prompt.

## Qué es
Web estática (GitHub Pages) que gamifica la evaluación por grupos. Dos aventuras en paralelo (`zerbitzuak`, `sareak`), 6 grupos de 5 alumnos, los mismos en ambas. Solo el profesor escribe (admin local con `node admin.js`).

Stack: HTML + CSS + JS puro, sin frameworks, sin build y sin dependencias. Código comentado en español.

## Decisiones (Fase 0)
- Interfaz **solo en euskera**: textos directamente en HTML/JS, sin `i18n/`. El código y los comentarios van en español.
- Mismos grupos en ambas aventuras; el `cometido` de cada miembro va por aventura.
- Economía **separada** por aventura. Los **puntos hacen de XP**: el nivel sale de `config.niveles`. No hay monedas ni nivel global.
- Ranking **no público** (`ranking_publico: false`).
- `ambito` de objetos/estados: id de aventura o `"todas"`, para que una tercera aventura no exija cambiar código.

## Recortes aceptados (no implementar sin que el profesor lo pida)
- **Fichas:** marco circular raster de `img/fichas/marcos.png` (sprite de 3x2, en el orden de `config.marcos`) con la foto del grupo recortada en círculo. Editor: subir foto, zoom y posición. Sin formas, rotación ni «aplicar a todos».
- **Integridad:** append-only, `anulacion`, escritura atómica y cadena SHA-256 por registro (`cadena.js`). Sin carpeta `backups/`, sin ZIP y sin archivos JSON Schema: Git es la copia y el historial, y la validación se hace en código.
- **Admin:** 5 módulos (panel de control, formulario de evento genérico, valoraciones con historial, grupos y fichas, editor del tablero). Sin botón de git.
- **Gamificación:** puntos/nivel, objetos con rareza y ámbito, estados con duración, hitos, logros y comentarios. Fuera: tienda/monedas, cartas, jefes con vida, side quests, rachas, alianzas, temporadas, niebla de guerra, sonidos, hall de la fama, viento a favor y jefe conjunto.
- **Web pública:** mapa, tarjetas de grupo, línea temporal y ranking (este último desactivado). Sin vista «Resumen» ni vitrina «???».

## Mapas
- `aventura.json → mapa`: `archivo` (cualquier imagen: jpg/webp/svg), `ancho`, `alto` y `dibujar_camino`.
- Zerbitzuak usa una ilustración raster (`img/mapa/zerbitzuak.jpg`) que ya trae el camino punteado y sus rótulos, así que `dibujar_camino: false`. Sareak usa un SVG provisional y la web dibuja el camino entre casillas.
- **Casilla = ejercicio**: cada casilla lleva `entrega` (id en `entregas.json`) y `lugar` (nombre del sitio en el mapa). Zerbitzuak: 18 temas en orden + `meta`. Los temas de Sareak están por decidir.
- **Numeración**: `Motor.ordenCasillas(tablero)` = casillas activas en el orden del recorrido (anchura desde `inicio`); las sueltas van al final. Es el número que se ve en la web y en el admin, no la posición en el JSON.
- Casillas en **% del mapa** (`x`, `y` de 0 a 100). Las fichas se mueven de casilla en casilla; no hace falta `<path id="camino-principal">`.

## Datos
- `data/publico/…`: config, grupos, catálogo, `eventos_globales.json` y, por aventura, `aventura`, `tablero`, `entregas` y `eventos`.
- `data/privado/` (en `.gitignore`): `rubricas.json` y `eventos_privados.json` (`nota_miembro`, con cadena propia).
- Registros de eventos = **array JSON**. Campos: `id, fecha, autor, aventura, grupo, miembro, tipo, datos, puntos, visible_publico, referencia, hash_anterior, hash`.
- Hash = `sha256(hash_anterior + JSON.stringify(evento sin hash))`. Añadir eventos siempre con `encadenar()` de `cadena.js`.
- `anulacion`: `referencia` = id del evento anulado.
- **Privacidad:** `visible_publico: false` solo oculta en la interfaz; el JSON público lo lee cualquiera. Lo privado (notas de grupo privadas, `nota_miembro`) se escribe en `data/privado/eventos_privados.json`.
- Estados: su `puntos` se registra una vez en el propio evento `estado_aplicado` (el admin lo rellena desde `efecto`). La duración baja en cada `entrega_cerrada` posterior. Flujo: primero se cierra la entrega y después se registran sus resultados.
- Un evento sin `grupo` y con `puntos` afecta a todos los grupos.

## Código
- `js/motor.js`: `calcularEstado()`, función pura (navegador y Node).
- `js/mapa.js`: fondo, casillas y fichas. Las fichas animan desde la última posición vista en ese navegador (localStorage, solo comodidad).
- `js/app.js`: carga, estandartes de aventura (`#id` en la URL), barra lateral (pestañas Taldeak / Egunkaria) y **ventanas emergentes con pestañas** junto a lo pulsado (en móvil, hoja inferior):
  - grupo: Taldea (nivel, XP, inventario en huecos, estados, logros), una pestaña por miembro (alias, clase, cometido) e Historia;
  - zona: Taldeak (cuándo, cómo y valoración de cada grupo en esa zona), Ariketa y Gertaerak.
- Las notas individuales nunca salen en la web pública: la pestaña de miembro solo muestra datos públicos.
- `css/web.css`: hoja única con tema RPG fijo (madera, oro y pergamino; sin modo claro/oscuro). Sin fuentes externas.
- Iconos: `icono` de objeto/logro/hito = emoji o ruta de imagen; si falta, se usa el emoji por defecto del tipo. `config.clases` = clase RPG con su icono.
- El profesor gestiona logros, objetos y estados desde el admin; los del catálogo actual son de ejemplo.
- Ficha: `config.marcos[i]` = centro y diámetro del marco en el sprite (medidos sobre la transparencia).

## Admin (Fase 3)
- `admin.js`: servidor en 127.0.0.1:3000 (variable de entorno PUERTO para cambiarlo). Comprueba `Host` y `Origin` y pide una cabecera `x-token` (token aleatorio en cada arranque, inyectado en `admin.html` en lugar de `%%TOKEN%%`). Sirve el repositorio salvo `.git` y `data/privado`.
- API: `GET /api/datos`, `GET /api/verificar`, `POST /api/evento` (solo JSON). No hay borrado ni edición.
- `validarEvento()` es la frontera de confianza: tipos permitidos, ids existentes y del ámbito correcto, límites numéricos y de texto, y solo campos conocidos. El servidor pone `id`, `fecha`, `desde` y los hashes.
- `nota_miembro` y `nota_grupo` con `visible_publico: false` van siempre al registro privado.
- Antes de añadir, se verifica la cadena del registro; si está dañada, no se escribe.
- `js/admin/panel.js` + `css/admin.css`: tarjetas de grupo con acciones rápidas (`config.acciones_rapidas`), formulario genérico (campos según `CAMPOS`), confirmación con resumen y lista de los últimos eventos con «Baliogabetu».
- Los mensajes de error del servidor están en castellano (los ve solo el profesor).
- Los tests del admin trabajan sobre una copia temporal de `data/`.

## Admin (Fase 4)
- `POST /api/entidad` {coleccion, aventura?, grupo?, valor}: colecciones `grupos`, `miembros`, `objetos`, `estados`, `hitos`, `logros`, `entregas` (por aventura) y `criterios` (rúbrica privada). Sin `valor.id` crea, con id modifica solo los campos enviados. Cada colección tiene sus validadores en `ESQUEMAS` (admin.js).
- Cada cambio genera un evento `auditoria` (`datos.antes`/`despues`, `visible_publico: false`) en el registro global, o en el privado para la rúbrica. Si cambia la ficha o la foto, `datos.cambio = 'ficha_modificada'`. Las auditorías no se anulan.
- Archivar = `activo: false`. Un objeto, estado, hito, logro o criterio archivado ya no se puede otorgar.
- `POST /api/imagen` {grupo, foto (WebP reducido a 512 px por el navegador), original}: crea `img/fichas/<g>-<fecha>.webp` (un archivo nuevo por versión; no se borra ninguno) y guarda el original en `data/privado/fotos_reales/`. Se comprueba la firma de cada imagen.
- El encuadre (zoom/x/y) no recorta la foto: se aplica con CSS, así se puede reajustar sin volver a subirla.
- Restaurar una ficha = volver a guardar `ficha` + `foto_grupo` de un `antes` de la auditoría.
- Panel: módulos Kontrola, Balorazioak (historial de grupo y de miembro, medias, gráfica SVG, tendencia, corrección = nota nueva, lotes), Taldeak eta fitxak, Katalogoa, Entregak eta errubrika, Konparaketa.
- `js/admin/panel.js` expone `window.Admin` (api, datos, avId, confirmar, avisar…). `entidades.js` y `valoraciones.js` se registran en `Admin.modulos`.

## Admin (Fase 5)
- Colección `casillas` en `/api/entidad` (por aventura): nombre, lugar, tipo, x/y (0-100), entrega, descripcion, siguientes (ids existentes, nunca la propia) y activo. No se archiva una casilla con grupos encima. A una casilla archivada no se puede avanzar.
- `POST /api/mapa` {aventura, archivo (dataURL) | existente (ruta img/mapa/…), ancho, alto, dibujar_camino}: crea un archivo nuevo por versión, `img/mapa/<av>-<fecha>.<ext>`, y audita el cambio (`coleccion: 'mapa'`). Un SVG solo se acepta sin script, sin on…= y sin href ni url() externos, y con viewBox (de ahí salen ancho y alto).
- `js/admin/tablero.js`: arrastre con pointer events (se guarda al soltar), flechas del teclado (se guarda a los 600 ms), «＋ Honen ondoren txertatu» (la nueva hereda las conexiones de la elegida), conexiones con casillas de verificación, versiones de mapa con «Leheneratu».

## Tests
`node --test` (carpeta `tests/`).

## Fases
Fase 0 ✔ · Fase 1 ✔ (esqueleto y datos) · Fase 2 ✔ (motor + web pública) · Fase 3 ✔ (admin.js + admin básico) · Fase 4 ✔ (gestión completa) · Fase 5 ✔ (editor del tablero y mapas) · Fase 6 saltada (sus elementos están recortados, ver arriba) · Fase 8 ✔ (GitHub Pages: https://igorhermoso1.github.io/bigarren_mailako_jokoa/) · pendientes: Fase 7 (pulido) y Fase 9 (mapas definitivos).
