# PROMPT MAESTRO · Aventuras gamificadas de evaluación por grupos (Zerbitzuak + Sareak)

> Copia todo este documento en Claude Code (o guárdalo como `CLAUDE.md` en la raíz del repo). Está pensado para que Claude Code construya el proyecto por fases, preguntando lo que falte antes de dar nada por supuesto.

---

## 0. ROL Y OBJETIVO

Actúa como desarrollador front-end senior y diseñador de juegos. Vas a construir una web estática, alojada en GitHub Pages, que gamifica la evaluación de proyectos de clase.

- Hay **dos aventuras en paralelo**, cada una con su propio mapa: una para la asignatura **Zerbitzuak** y otra para la asignatura **Sareak**. Son dos juegos independientes (tablero, entregas, progreso, eventos y notas propios) que comparten el mismo marco, el mismo panel de admin y, si procede, los mismos grupos de alumnos.
- **6 grupos de 5 alumnos** avanzan por cada mapa (fichas sobre casillas/puntos) cuando el profesor lo decide tras cada entrega de la asignatura correspondiente.
- Es **solo yo (el profesor) quien modifica el progreso**. Los alumnos solo ven.
- Tiene estética y mecánicas de **RPG muy contenido**: hitos, objetos, bonus, mejoras (upgrades), penalizaciones (downgrades), eventos, logros, notas.
- Debe ser **sostenible** (años de uso, sin mantenimiento) y la información **no debe poder borrarse nunca** (solo corregirse mediante nuevos registros).
- Stack: **HTML + CSS + JavaScript puro (sin frameworks, sin build)**. Datos en **JSON dentro del repositorio**. Control de versiones con **Git**.

Piezas del proyecto:

1. `index.html` → web **pública**, solo lectura (selector de aventura, mapa, grupos, objetos, línea temporal, ranking).
2. `admin.html` → panel **solo para el profesor**, en local, para editar todo en ambas aventuras.
3. `admin.js` → mini servidor local de Node.js **sin dependencias** que permite a `admin.html` leer y escribir los JSON y subir imágenes.

---

## 1. DECISIONES YA TOMADAS (no las cuestiones)

- Almacenamiento: **archivos JSON en el repo** (opción A). Nada de bases de datos externas, nada de localStorage como fuente de verdad.
- Hosting: **GitHub Pages**.
- Los alumnos **no escriben** nada.
- El admin se ejecuta **en local** (`node admin.js` → `http://localhost:3000/admin.html`).
- **Dos aventuras en paralelo** (`zerbitzuak` y `sareak`), añadidas como datos, no como código: el sistema debe ser **multi-aventura** (una lista `aventuras` en `config.json`), de modo que añadir una tercera asignatura en el futuro sea crear una carpeta y no tocar el código.
- **Los mapas serán SVG generados por código** (ver sección 10). **El mapa definitivo de cada aventura se añadirá al final**, cuando todo lo demás funcione. Hasta entonces, cada aventura usa un **mapa provisional** muy simple (fondo plano + camino + casillas) que cumple el mismo contrato que el definitivo, de modo que sustituirlo sea solo cambiar un archivo.
- Las fichas y marcos se dibujan con **SVG/CSS**; los iconos de objetos pueden ser imágenes externas o SVG.
- Diseño del tablero: **grafo de casillas**. Cada casilla tiene una lista `siguientes`; por defecto es un camino lineal, pero debe admitir bifurcaciones y casillas alternativas sin cambiar el código.

---

## 2. PRINCIPIO RECTOR: EVENT SOURCING (inmutabilidad)

**Nada se sobrescribe ni se borra.** El estado (posición, puntos, inventario, nivel) **se calcula siempre** recorriendo el registro de eventos.

Reglas obligatorias:

1. Los registros de eventos son **append-only**: el servidor solo añade al final. No existe endpoint de borrado ni de edición de eventos. Hay **un registro por aventura** (`data/publico/aventuras/<id>/eventos.json`), uno **global** para cosas comunes (altas de grupos y alumnos, cambios de cometido, auditoría) y los privados en `data/privado/`.
2. **Corregir un error = añadir un evento de tipo `anulacion`** que referencia el `id` del evento erróneo y, si procede, un evento nuevo con el valor correcto. El evento anulado sigue visible en el historial (tachado).
3. **Cadena de integridad:** cada evento incluye `hash` = SHA-256 de (`hash_anterior` + contenido del evento). **Cada registro tiene su propia cadena**, así un problema en una aventura no afecta a la otra. Incluye un botón y un comando `node admin.js --verificar` que recorre todas las cadenas y avisa de roturas.
4. Cada evento tiene `id` incremental único dentro de su registro, `fecha` ISO 8601 y `autor` (siempre "profesor").
5. Las entidades "editables" (grupos, alumnos, catálogo de objetos, casillas) mantienen su estado actual, pero **cada cambio genera además un evento de auditoría** con valor anterior y valor nuevo. "Eliminar" un alumno, grupo u objeto = marcarlo `activo: false` (archivado), jamás borrarlo.
6. El servidor **hace una copia con marca de tiempo** de cada JSON en `backups/` antes de cada escritura (rotación: conservar todo el mes en curso, 1 por semana el resto).
7. El servidor escribe de forma **atómica** (archivo temporal + renombrar) para evitar JSON corruptos.
8. Validación de esquema antes de guardar; si algo no valida, no se guarda y se muestra el error.

---

