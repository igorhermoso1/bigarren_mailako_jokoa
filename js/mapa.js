// Dibujo del mapa: fondo de la aventura, casillas, camino (opcional) y fichas de los grupos.
(function () {
  const PASO_MS = 550; // tiempo entre casilla y casilla al animar
  const sinAnimacion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  const crear = (etiqueta, clase, atributos = {}) => {
    const el = document.createElement(etiqueta);
    if (clase) el.className = clase;
    for (const [k, v] of Object.entries(atributos)) el.setAttribute(k, v);
    return el;
  };

  // Reduce una imagen (o un recorte de ella) a `lado` píxeles por pasos de la mitad y con suavizado alto.
  // Encoger de golpe 5 o 15 veces (marco de 330 px o foto de 512 px a una ficha de 40 px) la deja borrosa
  // y dentada; así queda nítida. El resultado se guarda en memoria para no repetirlo.
  const cacheNitido = new Map();
  function nitido(src, recorte, lado) {
    lado = Math.max(1, Math.round(lado));
    const clave = `${src}|${recorte ? Object.values(recorte).join(',') : ''}|${lado}`;
    if (!cacheNitido.has(clave)) {
      cacheNitido.set(clave, new Promise((ok, mal) => {
        const img = new Image();
        img.onload = () => {
          try {
            const r = recorte || { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
            const escala = Math.min(1, lado / Math.min(r.w, r.h));
            const finW = Math.max(1, Math.round(r.w * escala)), finH = Math.max(1, Math.round(r.h * escala));
            const lienzoDe = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
            let w = Math.round(r.w), h = Math.round(r.h), c = lienzoDe(w, h);
            c.getContext('2d').drawImage(img, r.x, r.y, r.w, r.h, 0, 0, w, h);
            const paso = (nw, nh) => {
              const n = lienzoDe(nw, nh), x = n.getContext('2d');
              x.imageSmoothingQuality = 'high';
              x.drawImage(c, 0, 0, nw, nh);
              c = n; w = nw; h = nh;
            };
            while (w / 2 > finW) paso(Math.round(w / 2), Math.round(h / 2));
            paso(finW, finH);
            ok(c.toDataURL('image/png'));
          } catch (e) { mal(e); }
        };
        img.onerror = mal;
        img.src = src;
      }));
    }
    return cacheNitido.get(clave);
  }

  // Ficha de un grupo: foto (o iniciales) en el centro y el marco del sprite encima.
  // El tamaño lo marca la variable CSS --t del contenedor. Cuando la ficha ya tiene tamaño en pantalla,
  // marco y foto se preparan exactamente a esos píxeles (por la densidad de la pantalla), así se ven nítidos.
  function crearFicha(grupo, config) {
    const ficha = crear('span', 'ficha');
    ficha.style.setProperty('--color', grupo.color);

    const foto = crear('span', 'ficha-foto');
    const { zoom = 1, x = 0, y = 0 } = grupo.ficha?.encuadre || {};
    let imgFoto = null;
    if (grupo.foto_grupo) {
      imgFoto = crear('img', '', { alt: '', decoding: 'async' });
      imgFoto.style.transform = `translate(${x * 100}%, ${y * 100}%) scale(${zoom})`;
      foto.append(imgFoto);
    } else {
      foto.textContent = grupo.nombre.split(/s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase();
    }

    const marco = crear('span', 'ficha-marco');
    const m = config.marcos.find(mm => mm.id === grupo.ficha?.marco);
    const s = config.marcos_sprite;
    let imgMarco = null;
    if (m) {
      // Mientras se prepara la versión nítida se ve el sprite tal cual.
      marco.style.backgroundImage = `url(${s.archivo})`;
      marco.style.backgroundSize = `calc(var(--t) * ${s.ancho / m.d}) calc(var(--t) * ${s.alto / m.d})`;
      marco.style.backgroundPosition = `calc(var(--t) * ${-(m.cx - m.d / 2) / m.d}) calc(var(--t) * ${-(m.cy - m.d / 2) / m.d})`;
    }
    ficha.append(foto, marco);

    let ladoActual = 0;
    const preparar = ancho => {
      const lado = Math.round(ancho * (devicePixelRatio || 1));
      if (!lado || lado === ladoActual) return;
      ladoActual = lado;
      if (m) nitido(s.archivo, { x: m.cx - m.d / 2, y: m.cy - m.d / 2, w: m.d, h: m.d }, lado).then(url => {
        if (!imgMarco) {
          imgMarco = crear('img', 'ficha-marco-img', { alt: '' });
          imgMarco.onload = () => { marco.style.backgroundImage = 'none'; };
          marco.append(imgMarco);
        }
        imgMarco.src = url;
      }, () => { /* se queda el sprite */ });
      // La foto ocupa el 56 % de la ficha y se amplía con el zoom del encuadre.
      if (imgFoto) nitido(grupo.foto_grupo, null, lado * .56 * Math.max(1, zoom)).then(url => { imgFoto.src = url; }, () => { imgFoto.src = grupo.foto_grupo; });
    };
    ficha._preparar = preparar; // el zoom del mapa la vuelve a preparar a su tamaño ampliado
    // Se rehace si cambia el tamaño en pantalla; y una primera vez en cuanto la ficha está en la página.
    new ResizeObserver(([entrada]) => preparar(entrada.contentRect.width)).observe(ficha);
    const primeraVez = (intentos = 20) => ficha.offsetWidth ? preparar(ficha.offsetWidth) : intentos && setTimeout(() => primeraVez(intentos - 1), 100);
    setTimeout(primeraVez, 0);
    return ficha;
  }

  // Camino casilla a casilla entre dos casillas (búsqueda en anchura por "siguientes").
  // Si no hay camino hacia delante (p. ej. un retroceso), se salta directamente.
  function ruta(tablero, desde, hasta) {
    const previo = { [desde]: null };
    const cola = [desde];
    while (cola.length) {
      const id = cola.shift();
      if (id === hasta) break;
      const c = tablero.casillas.find(cc => cc.id === id);
      for (const s of (c ? c.siguientes : [])) if (!(s in previo)) { previo[s] = id; cola.push(s); }
    }
    if (!(hasta in previo)) return [hasta];
    const pasos = [];
    for (let id = hasta; id !== null; id = previo[id]) pasos.unshift(id);
    return pasos;
  }

  // Desplazamientos en abanico para que las fichas de una misma casilla no se tapen.
  function abanico(n, i) {
    if (n === 1) return [0, 0];
    const fila = Math.floor(i / 3), enFila = Math.min(3, n - fila * 3), col = i % 3;
    return [(col - (enFila - 1) / 2) * 0.8, -fila * 0.75];
  }

  function dibujar(contenedor, { aventura, tablero, estado, grupos, config }, al) {
    contenedor.innerHTML = '';
    const { mapa } = aventura;
    const lienzo = crear('div', 'lienzo');
    // Mapas muy cargados: los nombres solo salen al pulsar una zona; las peanas brillan con el color de su zona.
    lienzo.classList.toggle('cartelas-al-pulsar', !!mapa.cartelas_al_pulsar);
    lienzo.style.setProperty('--aspecto', mapa.ancho / mapa.alto);

    const fondo = crear('img', 'fondo', { src: mapa.archivo, alt: aventura.tema || aventura.nombre });
    fondo.onerror = () => lienzo.prepend(Object.assign(crear('p', 'aviso-error'), { textContent: 'Ezin izan da maparen irudia kargatu.' }));
    lienzo.append(fondo);

    // Solo las casillas activas, numeradas en el orden del recorrido.
    const orden = Motor.ordenCasillas(tablero);
    const casilla = id => orden.find(c => c.id === id);
    if (mapa.dibujar_camino) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 100 100');
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.setAttribute('class', 'camino');
      svg.setAttribute('aria-hidden', 'true');
      for (const c of orden) {
        for (const s of c.siguientes) {
          const d = casilla(s);
          if (!d) continue;
          const linea = document.createElementNS(svg.namespaceURI, 'line');
          Object.entries({ x1: c.x, y1: c.y, x2: d.x, y2: d.y, 'vector-effect': 'non-scaling-stroke' }).forEach(([k, v]) => linea.setAttribute(k, v));
          svg.append(linea);
        }
      }
      lienzo.append(svg);
    }

    // Rastro de energía: tramos del camino que algún grupo ya ha recorrido, con luz que fluye.
    const pisadasRastro = new Set(Object.values(estado.grupos).flatMap(g => g.camino));
    const tramos = orden.flatMap(c => c.siguientes.filter(sg => pisadasRastro.has(c.id) && pisadasRastro.has(sg) && casilla(sg)).map(sg => [c, casilla(sg)]));
    if (tramos.length) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      Object.entries({ viewBox: '0 0 100 100', preserveAspectRatio: 'none', class: 'rastro', 'aria-hidden': 'true' }).forEach(([k, v]) => svg.setAttribute(k, v));
      for (const [a, z] of tramos) {
        for (const clase of ['rastro-halo', 'rastro-nucleo']) {
          const l = document.createElementNS(svg.namespaceURI, 'line');
          Object.entries({ x1: a.x, y1: a.y, x2: z.x, y2: z.y, class: clase, 'vector-effect': 'non-scaling-stroke' }).forEach(([k, v]) => l.setAttribute(k, v));
          svg.append(l);
        }
      }
      lienzo.append(svg);
    }

    // Casillas: medallón con su número de orden y cartela con el nombre.
    // Brillan las que algún grupo ya ha pisado; las ocupadas llevan un anillo rúnico.
    const pisadas = new Set(Object.values(estado.grupos).flatMap(g => g.camino));
    const ocupadas = new Set(grupos.grupos.filter(g => g.activo).map(g => estado.grupos[g.id].posicion));
    orden.forEach((c, i) => {
      const tipo = config.tipos_casilla[c.tipo] || c.tipo;
      const b = crear('button', 'casilla', { type: 'button', 'data-tipo': c.tipo, 'data-id': c.id, 'aria-label': `${i + 1}. ${c.nombre} (${tipo})` });
      b.append(crear('span', 'num'), crear('span', 'cartela', { 'aria-hidden': 'true' }));
      b.firstChild.textContent = c.tipo === 'meta' ? '⚑' : i + 1;
      b.lastChild.textContent = c.nombre;
      // Estilo de región elegido por el profesor (bosque, hielo, ciudad…); sin él, color tomado del mapa.
      const estilo = (config.estilos_cartela || []).find(e => e.id === c.estiloa);
      if (estilo) Object.assign(b.lastChild.dataset, { estiloa: estilo.id, ikonoa: estilo.ikonoa || '' });
      b.classList.toggle('pisada', pisadas.has(c.id));
      b.classList.toggle('ocupada', ocupadas.has(c.id));
      b.style.setProperty('--i', i); // desfase de las animaciones para que no vayan todas a la vez
      b.style.left = c.x + '%';
      b.style.top = c.y + '%';
      b.onclick = ev => { ev.stopPropagation(); window.Fx?.estallido(b); al.casilla(c, b); };
      lienzo.append(b);
    });

    // Fichas: se colocan donde las vio este navegador la última vez y caminan hasta su posición actual.
    const clave = 'posiciones-vistas:' + aventura.id;
    let vistas = {};
    try { vistas = JSON.parse(localStorage.getItem(clave)) || {}; } catch { /* sin almacenamiento: no pasa nada */ }

    const activos = grupos.grupos.filter(g => g.activo);
    const porCasilla = {};
    for (const g of activos) (porCasilla[estado.grupos[g.id].posicion] ||= []).push(g.id);

    for (const g of activos) {
      const e = estado.grupos[g.id];
      const ocupantes = porCasilla[e.posicion];
      const [dx, dy] = abanico(ocupantes.length, ocupantes.indexOf(g.id));
      const b = crear('button', 'ficha-mapa', { type: 'button', 'data-grupo': g.id, 'data-nombre': g.nombre, 'aria-label': `${g.nombre}: ${casilla(e.posicion)?.nombre || e.posicion}` });
      b.style.setProperty('--dx', dx);
      b.style.setProperty('--color', g.color); // aura del color del grupo bajo la ficha
      b.style.setProperty('--dy', dy);
      b.append(crearFicha(g, config));
      b.onclick = ev => { ev.stopPropagation(); window.Fx?.estallido(b); al.ficha(g.id, b); };
      lienzo.append(b);

      const colocar = id => { const c = casilla(id); if (c) { b.style.left = c.x + '%'; b.style.top = c.y + '%'; } };
      const desde = casilla(vistas[g.id]) ? vistas[g.id] : e.camino[0];
      const pasos = sinAnimacion() || desde === e.posicion ? [e.posicion] : ruta(tablero, desde, e.posicion);
      colocar(pasos[0]);
      pasos.slice(1).forEach((id, i) => setTimeout(() => colocar(id), 300 + i * PASO_MS));
      // Al llegar a la casilla nueva: onda, columna de luz y chispas del color del grupo.
      if (pasos.length > 1) setTimeout(() => window.Fx?.llegada(b, g.color), 300 + (pasos.length - 2) * PASO_MS + 520);
      vistas[g.id] = e.posicion;
    }
    try { localStorage.setItem(clave, JSON.stringify(vistas)); } catch { /* idem */ }

    // Celebración: si algún grupo ha llegado a la meta, estandarte de victoria y fuegos artificiales.
    const metas = orden.filter(c => c.tipo === 'meta').map(c => c.id);
    const campeones = activos.filter(g => metas.includes(estado.grupos[g.id].posicion));
    if (campeones.length) {
      const banda = crear('div', 'garaipena', { role: 'status' });
      banda.innerHTML = '<span class="g-koroa" aria-hidden="true">🏆</span><span class="g-testua"></span>';
      banda.querySelector('.g-testua').textContent = `HELMUGA! ${campeones.map(g => g.nombre).join(' · ')}`;
      lienzo.append(banda);
      const meta = () => lienzo.querySelector(`.casilla[data-id="${CSS.escape(estado.grupos[campeones[0].id].posicion)}"]`);
      const fiesta = () => { if (!lienzo.isConnected) return; window.Fx?.fuegos(meta(), 3); setTimeout(fiesta, 3200); };
      setTimeout(fiesta, 1200);
    }

    contenedor.append(lienzo);
    // Cuando la imagen del mapa está lista: color de cada cartela según su zona y reparto sin solapes.
    const preparar = () => { teñirCartelas(lienzo, fondo, orden); repartirCartelas(lienzo); };
    fondo.complete && fondo.naturalWidth ? preparar() : fondo.addEventListener('load', preparar, { once: true });
    new ResizeObserver(() => repartirCartelas(lienzo)).observe(lienzo);
    window.Fx?.iniciar(lienzo);
    habilitarZoom(contenedor, lienzo);
  }

  // ---------- Zoom y arrastre ----------
  // Rueda del ratón o pellizco para acercar (hasta x4), arrastrar para moverse, doble clic para acercar,
  // y botones ＋ − ⟲. El mapa se transforma con translate+scale; nada se recoloca ni se repinta.
  const ZOOM_MAX = 4;
  function habilitarZoom(contenedor, lienzo) {
    let s = 1, x = 0, y = 0, arrastrado = false, nitidez = null;
    const punteros = new Map();
    const limitar = () => {
      const w = lienzo.offsetWidth, h = lienzo.offsetHeight;
      s = Math.min(ZOOM_MAX, Math.max(1, s));
      x = Math.min(0, Math.max(w - w * s, x));
      y = Math.min(0, Math.max(h - h * s, y));
    };
    const aplicar = () => {
      limitar();
      lienzo.style.transform = s === 1 ? '' : `translate(${x}px, ${y}px) scale(${s})`;
      lienzo.classList.toggle('ampliado', s > 1);
      dispatchEvent(new Event('mapa-mugitu'));
      // Al terminar de hacer zoom, las fichas se vuelven a preparar a su tamaño ampliado (siguen nítidas).
      clearTimeout(nitidez);
      nitidez = setTimeout(() => lienzo.querySelectorAll('.ficha').forEach(f => f._preparar?.(f.offsetWidth * s)), 250);
    };
    // Acerca o aleja manteniendo quieto el punto de la pantalla (cx, cy).
    const zoomEn = (cx, cy, factor) => {
      const r = lienzo.getBoundingClientRect();
      const baseX = r.left - x, baseY = r.top - y;
      const ux = (cx - r.left) / s, uy = (cy - r.top) / s;
      s = Math.min(ZOOM_MAX, Math.max(1, s * factor));
      x = cx - baseX - ux * s;
      y = cy - baseY - uy * s;
      aplicar();
    };
    const centroPantalla = () => { const r = contenedor.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };

    lienzo.addEventListener('wheel', e => { e.preventDefault(); zoomEn(e.clientX, e.clientY, Math.exp(-e.deltaY * .0015)); }, { passive: false });
    lienzo.addEventListener('dblclick', e => { if (!e.target.closest('.casilla, .ficha-mapa')) zoomEn(e.clientX, e.clientY, 2); });
    lienzo.addEventListener('pointerdown', e => {
      punteros.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY });
      arrastrado = false;
    });
    lienzo.addEventListener('pointermove', e => {
      const p = punteros.get(e.pointerId);
      if (!p) return;
      if (punteros.size === 2) { // pellizco: zoom según cambia la distancia entre los dos dedos
        const [a, b] = [...punteros.values()];
        const antes = Math.hypot(a.x - b.x, a.y - b.y);
        p.x = e.clientX; p.y = e.clientY;
        const ahora = Math.hypot(a.x - b.x, a.y - b.y);
        if (antes > 0) zoomEn((a.x + b.x) / 2, (a.y + b.y) / 2, ahora / antes);
        arrastrado = true;
        return;
      }
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > 6) arrastrado = true;
      if (s > 1 && arrastrado) {
        if (!lienzo.hasPointerCapture(e.pointerId)) lienzo.setPointerCapture(e.pointerId);
        x += dx; y += dy; aplicar();
      }
    });
    const soltar = e => punteros.delete(e.pointerId);
    lienzo.addEventListener('pointerup', soltar);
    lienzo.addEventListener('pointercancel', soltar);
    // Si se ha arrastrado, el clic final no abre ninguna ventana.
    lienzo.addEventListener('click', e => { if (arrastrado) { e.stopPropagation(); e.preventDefault(); arrastrado = false; } }, true);

    const botones = crear('div', 'zoom-kontrolak');
    botones.innerHTML = '<button type="button" class="m-boton" aria-label="Hurbildu">＋</button><button type="button" class="m-boton" aria-label="Urrundu">−</button><button type="button" class="m-boton" aria-label="Mapa osoa">⟲</button>';
    const [mas, menos, todo] = botones.children;
    mas.onclick = e => { e.stopPropagation(); zoomEn(...centroPantalla(), 1.5); };
    menos.onclick = e => { e.stopPropagation(); zoomEn(...centroPantalla(), 1 / 1.5); };
    todo.onclick = e => { e.stopPropagation(); s = 1; x = 0; y = 0; aplicar(); };
    contenedor.append(botones);

    // Centra un elemento del mapa (si está ampliado).
    lienzo._enfocar = el => {
      if (s === 1) return;
      const r = el.getBoundingClientRect(), c = contenedor.getBoundingClientRect();
      x += (c.left + c.width / 2) - (r.left + r.width / 2);
      y += (c.top + c.height / 2) - (r.top + r.height / 2);
      aplicar();
    };
  }
  const enfocar = el => el?.closest('.lienzo')?._enfocar?.(el);

  // Toma el color medio del mapa alrededor de cada casilla (sin el propio punto) y lo usa como tono
  // de su cartela: así cada cartela combina con el diorama en el que está (bosque, lava, hielo…).
  function teñirCartelas(lienzo, fondo, orden) {
    try {
      const ancho = 240, alto = Math.round(ancho * fondo.naturalHeight / fondo.naturalWidth);
      const lienzo2d = Object.assign(document.createElement('canvas'), { width: ancho, height: alto }).getContext('2d', { willReadFrequently: true });
      lienzo2d.drawImage(fondo, 0, 0, ancho, alto);
      for (const c of orden) {
        const cx = c.x / 100 * ancho, cy = c.y / 100 * alto, radio = ancho * 0.035;
        let r = 0, g = 0, b = 0, n = 0;
        for (let a = 0; a < 16; a++) { // anillo de 16 muestras alrededor de la casilla
          const px = Math.round(cx + Math.cos(a / 16 * 2 * Math.PI) * radio), py = Math.round(cy + Math.sin(a / 16 * 2 * Math.PI) * radio);
          if (px < 0 || py < 0 || px >= ancho || py >= alto) continue;
          const d = lienzo2d.getImageData(px, py, 1, 1).data;
          r += d[0]; g += d[1]; b += d[2]; n++;
        }
        if (!n) continue;
        const [h, s] = rgbAHsl(r / n, g / n, b / n);
        const boton = lienzo.querySelector(`.casilla[data-id="${CSS.escape(c.id)}"]`);
        boton?.style.setProperty('--argia', Math.round(h)); // brillo de la peana: siempre el color de la zona
        if (boton?.querySelector('.cartela[data-estiloa]')) continue;
        boton?.style.setProperty('--tono', Math.round(h));
        boton?.style.setProperty('--sat', Math.round(Math.max(45, Math.min(90, s * 1.3))) + '%');
      }
    } catch { /* si no se puede leer la imagen, las cartelas se quedan con el color dorado por defecto */ }
  }
  function rgbAHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
    if (!d) return [40, 0, l * 100];
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [(h * 60 + 360) % 360, s * 100, l * 100];
  }

  // Coloca cada cartela arriba, abajo, a la derecha o a la izquierda de su medallón, eligiendo
  // el primer sitio que no pise otra cartela ni otro medallón. Si un grupo está en la casilla,
  // se prueba primero abajo, porque arriba están las fichas.
  // Los rectángulos se calculan a partir de las medidas de maquetación (no de la pantalla), así las
  // animaciones de flotar o de aparecer no falsean el cálculo.
  // Cuatro lados y cuatro diagonales (la cartela arranca en el medallón y se alarga hacia un lado).
  const SITIOS = ['arriba', 'abajo', 'derecha', 'izquierda', 'arriba-der', 'arriba-izq', 'abajo-der', 'abajo-izq'];
  const MARGEN = 4; // holgura para el vaivén de la animación
  const HUECO = 6; // separación entre medallón y cartela (la misma que en web.css)
  function rectCartela(sitio, cx, cy, d, w, h) {
    const r = d / 2 + HUECO;
    const [x, y] = {
      arriba: [cx - w / 2, cy - r - h], abajo: [cx - w / 2, cy + r], derecha: [cx + r, cy - h / 2], izquierda: [cx - r - w, cy - h / 2],
      'arriba-der': [cx - d / 2, cy - r - h], 'arriba-izq': [cx + d / 2 - w, cy - r - h], 'abajo-der': [cx - d / 2, cy + r], 'abajo-izq': [cx + d / 2 - w, cy + r],
    }[sitio];
    return { left: x, top: y, right: x + w, bottom: y + h };
  }
  function repartirCartelas(lienzo) {
    const botones = [...lienzo.querySelectorAll('.casilla')];
    if (!botones.length || !lienzo.isConnected) return;
    const area = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left) + MARGEN) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) + MARGEN);
    const datos = botones.map(b => ({ b, cx: b.offsetLeft, cy: b.offsetTop, d: b.offsetWidth }));
    const medallones = datos.map(({ cx, cy, d }) => ({ left: cx - d / 2, top: cy - d / 2, right: cx + d / 2, bottom: cy + d / 2 }));
    const ancho = lienzo.clientWidth, alto = lienzo.clientHeight;
    const puestas = [];
    for (const [i, { b, cx, cy, d }] of datos.entries()) {
      const cartela = b.querySelector('.cartela');
      const w = cartela.offsetWidth, h = cartela.offsetHeight;
      const orden = b.classList.contains('ocupada') ? ['abajo', 'abajo-der', 'abajo-izq', 'derecha', 'izquierda', 'arriba', 'arriba-der', 'arriba-izq'] : SITIOS;
      let mejor = null;
      for (const sitio of orden) {
        const r = rectCartela(sitio, cx, cy, d, w, h);
        const fuera = (r.left < 0 || r.top < 0 || r.right > ancho || r.bottom > alto) ? w * h : 0; // que no se salga del mapa
        const solape = fuera + [...puestas, ...medallones.filter((_, j) => j !== i)].reduce((t, o) => t + area(r, o), 0);
        if (!mejor || solape < mejor.solape) mejor = { sitio, solape, r };
        if (!solape) break;
      }
      cartela.dataset.sitio = mejor.sitio;
      puestas.push(mejor.r);
    }
  }

  window.Mapa = { dibujar, crearFicha, enfocar };
})();
