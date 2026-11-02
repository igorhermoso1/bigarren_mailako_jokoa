# Abentura-mapa · notas para Claude Code

Especificación original completa: `docs/PROMPT_MAESTRO.md`. Este archivo recoge **las decisiones vigentes**, que mandan sobre el prompt.

## Regla principal
**No inventar contenido ni funciones.** Ni nombres, ni alumnos, ni textos, ni eventos, ni objetos de ejemplo. Los datos reales empiezan vacíos y los rellena el profesor desde el panel. Los datos ficticios solo viven en `tests/datos_prueba/`. No añadir nada que el profesor no haya pedido.

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
- **Admin:** 5 módulos (panel de control, formulario de evento genérico, valoraciones con historial, grupos y fichas, editor del tablero). Botón «⬆ Argitaratu» pedido por el profesor (ver abajo).
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
- `comentario` (Oharra / testua): general, de un grupo (sale en su Historia) o de un miembro (`miembro`, sale en la pestaña del alumno, en «Lana»). Es público.

## Código
- `js/motor.js`: `calcularEstado()`, función pura (navegador y Node).
- `js/mapa.js`: fondo, casillas y fichas. Las fichas animan desde la última posición vista en ese navegador (localStorage, solo comodidad).
- `js/app.js`: carga, estandartes de aventura (`#id` en la URL), barra lateral (pestañas Taldeak / Egunkaria) y **ventanas emergentes con pestañas** junto a lo pulsado (en móvil, hoja inferior):
  - grupo: Taldea (nivel, XP, inventario en huecos, estados, logros), una pestaña por miembro (alias, clase, cometido) e Historia;
  - zona: Taldeak (cuándo, cómo y valoración de cada grupo en esa zona), Ariketa y Gertaerak.
- Las notas individuales nunca salen en la web pública: la pestaña de miembro solo muestra datos públicos.
- Cada zona muestra su nombre en una cartela que flota (animada, salvo con reducir movimiento) sobre su medallón.
- Barras de desplazamiento con estilo de madera y oro (web y panel).
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

## Publicar y aspecto (30/10)
- `POST /api/publicar` {mensaje?}: `git add -- data/publico img` → commit (si hay cambios) → `git push origin HEAD`, con `execFile` (sin shell) y `GIT_TERMINAL_PROMPT=0`. Usa las credenciales de Git del equipo. No publica si alguna cadena está dañada. Nunca añade código ni `data/privado`.
- Decisión: el panel NO se aloja en GitHub Pages con contraseña (obligaría a guardar un token de GitHub en el navegador); se publica desde el panel local.
- Título `config.titulo` = «Lit Zerbitzuak RPG», con un cubo rojo en SVG (`.kuboa`, girado -14°) junto al título, en la web y en el panel.
- `css/web.css` termina con la capa «RPG de los 90»: muro de piedra, ascuas animadas, cabecera de hierro con remaches, título metálico con destello, ventanas con bisel y gemas en las esquinas, luz de antorcha sobre el mapa, latido en zonas superadas, cursor ▶ en el menú de grupos y XP con rayas. Todo se desactiva con reducir movimiento.
- `css/admin.css` termina con la capa de controles: escala de espacios `--e1…--e5`, campos de 2.4rem con flecha propia en los select, botones con bisel y `[hidden]` siempre oculto.

## Mapa vivo (30/10, tarde)
- **Versión en las URL**: `index.html` y `admin.html` cargan CSS y JS con `?v=AAAAMMDDx`. **Cada cambio de código publicado necesita subir esa versión en los dos archivos**: GitHub Pages guarda en caché 10 min y, si no, el navegador mezcla archivos viejos y nuevos (así salió el cubo gigante). El SVG del cubo lleva además `width`/`height` propios.
- **Cartelas** de zona = `<span class="cartela">` dentro del botón de la casilla. `mapa.js → repartirCartelas()` elige arriba/abajo/derecha/izquierda sin solapes (con medidas de maquetación, no de pantalla; se repite al redimensionar) y `teñirCartelas()` toma el color medio del mapa alrededor de la casilla (`--tono`, `--sat`).
- **Efectos**: `js/fx.js` (solo en la web pública) pone un canvas con luciérnagas y un `Fx.estallido(el)` al pulsar una casilla o ficha, además de las capas CSS `.fx-nubes` y `.fx-rayo`. En CSS: entrada del mapa, anillo rúnico en casillas ocupadas, onda al pasar el ratón, faro en la meta y fichas que levitan con sombra. Todo se apaga con reducir movimiento y el canvas se para con la pestaña oculta.