## 3. ESTRUCTURA DE CARPETAS

```
/
├─ index.html                 ← web pública
├─ admin.html                 ← panel del profesor (NO se publica, ver .gitignore opcional)
├─ admin.js                   ← servidor local Node (sin dependencias)
├─ README.md                  ← cómo se usa, cómo hacer backup, cómo restaurar
├─ CLAUDE.md                  ← este prompt resumido
├─ .gitignore
├─ css/
│   ├─ base.css               ← variables, reset, tipografías
│   ├─ mapa.css               ← tablero (CSS Grid + capa SVG)
│   ├─ componentes.css        ← fichas, marcos, tarjetas, insignias, modales
│   └─ admin.css
├─ js/
│   ├─ app.js                 ← arranque público
│   ├─ motor.js               ← calcula el estado de una aventura a partir de sus eventos
│   ├─ mapa.js                ← carga el SVG de la aventura, dibuja casillas y anima fichas
│   ├─ vistas/                ← grupos.js, inventario.js, timeline.js, ranking.js, logros.js
│   └─ admin/                 ← módulos del panel
├─ data/
│   ├─ publico/               ← lo que ve todo el mundo
│   │   ├─ config.json        ← título, lista de aventuras, idioma, colores, reglas generales
│   │   ├─ grupos.json        ← grupos y alumnos (datos públicos, compartidos)
│   │   ├─ catalogo.json      ← objetos, estados, logros, cartas, hitos (con ámbito por aventura)
│   │   ├─ eventos_globales.json  ← registro append-only de lo común a ambas aventuras
│   │   ├─ aventuras/
│   │   │   ├─ zerbitzuak/
│   │   │   │   ├─ aventura.json   ← nombre, tema, colores, referencia al mapa
│   │   │   │   ├─ tablero.json    ← casillas y conexiones de ESTA aventura
│   │   │   │   ├─ entregas.json   ← calendario de entregas de ESTA asignatura
│   │   │   │   └─ eventos.json    ← registro append-only de ESTA aventura
│   │   │   └─ sareak/
│   │   │       └─ (misma estructura)
│   │   └─ temporadas/        ← archivo histórico por curso (ambas aventuras)
│   └─ privado/               ← EN .gitignore, solo en mi equipo
│       ├─ rubricas.json             ← rúbricas de cada asignatura
│       ├─ eventos_privados.json     ← valoraciones individuales (append-only, cadena propia)
│       └─ fotos_reales/             ← fotos originales de los grupos (copia de seguridad privada)
├─ img/
│   ├─ mapa/                  ← zerbitzuak.svg, sareak.svg (provisionales primero, definitivos al final)
│   ├─ objetos/               ← iconos
│   ├─ avatares/              ← avatares/fotos de alumnos (opcionales)
│   └─ fichas/                ← fotos de grupo ya recortadas (WebP) y marcos/decoraciones de ficha
├─ backups/                   ← copias automáticas (en .gitignore)
├─ tests/
└─ esquemas/                  ← JSON Schema de cada archivo
```

---

## 4. MODELO DE DATOS (con ejemplos)

### 4.0 `config.json` (multi-aventura)

```json
{
  "titulo": "Nombre del proyecto",
  "idioma_por_defecto": "es",
  "idiomas": ["es", "eu"],
  "ranking_publico": true,
  "niebla_de_guerra": false,
  "aventuras": [
    { "id": "zerbitzuak", "nombre": "Zerbitzuak", "color_acento": "#2a9d8f", "activa": true },
    { "id": "sareak",     "nombre": "Sareak",     "color_acento": "#e9c46a", "activa": true }
  ],
  "economia_compartida": { "xp_global": true, "monedas_global": false, "objetos_entre_aventuras": "segun_objeto" }
}
```

- El **color de acento** y el **tema** de cada aventura distinguen visualmente una de otra en toda la interfaz (cabecera, fichas, botones del admin) para evitar errores al registrar acciones en la aventura equivocada.

### 4.1 `aventuras/<id>/aventura.json` y `tablero.json`

```json
// aventura.json
{
  "id": "zerbitzuak",
  "nombre": "Zerbitzuak",
  "tema": "Reino de las torres y los servidores",
  "descripcion": "Texto de presentación de la aventura.",
  "mapa": { "archivo": "img/mapa/zerbitzuak.svg", "ancho": 1600, "alto": 1000, "camino_id": "camino-principal" },
  "regiones": [
    { "id": "region-aldea", "nombre": "Aldea inicial", "desbloqueo": "inicio" },
    { "id": "region-castillo", "nombre": "El Castillo", "desbloqueo": "c10" }
  ]
}

// tablero.json
{
  "casillas": [
    { "id": "c01", "nombre": "Aldea inicial", "x": 8.5, "y": 82, "tipo": "inicio",
      "siguientes": ["c02"], "descripcion": "Aquí empieza la aventura.", "region": "region-aldea" },
    { "id": "c03", "nombre": "Cruce de caminos", "x": 26, "y": 58, "tipo": "bifurcacion",
      "siguientes": ["c04a", "c04b"] },
    { "id": "c10", "nombre": "El Castillo", "x": 92, "y": 12, "tipo": "meta", "siguientes": [] }
  ]
}
```

