// Arranque de la web pública: carga los datos, calcula el estado y pinta mapa, barra lateral y ventanas emergentes.
(function () {
  const TIPOS_EVENTO = {
    avance: 'Aurrerapena', retroceso: 'Atzerapena', objeto_ganado: 'Objektua lortua', objeto_usado: 'Objektua erabilia',
    objeto_perdido: 'Objektua galdua', estado_aplicado: 'Egoera ezarria', estado_expirado: 'Egoera amaitua',
    hito: 'Mugarria', logro: 'Lorpena', bonus: 'Bonusa', penalizacion: 'Zigorra', nota_grupo: 'Balorazioa',
    entrega_cerrada: 'Entrega itxia', comentario: 'Oharra', anulacion: 'Baliogabetzea',
  };
  const ICONO_EVENTO = {
    avance: '👣', retroceso: '↩️', objeto_ganado: '🎁', objeto_usado: '✨', objeto_perdido: '💨', estado_aplicado: '🌀',
    estado_expirado: '⌛', hito: '🏰', logro: '🏆', bonus: '⭐', penalizacion: '💀', nota_grupo: '📜',
    entrega_cerrada: '🔒', comentario: '📣', anulacion: '✖️',
  };
  // Icono por defecto de cada tipo de objeto, si el objeto del catálogo no trae el suyo.
  const ICONO_OBJETO = { arma: '⚔️', armadura: '🛡️', pocion: '🧪', mapa: '🗺️', llave: '🗝️', reliquia: '💎' };
  const HUECOS_INVENTARIO = 8;
  const MESES = ['urt.', 'ots.', 'mar.', 'api.', 'mai.', 'eka.', 'uzt.', 'abu.', 'ira.', 'urr.', 'aza.', 'abe.'];

  const $ = id => document.getElementById(id);
  const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cargar = async ruta => {
    const r = await fetch(ruta, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`${ruta} (${r.status})`);
    return r.json();
  };
  const sinAnimacion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  const comun = {};      // config, grupos, catálogo y eventos globales
  const cache = {};      // datos de cada aventura ya cargada
  let actual = null;     // { aventura, tablero, entregas, eventos, estado }

  const publico = ev => ev.visible_publico !== false;
  const buscar = (lista, id) => (lista || []).find(x => x.id === id);
  const casilla = id => buscar(actual.tablero.casillas, id);
  // Número de una casilla = su posición en el recorrido (las archivadas no cuentan).
  const numCasilla = id => actual.orden.findIndex(c => c.id === id) + 1;
  const nombreCasilla = id => casilla(id)?.nombre || id;
  const grupo = id => buscar(comun.grupos.grupos, id);
  const gruposActivos = () => comun.grupos.grupos.filter(g => g.activo);
  // A mano: muchos navegadores no traen los nombres de los meses en euskera.
  const fecha = f => { const d = new Date(f); return `${d.getFullYear()} ${MESES[d.getMonth()]} ${d.getDate()}`; };
  const conSigno = n => (n > 0 ? '+' : '') + n;
  const icono = (valor, defecto) => !valor ? defecto
    : /[./]/.test(valor) ? `<img src="${esc(valor)}" alt="" loading="lazy">` : esc(valor);

  // ---------- Textos de eventos ----------
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
    const pts = ev.puntos ? `<span class="pts ${ev.puntos < 0 ? 'neg' : ''}">${conSigno(ev.puntos)}</span>` : '';
    return `<li class="${ev.anulado ? 'anulado' : ''}">
      <span class="cr-icono" aria-hidden="true">${ICONO_EVENTO[ev.tipo] || '•'}</span>
      <div class="cr-texto">
        <div class="cr-meta"><time datetime="${esc(ev.fecha)}">${fecha(ev.fecha)}</time> · ${esc(TIPOS_EVENTO[ev.tipo] || ev.tipo)}${ev.anulado ? ' · <em>baliogabetua</em>' : ''}</div>
        ${g ? `<strong class="cr-grupo" style="--color:${esc(g.color)}">${esc(g.nombre)}</strong> ` : ''}${esc(describir(ev))}
      </div>${pts}</li>`;
  }
  const cronica = evs => `<ol class="cronica">${evs.map(ev => filaEvento(ev)).join('') || '<li class="vacio">Oraindik ez da ezer gertatu.</li>'}</ol>`;

  // ---------- Piezas visuales ----------
  function barraNivel(puntos) {
    const niveles = comun.config.niveles;
    const i = niveles.findLastIndex(n => puntos >= n.puntos);
    const nivel = niveles[Math.max(i, 0)], sig = niveles[i + 1];
    const pct = sig ? Math.round(100 * (puntos - nivel.puntos) / (sig.puntos - nivel.puntos)) : 100;
    return { numero: Math.max(i, 0) + 1, titulo: nivel.titulo, pct: Math.max(0, Math.min(100, pct)), falta: sig ? sig.puntos - puntos : 0 };
  }
  const htmlBarra = (n, puntos) => `<div class="xp" role="img" aria-label="${n.pct}% hurrengo mailara">
      <div class="xp-relleno" style="width:${n.pct}%"></div><span>${puntos} pt${n.falta ? ` · ${n.falta} falta` : ''}</span></div>`;

  const estrellas = nota => {
    const llenas = Math.round(Number(nota) / 2);
    return `<span class="estrellas" aria-label="${esc(nota)} / 10">${'★'.repeat(llenas)}<span class="apagadas">${'★'.repeat(5 - llenas)}</span></span>`;
  };

  function htmlInventario(inventario) {
    const cat = comun.catalogo;
    const objetos = Object.entries(inventario).map(([id, n]) => {
      const o = buscar(cat.objetos, id) || { nombre: id };
      const r = buscar(cat.rarezas, o.rareza);
      return `<li class="hueco lleno" style="--rareza:${esc(r?.color || '#888')}" tabindex="0"
        title="${esc(o.nombre)} (${esc(r?.nombre || '')})${o.descripcion ? ' — ' + esc(o.descripcion) : ''}">
        <span aria-hidden="true">${icono(o.icono, ICONO_OBJETO[o.tipo] || '❔')}</span>${n > 1 ? `<b>${n}</b>` : ''}
        <span class="sr">${esc(o.nombre)}</span></li>`;
    });
    while (objetos.length < HUECOS_INVENTARIO) objetos.push('<li class="hueco" aria-hidden="true"></li>');
    return `<ul class="inventario">${objetos.join('')}</ul>`;
  }

  function htmlEstados(estados) {
    if (!estados.length) return '<p class="vacio">Egoerarik ez.</p>';
    return `<ul class="pildoras">${estados.map(s => {
      const p = buscar(comun.catalogo.estados, s.id) || { nombre: s.id };
      const malo = p.tipo === 'downgrade';
      return `<li class="${malo ? 'malo' : 'bueno'}" title="${esc(p.descripcion || '')}">${malo ? '▼' : '▲'} ${esc(p.nombre)} <small>${s.restantes}⌛</small></li>`;
    }).join('')}</ul>`;
  }

  function htmlInsignias(ids, lista, iconoDef) {
    if (!ids.length) return '<p class="vacio">Oraindik ez.</p>';
    return `<ul class="insignias">${ids.map(id => {
      const x = buscar(lista, id) || { nombre: id };
      return `<li title="${esc(x.descripcion || '')}"><span aria-hidden="true">${icono(x.icono, iconoDef)}</span>${esc(x.nombre)}</li>`;
    }).join('')}</ul>`;
  }

  const iniciales = t => t.split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase();

  // ---------- Ventana emergente con pestañas ----------
  let emergente = null; // { el, ancla }

  function cerrarEmergente() {
    if (!emergente) return;
    const { el, ancla } = emergente;
    emergente = null;
    el.remove();
    document.querySelectorAll('.seleccionada').forEach(x => x.classList.remove('seleccionada'));
    ancla?.focus({ preventScroll: true });
  }

  // pestanas: [{ etiqueta, html }]; cabecera: nodo o HTML con el encabezado de la ventana.
  function abrirEmergente(ancla, { cabecera, pestanas, clase = '' }) {
    cerrarEmergente();
    const el = document.createElement('div');
    el.className = `emergente pergamino ${clase}`;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-labelledby', 'em-titulo');
    el.innerHTML = `<button type="button" class="cerrar" aria-label="Itxi">✕</button>
      <header class="em-cabecera"></header>
      <div class="em-pestanas" role="tablist">${pestanas.map((p, i) =>
        `<button type="button" role="tab" aria-selected="${i === 0}" data-i="${i}">${p.etiqueta}</button>`).join('')}</div>
      <div class="em-cuerpo" role="tabpanel"></div>`;
    const cab = el.querySelector('.em-cabecera');
    typeof cabecera === 'string' ? (cab.innerHTML = cabecera) : cab.append(cabecera);
    const cuerpo = el.querySelector('.em-cuerpo');
    const tabs = [...el.querySelectorAll('[role=tab]')];
    const elegir = i => {
      tabs.forEach((t, j) => { t.setAttribute('aria-selected', i === j); t.tabIndex = i === j ? 0 : -1; });
      cuerpo.innerHTML = pestanas[i].html;
      cuerpo.scrollTop = 0;
    };
    tabs.forEach((t, i) => {
      t.onclick = () => elegir(i);
      t.onkeydown = e => {
        const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
        if (d) { const j = (i + d + tabs.length) % tabs.length; elegir(j); tabs[j].focus(); }
      };
    });
    el.querySelector('.cerrar').onclick = cerrarEmergente;
    el.addEventListener('click', e => e.stopPropagation());
    elegir(0);

    ancla.classList.add('seleccionada');
    emergente = { el, ancla };
    colocar(el, ancla);
    el.querySelector('.cerrar').focus({ preventScroll: true });
  }

  // Junto al elemento pulsado, dentro del mapa; en pantallas estrechas, como hoja inferior.
  function colocar(el, ancla) {
    const lienzo = ancla.closest('.lienzo');
    el.classList.remove('hoja');
    el.style.cssText = '';
    if (!lienzo || matchMedia('(max-width: 899px)').matches) {
      el.classList.add('hoja');
      document.body.append(el);
      return;
    }
    lienzo.append(el);
    const r = lienzo.getBoundingClientRect(), a = ancla.getBoundingClientRect();
    el.style.maxHeight = (r.height - 16) + 'px';
    const p = el.getBoundingClientRect();
    let left = a.right - r.left + 14;
    if (left + p.width > r.width - 8) left = a.left - r.left - p.width - 14;
    const top = Math.min(Math.max(8, a.top - r.top + a.height / 2 - p.height / 2), r.height - p.height - 8);
    el.style.left = Math.max(8, left) + 'px';
    el.style.top = Math.max(8, top) + 'px';
  }

  // ---------- Ventana de grupo ----------
  function abrirGrupo(gid, ancla) {
    const g = grupo(gid);
    const e = actual.estado.grupos[gid];
    const n = barraNivel(e.puntos);
    const cat = comun.catalogo;
    const cab = document.createElement('div');
    cab.className = 'em-cab-grupo';
    cab.style.setProperty('--color', g.color);
    cab.append(Mapa.crearFicha(g, comun.config));
    cab.insertAdjacentHTML('beforeend', `<div><h2 id="em-titulo">${esc(g.nombre)}</h2><p class="lema">«${esc(g.lema)}»</p>
      <p class="em-nivel"><span class="nivel-num">${n.numero}</span> ${esc(n.titulo)}</p></div>`);

    const superadas = e.camino.length - 1;
    const taldea = `${htmlBarra(n, e.puntos)}
      <dl class="stats">
        <div><dt>Gunea</dt><dd>${numCasilla(e.posicion)}. ${esc(nombreCasilla(e.posicion))}</dd></div>
        <div><dt>Gaindituak</dt><dd>${superadas} / ${actual.orden.length - 1}</dd></div>
      </dl>
      <h3>Inbentarioa</h3>${htmlInventario(e.inventario)}
      <h3>Egoerak</h3>${htmlEstados(e.estados)}
      <h3>Lorpenak eta mugarriak</h3>${htmlInsignias([...e.logros, ...e.hitos], [...cat.logros, ...cat.hitos], '🏆')}`;

    const clases = comun.config.clases || [];
    const kideak = g.miembros.filter(m => m.activo).map(m => {
      const clase = clases.find(c => c.nombre === m.clase);
      const avatar = m.foto ? `<img src="${esc(m.foto)}" alt="" loading="lazy">` : esc(iniciales(m.alias));
      return {
        etiqueta: esc(m.alias),
        html: `<div class="kidea" style="--color:${esc(g.color)}">
            <div class="avatar">${avatar}</div>
            <h3>${esc(m.alias)}</h3>
            ${m.clase ? `<p class="clase"><span aria-hidden="true">${clase ? esc(clase.icono) : '⚜️'}</span> ${esc(m.clase)}</p>` : ''}
          </div>
          <dl class="stats"><div><dt>Zeregina ${esc(actual.aventura.nombre)}-n</dt><dd>${esc(m.cometido?.[actual.aventura.id] || '—')}</dd></div></dl>`,
      };
    });

    const historial = e.historial.filter(publico).slice().reverse();
    abrirEmergente(ancla, {
      clase: 'em-grupo',
      cabecera: cab,
      pestanas: [{ etiqueta: 'Taldea', html: taldea }, ...kideak, { etiqueta: 'Historia', html: cronica(historial) }],
    });
  }

  // ---------- Ventana de zona (casilla = ejercicio) ----------
  function abrirCasilla(c, ancla) {
    const num = numCasilla(c.id);
    const entrega = buscar(actual.entregas.entregas, c.entrega);
    const tipo = comun.config.tipos_casilla[c.tipo] || c.tipo;
    const cab = `<div class="em-cab-zona"><span class="medallon" aria-hidden="true">${c.tipo === 'meta' ? '⚑' : num}</span>
      <div><h2 id="em-titulo">${esc(c.nombre)}</h2>${c.lugar ? `<p class="lema">${esc(c.lugar)}</p>` : ''}<p class="etiqueta">${esc(tipo)}</p></div></div>`;

    // Para cada grupo: si ha superado esta zona (cuándo y con qué motivo), si está aquí, y su valoración.
    const filas = gruposActivos().map(g => {
      const e = actual.estado.grupos[g.id];
      const salida = actual.estado.eventos.find(ev => !ev.anulado && ev.grupo === g.id && ev.tipo === 'avance' && ev.datos?.desde === c.id);
      const nota = c.entrega && e.notas[c.entrega];
      const estado = salida ? ['gainditua', '✔ Gaindituta'] : e.posicion === c.id ? ['hemen', '⚑ Hemen dago'] : ['bidean', '… Oraindik ez'];
      return { g, salida, nota: nota && publico(nota) ? nota : null, estado };
    });
    const superados = filas.filter(f => f.salida).length;
    const ficha = g => { const s = document.createElement('div'); s.append(Mapa.crearFicha(g, comun.config)); return s.innerHTML; };
    const taldeak = `<ul class="resultados">${filas.map(({ g, salida, nota, estado }) => `
      <li class="${estado[0]}" style="--color:${esc(g.color)}">
        <div class="mini-ficha">${ficha(g)}</div>
        <div class="res-texto">
          <strong>${esc(g.nombre)}</strong> <span class="chip ${estado[0]}">${estado[1]}</span>
          ${salida ? `<div class="res-meta">📅 ${fecha(salida.fecha)}${salida.datos.motivo ? ` · ${esc(salida.datos.motivo)}` : ''}${salida.puntos ? ` · <b>${conSigno(salida.puntos)} pt</b>` : ''}</div>` : ''}
          ${nota ? `<div class="res-nota">${estrellas(nota.datos.nota)} <b>${esc(nota.datos.nota)}</b>${nota.datos.comentario ? `<q>${esc(nota.datos.comentario)}</q>` : ''}</div>` : ''}
        </div></li>`).join('')}</ul>`;

    const ariketa = `${c.descripcion ? `<p>${esc(c.descripcion)}</p>` : ''}
      <dl class="stats">
        ${entrega ? `<div><dt>Ariketa</dt><dd>${esc(entrega.nombre)}</dd></div>
        <div><dt>Epea</dt><dd>${entrega.fecha_limite ? fecha(entrega.fecha_limite) : 'Zehazteko'}</dd></div>
        <div><dt>Puntu max.</dt><dd>${esc(entrega.puntos_max ?? '—')}</dd></div>` : ''}
        <div><dt>Gainditu dute</dt><dd>${superados} / ${filas.length} talde</dd></div>
      </dl>
      <div class="xp" role="img" aria-label="${superados} talde ${filas.length}-tik"><div class="xp-relleno" style="width:${100 * superados / filas.length}%"></div></div>`;

    const sucesos = actual.estado.eventos.filter(ev => publico(ev) && (ev.datos?.hasta === c.id || (c.entrega && ev.datos?.entrega === c.entrega))).reverse();
    abrirEmergente(ancla, {
      clase: 'em-zona',
      cabecera: cab,
      pestanas: [{ etiqueta: 'Taldeak', html: taldeak }, { etiqueta: 'Ariketa', html: ariketa }, { etiqueta: 'Gertaerak', html: cronica(sucesos) }],
    });
  }

  // ---------- Barra lateral ----------
  function pintarLateral() {
    const cont = $('lat-taldeak');
    cont.innerHTML = '<ul class="lista-grupos"></ul>';
    const ul = cont.firstChild;
    const orden = gruposActivos(); // sin ranking público: orden fijo de grupos
    for (const g of orden) {
      const e = actual.estado.grupos[g.id];
      const n = barraNivel(e.puntos);
      const objetos = Object.keys(e.inventario).map(id => {
        const o = buscar(comun.catalogo.objetos, id) || {};
        return `<span title="${esc(o.nombre || id)}">${icono(o.icono, ICONO_OBJETO[o.tipo] || '❔')}</span>`;
      }).join('');
      const estados = e.estados.map(s => buscar(comun.catalogo.estados, s.id)?.tipo === 'downgrade' ? '▼' : '▲').join('');
      const li = document.createElement('li');
      li.innerHTML = `<button type="button" class="fila-grupo" style="--color:${esc(g.color)}">
          <span class="fg-ficha"></span>
          <span class="fg-texto">
            <span class="fg-nombre">${esc(g.nombre)}</span>
            <span class="fg-nivel"><span class="nivel-num">${n.numero}</span> ${esc(n.titulo)}</span>
            ${htmlBarra(n, e.puntos)}
            <span class="fg-zona">📍 ${numCasilla(e.posicion)}. ${esc(nombreCasilla(e.posicion))}</span>
            ${objetos || estados ? `<span class="fg-extra">${objetos}${estados ? `<span class="fg-estados">${estados}</span>` : ''}</span>` : ''}
          </span>
        </button>`;
      li.querySelector('.fg-ficha').append(Mapa.crearFicha(g, comun.config));
      li.querySelector('button').onclick = ev => {
        ev.stopPropagation();
        const ficha = document.querySelector(`.ficha-mapa[data-grupo="${g.id}"]`);
        ficha.scrollIntoView({ behavior: sinAnimacion() ? 'auto' : 'smooth', block: 'nearest', inline: 'center' });
        abrirGrupo(g.id, ficha);
      };
      ul.append(li);
    }
  }

  function pintarEgunkaria() {
    const fg = $('filtro-grupo').value, ft = $('filtro-tipo').value;
    const evs = actual.estado.eventos.filter(ev => publico(ev) && (!fg || ev.grupo === fg) && (!ft || ev.tipo === ft));
    $('lista-eventos').innerHTML = cronica(evs.slice().reverse()).replace(/^<ol class="cronica">|<\/ol>$/g, '');
  }

  function prepararLateral() {
    $('filtro-grupo').innerHTML = '<option value="">Talde guztiak</option>' +
      comun.grupos.grupos.map(g => `<option value="${esc(g.id)}">${esc(g.nombre)}</option>`).join('');
    $('filtro-tipo').innerHTML = '<option value="">Mota guztiak</option>' +
      Object.entries(TIPOS_EVENTO).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
    $('filtro-grupo').onchange = $('filtro-tipo').onchange = pintarEgunkaria;
    const tabs = [$('tab-taldeak'), $('tab-egunkaria')];
    tabs.forEach(t => t.onclick = () => tabs.forEach(o => {
      o.setAttribute('aria-selected', o === t);
      $(o.getAttribute('aria-controls')).hidden = o !== t;
    }));
  }

  // ---------- Carga ----------
  async function abrirAventura(id) {
    cerrarEmergente();
    const base = `data/publico/aventuras/${id}/`;
    if (!cache[id]) {
      const [aventura, tablero, entregas, eventos] = await Promise.all(
        ['aventura', 'tablero', 'entregas', 'eventos'].map(n => cargar(base + n + '.json')));
      cache[id] = { aventura, tablero, entregas, eventos };
    }
    const d = cache[id];
    const estado = Motor.calcularEstado(id, d.eventos, comun.globales, comun.catalogo, d.tablero, comun.grupos, comun.config);
    actual = { ...d, estado, orden: Motor.ordenCasillas(d.tablero) };

    const info = buscar(comun.config.aventuras, id);
    document.documentElement.style.setProperty('--acento', info.color_acento);
    document.title = `${info.nombre} · ${comun.config.titulo}`;
    document.querySelectorAll('#pestanas a').forEach(a => a.toggleAttribute('aria-current', a.hash === '#' + id));

    Mapa.dibujar($('mapa'), { ...actual, grupos: comun.grupos, config: comun.config }, { casilla: abrirCasilla, ficha: abrirGrupo });
    pintarLateral();
    pintarEgunkaria();
  }

  function mostrarError(err) {
    console.error(err);
    $('contenido').innerHTML = `<p class="aviso-error pergamino" role="alert">Ezin izan dira datuak kargatu. Saiatu berriro geroago.<br><small>${esc(err.message)}</small></p>`;
  }

  async function iniciar() {
    try {
      [comun.config, comun.grupos, comun.catalogo, comun.globales] = await Promise.all(
        ['config', 'grupos', 'catalogo', 'eventos_globales'].map(n => cargar(`data/publico/${n}.json`)));
    } catch (err) { return mostrarError(err); }

    $('titulo').textContent = comun.config.titulo;
    const aventuras = comun.config.aventuras.filter(a => a.activa);
    $('pestanas').innerHTML = aventuras.map(a =>
      `<a href="#${esc(a.id)}" style="--acento:${esc(a.color_acento)}">${esc(a.nombre)}</a>`).join('');
    prepararLateral();

    document.addEventListener('click', cerrarEmergente);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarEmergente(); });
    addEventListener('resize', () => emergente && colocar(emergente.el, emergente.ancla));

    const irA = () => {
      const id = location.hash.slice(1);
      abrirAventura(aventuras.some(a => a.id === id) ? id : aventuras[0].id).catch(mostrarError);
    };
    addEventListener('hashchange', irA);
    irA();
  }

  iniciar();
})();
