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
- Casillas en **% del mapa** (`x`, `y` de 0 a 100). Las fichas se mueven de casilla en casilla; no hace falta `<path id="camino-principal">`.

## Datos
- `data/publico/…`: config, grupos, catálogo, `eventos_globales.json` y, por aventura, `aventura`, `tablero`, `entregas` y `eventos`.
- `data/privado/` (en `.gitignore`): `rubricas.json` y `eventos_privados.json` (`nota_miembro`, con cadena propia).
- Registros de eventos = **array JSON**. Campos: `id, fecha, autor, aventura, grupo, miembro, tipo, datos, puntos, visible_publico, referencia, hash_anterior, hash`.
- Hash = `sha256(hash_anterior + JSON.stringify(evento sin hash))`. Añadir eventos siempre con `encadenar()` de `cadena.js`.
- `anulacion`: `referencia` = id del evento anulado.

## Tests
`node --test` (carpeta `tests/`).

## Fases
Fase 0 ✔ · Fase 1 ✔ (esqueleto y datos) · siguiente: Fase 2 (motor + web pública).