- Coordenadas `x`,`y` en **porcentaje** del mapa (responsive) y **en el mismo sistema que el `viewBox` del SVG**.
- Cada aventura tiene **su propio tablero, número de casillas y recorrido**.
- **Tipos de casilla** (configurables): `inicio`, `normal`, `hito`, `evento` (aleatorio), `tienda`, `recompensa`, `penalizacion`, `descanso`, `jefe` (entrega grande), `secreta`, `bifurcacion`, `meta`.
- Cada casilla puede tener `efecto_al_llegar` (dar objeto, aplicar estado, robar carta) que el admin **propone** al llegar el grupo y el profesor confirma (nunca se aplica solo).

### 4.2 `grupos.json` (compartido por defecto)

```json
{
  "grupos": [
    {
      "id": "g1",
      "nombre": "Los Divs Errantes",
      "lema": "Todo cabe en un contenedor",
      "color": "#e63946",
      "foto_grupo": "img/fichas/g1-foto.webp",
      "ficha": {
        "forma": "escudo",
        "marco": "dorado",
        "color_borde": "#e63946",
        "grosor_borde": 6,
        "encuadre": { "zoom": 1.15, "x": 0.0, "y": -0.05 },
        "insignias_visibles": ["nivel", "puntos"],
        "etiqueta": "Los Divs Errantes"
      },
      "activo": true,
      "aventuras": ["zerbitzuak", "sareak"],
      "miembros": [
        { "id": "g1-a1", "alias": "Ada", "nombre_visible": "Ada", "foto": "img/avatares/g1-a1.webp",
          "cometido": { "zerbitzuak": "Responsable de despliegue", "sareak": "Responsable de direccionamiento" },
          "clase": "Arquitecto", "activo": true }
      ]
    }
  ]
}
```

- Los grupos y alumnos son **globales**, pero el **cometido puede ser distinto en cada aventura** (campo por aventura).
- Si los grupos fueran distintos en cada asignatura, el campo `aventuras` del grupo indica en cuáles participa (**preguntar en Fase 0**).
- `nombre_visible` y `foto` son **opcionales**; los datos sensibles van a `privado/`.
- **Clases/roles RPG** editables, con bonificación narrativa o de atributo.

### 4.3 `catalogo.json` (con ámbito por aventura)

```json
{
  "objetos": [
    { "id": "o-espada-valid", "nombre": "Espada del Validador", "icono": "img/objetos/espada.svg",
      "rareza": "raro", "tipo": "arma", "ambito": "zerbitzuak",
      "descripcion": "...", "efecto": { "puntos": 5 }, "consumible": false },
    { "id": "o-llave-maestra", "nombre": "Llave maestra", "ambito": "ambas",
      "descripcion": "Útil en cualquiera de las dos aventuras.", "consumible": true }
  ],
  "estados": [
    { "id": "e-niebla", "nombre": "Niebla del Retraso", "tipo": "downgrade", "ambito": "ambas",
      "efecto": { "puntos": -3 }, "duracion_entregas": 1 }
  ],
  "hitos": [], "logros": [], "cartas": [],
  "rarezas": ["comun", "poco_comun", "raro", "epico", "legendario"]
}
```

- `ambito`: `"zerbitzuak"`, `"sareak"` o `"ambas"`. Un objeto de ámbito `ambas` puede viajar entre aventuras; uno de ámbito concreto, no.
- **Logros transversales** (ej.: "Doble aventurero": completar un hito en ambas aventuras).

### 4.4 Eventos (append-only, uno por aventura)

```json
{
  "id": 142,
  "fecha": "2026-11-05T10:32:00+01:00",
  "aventura": "zerbitzuak",
  "grupo": "g1",
  "miembro": null,
  "tipo": "avance",
  "datos": { "desde": "c03", "hasta": "c04a", "motivo": "Entrega 3 aprobada" },
  "puntos": 10,
  "visible_publico": true,
  "referencia": null,
  "hash_anterior": "ab12…",
  "hash": "cd34…"
}
```

**Tipos de evento** (extensibles): `avance`, `retroceso`, `objeto_ganado`, `objeto_usado`, `objeto_perdido`, `estado_aplicado`, `estado_expirado`, `hito`, `logro`, `bonus`, `penalizacion`, `nota_grupo`, `nota_miembro`, `carta_robada`, `monedas`, `xp`, `entrega_cerrada`, `cambio_cometido`, `cambio_miembro`, `ficha_modificada`, `foto_grupo`, `valoracion_grupo`, `inicio_temporada`, `anulacion`, `auditoria`, `comentario`.

- **Eventos que afectan a ambas aventuras** (p. ej. un bonus global o un evento "Semana de la tormenta"): se registran en `eventos_globales.json` y el motor los aplica a las dos aventuras.

### 4.5 Valoraciones y notas (resumen)

Las valoraciones **no son un campo editable**, son **eventos** (principio de la sección 2). Se guardan así:

- **Valoraciones y notas del grupo** (`nota_grupo`): en `aventuras/<id>/eventos.json`, con `visible_publico` true/false según decida el profesor.
- **Valoraciones y notas de cada miembro** (`nota_miembro`): **siempre privadas**, en `data/privado/eventos_privados.json` (con su propia cadena de hashes) y con el campo `aventura`.
- Las rúbricas de cada asignatura viven en `data/privado/rubricas.json`.
- Un archivo de resumen o exportación (CSV/HTML) puede **calcularse** a partir de estos eventos, pero nunca es la fuente de verdad.

### 4.6 Fichas de los grupos (configurables desde el admin)