## Música, regiones y nitidez (30/10, noche)
- **Música**: carpeta `music/`. `admin.js → actualizarMusica()` escribe `music/zerrenda.json` (lista de archivos de audio) al arrancar y al publicar; `publicar` añade también `music`. `js/musika.js`: bolsa barajada (ninguna se repite hasta acabar la ronda y la nueva ronda no empieza por la última), «Orain jotzen» con letrero que se desplaza, ▶/❚❚, ⏭, volumen y ecualizador. Recuerda encendido y volumen (localStorage) y vuelve a sonar con el primer toque si estaba encendida. Título = nombre del archivo sin extensión.
- **Regiones**: `config.estilos_cartela` (id, nombre, ikonoa) y `casilla.estiloa` (validado; vacío = color tomado del mapa). En CSS: `.cartela[data-estiloa="…"]`, cada una con material y animación propios. Asignadas en Zerbitzuak según el lugar del mapa; se cambian en el editor del tablero.
- **Cartelas**: 8 posiciones (4 lados + 4 diagonales) con 4 px de holgura.
- **Cubo** 3D con 6 caras en CSS (`.kuboa-gorputza`), girando sin parar.
- **Fichas nítidas**: `mapa.js → nitido()` reduce marco y foto por pasos de la mitad con suavizado alto, exactamente a los píxeles en pantalla (ResizeObserver × devicePixelRatio, y una primera vez en cuanto la ficha está en la página), y lo guarda en memoria. Mientras tanto se ve el sprite. Por eso las fichas se insertan siempre como nodos (`[data-ficha]` en las ventanas), nunca vía innerHTML.
- **Efectos**: rastro de energía en los tramos ya recorridos (`.rastro`), llegada de ficha (`Fx.llegada`: columna de luz, ondas y chispas del color del grupo), estrellas fugaces, luciérnagas de dos colores, entrada en iris, aura del color del grupo bajo cada ficha, faro de la meta y estandartes que ondean.

## Comodidad y rendimiento (30/10, cierre)
- **Rendimiento**: las animaciones grandes solo usan transform u opacity (las hace la tarjeta gráfica, sin repintar). Ascuas: capa `body::before` desplazada -300 px con mosaicas divisoras de 300 px. Antorcha: `.lienzo::before` que solo cambia de opacidad. Rayo: `.fx-rayo::before` con translateX. Halo del rastro, fijo. No animar `background-position`, `box-shadow` ni `filter` en capas grandes.
- **«Zer berri?»** (`app.js → mostrarNovedades`): localStorage `ikusita:<aventura>` = último id visto de cada registro. Sale **siempre** al abrir la web y solo se cierra con «Jarraitu» o Esc: muestra lo nuevo desde la última visita (con las subidas de nivel) o, si no hay nada nuevo, los últimos eventos. Al cambiar de aventura solo sale si hay novedades.
- **Luz por hora**: `#mapa[data-ordua]` = eguna (7-17), ilunabarra (17-20) o gaua; filtros fijos sobre `.fondo`.
- Cursor de espada en SVG (dorado sobre lo pulsable) y barra de recorrido (`.fg-ruta`) en la barra lateral.

## Proyector, vitrina, meta y zoom (30/10)
- **Modo proyector** (botón 📽 de la cabecera, `app.js → abrirProyector`): pantalla completa que recorre los grupos cada 10 s, con ← → para cambiar, espacio para pausar y Esc para salir.
- **Vitrina** (pestaña «Bitrina» de la barra lateral): logros, hitos y objetos de la aventura. Lo conseguido brilla y muestra quién lo tiene; lo que nadie tiene sale en silueta, y un logro `oculto` sale como «???».
- **Meta**: si un grupo está en una casilla `meta`, estandarte «HELMUGA!» y `Fx.fuegos` cada 3,2 s.
- **Zoom** (`mapa.js → habilitarZoom`): rueda, pellizco, doble clic y botones ＋ − ⟲, de 1 a 4 aumentos, con translate+scale sobre `.lienzo`. Al arrastrar no se abre ninguna ventana. Las ventanas emergentes son ahora `position: fixed` en `body` y siguen a lo pulsado (evento `mapa-mugitu`). Tras el zoom, las fichas se vuelven a preparar a su tamaño ampliado (`ficha._preparar`). En móvil el mapa cabe entero (sin min-width) y `touch-action: pan-y` deja desplazar la página sin zoom.
- El mapa de Zerbitzuak está ahora en WebP: `img/mapa/zerbitzuak-20261030T133209.webp` (294 KB; la JPG sigue como versión anterior).
- Sareak: el profesor diseñará su mapa más adelante; no tocarlo.

