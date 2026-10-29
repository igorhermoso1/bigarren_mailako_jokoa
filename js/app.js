// Arranque de la web pública: carga los datos, calcula el estado y pinta mapa, paneles y egunkaria.
(function () {
  const TIPOS_EVENTO = {
    avance: 'Aurrerapena', retroceso: 'Atzerapena', objeto_ganado: 'Objektua lortua', objeto_usado: 'Objektua erabilia',
    objeto_perdido: 'Objektua galdua', estado_aplicado: 'Egoera ezarria', estado_expirado: 'Egoera amaitua',
    hito: 'Mugarria', logro: 'Lorpena', bonus: 'Bonusa', penalizacion: 'Zigorra', nota_grupo: 'Taldearen nota',
    entrega_cerrada: 'Entrega itxia', comentario: 'Oharra', anulacion: 'Baliogabetzea',
  };

  const $ = id => document.getElementById(id);
  const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cargar = async ruta => {
    const r = await fetch(ruta, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`${ruta} (${r.status})`);
    return r.json();
  };

  const comun = {};      // config, grupos, catálogo y eventos globales
  const cache = {};      // datos de cada aventura ya cargada
  let actual = null;     // { aventura, tablero, entregas, eventos, estado }

  const publico = ev => ev.visible_publico !== false;
  const buscar = (lista, id) => (lista || []).find(x => x.id === id);
  const nombreCasilla = id => buscar(actual.tablero.casillas, id)?.nombre || id;
  const grupo = id => buscar(comun.grupos.grupos, id);
  // A mano: muchos navegadores no traen los nombres de los meses en euskera.
  const MESES = ['urt.', 'ots.', 'mar.', 'api.', 'mai.', 'eka.', 'uzt.', 'abu.', 'ira.', 'urr.', 'aza.', 'abe.'];
  const fecha = f => { const d = new Date(f); return `${d.getFullYear()} ${MESES[d.getMonth()]} ${d.getDate()}`; };
  const conSigno = n => (n > 0 ? '+' : '') + n;

  // Texto breve de un evento para el egunkaria y los historiales.
  function describir(ev) {
    const d = ev.datos || {};
    const cat = comun.catalogo;
    const motivo = d.motivo ? ` · ${d.motivo}` : '';
    switch (ev.tipo) {
      case 'avance': case 'retroceso': return `${nombreCasilla(d.desde)} → ${nombreCasilla(d.hasta)}${motivo}`;
      case 'objeto_ganado': case 'objeto_usado': case 'objeto_perdido': return (buscar(cat.objetos, d.objeto)?.nombre || d.objeto) + motivo;
      case 'estado_aplicado': return `${buscar(cat.estados, d.estado)?.nombre || d.estado} (${d.duracion_entregas ?? '?'} entrega)`;
      case 'estado_expirado': return buscar(cat.estados, d.estado)?.nombre || d.estado;
      case 'hito': return buscar(cat.hitos, d.hito)?.nombre || d.hito;
      case 'logro': return buscar(cat.logros, d.logro)?.nombre || d.logro;
      case 'nota_grupo': return `${buscar(actual.entregas.entregas, d.entrega)?.nombre || d.entrega}: ${d.nota}${d.comentario ? ' · ' + d.comentario : ''}`;
      case 'entrega_cerrada': return buscar(actual.entregas.entregas, d.entrega)?.nombre || d.entrega;
      case 'comentario': return d.texto;
      case 'anulacion': return `#${ev.referencia} gertaera baliogabetua${motivo}`;
      default: return motivo.slice(3);
    }
  }

  function filaEvento(ev, conGrupo = true) {
    const g = conGrupo && ev.grupo ? grupo(ev.grupo) : null;
    const pts = ev.puntos ? `<span class="puntos ${ev.puntos < 0 ? 'neg' : ''}">${conSigno(ev.puntos)}</span>` : '';
    const tachado = ev.anulado ? ' class="anulado" title="Baliogabetua"' : '';
    return `<li${tachado}><time datetime="${esc(ev.fecha)}">${fecha(ev.fecha)}</time>
      <span class="tipo">${esc(TIPOS_EVENTO[ev.tipo] || ev.tipo)}</span>
      ${g ? `<strong style="--color:${esc(g.color)}" class="nombre-grupo">${esc(g.nombre)}</strong>` : ''}
      <span>${esc(describir(ev))}</span>${pts}${ev.anulado ? '<span class="sr">(baliogabetua)</span>' : ''}</li>`;
  }

  const lista = (titulo, items) => `<h3>${titulo}</h3>` + (items.length ? `<ul>${items.join('')}</ul>` : '<p class="vacio">—</p>');

  // Resumen de un grupo: se usa en las tarjetas y en el panel lateral.
  function resumenGrupo(g, completo) {
    const e = actual.estado.grupos[g.id];
    const cat = comun.catalogo;
    const objetos = Object.entries(e.inventario).map(([id, n]) => {
      const o = buscar(cat.objetos, id) || { nombre: id };
      const r = buscar(cat.rarezas, o.rareza);
      return `<li><span class="rareza" style="--color:${esc(r?.color || '#888')}">${esc(r?.nombre || '')}</span> ${esc(o.nombre)}${n > 1 ? ' ×' + n : ''}</li>`;
    });
    const estados = e.estados.map(s => {
      const p = buscar(cat.estados, s.id) || { nombre: s.id };
      return `<li class="${p.tipo === 'downgrade' ? 'malo' : 'bueno'}">${p.tipo === 'downgrade' ? '▼' : '▲'} ${esc(p.nombre)} <small>(${s.restantes} entrega falta)</small></li>`;
    });
    let html = `<p class="lema">${esc(g.lema)}</p>
      <dl class="datos">
        <dt>Maila</dt><dd>${esc(e.nivel.titulo)}</dd>
        <dt>Puntuak</dt><dd>${e.puntos}</dd>
        <dt>Kokapena</dt><dd>${esc(nombreCasilla(e.posicion))}</dd>
      </dl>
      ${lista('Inbentarioa', objetos)}${lista('Egoerak', estados)}`;
    if (!completo) return html;

    const kideak = g.miembros.filter(m => m.activo).map(m =>
      `<li><strong>${esc(m.alias)}</strong> — ${esc(m.cometido?.[actual.aventura.id] || '')}${m.clase ? ` · <em>${esc(m.clase)}</em>` : ''}</li>`);
    const nombres = (ids, l) => ids.map(id => `<li>${esc(buscar(l, id)?.nombre || id)}</li>`);
    const notas = Object.values(e.notas).filter(publico).map(ev => `<li>${esc(describir(ev))}</li>`);
    const historial = e.historial.filter(publico).slice().reverse().map(ev => filaEvento(ev, false));
    html += lista('Kideak', kideak) + lista('Mugarriak', nombres(e.hitos, cat.hitos)) +
      lista('Lorpenak', nombres(e.logros, cat.logros)) + lista('Notak', notas) +
      `<h3>Historia</h3><ol class="lista-eventos">${historial.join('') || '<li class="vacio">—</li>'}</ol>`;
    return html;
  }

  function mostrarGrupo(id) {
    const g = grupo(id);
    const panel = $('panel');
    panel.innerHTML = `<div class="cabecera-grupo"></div><h2>${esc(g.nombre)}</h2>` + resumenGrupo(g, true);
    panel.querySelector('.cabecera-grupo').append(Mapa.crearFicha(g, comun.config));
    panel.focus();
  }

  function mostrarCasilla(c) {
    const aqui = comun.grupos.grupos.filter(g => g.activo && actual.estado.grupos[g.id].posicion === c.id);
    const pasaron = comun.grupos.grupos.filter(g => actual.estado.grupos[g.id].camino.includes(c.id));
    const sucesos = actual.estado.eventos.filter(ev => publico(ev) && ev.datos?.hasta === c.id);
    const nombresG = gs => gs.map(g => `<li>${esc(g.nombre)}</li>`);
    $('panel').innerHTML = `<h2>${esc(c.nombre)}</h2>
      <p class="etiqueta-tipo">${esc(comun.config.tipos_casilla[c.tipo] || c.tipo)}</p>
      ${c.descripcion ? `<p>${esc(c.descripcion)}</p>` : ''}
      ${lista('Hemen daude', nombresG(aqui))}${lista('Hemendik igaro dira', nombresG(pasaron))}
      <h3>Gertaerak</h3><ol class="lista-eventos">${sucesos.map(ev => filaEvento(ev)).join('') || '<li class="vacio">—</li>'}</ol>`;
    $('panel').focus();
  }

  function pintarTarjetas() {
    const cont = $('tarjetas');
    cont.innerHTML = '';
    for (const g of comun.grupos.grupos.filter(gg => gg.activo)) {
      const art = document.createElement('article');
      art.className = 'tarjeta';
      art.style.setProperty('--color', g.color);
      art.innerHTML = `<div class="tarjeta-ficha"></div><h3>${esc(g.nombre)}</h3>${resumenGrupo(g, false)}
        <button type="button" class="boton">Mapan ikusi</button>`;
      art.querySelector('.tarjeta-ficha').append(Mapa.crearFicha(g, comun.config));
      art.querySelector('button').onclick = () => {
        const ficha = document.querySelector(`.ficha-mapa[data-grupo="${g.id}"]`);
        ficha?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center', inline: 'center' });
        mostrarGrupo(g.id);
      };
      cont.append(art);
    }
  }

  function pintarEgunkaria() {
    const fg = $('filtro-grupo').value, ft = $('filtro-tipo').value;
    const evs = actual.estado.eventos.filter(ev => publico(ev) && (!fg || ev.grupo === fg) && (!ft || ev.tipo === ft));
    $('lista-eventos').innerHTML = evs.slice().reverse().map(ev => filaEvento(ev)).join('') || '<li class="vacio">Oraindik ez da ezer gertatu.</li>';
  }

  function prepararFiltros() {
    $('filtro-grupo').innerHTML = '<option value="">Talde guztiak</option>' +
      comun.grupos.grupos.map(g => `<option value="${esc(g.id)}">${esc(g.nombre)}</option>`).join('');
    $('filtro-tipo').innerHTML = '<option value="">Mota guztiak</option>' +
      Object.entries(TIPOS_EVENTO).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
    $('filtro-grupo').onchange = $('filtro-tipo').onchange = pintarEgunkaria;
  }

  async function abrirAventura(id) {
    const base = `data/publico/aventuras/${id}/`;
    if (!cache[id]) {
      const [aventura, tablero, entregas, eventos] = await Promise.all(
        ['aventura', 'tablero', 'entregas', 'eventos'].map(n => cargar(base + n + '.json')));
      cache[id] = { aventura, tablero, entregas, eventos };
    }
    const d = cache[id];
    const estado = Motor.calcularEstado(id, d.eventos, comun.globales, comun.catalogo, d.tablero, comun.grupos, comun.config);
    actual = { ...d, estado };

    const info = buscar(comun.config.aventuras, id);
    document.documentElement.style.setProperty('--acento', info.color_acento);
    document.title = `${info.nombre} · ${comun.config.titulo}`;
    document.querySelectorAll('#pestanas a').forEach(a => a.toggleAttribute('aria-current', a.hash === '#' + id));
    $('descripcion').textContent = d.aventura.descripcion || '';
    $('panel').innerHTML = '<p>Sakatu talde bat edo lauki bat xehetasunak ikusteko.</p>';

    Mapa.dibujar($('mapa'), { ...actual, grupos: comun.grupos, config: comun.config }, { casilla: mostrarCasilla, ficha: mostrarGrupo });
    pintarTarjetas();
    pintarEgunkaria();
  }

  function mostrarError(err) {
    console.error(err);
    $('contenido').innerHTML = `<p class="aviso-error" role="alert">Ezin izan dira datuak kargatu. Saiatu berriro geroago.<br><small>${esc(err.message)}</small></p>`;
  }

  async function iniciar() {
    try {
      [comun.config, comun.grupos, comun.catalogo, comun.globales] = await Promise.all(
        ['config', 'grupos', 'catalogo', 'eventos_globales'].map(n => cargar(`data/publico/${n}.json`)));
    } catch (err) { return mostrarError(err); }

    $('titulo').textContent = comun.config.titulo;
    $('panel').tabIndex = -1;
    const aventuras = comun.config.aventuras.filter(a => a.activa);
    $('pestanas').innerHTML = aventuras.map(a =>
      `<a href="#${esc(a.id)}" style="--acento:${esc(a.color_acento)}">${esc(a.nombre)}</a>`).join('');
    prepararFiltros();

    const irA = () => {
      const id = location.hash.slice(1);
      abrirAventura(aventuras.some(a => a.id === id) ? id : aventuras[0].id).catch(mostrarError);
    };
    addEventListener('hashchange', irA);
    irA();
  }

  iniciar();
})();
