// Panel del profesor: muestra el estado de la aventura activa y registra eventos nuevos a través de admin.js.
(function () {
  const TOKEN = document.querySelector('meta[name="token"]').content;
  const TIPOS = {
    avance: 'Aurrerapena', retroceso: 'Atzerapena', bonus: 'Bonusa', penalizacion: 'Zigorra',
    objeto_ganado: 'Objektua eman', objeto_usado: 'Objektua erabili', objeto_perdido: 'Objektua kendu',
    estado_aplicado: 'Egoera ezarri', estado_expirado: 'Egoera amaitu', hito: 'Mugarria', logro: 'Lorpena',
    nota_grupo: 'Taldearen nota', nota_miembro: 'Kide baten nota (pribatua)', entrega_cerrada: 'Entrega itxi',
    comentario: 'Oharra / testua', anulacion: 'Baliogabetzea',
  };
  // Campos del formulario que necesita cada tipo de evento.
  const CAMPOS = {
    avance: ['grupo', 'hasta', 'motivo', 'puntos'], retroceso: ['grupo', 'hasta', 'motivo', 'puntos'],
    bonus: ['grupo', 'motivo', 'puntos'], penalizacion: ['grupo', 'motivo', 'puntos'],
    objeto_ganado: ['grupo', 'objeto', 'motivo'], objeto_usado: ['grupo', 'objeto', 'motivo'], objeto_perdido: ['grupo', 'objeto', 'motivo'],
    estado_aplicado: ['grupo', 'estado', 'duracion', 'motivo', 'puntos'], estado_expirado: ['grupo', 'estado', 'motivo'],
    hito: ['grupo', 'hito', 'motivo', 'puntos'], logro: ['grupo', 'logro', 'motivo', 'puntos'],
    nota_grupo: ['grupo', 'entrega', 'nota', 'comentario', 'publico', 'puntos'],
    nota_miembro: ['grupo', 'miembro', 'entrega', 'criterios', 'comentario'],
    entrega_cerrada: ['entrega'], comentario: ['grupo', 'miembro', 'texto'],
  };
  const GLOBALES = ['bonus', 'penalizacion', 'comentario'];
  const TODOS_LOS_GRUPOS = ['bonus', 'penalizacion', 'comentario'];

  const $ = id => document.getElementById(id);
  const form = $('formulario');
  const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const buscar = (lista, id) => (lista || []).find(x => x.id === id);
  const opciones = (lista, etiqueta = x => x.nombre, vacia) =>
    (vacia ? `<option value="">${esc(vacia)}</option>` : '') + lista.map(x => `<option value="${esc(x.id)}">${esc(etiqueta(x))}</option>`).join('');

  let datos = null;     // todo lo que devuelve /api/datos
  let avId = null;      // aventura activa
  let estado = null;    // estado calculado por el motor

  // ---------- Comunicación con admin.js ----------
  async function api(ruta, cuerpo) {
    const r = await fetch(ruta, {
      method: cuerpo ? 'POST' : 'GET',
      headers: { 'x-token': TOKEN, ...(cuerpo ? { 'content-type': 'application/json' } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    const j = await r.json().catch(() => ({ error: `Erantzun okerra (${r.status})` }));
    if (!r.ok) throw new Error(j.error || r.status);
    return j;
  }

  let temporizador;
  function avisar(texto, tipo = 'ok') {
    const el = $('aviso');
    el.textContent = texto;
    el.className = `aviso visible ${tipo}`;
    clearTimeout(temporizador);
    temporizador = setTimeout(() => el.classList.remove('visible'), tipo === 'error' ? 8000 : 4000);
  }

  // Diálogo de confirmación: devuelve true si el profesor pulsa «Erregistratu».
  function confirmar(titulo, html, textoSi = 'Erregistratu') {
    const d = $('dialogo');
    $('d-titulo').textContent = titulo;
    $('d-cuerpo').innerHTML = html;
    $('d-si').textContent = textoSi;
    d.returnValue = '';
    d.showModal();
    // Se escucha el envío del formulario (síncrono) y no «close», que algunos navegadores retrasan.
    return new Promise(ok => {
      const f = d.querySelector('form');
      const fin = v => { f.onsubmit = d.oncancel = null; ok(v); };
      f.onsubmit = e => fin(e.submitter?.value === 'si');
      d.oncancel = () => fin(false);
    });
  }

  // ---------- Datos de la aventura activa ----------
  const av = () => datos.aventuras[avId];
  const nombreAv = () => buscar(datos.config.aventuras, avId).nombre;
  // Casillas activas en el orden del recorrido; su posición es el número que se ve en el mapa.
  const casillas = () => Motor.ordenCasillas(av().tablero);
  const numCasilla = id => casillas().findIndex(c => c.id === id) + 1;
  const nombreCasilla = id => { const c = buscar(casillas(), id); return c ? `${numCasilla(id)}. ${c.nombre}` : id; };
  const enAmbito = x => x.ambito === 'todas' || x.ambito === avId;
  const grupos = () => datos.grupos.grupos.filter(g => g.activo);

  // Todos los eventos que afectan a la aventura activa, de los tres registros, con su marca de anulado.
  function eventosVisibles() {
    const marcar = (lista, registro) => {
      const anulados = new Set(lista.filter(e => e.tipo === 'anulacion').map(e => e.referencia));
      return lista.map(e => ({ ...e, registro, anulado: anulados.has(e.id) }));
    };
    return [
      ...marcar(av().eventos, 'aventura'),
      ...marcar(datos.globales, 'global'),
      ...marcar(datos.privado.eventos, 'privado').filter(e => e.aventura === avId),
    ].sort((a, b) => new Date(b.fecha) - new Date(a.fecha) || b.id - a.id);
  }

  function resumen(ev) {
    const d = ev.datos || {};
    const cat = datos.catalogo;
    const g = buscar(datos.grupos.grupos, ev.grupo);
    const m = g && buscar(g.miembros, ev.miembro);
    const partes = [
      g ? g.nombre + (m ? ` / ${m.alias}` : '') : (ev.registro === 'global' ? 'Talde guztiak · bi abenturak' : ''),
      d.hasta && `${nombreCasilla(d.desde)} → ${nombreCasilla(d.hasta)}`,
      d.objeto && buscar(cat.objetos, d.objeto)?.nombre,
      d.estado && buscar(cat.estados, d.estado)?.nombre,
      d.hito && buscar(cat.hitos, d.hito)?.nombre,
      d.logro && buscar(cat.logros, d.logro)?.nombre,
      d.entrega && buscar(av().entregas.entregas, d.entrega)?.nombre,
      d.nota != null && `nota ${d.nota}`,
      d.criterios && Object.entries(d.criterios).map(([k, v]) => `${k} ${v}`).join(', '),
      ev.tipo === 'anulacion' && `#${ev.referencia} baliogabetua`,
      d.texto, d.motivo, d.comentario,
    ];
    return partes.filter(Boolean).join(' · ');
  }

  // ---------- Pintado ----------
  function pintarCabecera() {
    const info = buscar(datos.config.aventuras, avId);
    document.documentElement.style.setProperty('--acento', info.color_acento);
    document.title = `${info.nombre} · Irakaslearen panela`;
    $('pestanas').innerHTML = datos.config.aventuras.filter(a => a.activa).map(a =>
      `<a href="#${esc(a.id)}" style="--acento:${esc(a.color_acento)}"${a.id === avId ? ' aria-current="page"' : ''}>${esc(a.nombre)}</a>`).join('');
    $('registrando').innerHTML = `Erregistratzen: <strong>${esc(info.nombre)}</strong>`;
    $('f-ambito-nombre').textContent = `${info.nombre}-n bakarrik`;
    $('f-enviar').textContent = `Erregistratu ${info.nombre}-n`;
  }

  function pintarControl() {
    const cont = $('control');
    cont.innerHTML = '';
    const evs = eventosVisibles();
    for (const g of grupos()) {
      const e = estado.grupos[g.id];
      const c = buscar(casillas(), e.posicion);
      const ultimo = evs.find(ev => ev.grupo === g.id && !ev.anulado && !['anulacion', 'auditoria'].includes(ev.tipo));
      const estados = e.estados.map(s => buscar(datos.catalogo.estados, s.id)?.nombre || s.id);
      const art = document.createElement('article');
      art.className = 'tarjeta-grupo';
      art.style.setProperty('--color', g.color);
      art.innerHTML = `<div class="tg-cab"><span class="tg-ficha"></span>
          <div><h3>${esc(g.nombre)}</h3>
          <p class="tg-pos">📍 ${esc(nombreCasilla(e.posicion))}</p>
          <p class="tg-num"><b>${e.puntos}</b> pt · ${esc(e.nivel.titulo)}${estados.length ? ` · ${esc(estados.join(', '))}` : ''}</p></div></div>
        <p class="tg-ultimo">${ultimo ? `Azkena: ${esc(TIPOS[ultimo.tipo])} — ${esc(resumen(ultimo))}` : 'Oraindik ezer ez'}</p>
        <div class="tg-acciones"></div>`;
      art.querySelector('.tg-ficha').append(Mapa.crearFicha(g, datos.config));
      const acciones = art.querySelector('.tg-acciones');
      const boton = (texto, clase, fn) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = clase;
        b.textContent = texto;
        b.onclick = fn;
        acciones.append(b);
      };
      if (c?.siguientes.length) {
        boton('▶ Aurreratu', 'boton-pri', () => {
          const entrega = buscar(av().entregas.entregas, c.entrega);
          rellenar({ tipo: 'avance', grupo: g.id, hasta: c.siguientes[0], motivo: entrega ? `${entrega.nombre} onartua` : '', puntos: entrega?.puntos_max ?? 10 });
          enviar();
        });
      }
      for (const a of datos.config.acciones_rapidas || []) {
        boton(`${a.etiqueta} ${a.puntos > 0 ? '+' : ''}${a.puntos}`, a.puntos < 0 ? 'boton-mal' : 'boton-sec', () => {
          rellenar({ tipo: a.tipo, grupo: g.id, motivo: a.motivo, puntos: a.puntos });
          enviar();
        });
      }
      boton('✎', 'boton-sec', () => { rellenar({ grupo: g.id }); form.elements.tipo.focus(); });
      cont.append(art);
    }
  }

  function pintarUltimos() {
    const lista = eventosVisibles().filter(e => e.tipo !== 'auditoria').slice(0, 25);
    $('ultimos').innerHTML = lista.map(ev => `<li class="${ev.anulado ? 'anulado' : ''}">
        <span class="cr-icono" aria-hidden="true">${ev.registro === 'privado' ? '🔒' : ev.registro === 'global' ? '🌍' : '•'}</span>
        <div class="cr-texto"><div class="cr-meta">#${ev.id} · ${esc(new Date(ev.fecha).toLocaleString())} · ${esc(TIPOS[ev.tipo] || ev.tipo)}${ev.anulado ? ' · baliogabetua' : ''}</div>
        ${esc(resumen(ev))}</div>
        ${ev.puntos ? `<span class="pts ${ev.puntos < 0 ? 'neg' : ''}">${ev.puntos > 0 ? '+' : ''}${ev.puntos}</span>` : ''}
        ${ev.anulado || ev.tipo === 'anulacion' ? '' : `<button type="button" class="boton-mal pequeno" data-anular="${ev.id}" data-registro="${ev.registro}">Baliogabetu</button>`}
      </li>`).join('') || '<li class="vacio">Gertaerarik ez.</li>';
    $('ultimos').querySelectorAll('[data-anular]').forEach(b => b.onclick = () => anular(b.dataset.registro, Number(b.dataset.anular)));
  }

  // ---------- Formulario ----------
  function prepararSelects() {
    const cat = datos.catalogo;
    form.elements.tipo.innerHTML = Object.entries(CAMPOS).map(([k]) => `<option value="${k}">${esc(TIPOS[k])}</option>`).join('');
    $('f-hasta').innerHTML = opciones(casillas(), c => nombreCasilla(c.id));
    $('f-objeto').innerHTML = opciones(cat.objetos.filter(enAmbito));
    $('f-estado').innerHTML = opciones(cat.estados.filter(enAmbito), s => `${s.tipo === 'downgrade' ? '▼' : '▲'} ${s.nombre}`);
    $('f-hito').innerHTML = opciones(cat.hitos.filter(enAmbito));
    $('f-logro').innerHTML = opciones(cat.logros.filter(enAmbito));
    $('f-entrega').innerHTML = opciones(av().entregas.entregas, e => `${e.nombre}${estado.cerradas.has(e.id) ? ' 🔒' : ''}`);
    const rubrica = datos.privado.rubricas[avId];
    $('f-criterios').innerHTML = rubrica
      ? `<p class="nota-priv">🔒 Pribatua: ez da inoiz web publikoan agertzen.</p>` + rubrica.criterios.map(c =>
        `<label>${esc(c.nombre)} <input type="number" name="crit-${esc(c.id)}" min="${rubrica.escala[0]}" max="${rubrica.escala[1]}" step="0.25"></label>`).join('')
      : '<p class="vacio">Ez dago errubrikarik data/privado/rubricas.json fitxategian.</p>';
  }

  function actualizarCampos() {
    const tipo = form.elements.tipo.value;
    const campos = CAMPOS[tipo];
    form.querySelectorAll('[data-campo]').forEach(el => { el.hidden = !campos.includes(el.dataset.campo); });
    $('f-ambito').hidden = !GLOBALES.includes(tipo);
    if ($('f-ambito').hidden) form.elements.ambito.value = 'aventura';
    const global = form.elements.ambito.value === 'global';
    const previo = form.elements.grupo.value;
    $('f-grupo').innerHTML = opciones(grupos(), g => g.nombre, TODOS_LOS_GRUPOS.includes(tipo) ? 'Talde guztiak' : null);
    if ([...$('f-grupo').options].some(o => o.value === previo)) form.elements.grupo.value = previo;
    if (global) { form.elements.grupo.value = ''; form.elements.grupo.disabled = true; } else form.elements.grupo.disabled = false;
    actualizarMiembros();
    if (tipo === 'avance' || tipo === 'retroceso') proponerDestino();
    if (tipo === 'estado_aplicado') proponerEstado();
  }

  function actualizarMiembros() {
    const g = buscar(datos.grupos.grupos, form.elements.grupo.value);
    // En un oharra el miembro es opcional: vacío = texto para todo el grupo.
    const opcional = form.elements.tipo.value === 'comentario' ? '— Talde osoa —' : null;
    $('f-miembro').innerHTML = g ? opciones(g.miembros.filter(m => m.activo), m => m.alias, opcional) : '';
  }

  // Al avanzar se propone la casilla siguiente del grupo; al retroceder, la anterior de su camino.
  function proponerDestino() {
    const e = estado.grupos[form.elements.grupo.value];
    if (!e) return;
    const c = buscar(casillas(), e.posicion);
    const destino = form.elements.tipo.value === 'avance' ? c?.siguientes[0] : e.camino[e.camino.length - 2];
    if (destino) form.elements.hasta.value = destino;
  }

  // Al elegir una plantilla de estado se proponen su duración y sus puntos.
  function proponerEstado() {
    const p = buscar(datos.catalogo.estados, form.elements.estado.value);
    if (!p) return;
    form.elements.duracion.value = p.duracion_entregas ?? 1;
    form.elements.puntos.value = p.efecto?.puntos ?? 0;
  }

  function rellenar(valores) {
    if (valores.tipo) { form.elements.tipo.value = valores.tipo; }
    if (valores.grupo !== undefined) form.elements.grupo.value = valores.grupo;
    actualizarCampos();
    if (valores.grupo !== undefined) { form.elements.grupo.value = valores.grupo; actualizarMiembros(); }
    if (valores.tipo === 'avance' || valores.tipo === 'retroceso') proponerDestino();
    for (const k of ['hasta', 'motivo', 'puntos']) if (valores[k] !== undefined) form.elements[k].value = valores[k];
  }

  function leerFormulario() {
    const f = form.elements;
    const tipo = f.tipo.value;
    const campos = CAMPOS[tipo];
    const usa = c => campos.includes(c);
    const datosEv = {};
    if (usa('hasta')) datosEv.hasta = f.hasta.value;
    if (usa('objeto')) datosEv.objeto = f.objeto.value;
    if (usa('estado')) datosEv.estado = f.estado.value;
    if (usa('duracion')) datosEv.duracion_entregas = f.duracion.value;
    if (usa('hito')) datosEv.hito = f.hito.value;
    if (usa('logro')) datosEv.logro = f.logro.value;
    if (usa('entrega')) datosEv.entrega = f.entrega.value;
    if (usa('nota')) datosEv.nota = f.nota.value;
    if (usa('comentario')) datosEv.comentario = f.comentario.value;
    if (usa('texto')) datosEv.texto = f.texto.value;
    if (usa('motivo')) datosEv.motivo = f.motivo.value;
    if (usa('criterios')) {
      datosEv.criterios = {};
      form.querySelectorAll('[name^="crit-"]').forEach(i => { if (i.value !== '') datosEv.criterios[i.name.slice(5)] = i.value; });
    }
    return {
      aventura: avId, ambito: f.ambito.value, tipo,
      grupo: usa('grupo') ? f.grupo.value || null : null,
      miembro: usa('miembro') ? f.miembro.value || null : null,
      puntos: usa('puntos') ? f.puntos.value : 0,
      visible_publico: usa('publico') ? f.publico.checked : true,
      datos: datosEv,
    };
  }

  // Resumen legible de lo que se va a registrar (con la aventura bien visible).
  function resumenFormulario() {
    const filas = [['Abentura', form.elements.ambito.value === 'global' ? 'BI ABENTURAK' : nombreAv()], ['Mota', TIPOS[form.elements.tipo.value]]];
    form.querySelectorAll('[data-campo]:not([hidden])').forEach(el => {
      const campo = el.querySelector('select, input, textarea');
      if (!campo) return;
      const valor = campo.type === 'checkbox' ? (campo.checked ? 'Bai' : 'Ez') : campo.tagName === 'SELECT' ? campo.selectedOptions[0]?.textContent : campo.value;
      const etiqueta = (campo.type === 'checkbox' ? el.textContent : el.firstChild.textContent).trim();
      if (valor !== '' && valor != null) filas.push([etiqueta, valor]);
    });
    form.querySelectorAll('[name^="crit-"]').forEach(i => { if (!i.closest('[hidden]') && i.value !== '') filas.push([i.parentElement.firstChild.textContent.trim(), i.value]); });
    return `<dl class="resumen">${filas.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
  }

  async function enviar() {
    const entrada = leerFormulario();
    const titulo = entrada.ambito === 'global' ? 'Bi abenturetan erregistratu?' : `${nombreAv()}-n erregistratu?`;
    if (!await confirmar(titulo, resumenFormulario())) return;
    try {
      const r = await api('/api/evento', entrada);
      avisar(`✔ #${r.evento.id} erregistratuta (${r.registro === 'privado' ? 'pribatua' : r.registro === 'global' ? 'bi abenturak' : nombreAv()})`);
      for (const k of ['motivo', 'comentario', 'texto', 'nota']) form.elements[k].value = '';
      form.querySelectorAll('[name^="crit-"]').forEach(i => { i.value = ''; });
      await recargar();
    } catch (e) {
      avisar('✖ ' + e.message, 'error');
    }
  }

  async function anular(registro, id) {
    const lista = registro === 'global' ? datos.globales : registro === 'privado' ? datos.privado.eventos : av().eventos;
    const ev = buscar(lista, id);
    const html = `<p>Gertaera hau baliogabetuko da (ez da ezabatzen: historian marratuta geratzen da).</p>
      <p class="resumen-ev"><b>#${id} ${esc(TIPOS[ev.tipo])}</b> — ${esc(resumen({ ...ev, registro }))}</p>
      <label>Arrazoia <input type="text" id="d-motivo" required maxlength="1000"></label>`;
    if (!await confirmar('Baliogabetu?', html, 'Baliogabetu')) return;
    const motivo = $('d-motivo').value;
    try {
      await api('/api/evento', { aventura: avId, ambito: registro === 'global' ? 'global' : 'aventura', registro, tipo: 'anulacion', referencia: id, datos: { motivo } });
      avisar(`✔ #${id} baliogabetuta`);
      await recargar();
    } catch (e) {
      avisar('✖ ' + e.message, 'error');
    }
  }

  async function verificarCadenas() {
    try {
      const r = await api('/api/verificar');
      if (r.ok) avisar('✔ Erregistro guztiak osorik daude');
      else avisar('✖ ' + r.informe.filter(x => x.errores.length).map(x => `${x.registro}: ${x.errores.join('; ')}`).join(' | '), 'error');
    } catch (e) { avisar('✖ ' + e.message, 'error'); }
  }

  // ---------- Carga ----------
  async function recargar() {
    datos = await api('/api/datos');
    const activas = datos.config.aventuras.filter(a => a.activa);
    const pedida = location.hash.slice(1);
    avId = activas.some(a => a.id === pedida) ? pedida : activas[0].id;
    const a = av();
    estado = Motor.calcularEstado(avId, a.eventos, datos.globales, datos.catalogo, a.tablero, datos.grupos, datos.config);
    estado.cerradas = new Set(estado.eventos.filter(e => e.tipo === 'entrega_cerrada' && !e.anulado).map(e => e.datos.entrega));

    const tipo = form.elements.tipo.value, grupo = form.elements.grupo.value;
    pintarCabecera();
    prepararSelects();
    if (tipo) form.elements.tipo.value = tipo;
    rellenar({ grupo: grupo || undefined });
    pintarControl();
    pintarUltimos();
    pintarKonparaketa();
    for (const m of Admin.modulos) m.pintar();
  }

  // ---------- Panel comparado: los grupos en todas las aventuras a la vez ----------
  function pintarKonparaketa() {
    const avs = datos.config.aventuras.filter(a => a.activa);
    const estados = Object.fromEntries(avs.map(a => {
      const d = datos.aventuras[a.id];
      return [a.id, Motor.calcularEstado(a.id, d.eventos, datos.globales, datos.catalogo, d.tablero, datos.grupos, datos.config)];
    }));
    const celda = (a, g) => {
      const e = estados[a.id].grupos[g.id];
      const orden = Motor.ordenCasillas(datos.aventuras[a.id].tablero);
      const total = orden.length;
      const n = orden.findIndex(c => c.id === e.posicion) + 1;
      return `<td><div class="xp"><div class="xp-relleno" style="width:${100 * (n - 1) / (total - 1)}%"></div><span>${n} / ${total}</span></div>
        <small>${e.puntos} pt · ${esc(e.nivel.titulo)}</small></td>`;
    };
    $('mod-konparaketa').innerHTML = `<table class="tabla"><thead><tr><th>Taldea</th>${avs.map(a =>
      `<th style="color:${esc(a.color_acento)}">${esc(a.nombre)}</th>`).join('')}</tr></thead><tbody>${grupos().map(g =>
      `<tr><th style="border-left:5px solid ${esc(g.color)}">${esc(g.nombre)}</th>${avs.map(a => celda(a, g)).join('')}</tr>`).join('')}</tbody></table>`;
  }

  // ---------- Navegación entre módulos ----------
  function irA(modulo) {
    document.querySelectorAll('[data-modulo]').forEach(m => { m.hidden = m.dataset.modulo !== modulo; });
    document.querySelectorAll('[data-ir]').forEach(b => b.toggleAttribute('aria-current', b.dataset.ir === modulo));
  }

  // Lo que comparten los demás módulos del panel (entidades.js, valoraciones.js).
  window.Admin = {
    api, avisar, confirmar, esc, buscar, opciones, recargar, eventosVisibles, resumen, TIPOS, modulos: [],
    get datos() { return datos; }, get avId() { return avId; }, get estado() { return estado; },
    nombreAv: () => nombreAv(), nombreCasilla: id => nombreCasilla(id),
  };

  async function iniciar() {
    if (TOKEN.startsWith('%%')) {
      $('contenido').innerHTML = `<p class="aviso-error pergamino">Panel hau zure ordenagailuan bakarrik dabil.<br>
        Ireki terminal bat proiektuaren karpetan eta exekutatu <code>node admin.js</code>, gero ireki <code>http://localhost:3000/admin.html</code>.</p>`;
      return;
    }
    // Al cambiar de tipo se vacían los puntos para no arrastrar los del evento anterior.
    form.elements.tipo.onchange = () => { form.elements.puntos.value = 0; actualizarCampos(); };
    form.elements.ambito.forEach(r => r.onchange = actualizarCampos);
    form.elements.grupo.onchange = () => { actualizarMiembros(); if (/avance|retroceso/.test(form.elements.tipo.value)) proponerDestino(); };
    form.elements.estado.onchange = proponerEstado;
    form.onsubmit = e => { e.preventDefault(); enviar(); };
    $('verificar').onclick = verificarCadenas;
    document.querySelectorAll('[data-ir]').forEach(b => b.onclick = () => irA(b.dataset.ir));
    addEventListener('hashchange', () => recargar().catch(e => avisar('✖ ' + e.message, 'error')));
    try { await recargar(); } catch (e) {
      $('contenido').innerHTML = `<p class="aviso-error pergamino" role="alert">Ezin izan da zerbitzariarekin konektatu: ${esc(e.message)}</p>`;
    }
  }

  iniciar();
})();