Cada grupo tiene una **ficha**: la pieza visual que lo representa en el mapa y en su tarjeta. Los alumnos me pasarán la **foto de grupo** y yo la colocaré **en el centro de la ficha** desde el panel de administración. La ficha se compone de capas, todas configurables:

1. **Foto de grupo** (`foto_grupo`) centrada en la ficha, recortada según la `forma`.
2. **Marco** (borde, esquinas, adorno) con el color del grupo.
3. **Forma:** escudo, círculo, hexágono, peón o carta (lista ampliable).
4. **Insignias** superpuestas (nivel, puntos, estados activos, objeto equipado), activables y desactivables.
5. **Etiqueta** con el nombre del grupo.
6. Tamaño reducido para el mapa y tamaño grande para la tarjeta del grupo, generados a partir de la misma configuración.

Reglas:

- La ficha se dibuja con **SVG/CSS** a partir de `ficha` en `grupos.json`; no hay imagen de ficha prefabricada, solo la foto del grupo.
- Si un grupo aún no tiene foto, la ficha muestra un **marcador provisional** (iniciales o silueta) con el color del grupo.
- Cambiar la foto o la configuración de una ficha **no borra nada**: se guarda la nueva versión, se conserva la anterior en `img/fichas/historial/` y se registra un evento global `ficha_modificada` con valor anterior y nuevo.
- La ficha se ve **igual en todas las aventuras** (es la identidad del grupo), aunque cada aventura puede aplicar un adorno de marco propio según su tema (opcional).

### 4.7 Historial de valoraciones por grupo y por miembro

**Cada grupo y cada miembro tienen un historial propio y completo** de todo lo que reciben: valoraciones, notas, comentarios, puntos, bonus, penalizaciones, objetos, estados, hitos y logros. Se construye siempre a partir de los eventos, por orden cronológico y **separado por aventura** (con filtro "todas").

**Historial del grupo**
- Cada entrada indica fecha, aventura, entrega asociada, tipo, valor, comentario y si es pública.
- Muestra **evolución**: gráfica sencilla en SVG de la nota/puntos a lo largo de las entregas y **media actual**.
- Incluye la **valoración general** vigente (la última) y todas las anteriores, no solo la última.

**Historial de cada miembro**
- Todas las valoraciones individuales por entrega y rúbrica (aportación, puntualidad, calidad técnica, trabajo en equipo, etc.), con comentario y fecha.
- Nota media por criterio y global, tendencia (sube, baja, estable) y comparación opcional con la media del grupo.
- Siempre privado: solo visible en `admin.html` y en los informes que yo genere.

**Reglas**
- Las valoraciones **no se editan ni se borran**: una corrección es una **nueva valoración** que sustituye a la anterior como "vigente", y la antigua queda visible en el historial marcada como "corregida".
- La **nota vigente** de cada entrega es la última no anulada; el historial siempre muestra todas.
- Cada valoración puede llevar **adjuntos de texto** (comentario, enlace a la entrega), pero no ficheros binarios en el repositorio público.

---

## 5. MOTOR DE ESTADO (`motor.js`)

Función pura `calcularEstado(aventuraId, eventos, eventosGlobales, catalogo, tablero)` que devuelve por grupo, **para esa aventura**:

- posición actual y camino recorrido,
- puntos totales, XP, nivel, monedas,
- inventario (objetos ganados − usados/perdidos),
- estados activos (con entregas restantes),
- hitos y logros desbloqueados,
- historial completo (incluido el de valoraciones y notas del grupo),
- ranking de la aventura.

Y una función `calcularResumenGlobal(...)` que combina ambas aventuras (XP global, nivel global del grupo, logros transversales, ranking combinado) si `economia_compartida` lo permite.

Reglas:

- Ignorar los eventos anulados (pero mostrarlos tachados en la línea temporal).
- Los estados con duración se descuentan por **entrega de esa aventura** (`entrega_cerrada`), no por fecha.
- Código sin efectos secundarios, **comentado y con tests** (`tests/motor.test.js`, ejecutable con `node --test`), incluyendo tests de que **una aventura no contamina a la otra**.

---

## 6. WEB PÚBLICA (`index.html`)

### 6.1 Navegación entre aventuras

- **Selector de aventura** siempre visible (pestañas o conmutador grande) con el nombre y color de acento de cada una. Persistir la elección en la URL (`#zerbitzuak`, `#sareak`) para poder compartir enlaces directos.
- Una vista **"Resumen"** opcional con las dos aventuras lado a lado: posición de cada grupo en cada mapa, nivel global y logros transversales.

### 6.2 Vista Mapa (principal de cada aventura)

- El mapa es un **SVG** cargado desde `aventura.json` (ver sección 10). Encima, la capa de casillas clicables y las **fichas** de los 6 grupos.
- **Fichas:** se dibujan según la configuración de cada grupo (`ficha` en `grupos.json`, ver 4.6): forma, marco, color y **foto de grupo en el centro**. Si varias fichas coinciden en una casilla, se **disponen en abanico** sin solaparse.
- **Animación** de movimiento siguiendo el camino casilla a casilla (SVG `getPointAtLength` o CSS `offset-path`), respetando `prefers-reduced-motion`.
- Clic en una casilla: panel con nombre, tipo, descripción, quién ha pasado y qué ocurrió.
- Clic en una ficha: ficha completa del grupo en esa aventura.
- **Niebla de guerra opcional:** las regiones futuras aparecen ocultas hasta que algún grupo llega; las casillas `secretas` solo se revelan al descubrirlas.
- Zoom y arrastre en móvil; botón de "centrar en mi grupo".
- Maquetación general de la página con **CSS Grid** (cabecera, mapa, panel lateral, pie), con áreas reordenadas en móvil.