## Combates (02/11)
- **Qué es**: cada tema (casilla) tiene preguntas tipo test (5 recomendadas); cada pregunta es un enemigo. El profesor abre el combate desde el panel (⚔️ Borrokak → taldea → «Borroka hasi») y se juega en `borroka.html` **en su equipo** (proyector): solo funciona con `node admin.js` (token), porque las preguntas llevan la respuesta y son privadas (`data/privado/galderak.json` → `{ aventura: { casilla: [ {id, testua, aukerak[4], zuzena 0-3, pista?, activo} ] } }`, colección `galderak` de `/api/entidad`, con auditoría privada).
- **Mecánica**: vida del grupo = número de preguntas. Se elige quién ataca (← →) y a qué enemigo; si acierta, el enemigo cae, y si falla, el grupo pierde 1 de vida y el enemigo huye (un solo intento por pregunta). El turno pasa al siguiente miembro. Termina al resolver todos los enemigos o al quedarse sin vida. Resultado: `garaipena`, `porrota` o `amaitu_gabe` (si se corta a mano).
- **Objetos de combate**: `objeto.borroka` = `erdia` (quita 2 respuestas falsas), `pista` (muestra `pista`; solo sale si la pregunta tiene), `erantzuna` (marca la correcta) o `bizitza` (+1 vida). Se usan dentro de la ventana de la pregunta y quedan en el turno; los consumibles se gastan (`objeto_usado` automático).
- **Registro**: `POST /api/borroka` → evento `borroka` en el registro de la aventura (público): `{casilla, entrega, guztira, asmatuak, bizitza, emaitza, etsaiak[ids], txandak[{galdera, kidea, aukera, zuzena, objektuak?}]}`, con `puntos: 0` (no suma XP; si el profesor quiere premiar, usa un bonus). **El servidor vuelve a corregir** cada respuesta con las preguntas privadas, comprueba que el miembro es del grupo y que el grupo tenía los objetos. Por `/api/evento` no se puede registrar un combate. El texto de las preguntas nunca va al registro público.
- **Sprites**: `miembro.sprite` (`img/sprites/<miembro>-<fecha>.<ext>`, PNG/GIF/WebP sin reducir, `POST /api/sprite`). Si la imagen mide ≤ 160 px se pinta pixelada. Sin sprite: caballero con iniciales del color del grupo. Enemigos: 5 monstruos SVG provisionales (limo, murciélago, fantasma, gólem, ojo) teñidos con la región de la casilla (`body[data-estiloa]` en `css/borroka.css`).
- **Web pública**: pestaña «⚔ Borrokak» en la ventana del grupo (tarjeta por combate: resultado, vida y quién respondió a cada enemigo, con aciertos y objetos), estadística de combate en la pestaña de cada alumno, el último combate de cada grupo en la ventana de la zona, y tipo `borroka` en el egunkaria.
- No usar `garaipena` ni otros resultados como **clase** CSS: `.garaipena` es el estandarte de la meta. Usar `data-emaitza`.
- **Panel**: el botón «⬆ Argitaratu» muestra un contador rojo con los cambios sin publicar (`GET /api/git`: archivos cambiados en data/publico, img y music, más commits por delante de origin/main).

## Tests
`node --test` (carpeta `tests/`). Los tests usan `tests/datos_prueba/publico` (ficticio), nunca `data/`.

## Fases
Fase 0 ✔ · Fase 1 ✔ (esqueleto y datos) · Fase 2 ✔ (motor + web pública) · Fase 3 ✔ (admin.js + admin básico) · Fase 4 ✔ (gestión completa) · Fase 5 ✔ (editor del tablero y mapas) · Fase 6 saltada (sus elementos están recortados, ver arriba) · Fase 8 ✔ (GitHub Pages: https://igorhermoso1.github.io/bigarren_mailako_jokoa/) · pendientes: Fase 7 (pulido) y Fase 9 (mapas definitivos).
