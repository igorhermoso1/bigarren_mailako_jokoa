// Valoraciones: historial completo por grupo y por miembro (con medias, gráfica y tendencia) y valoración por lotes.
// Corregir una nota = registrar una nueva para la misma entrega; la anterior queda como «zuzendua».
(function () {
  const A = window.Admin;
  const { esc, buscar } = A;
  let grupoSel = null;
  let miembroSel = null;
  let soloEsta = true; // filtro: solo la aventura activa o todas

  const media = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  const redondear = n => n == null ? '—' : (Math.round(n * 100) / 100).toString();
  const nombreEntrega = ev => buscar(A.datos.aventuras[ev.aventura]?.entregas.entregas, ev.datos.entrega)?.nombre || ev.datos.entrega;
  const nombreAventura = id => buscar(A.datos.config.aventuras, id)?.nombre || id;

  // Notas de un tipo (de los registros público y privado), con su estado: indarrean / zuzendua / baliogabetua.
  function historial(tipo, filtro) {
    const d = A.datos;
    const marcar = (lista, registro) => {
      const anulados = new Set(lista.filter(e => e.tipo === 'anulacion').map(e => e.referencia));
      return lista.filter(e => e.tipo === tipo && filtro(e)).map(e => ({ ...e, registro, anulado: anulados.has(e.id) }));
    };
    const todas = [
      ...Object.values(d.aventuras).flatMap(a => marcar(a.eventos, 'aventura')),
      ...marcar(d.privado.eventos, 'privado'),
    ].filter(e => !soloEsta || e.aventura === A.avId)
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha) || a.id - b.id);
    // La vigente de cada entrega es la última no anulada; las anteriores quedan como corregidas.
    const vigente = {};
    for (const e of todas) if (!e.anulado) vigente[e.aventura + '|' + e.datos.entrega] = e;
    for (const e of todas) e.situacion = e.anulado ? 'baliogabetua' : vigente[e.aventura + '|' + e.datos.entrega] === e ? 'indarrean' : 'zuzendua';
    return { todas, vigentes: todas.filter(e => e.situacion === 'indarrean') };
  }

  // Gráfica de líneas sencilla en SVG. series: [{ nombre, color, valores: [{ etiqueta, valor }] }]
  function grafica(series, max = 10) {
    const etiquetas = [...new Set(series.flatMap(s => s.valores.map(v => v.etiqueta)))];
    if (!etiquetas.length) return '<p class="vacio">Oraindik ez dago daturik grafikorako.</p>';
    const W = 600, H = 180, M = 28;
    const x = i => etiquetas.length === 1 ? W / 2 : M + i * (W - 2 * M) / (etiquetas.length - 1);
    const y = v => H - M - (v / max) * (H - 2 * M);
    const lineas = series.map(s => {
      const pts = s.valores.map(v => [x(etiquetas.indexOf(v.etiqueta)), y(v.valor), v]);
      return `<polyline fill="none" stroke="${esc(s.color)}" stroke-width="3" stroke-linejoin="round" points="${pts.map(p => p[0] + ',' + p[1]).join(' ')}"${s.discontinua ? ' stroke-dasharray="6 5"' : ''}/>` +
        pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="4.5" fill="${esc(s.color)}"><title>${esc(p[2].etiqueta)}: ${p[2].valor}</title></circle>`).join('');
    }).join('');
    const rejilla = [0, max / 2, max].map(v => `<line x1="${M}" x2="${W - M}" y1="${y(v)}" y2="${y(v)}" stroke="#8a642455"/><text x="4" y="${y(v) + 4}" font-size="11" fill="currentColor">${v}</text>`).join('');
    const leyenda = series.length > 1 ? `<p class="leyenda">${series.map(s => `<span style="--c:${esc(s.color)}">${esc(s.nombre)}</span>`).join('')}</p>` : '';
    return `<svg class="grafica" viewBox="0 0 ${W} ${H}" role="img" aria-label="Bilakaera">${rejilla}${lineas}</svg>${leyenda}`;
  }

  const etiquetaNota = e => soloEsta ? nombreEntrega(e) : `${nombreAventura(e.aventura)}: ${nombreEntrega(e)}`;
  const chipSituacion = e => `<span class="chip ${e.situacion}">${{ indarrean: '✔ Indarrean', zuzendua: '✎ Zuzendua', baliogabetua: '✖ Baliogabetua' }[e.situacion]}</span>`;

  function bloqueGrupo(g) {
    const { todas, vigentes } = historial('nota_grupo', e => e.grupo === g.id);
    const notas = vigentes.map(e => e.datos.nota);
    const filas = todas.slice().reverse().map(e => `<tr class="${e.situacion}">
        <td>${esc(new Date(e.fecha).toLocaleDateString())}</td>${soloEsta ? '' : `<td>${esc(nombreAventura(e.aventura))}</td>`}
        <td>${esc(nombreEntrega(e))}</td><td class="num">${esc(e.datos.nota)}</td><td>${esc(e.datos.comentario || '')}</td>
        <td>${e.registro === 'privado' ? '🔒 Pribatua' : '👁 Publikoa'}</td><td>${chipSituacion(e)}</td>
        <td>${e.situacion === 'indarrean' ? `<button type="button" class="boton-sec pequeno" data-corregir="${esc(e.aventura)}|${esc(e.datos.entrega)}">Zuzendu</button>` : ''}</td></tr>`).join('');
    return `<section class="pergamino caja">
      <h2>${esc(g.nombre)}: taldearen balorazioak</h2>
      <div class="kpis"><div><b>${redondear(media(notas))}</b><small>Batez bestekoa</small></div>
        <div><b>${vigentes.length}</b><small>Entrega baloratuak</small></div>
        <div><b>${vigentes.length ? esc(vigentes.at(-1).datos.nota) : '—'}</b><small>Azkena</small></div></div>
      ${grafica([{ nombre: g.nombre, color: g.color, valores: vigentes.map(e => ({ etiqueta: etiquetaNota(e), valor: e.datos.nota })) }])}
      <form class="formulario fila-form" data-nota-grupo>
        <label>Entrega <select name="entrega">${A.opciones(A.datos.aventuras[A.avId].entregas.entregas)}</select></label>
        <label>Nota <input type="number" name="nota" min="0" max="10" step="0.25" required></label>
        <label class="crece">Iruzkina <input type="text" name="comentario" maxlength="1000"></label>
        <label class="check"><input type="checkbox" name="publico" checked> Publikoa</label>
        <button type="submit" class="boton-pri">Baloratu ${esc(A.nombreAv())}-n</button>
      </form>
      <table class="tabla"><thead><tr><th>Data</th>${soloEsta ? '' : '<th>Abentura</th>'}<th>Entrega</th><th>Nota</th><th>Iruzkina</th><th>Ikusgai</th><th>Egoera</th><th></th></tr></thead>
        <tbody>${filas || '<tr><td colspan="8" class="vacio">Baloraziorik ez.</td></tr>'}</tbody></table>
    </section>`;
  }

  function bloqueMiembro(g, m) {
    const rubrica = A.datos.privado.rubricas[A.avId] || { escala: [0, 10], criterios: [] };
    const max = rubrica.escala[1];
    const { todas, vigentes } = historial('nota_miembro', e => e.miembro === m.id);
    const criterios = [...new Map([...rubrica.criterios, ...vigentes.flatMap(e => Object.keys(e.datos.criterios).map(id => ({ id, nombre: id })))]
      .map(c => [c.id, c])).values()];
    const globalDe = e => media(Object.values(e.datos.criterios));
    const medias = criterios.map(c => media(vigentes.map(e => e.datos.criterios[c.id]).filter(v => v != null)));
    const globales = vigentes.map(globalDe);
    const tendencia = globales.length < 2 ? '' : globales.at(-1) - globales.at(-2) > 0.25 ? '↑ Gora' : globales.at(-1) - globales.at(-2) < -0.25 ? '↓ Behera' : '→ Egonkor';
    const notasGrupo = historial('nota_grupo', e => e.grupo === g.id).vigentes;
    const filas = todas.slice().reverse().map(e => `<tr class="${e.situacion}">
        <td>${esc(new Date(e.fecha).toLocaleDateString())}</td><td>${esc(etiquetaNota(e))}</td>
        ${criterios.map(c => `<td class="num">${esc(e.datos.criterios[c.id] ?? '')}</td>`).join('')}
        <td class="num"><b>${redondear(globalDe(e))}</b></td><td>${esc(e.datos.comentario || '')}</td><td>${chipSituacion(e)}</td>
        <td>${e.situacion !== 'baliogabetua' ? `<button type="button" class="boton-mal pequeno" data-anular="${e.id}">Baliogabetu</button>` : ''}</td></tr>`).join('');
    return `<section class="pergamino caja">
      <div class="sub-pestanas">${g.miembros.filter(x => x.activo).map(x =>
        `<button type="button" data-miembro="${esc(x.id)}" aria-selected="${x.id === m.id}">${esc(x.alias)}</button>`).join('')}</div>
      <h2>${esc(m.alias)}: banakako balorazioak 🔒</h2>
      <div class="kpis"><div><b>${redondear(media(globales))}</b><small>Batez besteko orokorra</small></div>
        ${criterios.map((c, i) => `<div><b>${redondear(medias[i])}</b><small>${esc(c.nombre)}</small></div>`).join('')}
        <div><b>${tendencia || '—'}</b><small>Joera</small></div>
        <div><b>${redondear(media(notasGrupo.map(e => e.datos.nota)))}</b><small>Taldearen batez bestekoa</small></div></div>
      ${grafica([
        { nombre: m.alias, color: g.color, valores: vigentes.map(e => ({ etiqueta: etiquetaNota(e), valor: Math.round(globalDe(e) * 100) / 100 })) },
        { nombre: 'Taldea', color: '#7a5c3c', discontinua: true, valores: notasGrupo.map(e => ({ etiqueta: etiquetaNota(e), valor: e.datos.nota })) },
      ], max)}
      <table class="tabla"><thead><tr><th>Data</th><th>Entrega</th>${criterios.map(c => `<th>${esc(c.nombre)}</th>`).join('')}<th>Orokorra</th><th>Iruzkina</th><th>Egoera</th><th></th></tr></thead>
        <tbody>${filas || `<tr><td colspan="${criterios.length + 6}" class="vacio">Baloraziorik ez.</td></tr>`}</tbody></table>
      <p class="vacio">Zuzentzeko: baloratu berriro entrega bera behean; aurrekoa «zuzendua» geratuko da.</p>
    </section>`;
  }

  function bloqueLotes(g) {
    const rubrica = A.datos.privado.rubricas[A.avId];
    if (!rubrica) return '<section class="pergamino caja"><p class="vacio">Ez dago errubrikarik abentura honetarako.</p></section>';
    const crit = rubrica.criterios.filter(c => c.activo !== false);
    return `<section class="pergamino caja">
      <h2>Loteka baloratu: ${esc(g.nombre)} 🔒</h2>
      <form class="formulario" data-lotes>
        <label>Entrega <select name="entrega">${A.opciones(A.datos.aventuras[A.avId].entregas.entregas)}</select></label>
        <table class="tabla"><thead><tr><th>Kidea</th>${crit.map(c => `<th>${esc(c.nombre)}</th>`).join('')}<th>Iruzkina</th></tr></thead>
        <tbody>${g.miembros.filter(m => m.activo).map(m => `<tr data-m="${esc(m.id)}"><th>${esc(m.alias)}</th>
          ${crit.map(c => `<td><input type="number" name="${esc(c.id)}" min="${rubrica.escala[0]}" max="${rubrica.escala[1]}" step="0.25" aria-label="${esc(m.alias)}: ${esc(c.nombre)}"></td>`).join('')}
          <td><input type="text" name="comentario" maxlength="1000" aria-label="${esc(m.alias)}: iruzkina"></td></tr>`).join('')}</tbody></table>
        <button type="submit" class="boton-pri">Gorde guztiak (${esc(A.nombreAv())})</button>
      </form>
    </section>`;
  }

  async function registrar(cuerpo) {
    try { await A.api('/api/evento', cuerpo); return true; } catch (e) { A.avisar('✖ ' + e.message, 'error'); return false; }
  }

  function pintar() {
    const cont = document.getElementById('mod-balorazioak');
    const grupos = A.datos.grupos.grupos.filter(g => g.activo);
    const g = buscar(grupos, grupoSel) || grupos[0];
    grupoSel = g.id;
    const m = buscar(g.miembros, miembroSel) || g.miembros.find(x => x.activo);
    miembroSel = m?.id;
    cont.innerHTML = `<div class="barra-sel">
        <div class="sub-pestanas">${grupos.map(x => `<button type="button" data-grupo="${esc(x.id)}" aria-selected="${x.id === g.id}" style="--color:${esc(x.color)}">${esc(x.nombre)}</button>`).join('')}</div>
        <label class="check"><input type="checkbox" data-todas${soloEsta ? '' : ' checked'}> Abentura guztiak erakutsi</label>
      </div>
      ${bloqueGrupo(g)}${m ? bloqueMiembro(g, m) : ''}${bloqueLotes(g)}`;

    cont.querySelectorAll('[data-grupo]').forEach(b => b.onclick = () => { grupoSel = b.dataset.grupo; miembroSel = null; pintar(); });
    cont.querySelectorAll('[data-miembro]').forEach(b => b.onclick = () => { miembroSel = b.dataset.miembro; pintar(); });
    cont.querySelector('[data-todas]').onchange = e => { soloEsta = !e.target.checked; pintar(); };

    const fNota = cont.querySelector('[data-nota-grupo]');
    cont.querySelectorAll('[data-corregir]').forEach(b => b.onclick = () => {
      const [av, entrega] = b.dataset.corregir.split('|');
      if (av !== A.avId) return A.avisar(`Aldatu ${nombreAventura(av)} abenturara zuzentzeko`, 'error');
      fNota.elements.entrega.value = entrega;
      fNota.elements.nota.focus();
    });
    fNota.onsubmit = async e => {
      e.preventDefault();
      const f = fNota.elements;
      const ent = f.entrega.selectedOptions[0]?.textContent;
      if (!await A.confirmar(`${A.nombreAv()}-n baloratu?`, `<dl class="resumen"><dt>Abentura</dt><dd>${esc(A.nombreAv())}</dd><dt>Taldea</dt><dd>${esc(g.nombre)}</dd>
        <dt>Entrega</dt><dd>${esc(ent)}</dd><dt>Nota</dt><dd>${esc(f.nota.value)}</dd><dt>Ikusgai</dt><dd>${f.publico.checked ? 'Publikoa' : '🔒 Pribatua'}</dd></dl>`)) return;
      if (await registrar({ aventura: A.avId, tipo: 'nota_grupo', grupo: g.id, visible_publico: f.publico.checked,
        datos: { entrega: f.entrega.value, nota: f.nota.value, comentario: f.comentario.value } })) { A.avisar('✔ Balorazioa gordeta'); A.recargar(); }
    };

    cont.querySelectorAll('[data-anular]').forEach(b => b.onclick = async () => {
      if (!await A.confirmar('Baliogabetu?', '<label>Arrazoia <input type="text" id="d-motivo" maxlength="1000"></label>', 'Baliogabetu')) return;
      if (await registrar({ aventura: A.avId, registro: 'privado', tipo: 'anulacion', referencia: Number(b.dataset.anular), datos: { motivo: document.getElementById('d-motivo').value } })) {
        A.avisar('✔ Baliogabetuta'); A.recargar();
      }
    });

    const fLotes = cont.querySelector('[data-lotes]');
    if (fLotes) fLotes.onsubmit = async e => {
      e.preventDefault();
      const filas = [...fLotes.querySelectorAll('tr[data-m]')].map(tr => {
        const criterios = {};
        tr.querySelectorAll('input[type=number]').forEach(i => { if (i.value !== '') criterios[i.name] = i.value; });
        return { miembro: tr.dataset.m, criterios, comentario: tr.querySelector('[name=comentario]').value };
      }).filter(f => Object.keys(f.criterios).length);
      if (!filas.length) return A.avisar('Ez dago baloraziorik idatzita', 'error');
      const entrega = fLotes.elements.entrega;
      if (!await A.confirmar(`${filas.length} kide baloratu?`, `<dl class="resumen"><dt>Abentura</dt><dd>${esc(A.nombreAv())}</dd><dt>Taldea</dt><dd>${esc(g.nombre)}</dd>
        <dt>Entrega</dt><dd>${esc(entrega.selectedOptions[0]?.textContent)}</dd>${filas.map(f => `<dt>${esc(buscar(g.miembros, f.miembro).alias)}</dt><dd>${esc(Object.values(f.criterios).join(' · '))}</dd>`).join('')}</dl>`)) return;
      let ok = 0;
      for (const f of filas) if (await registrar({ aventura: A.avId, tipo: 'nota_miembro', grupo: g.id, miembro: f.miembro, datos: { entrega: entrega.value, criterios: f.criterios, comentario: f.comentario } })) ok++;
      A.avisar(`✔ ${ok} / ${filas.length} balorazio gordeta`, ok === filas.length ? 'ok' : 'error');
      A.recargar();
    };
  }

  A.modulos.push({ pintar });
})();