### 6.3 Otras vistas (todas filtradas por la aventura activa)

- **Grupos:** tarjeta de cada grupo con su ficha grande, lema, miembros con cometido y clase **en esa aventura**, puntos, nivel, inventario, estados activos y valoración general vigente, más su **historial público** (solo las valoraciones y notas marcadas como públicas; las individuales nunca aparecen).
- **Inventario y catálogo:** objetos con rareza (bloqueados = silueta "???").
- **Logros e hitos:** vitrina con los desbloqueados y los ocultos, incluidos los transversales.
- **Línea temporal:** diario de aventura con todos los eventos públicos, filtrable por grupo y tipo, con textos narrativos.
- **Ranking:** por aventura y combinado. **Opcional** y desactivable en `config.json`.
- **Tablón de avisos** del profesor (eventos tipo `comentario`).

### 6.4 Requisitos no funcionales

- Carga rápida: sin librerías pesadas, SVG ligeros, `loading="lazy"` en imágenes.
- **Responsive** (móvil primero), accesible (contraste, teclado, `aria-label`, textos alternativos, no depender solo del color), modo oscuro.
- **Interfaz preparada para varios idiomas** (castellano y euskera como mínimo): todos los textos de la interfaz en `i18n/es.json` y `i18n/eu.json`, con selector de idioma (**confirmar en Fase 0**).
- Sin JavaScript ni CDNs de terceros (autocontenida y duradera).
- Si falla la carga de un JSON o del SVG, mostrar mensaje claro, no pantalla en blanco; el mapa provisional actúa de respaldo.

---

## 7. PANEL ADMIN (`admin.html` + `admin.js`)

### 7.1 Servidor local (`admin.js`)

- Node.js **sin dependencias** (solo módulos nativos: `http`, `fs`, `path`, `crypto`).
- Escucha **solo en `127.0.0.1`**. Genera un **token aleatorio al arrancar** que el admin usa en cada petición (evita que otra web abierta en el navegador escriba en tus archivos).
- Sirve `index.html` y `admin.html` y expone una API mínima:
  - `GET /api/datos` → todos los JSON de todas las aventuras
  - `POST /api/evento` → **añade** un evento a la aventura indicada (valida, encadena hash, hace backup)
  - `POST /api/entidad` → crea/modifica grupos, alumnos, objetos, casillas (genera evento de auditoría)
  - `POST /api/imagen` → recibe la imagen ya **recortada y reducida por el navegador** (con `<canvas>`, convertida a WebP) y la guarda; conserva el original en `data/privado/fotos_reales/` y la versión anterior en `img/fichas/historial/`
  - `POST /api/mapa` → sube/sustituye el SVG de una aventura (con backup del anterior y validación del contrato de la sección 10)
  - `GET /api/verificar` → comprueba todas las cadenas de hashes
  - `POST /api/exportar` → genera ZIP/JSON de respaldo e informes
- **No existe ningún endpoint DELETE ni de edición de eventos.**
- Botón/atajo para `git add . && git commit -m "…"` y `git push` desde el panel (opcional; pedir confirmación).

### 7.2 Selector de aventura en el admin

- **Aventura activa** seleccionable en la cabecera, con el **color de acento** de esa aventura en toda la interfaz y el nombre bien visible en cada formulario ("Registrando en: **Zerbitzuak**").
- Toda acción de puntos, avance, objetos, estados y notas se registra **en la aventura activa**.
- Acciones **"en ambas aventuras"** disponibles explícitamente (con confirmación y resumen), que generan eventos globales.
- Vista **"Panel comparado"** con los 6 grupos y su estado en las dos aventuras a la vez.

### 7.3 Módulos del panel

1. **Panel de control:** los 6 grupos, su casilla, puntos, estados y última acción en la aventura activa, con acciones rápidas.
2. **Grupos y alumnos:** crear/editar grupo (nombre, lema, color), añadir/editar miembros (alias, nombre, foto opcional, cometido **por aventura**, clase). Archivar en vez de borrar. Los cambios quedan registrados.
3. **Editor de fichas** (para cada grupo):
    - **Subir la foto de grupo** que me pasen los alumnos (arrastrar y soltar o seleccionar archivo).
    - **Encuadrarla** con un editor visual: zoom, desplazamiento y rotación dentro de la forma de la ficha, con **vista previa en vivo** (tamaño mapa y tamaño tarjeta).
    - Elegir **forma, marco, color y grosor del borde, insignias visibles y etiqueta**.
    - **Vista previa sobre el mapa** de cada aventura para ver cómo queda la ficha junto a las demás.
    - **Restaurar una versión anterior** de la foto o de la configuración desde el historial de la ficha.
    - Aplicar una configuración **a todos los grupos a la vez** (p. ej. misma forma y marco, cambiando solo color y foto).
    - Aviso si la foto es de baja resolución o poco nítida.
