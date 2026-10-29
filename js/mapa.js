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

    const casilla = id => tablero.casillas.find(c => c.id === id);
    if (mapa.dibujar_camino) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 100 100');
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.setAttribute('class', 'camino');
      svg.setAttribute('aria-hidden', 'true');
      for (const c of tablero.casillas) {
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

    // Casillas: medallón con su número de orden; brillan las que algún grupo ya ha pisado.
    const pisadas = new Set(Object.values(estado.grupos).flatMap(g => g.camino));
    tablero.casillas.forEach((c, i) => {
      const tipo = config.tipos_casilla[c.tipo] || c.tipo;
      const b = crear('button', 'casilla', { type: 'button', 'data-tipo': c.tipo, 'data-nombre': c.nombre, 'aria-label': `${i + 1}. ${c.nombre} (${tipo})` });
      b.textContent = c.tipo === 'meta' ? '⚑' : i + 1;
      b.classList.toggle('pisada', pisadas.has(c.id));
      b.style.left = c.x + '%';
      b.style.top = c.y + '%';
      b.onclick = ev => { ev.stopPropagation(); al.casilla(c, b); };
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
      b.onclick = ev => { ev.stopPropagation(); al.ficha(g.id, b); };
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
  }

  window.Mapa = { dibujar, crearFicha };
})();
