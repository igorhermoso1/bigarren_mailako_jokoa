// Arranque de la web pública: carga los datos, calcula el estado y pinta mapa, barra lateral y ventanas emergentes.
(function () {
  const TIPOS_EVENTO = {
    avance: 'Aurrerapena', retroceso: 'Atzerapena', objeto_ganado: 'Objektua lortua', objeto_usado: 'Objektua erabilia',
    objeto_perdido: 'Objektua galdua', estado_aplicado: 'Egoera ezarria', estado_expirado: 'Egoera amaitua',
    hito: 'Mugarria', logro: 'Lorpena', bonus: 'Bonusa', penalizacion: 'Zigorra', nota_grupo: 'Balorazioa',
    entrega_cerrada: 'Entrega itxia', comentario: 'Oharra', anulacion: 'Baliogabetzea', borroka: 'Borroka',
  };
  const ICONO_EVENTO = {
    avance: '👣', retroceso: '↩️', objeto_ganado: '🎁', objeto_usado: '✨', objeto_perdido: '💨', estado_aplicado: '🌀',
    estado_expirado: '⌛', hito: '🏰', logro: '🏆', bonus: '⭐', penalizacion: '💀', nota_grupo: '📜',
    entrega_cerrada: '🔒', comentario: '📣', anulacion: '✖️', borroka: '⚔️',
  };
  const EMAITZA = { garaipena: '🏆 Garaipena', porrota: '💀 Porrota', amaitu_gabe: '⏸ Amaitu gabe' };
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
      case 'borroka': return `${nombreCasilla(d.casilla)}: ${d.asmatuak} / ${d.guztira} · ${EMAITZA[d.emaitza] || ''}`;
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
      // Las fichas se ponen como nodos (sus imágenes nítidas llegan después y no sobreviven a un innerHTML).
      cuerpo.querySelectorAll('[data-ficha]').forEach(el => el.append(Mapa.crearFicha(grupo(el.dataset.ficha), comun.config)));
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
    // Fija respecto a la pantalla (no dentro del mapa), para que el zoom del mapa no la agrande.
    document.body.append(el);
    el.style.position = 'fixed';
    const a = ancla.getBoundingClientRect(), anchoV = innerWidth, altoV = innerHeight;
    el.style.maxHeight = (altoV - 16) + 'px';
    // Medidas de maquetación: getBoundingClientRect daría la ventana encogida por su animación de entrada.
    const p = { width: el.offsetWidth, height: el.offsetHeight };
    let left = a.right + 14;
    if (left + p.width > anchoV - 8) left = a.left - p.width - 14;
    const top = Math.min(Math.max(8, a.top + a.height / 2 - p.height / 2), altoV - p.height - 8);
    el.style.left = Math.max(8, Math.min(left, anchoV - p.width - 8)) + 'px';
    el.style.top = Math.max(8, top) + 'px';
  }

  // ---------- Combates ----------
  // Combates del grupo en esta aventura (los más recientes primero, sin los anulados).
  const borrokak = e => e.historial.filter(ev => ev.tipo === 'borroka' && !ev.anulado).reverse();

  function borrokaKidea(e, m) {
    const txandak = borrokak(e).flatMap(ev => ev.datos.txandak.filter(t => t.kidea === m.id));
    if (!txandak.length) return '';
    const ondo = txandak.filter(t => t.zuzena).length;
    return `<h3>Borrokak</h3><div class="b-kidea-stats"><span class="ondo">✔ ${ondo}</span><span class="gaizki">✖ ${txandak.length - ondo}</span>
      <span>🎒 ${txandak.filter(t => t.objektuak).length}</span></div>`;
  }

  // Resumen de cada combate: tema, resultado, vida y quién respondió a cada enemigo (y con qué objetos).
  function htmlBorrokak(g, e) {
    const alias = id => buscar(g.miembros, id)?.alias || id;
    const obj = id => buscar(comun.catalogo.objetos, id);
    return borrokak(e).map(ev => {
      const d = ev.datos;
      return `<article class="borroka-txartela" data-emaitza="${d.emaitza}">
        <header><span class="bt-emaitza">${EMAITZA[d.emaitza]}</span><time>${fecha(ev.fecha)}</time></header>
        <h4>${numCasilla(d.casilla)}. ${esc(nombreCasilla(d.casilla))}</h4>
        <div class="bt-puntuazioa"><b>${d.asmatuak}</b> / ${d.guztira}
          <span class="bt-bihotzak">${'♥'.repeat(d.bizitza)}<span class="hutsa">${'♥'.repeat(Math.max(0, d.guztira - d.bizitza))}</span></span></div>
        <ol class="bt-txandak">${d.txandak.map((t, i) => `<li class="${t.zuzena ? 'ondo' : 'gaizki'}">
          <span class="bt-etsaia">${d.etsaiak.indexOf(t.galdera) + 1}. etsaia</span>
          <span class="bt-kidea">${esc(alias(t.kidea))}</span>
          <span class="bt-objektuak">${(t.objektuak || []).map(id => `<span title="${esc(obj(id)?.nombre || id)}">${icono(obj(id)?.icono, ICONO_OBJETO[obj(id)?.tipo] || '🎒')}</span>`).join('')}</span>
          <span class="bt-ikurra">${t.zuzena ? '✔' : '✖'}</span></li>`).join('')}</ol>
      </article>`;
    }).join('');
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
    cab.insertAdjacentHTML('beforeend', `<div><h2 id="em-titulo">${esc(g.nombre)}</h2>${g.lema ? `<p class="lema">«${esc(g.lema)}»</p>` : ''}
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
          <dl class="stats"><div><dt>Zeregina ${esc(actual.aventura.nombre)}-n</dt><dd>${esc(m.cometido?.[actual.aventura.id] || '—')}</dd></div></dl>
          ${borrokaKidea(e, m)}
          <h3>Lana</h3>${cronica(e.historial.filter(ev => publico(ev) && ev.miembro === m.id).reverse())}`,
      };
    });

    const historial = e.historial.filter(publico).slice().reverse();
    abrirEmergente(ancla, {
      clase: 'em-grupo',
      cabecera: cab,
      pestanas: [{ etiqueta: 'Taldea', html: taldea }, ...kideak, ...(borrokak(e).length ? [{ etiqueta: '⚔ Borrokak', html: htmlBorrokak(g, e) }] : []), { etiqueta: 'Historia', html: cronica(historial) }],
    });
  }

  // ---------- Ventana de zona (casilla = ejercicio) ----------
  function abrirCasilla(c, ancla) {
    const num = numCasilla(c.id);
    const entrega = buscar(actual.entregas.entregas, c.entrega);
    const tipo = comun.config.tipos_casilla[c.tipo] || c.tipo;
    const cab = `<div class="em-cab-zona"><span class="medallon" aria-hidden="true">${c.tipo === 'meta' ? '⚑' : num}</span>
      <div><h2 id="em-titulo">${esc(c.nombre)}</h2>${c.lugar && c.lugar !== c.nombre ? `<p class="lema">${esc(c.lugar)}</p>` : ''}<p class="etiqueta">${esc(tipo)}</p></div></div>`;

    // Para cada grupo: si ha superado esta zona (cuándo y con qué motivo), si está aquí, y su valoración.
    const filas = gruposActivos().map(g => {
      const e = actual.estado.grupos[g.id];
      const salida = actual.estado.eventos.find(ev => !ev.anulado && ev.grupo === g.id && ev.tipo === 'avance' && ev.datos?.desde === c.id);
      const nota = c.entrega && e.notas[c.entrega];
      const estado = salida ? ['gainditua', '✔ Gaindituta'] : e.posicion === c.id ? ['hemen', '⚑ Hemen dago'] : ['bidean', '… Oraindik ez'];
      return { g, salida, nota: nota && publico(nota) ? nota : null, estado };
    });
    const superados = filas.filter(f => f.salida).length;
    const taldeak = `<ul class="resultados">${filas.map(({ g, salida, nota, estado }) => `
      <li class="${estado[0]}" style="--color:${esc(g.color)}">
        <div class="mini-ficha" data-ficha="${esc(g.id)}"></div>
        <div class="res-texto">
          <strong>${esc(g.nombre)}</strong> <span class="chip ${estado[0]}">${estado[1]}</span>
          ${salida ? `<div class="res-meta">📅 ${fecha(salida.fecha)}${salida.datos.motivo ? ` · ${esc(salida.datos.motivo)}` : ''}${salida.puntos ? ` · <b>${conSigno(salida.puntos)} pt</b>` : ''}</div>` : ''}
          ${(() => { const bk = borrokak(actual.estado.grupos[g.id]).find(ev => ev.datos.casilla === c.id); return bk ? `<div class="res-borroka" data-emaitza="${bk.datos.emaitza}">⚔ <b>${bk.datos.asmatuak} / ${bk.datos.guztira}</b> · ${EMAITZA[bk.datos.emaitza]}</div>` : ''; })()}
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
            <span class="fg-ruta" aria-hidden="true"><i style="width:${actual.orden.length > 1 ? 100 * (numCasilla(e.posicion) - 1) / (actual.orden.length - 1) : 0}%"></i></span>
            ${objetos || estados ? `<span class="fg-extra">${objetos}${estados ? `<span class="fg-estados">${estados}</span>` : ''}</span>` : ''}
          </span>
        </button>`;
      li.querySelector('.fg-ficha').append(Mapa.crearFicha(g, comun.config));
      li.querySelector('button').onclick = ev => {
        ev.stopPropagation();
        const ficha = document.querySelector(`.ficha-mapa[data-grupo="${g.id}"]`);
        ficha.scrollIntoView({ behavior: sinAnimacion() ? 'auto' : 'smooth', block: 'nearest', inline: 'center' });
        Mapa.enfocar(ficha); // si el mapa está ampliado, lo centra en la ficha
        abrirGrupo(g.id, ficha);
      };
      ul.append(li);
    }
  }

  // Vitrina: logros, hitos y objetos del catálogo de esta aventura. Los conseguidos brillan y muestran
  // quién los tiene; los que nadie tiene aún salen en silueta (y los logros ocultos, sin nombre: «???»).
  function pintarVitrina() {
    const cat = comun.catalogo;
    const vale = x => x.ambito === 'todas' || x.ambito === actual.aventura.id;
    const grupos = gruposActivos();
    const dueños = (fn) => grupos.filter(g => fn(actual.estado.grupos[g.id]));
    const seccion = (titulo, items, tiene, iconoDef, extra = () => '') => {
      const filas = items.filter(vale).map(x => ({ x, quien: dueños(e => tiene(e, x.id)) }))
        .filter(({ x, quien }) => x.activo !== false || quien.length);
      if (!filas.length) return '';
      return `<h3>${titulo} <small>${filas.filter(f => f.quien.length).length} / ${filas.length}</small></h3>
        <ul class="bitrina">${filas.map(({ x, quien }) => {
          const lortua = quien.length > 0, ezkutua = !lortua && x.oculto;
          return `<li class="${lortua ? 'lortua' : 'itxita'}" ${extra(x)} title="${ezkutua ? '???' : esc(x.descripcion || '')}">
            <span class="b-ikonoa" aria-hidden="true">${ezkutua ? '❔' : icono(x.icono, iconoDef(x))}</span>
            <span class="b-izena">${ezkutua ? '???' : esc(x.nombre)}</span>
            <span class="b-jabeak">${quien.map(g => `<span class="b-ficha" data-ficha="${esc(g.id)}" title="${esc(g.nombre)}"></span>`).join('')}</span>
          </li>`;
        }).join('')}</ul>`;
    };
    const html = seccion('🏆 Lorpenak', cat.logros, (e, id) => e.logros.includes(id), () => '🏆') +
      seccion('🏰 Mugarriak', cat.hitos, (e, id) => e.hitos.includes(id), () => '🏰') +
      seccion('💎 Objektuak', cat.objetos, (e, id) => id in e.inventario, x => ICONO_OBJETO[x.tipo] || '❔',
        x => `style="--rareza:${esc(buscar(cat.rarezas, x.rareza)?.color || '#888')}"`);
    const cont = $('lat-bitrina');
    cont.innerHTML = html || '<p class="vacio">Katalogoa hutsik dago oraindik.</p>';
    cont.querySelectorAll('[data-ficha]').forEach(el => el.append(Mapa.crearFicha(grupo(el.dataset.ficha), comun.config)));
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
    const tabs = [$('tab-taldeak'), $('tab-egunkaria'), $('tab-bitrina')];
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

    // Luz del mapa según la hora real: día, atardecer o noche.
    const hora = new Date().getHours();
    $('mapa').dataset.ordua = hora >= 7 && hora < 17 ? 'eguna' : hora >= 17 && hora < 20 ? 'ilunabarra' : 'gaua';
    Mapa.dibujar($('mapa'), { ...actual, grupos: comun.grupos, config: comun.config }, { casilla: abrirCasilla, ficha: abrirGrupo });
    pintarLateral();
    pintarEgunkaria();
    pintarVitrina();
    mostrarNovedades(id, d, estado);
  }

  // «Zer berri?»: lo que ha pasado desde la última visita de este navegador a esta aventura,
  // con las subidas de nivel destacadas. Sale siempre al abrir la web (si no hay nada nuevo, con lo
  // último que ha pasado) y solo se cierra a mano. Al cambiar de aventura, solo si hay novedades.
  let novedadesVistas = false;
  function mostrarNovedades(id, d, estado) {
    const clave = 'ikusita:' + id;
    let visto = null;
    try { visto = JSON.parse(localStorage.getItem(clave)); } catch { /* sin almacenamiento */ }
    const maxId = lista => lista.reduce((m, e) => Math.max(m, e.id), 0);
    try { localStorage.setItem(clave, JSON.stringify({ aventura: maxId(d.eventos), global: maxId(comun.globales) })); } catch { /* idem */ }
    const visibles = estado.eventos.filter(ev => publico(ev) && !ev.anulado && !['anulacion', 'auditoria'].includes(ev.tipo));
    const nuevos = visto ? visibles.filter(ev => ev.id > (ev.origen === 'global' ? visto.global : visto.aventura)) : [];
    if (novedadesVistas && !nuevos.length) return;
    novedadesVistas = true;
    let subidas = [];
    if (nuevos.length) {
      const antes = Motor.calcularEstado(id, d.eventos.filter(e => e.id <= visto.aventura), comun.globales.filter(e => e.id <= visto.global),
        comun.catalogo, d.tablero, comun.grupos, comun.config);
      subidas = gruposActivos().map(g => ({ g, a: barraNivel(antes.grupos[g.id].puntos), n: barraNivel(estado.grupos[g.id].puntos) }))
        .filter(x => x.n.numero > x.a.numero);
    }
    const lista = nuevos.length ? nuevos : visibles;
    const subtitulo = nuevos.length ? `Azken bisitatik ${esc(actual.aventura.nombre)}-n` : `Azken gertaerak ${esc(actual.aventura.nombre)}-n`;

    const MAX = 8;
    const caja = document.createElement('div');
    caja.className = 'berriak-fondoa';
    caja.innerHTML = `<div class="berriak pergamino" role="dialog" aria-modal="true" aria-labelledby="berriak-izenburua">
        <h2 id="berriak-izenburua">📜 Zer berri?</h2>
        <p class="lema">${subtitulo}</p>
        ${subidas.length ? `<ul class="maila-igoerak">${subidas.map(x => `<li style="--color:${esc(x.g.color)}">
          <span class="mi-ficha" data-ficha="${esc(x.g.id)}"></span>
          <span><b>${esc(x.g.nombre)}</b><br>⬆ MAILA IGOTA! <span class="nivel-num">${x.n.numero}</span> ${esc(x.n.titulo)}</span></li>`).join('')}</ul>` : ''}
        ${lista.length ? cronica(lista.slice(-MAX).reverse()) : '<p class="vacio">Oraindik ez da ezer gertatu. Abentura hastear dago!</p>'}
        ${lista.length > MAX ? `<p class="vacio">… eta beste ${lista.length - MAX} (Egunkarian)</p>` : ''}
        <div class="d-botones"><button type="button" class="boton-jarraitu">Jarraitu ▶</button></div>
      </div>`;
    caja.querySelectorAll('[data-ficha]').forEach(el => el.append(Mapa.crearFicha(grupo(el.dataset.ficha), comun.config)));
    const cerrar = () => { caja.remove(); removeEventListener('keydown', tecla); };
    const tecla = e => { if (e.key === 'Escape') cerrar(); };
    caja.querySelector('.boton-jarraitu').onclick = cerrar;
    addEventListener('keydown', tecla);
    document.body.append(caja);
    caja.querySelector('.boton-jarraitu').focus();
  }

  // ---------- Modo proyector ----------
  // Pantalla completa para clase: recorre los grupos uno a uno (ficha grande, nivel, zona, inventario,
  // logros y lo último que les ha pasado). ← → para cambiar, espacio para pausar, Esc para salir.
  const SEGUNDOS_PROYECTOR = 10;
  function abrirProyector() {
    const grupos = gruposActivos();
    if (!grupos.length) return;
    let i = 0, pausa = false, temporizador = null;
    const pantalla = document.createElement('div');
    pantalla.className = 'proiektorea';
    pantalla.setAttribute('role', 'dialog');
    pantalla.setAttribute('aria-label', 'Proiektore modua');
    pantalla.innerHTML = `<div class="p-eszena" aria-live="polite"></div>
      <div class="p-oina">
        <div class="p-puntuak"></div>
        <div class="p-kontrolak">
          <button type="button" class="m-boton" data-p="aurrekoa" aria-label="Aurrekoa">◀</button>
          <button type="button" class="m-boton" data-p="pausa" aria-label="Gelditu">❚❚</button>
          <button type="button" class="m-boton" data-p="hurrengoa" aria-label="Hurrengoa">▶</button>
          <button type="button" class="m-boton" data-p="itxi" aria-label="Itxi">✕</button>
        </div>
        <div class="p-denbora"><i></i></div>
      </div>`;
    const eszena = pantalla.querySelector('.p-eszena');

    const pintar = () => {
      const g = grupos[i], e = actual.estado.grupos[g.id], n = barraNivel(e.puntos);
      const total = actual.orden.length, num = numCasilla(e.posicion);
      const cat = comun.catalogo;
      const ultimos = e.historial.filter(ev => publico(ev) && !ev.anulado && ev.tipo !== 'anulacion').slice(-3).reverse();
      pantalla.style.setProperty('--color', g.color);
      eszena.innerHTML = `<div class="p-fitxa"></div>
        <div class="p-datuak pergamino">
          <p class="p-abentura">${esc(actual.aventura.nombre)}</p>
          <h2>${esc(g.nombre)}</h2>
          ${g.lema ? `<p class="lema">«${esc(g.lema)}»</p>` : ''}
          <p class="p-maila"><span class="nivel-num">${n.numero}</span> ${esc(n.titulo)} · <b>${e.puntos} pt</b></p>
          ${htmlBarra(n, e.puntos)}
          <p class="p-gunea">📍 ${num}. ${esc(nombreCasilla(e.posicion))} <small>(${num} / ${total})</small></p>
          <div class="fg-ruta"><i style="width:${total > 1 ? 100 * (num - 1) / (total - 1) : 0}%"></i></div>
          <h3>Inbentarioa</h3>${htmlInventario(e.inventario)}
          ${e.estados.length ? `<h3>Egoerak</h3>${htmlEstados(e.estados)}` : ''}
          ${e.logros.length || e.hitos.length ? `<h3>Lorpenak</h3>${htmlInsignias([...e.logros, ...e.hitos], [...cat.logros, ...cat.hitos], '🏆')}` : ''}
          ${ultimos.length ? `<h3>Azkenak</h3>${cronica(ultimos)}` : ''}
        </div>`;
      eszena.querySelector('.p-fitxa').append(Mapa.crearFicha(g, comun.config));
      pantalla.querySelector('.p-puntuak').innerHTML = grupos.map((x, j) =>
        `<span class="${j === i ? 'aktiboa' : ''}" style="--color:${esc(x.color)}" title="${esc(x.nombre)}"></span>`).join('');
      // Reinicia las animaciones de entrada y la barra de tiempo.
      eszena.classList.remove('sartu'); void eszena.offsetWidth; eszena.classList.add('sartu');
      const barra = pantalla.querySelector('.p-denbora i');
      barra.style.animation = 'none'; void barra.offsetWidth;
      barra.style.animation = pausa ? 'none' : `p-denbora ${SEGUNDOS_PROYECTOR}s linear forwards`;
      clearTimeout(temporizador);
      if (!pausa) temporizador = setTimeout(() => ir(1), SEGUNDOS_PROYECTOR * 1000);
    };
    const ir = paso => { i = (i + paso + grupos.length) % grupos.length; pintar(); };
    const cerrar = () => {
      clearTimeout(temporizador);
      removeEventListener('keydown', tecla, true);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      pantalla.remove();
    };
    const alternarPausa = () => {
      pausa = !pausa;
      const b = pantalla.querySelector('[data-p="pausa"]');
      b.textContent = pausa ? '▶▶' : '❚❚';
      b.setAttribute('aria-label', pausa ? 'Jarraitu' : 'Gelditu');
      pintar();
    };
    const tecla = e => {
      const acciones = { ArrowRight: () => ir(1), ArrowLeft: () => ir(-1), ' ': alternarPausa, Escape: cerrar };
      if (acciones[e.key]) { e.preventDefault(); e.stopPropagation(); acciones[e.key](); }
    };
    pantalla.querySelector('[data-p="aurrekoa"]').onclick = () => ir(-1);
    pantalla.querySelector('[data-p="hurrengoa"]').onclick = () => ir(1);
    pantalla.querySelector('[data-p="pausa"]').onclick = alternarPausa;
    pantalla.querySelector('[data-p="itxi"]').onclick = cerrar;
    pantalla.addEventListener('click', e => e.stopPropagation());
    document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && pantalla.isConnected && pantalla.dataset.osoa) cerrar(); });
    addEventListener('keydown', tecla, true);
    cerrarEmergente();
    document.body.append(pantalla);
    pantalla.requestFullscreen?.().then(() => { pantalla.dataset.osoa = '1'; }).catch(() => { /* sin pantalla completa: sigue ocupando la ventana */ });
    pintar();
    pantalla.querySelector('[data-p="hurrengoa"]').focus();
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
    $('gida-mailak').innerHTML = comun.config.niveles.map((n, i) => `<li><span class="nivel-num">${i + 1}</span>${esc(n.titulo)} <small>${n.puntos} XP</small></li>`).join('');
    const aventuras = comun.config.aventuras.filter(a => a.activa);
    $('pestanas').innerHTML = aventuras.map(a =>
      `<a href="#${esc(a.id)}" style="--acento:${esc(a.color_acento)}">${esc(a.nombre)}</a>`).join('');
    prepararLateral();
    $('proiektorea').onclick = abrirProyector;

    document.addEventListener('click', cerrarEmergente);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarEmergente(); });
    addEventListener('resize', () => emergente && colocar(emergente.el, emergente.ancla));
    addEventListener('scroll', () => emergente && colocar(emergente.el, emergente.ancla), { passive: true });
    addEventListener('mapa-mugitu', () => emergente && colocar(emergente.el, emergente.ancla)); // la ventana sigue a lo pulsado al mover el mapa

    const irA = () => {
      const id = location.hash.slice(1);
      abrirAventura(aventuras.some(a => a.id === id) ? id : aventuras[0].id).catch(mostrarError);
    };
    addEventListener('hashchange', irA);
    irA();
  }

  iniciar();
})();