4. **Avance en el mapa:** elegir grupo → casilla destino (alcanzables o cualquiera con confirmación) → motivo/entrega → opcionalmente aplicar el efecto de la casilla. Soporta retroceso.
5. **Puntuación y economía:** puntos, XP y monedas, con motivo obligatorio.
6. **Objetos:** crear en el catálogo (icono, rareza, efecto, **ámbito**) y **otorgar/retirar/consumir** a un grupo o miembro.
7. **Upgrades y downgrades (estados):** plantillas y aplicación a un grupo con duración en entregas.
8. **Bonus y penalizaciones rápidas:** botones configurables ("Entrega puntual +3", "Entrega tardía −2"…) para registrar en 2 clics.
9. **Hitos y logros:** crear, otorgar manualmente y definir condiciones sugeridas que el admin confirma, incluidos logros transversales.
10. **Cartas y eventos aleatorios:** mazo configurable por aventura; botón "robar carta" con resultado propuesto.
11. **Notas, valoraciones e historial (por aventura):**
    - **Valorar al grupo**: valoración general con nota o puntuación, comentario, entrega asociada y marca de pública/privada.
    - **Valorar a cada miembro**: valoración individual (siempre privada) con la **rúbrica** de la asignatura y comentario.
    - **Valoración rápida por lotes**: evaluar a los 5 miembros de un grupo en una sola pantalla.
    - **Ficha de historial del grupo** y **ficha de historial de cada miembro** (ver 4.7): todas las valoraciones y notas por fecha y entrega, con medias, gráfica de evolución y tendencia.
    - **Corregir una valoración** = añadir una nueva que pasa a ser la vigente; la anterior queda visible como "corregida".
    - Filtros por aventura, entrega, criterio y rango de fechas.
12. **Entregas (por aventura):** calendario (nombre, fecha límite, criterios, casilla asociada, puntos máximos) y estado por grupo (pendiente, entregada, revisada, aprobada, repetir).
13. **Editor del tablero:** arrastrar casillas sobre el mapa de la aventura activa, conectarlas, cambiar tipo y nombre, con previsualización en vivo.
14. **Gestión de mapas:** subir/sustituir el SVG de cada aventura, validar que cumple el contrato y previsualizar con las casillas encima.
15. **Línea temporal y auditoría:** todo, incluidos eventos anulados; botón "anular".
16. **Verificación e informes:** integridad, boletín por grupo/alumno (HTML imprimible/PDF, **por asignatura o combinado**), CSV de notas.
17. **Configuración:** títulos, colores, aventuras, idiomas, ranking, niebla de guerra, reglas, temporada.
18. **"Corregir último movimiento":** crea la anulación + nuevo evento en un paso.

### 7.4 UX del admin

- Todo en **pocos clics** (uso en clase, con prisa).
- Confirmación antes de acciones importantes y **resumen de lo que se va a registrar, incluyendo la aventura**.
- Atajos de teclado y búsqueda global.
- Feedback claro al guardar o fallar.

---

## 8. IDEAS DE GAMIFICACIÓN (RPG contenido)

Implementa de forma **modular y activable/desactivable** desde `config.json`.

1. **Puntos, XP y niveles:** curva suave; título por nivel (Aprendiz, Artesano, Maestro…). Nivel por aventura y **nivel global** del grupo.
2. **Atributos del grupo** (4-5, opcionales): Calidad, Creatividad, Puntualidad, Colaboración, Documentación.
3. **Monedas y tienda:** objetos útiles (prórroga, pista, comodín, repetir entrega), gestionados por el profesor.
4. **Objetos con rareza** y tipos (arma, armadura, poción, mapa, llave, reliquia), consumibles y permanentes.
5. **Comodines/amuletos:** "Pergamino de prórroga", "Llave maestra", "Escudo contra penalización".
6. **Estados temporales:** buffs/debuffs con duración en entregas.
7. **Casillas especiales:** hito, evento, tienda, descanso, jefe, secreta, atajo, trampa (siempre con confirmación del profesor).
8. **Jefes finales por bloque** con "vida" que baja según la calidad del trabajo.
9. **Misiones secundarias (side quests):** retos opcionales con recompensa.
10. **Cartas de evento**, positivas, negativas y neutras, con texto narrativo.
11. **Logros ocultos** descubribles.
12. **Rachas** de entregas puntuales.
13. **Alianzas** (opcional): revisión cruzada entre grupos que beneficia a ambos.
14. **Eventos globales:** "Semana de la tormenta" que afecta a todos los grupos y/o a ambas aventuras.
15. **Temporadas:** al cerrar curso se archiva todo (ambas aventuras) en `temporadas/AAAA-AA/` y se reinicia conservando el histórico.
16. **Crónica narrativa:** textos épicos opcionales en los eventos.
17. **Hall de la fama** con campeones de temporadas anteriores.
18. **Sonidos opcionales** (desactivados por defecto).
19. **Recompensa por mejora** respecto a la entrega anterior.
20. **Anti-frustración:** "viento a favor" opcional para el grupo más rezagado.
21. **Conexión entre las dos aventuras:** objetos de ámbito `ambas` que viajan de una a otra, logros transversales ("Doble aventurero", "Maestro de redes y servicios"), nivel global, y un **jefe final conjunto** opcional que requiere haber llegado a la meta en ambas.
22. **Identidad temática distinta por aventura** (paleta, iconografía, narrativa y vocabulario propios), p. ej. una de torres/servidores y otra de rutas/puertos/redes. Los temas son una propuesta inicial; el profesor decide.

> Principio de diseño: lo lúdico **acompaña** a la evaluación, no la sustituye. La nota académica real debe poder calcularse y justificarse aparte con la rúbrica de cada asignatura; los puntos del juego son un refuerzo.

---

