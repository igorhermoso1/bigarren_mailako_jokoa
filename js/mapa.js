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

  // Ficha de un grupo: foto (o iniciales) en el centro y el marco del sprite encima.
  // El tamaño lo marca la variable CSS --t del contenedor, así sirve para el mapa y para las tarjetas.
  function crearFicha(grupo, config) {
    const ficha = crear('span', 'ficha');
    ficha.style.setProperty('--color', grupo.color);

    const foto = crear('span', 'ficha-foto');
    if (grupo.foto_grupo) {
      const { zoom = 1, x = 0, y = 0 } = grupo.ficha.encuadre || {};
      const img = crear('img', '', { src: grupo.foto_grupo, alt: '', loading: 'lazy' });
      img.style.transform = `translate(${x * 100}%, ${y * 100}%) scale(${zoom})`;
      foto.append(img);
    } else {
      foto.textContent = grupo.nombre.split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase();
    }

    const marco = crear('span', 'ficha-marco');
    const m = config.marcos.find(mm => mm.id === grupo.ficha.marco);
    if (m) {
      const s = config.marcos_sprite;
      marco.style.backgroundImage = `url(${s.archivo})`;
      marco.style.backgroundSize = `calc(var(--t) * ${s.ancho / m.d}) calc(var(--t) * ${s.alto / m.d})`;
      marco.style.backgroundPosition = `calc(var(--t) * ${-(m.cx - m.d / 2) / m.d}) calc(var(--t) * ${-(m.cy - m.d / 2) / m.d})`;
    }
    ficha.append(foto, marco);
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
      b.style.setProperty('--dy', dy);
      b.append(crearFicha(g, config));
      b.onclick = ev => { ev.stopPropagation(); window.Fx?.estallido(b); al.ficha(g.id, b); };
      lienzo.append(b);

      const colocar = id => { const c = casilla(id); if (c) { b.style.left = c.x + '%'; b.style.top = c.y + '%'; } };
      const desde = casilla(vistas[g.id]) ? vistas[g.id] : e.camino[0];
      const pasos = sinAnimacion() || desde === e.posicion ? [e.posicion] : ruta(tablero, desde, e.posicion);
      colocar(pasos[0]);
      pasos.slice(1).forEach((id, i) => setTimeout(() => colocar(id), 300 + i * PASO_MS));
      vistas[g.id] = e.posicion;
    }
    try { localStorage.setItem(clave, JSON.stringify(vistas)); } catch { /* idem */ }

    contenedor.append(lienzo);
    // Cuando la imagen del mapa está lista: color de cada cartela según su zona y reparto sin solapes.
    const preparar = () => { teñirCartelas(lienzo, fondo, orden); repartirCartelas(lienzo); };
    fondo.complete && fondo.naturalWidth ? preparar() : fondo.addEventListener('load', preparar, { once: true });
    new ResizeObserver(() => repartirCartelas(lienzo)).observe(lienzo);
    window.Fx?.iniciar(lienzo);
  }

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
  const SITIOS = ['arriba', 'abajo', 'derecha', 'izquierda'];
  const HUECO = 6; // separación entre medallón y cartela (la misma que en web.css)
  function rectCartela(sitio, cx, cy, d, w, h) {
    const r = d / 2 + HUECO;
    const [x, y] = { arriba: [cx - w / 2, cy - r - h], abajo: [cx - w / 2, cy + r], derecha: [cx + r, cy - h / 2], izquierda: [cx - r - w, cy - h / 2] }[sitio];
    return { left: x, top: y, right: x + w, bottom: y + h };
  }
  function repartirCartelas(lienzo) {
    const botones = [...lienzo.querySelectorAll('.casilla')];
    if (!botones.length || !lienzo.isConnected) return;
    const area = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    const datos = botones.map(b => ({ b, cx: b.offsetLeft, cy: b.offsetTop, d: b.offsetWidth }));
    const medallones = datos.map(({ cx, cy, d }) => ({ left: cx - d / 2, top: cy - d / 2, right: cx + d / 2, bottom: cy + d / 2 }));
    const ancho = lienzo.clientWidth, alto = lienzo.clientHeight;
    const puestas = [];
    for (const [i, { b, cx, cy, d }] of datos.entries()) {
      const cartela = b.querySelector('.cartela');
      const w = cartela.offsetWidth, h = cartela.offsetHeight;
      const orden = b.classList.contains('ocupada') ? ['abajo', 'derecha', 'izquierda', 'arriba'] : SITIOS;
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

  window.Mapa = { dibujar, crearFicha };
})();