## 9. ALMACENAMIENTO Y COPIAS (documentar en el README)

**Fuente de verdad: JSON en Git.** Alternativas consideradas:

| Opción | Cuándo tendría sentido |
|---|---|
| **JSON + Git (elegida)** | Un único administrador, sin servidor, gratis, historial completo |
| Repositorio **privado aparte** para `data/privado/` | Versionar notas individuales sin publicarlas |
| Supabase / Firebase | Si algún día los alumnos tuvieran que escribir o entrar con login |
| API de GitHub desde el navegador | Edición sin servidor local, pero exige guardar un token (riesgo) |
| localStorage | **Descartada** como almacén principal |

**Estrategia de copias (regla 3-2-1):**
- 3 copias: tu equipo, GitHub y un respaldo externo.
- `backups/` automáticos por cada escritura.
- Etiquetas de Git (`git tag`) al cerrar cada trimestre y al cerrar cada aventura.
- **Proteger la rama `main`** (sin force-push ni borrado de historial).
- `node admin.js --backup` genera un ZIP fechado con todo.
- Documentar cómo **restaurar** a una versión anterior, **de una sola aventura o de todo el proyecto**.

**Privacidad (decisión del profesor: gestionada por él):**
- Estructura preparada para separar lo público de lo privado (`data/privado/` en `.gitignore`).
- Fotos reales y notas individuales **nunca** se publican salvo orden explícita; por defecto, alias/avatar.
- Documentar que lo subido con `push` a un repo público **queda en el historial de Git** aunque luego se borre.

---

## 10. MAPAS SVG (uno por aventura)

### 10.1 Enfoque

Cada aventura tiene su **mapa en SVG**, **generado por código** (sin imágenes externas), con estilo ilustrado y limpio. **El mapa definitivo de cada aventura se desarrolla al final (Fase 9)**; durante el desarrollo se usa un **mapa provisional** que respeta el mismo contrato, por lo que sustituirlo no obliga a tocar nada más.

### 10.2 Contrato que debe cumplir cualquier mapa SVG (provisional o definitivo)

1. Un único archivo `img/mapa/<aventura>.svg`, con `viewBox` fijo (p. ej. `0 0 1600 1000`) que coincide con `mapa.ancho` y `mapa.alto` de `aventura.json`.
2. El **camino principal** es un `<path id="camino-principal">`. Los caminos alternativos (bifurcaciones) llevan ids propios (`camino-alt-1`…), referenciados en `aventura.json`.
3. Cada **región** del mapa es un grupo `<g id="region-...">` con el mismo id declarado en `aventura.json` (para niebla de guerra, iluminarla o desbloquearla por progreso).
4. Las **decoraciones** repetidas (árboles, montañas, casas, torres, olas) usan `<symbol>` + `<use>` para mantener el peso bajo.
5. Los **colores** van como variables CSS (`var(--mapa-tierra)`, `var(--mapa-agua)`, etc.) para tener modo claro/oscuro y distinguir una aventura de otra con la misma estructura.
6. **Sin texto incrustado** (los nombres de lugares los pone la web, para poder traducirlos).
7. **Sin imágenes raster incrustadas**, salvo que el profesor lo apruebe.
8. Peso objetivo: **menos de 150 KB**. Filtros SVG (`feTurbulence`, sombras) con moderación para no penalizar rendimiento en móvil.
9. Las **casillas, el camino y las fichas comparten sistema de coordenadas** con el `viewBox`, de modo que no hay desajustes entre dibujo y datos.
10. Accesible: `<title>` y `<desc>` descriptivos y `role="img"`.

### 10.3 Mapa provisional (durante el desarrollo)

- Fondo plano o degradado, un camino curvo, regiones representadas por zonas de color y etiquetas simples. Un provisional **por aventura**, con paleta distinta.
- Suficiente para probar movimiento de fichas, niebla de guerra, clics y editor de tablero.

### 10.4 Mapas definitivos (Fase 9)

- Generados por Claude Code con terreno orgánico (curvas Bézier), texturas de pergamino, sombras y detalles temáticos propios de cada aventura, y pequeños elementos animados (olas, nubes, humo, banderas) respetando `prefers-reduced-motion`.
- Se ofrecerán **dos o tres propuestas de estilo** por aventura para que el profesor elija antes de pulir.
- Opción híbrida si se quiere un acabado más pictórico: fondo raster (p. ej. generado con IA) **bajo** una capa SVG con camino, casillas y efectos; el contrato de arriba sigue aplicándose a la capa SVG.

### 10.5 Resto del diseño visual

- Estética "mapa de aventuras" cálida (pergamino, madera, dorado), legible y sin saturar.
- **Variables CSS** para colores, tipografías y espaciados, con un **tema por aventura**.
- Fichas: SVG con forma de escudo/peón + marco + foto del grupo recortada, color tomado de `grupos.json`.
- Iconos de objetos: SVG propios o recursos con licencia compatible (game-icons.net, Kenney); mantener un `CREDITOS.md`.

---

## 11. PLAN DE TRABAJO POR FASES

Trabaja por fases, **mostrándome el resultado y esperando mi visto bueno antes de seguir**. Al final de cada fase haz `commit` con mensaje claro.

**Fase 0 · Preguntas previas.** Antes de escribir código, pregúntame lo imprescindible que falte, en especial:
- escritura exacta del nombre de cada asignatura (Zerbitzuak y Sareak) y su temática;
- si **los 6 grupos y sus alumnos son los mismos** en ambas asignaturas;
- idioma de la interfaz (castellano, euskera o ambos);
- nº aproximado de casillas y de entregas en cada aventura;
- bifurcaciones sí/no;
- si hay **economía compartida** (XP/monedas globales) o completamente separada;
- rúbrica de valoración de cada asignatura;
- si quiero ranking público.

**Fase 1 · Esqueleto y datos.** Estructura multi-aventura, JSON de ejemplo realistas (6 grupos, 2 aventuras con ~20-30 casillas cada una, 15 objetos, 10 estados, 20 eventos por aventura), JSON Schema, README.

**Fase 2 · Motor + web pública mínima.** `motor.js` con tests (incluido aislamiento entre aventuras); selector de aventura, mapa SVG provisional por aventura, 6 fichas dibujadas desde su configuración (con marcador provisional hasta tener foto), animación, panel de grupo. Funciona con un servidor estático.

**Fase 3 · `admin.js` + admin básico.** Servidor local seguro, selector de aventura activa, añadir eventos (avance, puntos, objeto, estado), backups, cadenas de hashes, verificación.

**Fase 4 · Gestión completa.** Grupos y alumnos, **editor de fichas con subida y encuadre de la foto de grupo**, catálogo con ámbitos, hitos, logros, entregas por aventura, **valoraciones y notas con historial por grupo y por miembro**, rúbricas (privadas), anulaciones, panel comparado.

**Fase 5 · Editor visual del tablero.** Arrastrar casillas sobre el mapa de cada aventura, conexiones, tipos, gestión de mapas SVG y validación del contrato.

**Fase 6 · Gamificación avanzada.** Tienda, cartas, jefes, side quests, rachas, temporadas, niebla de guerra, conexión entre aventuras (logros transversales, nivel global, jefe conjunto).

**Fase 7 · Pulido.** Accesibilidad, rendimiento, móvil, i18n, informes/boletines, CSV, modo oscuro, sonidos opcionales.

**Fase 8 · Despliegue.** Guía paso a paso de GitHub Pages, protección de rama, flujo diario (editar → verificar → commit → push) y plan de copias.

**Fase 9 · Mapas SVG definitivos.** Con todo lo anterior funcionando, crear los dos mapas definitivos según la sección 10.4, sustituir los provisionales y recolocar las casillas con el editor.

---

## 12. CRITERIOS DE ACEPTACIÓN

- [ ] `index.html` en GitHub Pages permite cambiar entre las dos aventuras y muestra en cada una su mapa con las 6 fichas en la posición calculada desde sus eventos.
- [ ] **Registrar algo en una aventura no altera nunca la otra** (comprobado con tests).
- [ ] Desde `admin.html` puedo avanzar un grupo, dar un objeto, aplicar un estado y anotar una nota en la aventura activa, y todo queda como **evento nuevo**.
- [ ] El admin deja siempre claro **en qué aventura** se va a registrar cada acción.
- [ ] **No existe** forma, desde la interfaz ni la API, de borrar o modificar un evento existente.
- [ ] Un cambio manual en un evento antiguo es detectado por la verificación de hashes (en cada cadena).
- [ ] Cada escritura genera backup y es atómica.
- [ ] Desde el admin subo la foto de un grupo, la encuadro en el centro de su ficha, configuro forma/marco/color y la ficha se ve igual en el mapa de las dos aventuras.
- [ ] Cambiar la foto o la configuración de una ficha conserva la versión anterior y puedo restaurarla.
- [ ] Cada grupo y cada miembro tienen un **historial completo** de valoraciones y notas, por fecha y entrega, con medias y gráfica de evolución.
- [ ] Corregir una valoración añade una nueva y conserva la anterior como "corregida".
- [ ] Las notas individuales **no** aparecen en la web pública ni en el repositorio publicado.
- [ ] Puedo corregir un error con una anulación y el historial lo conserva.
- [ ] Sustituir el mapa provisional por el definitivo solo requiere cambiar el archivo SVG (y recolocar casillas con el editor si hace falta).
- [ ] Añadir una tercera aventura se hace creando su carpeta y registrándola en `config.json`, sin modificar el código.
- [ ] Funciona bien en móvil y con teclado.
- [ ] Sin dependencias externas en runtime; `node admin.js` funciona solo con Node instalado.
- [ ] README explica instalación, flujo diario, backup y restauración en lenguaje claro.

---

## 13. REGLAS DE TRABAJO PARA CLAUDE CODE

1. Código **claro, comentado en español** y con nombres descriptivos; pensado para que un docente pueda leerlo y mantenerlo.
2. Nada de frameworks ni bundlers. Si propones una dependencia, justifícala y pídeme permiso.
3. **Nunca** implementes borrado o edición destructiva de eventos.
4. Antes de cualquier cambio grande en los datos, haz backup.
5. **Nada de código específico de una asignatura**: todo lo que diferencie Zerbitzuak de Sareak debe estar en datos.
6. Si algo del diseño es ambiguo, **pregunta** en lugar de suponer.
7. Tras cada fase: resume qué has hecho, cómo probarlo y qué falta.
8. Mantén `CLAUDE.md` y `README.md` actualizados con las decisiones tomadas.
9. Propón mejoras al final de cada fase, pero **no las implementes sin que yo las apruebe**.

---

**Empieza por la Fase 0: hazme las preguntas que necesites y, cuando te responda, continúa con la Fase 1.**
