// Módulo «Borrokak»: preguntas de combate de cada tema (5 por casilla, privadas), botón para empezar
// un combate con un grupo (se abre borroka.html, pensado para el proyector) y resumen de los combates hechos.
(function () {
  const A = window.Admin;
  const { esc, buscar } = A;
  let casillaSel = null;

  function pintar() {
    const cont = document.getElementById('mod-borrokak');
    cont.replaceChildren();
    const av = A.datos.aventuras[A.avId];
    const orden = Motor.ordenCasillas(av.tablero).filter(c => c.tipo !== 'meta');
    if (!orden.length) { cont.innerHTML = '<p class="vacio">Ez dago laukirik.</p>'; return; }
    if (!orden.some(c => c.id === casillaSel)) casillaSel = orden[0].id;
    const galderak = A.datos.privado.galderak?.[A.avId] || {};
    const kopurua = id => (galderak[id] || []).filter(q => q.activo !== false).length;
    const c = buscar(orden, casillaSel);
    const grupos = A.datos.grupos.grupos.filter(g => g.activo);
    const combates = av.eventos.filter(e => e.tipo === 'borroka' && e.datos.casilla === c.id);
    const anulados = new Set(av.eventos.filter(e => e.tipo === 'anulacion').map(e => e.referencia));

    const cab = document.createElement('section');
    cab.className = 'pergamino caja';
    cab.innerHTML = `<h2>⚔️ Borrokak: ${esc(A.nombreAv())}</h2>
      <p class="vacio">Gai bakoitzak bere galderak ditu (5 gomendatuta). Galdera bakoitza etsai bat da. Galderak <b>pribatuak</b> dira: ez dira inoiz GitHub-era igotzen.</p>
      <div class="sub-pestanas borroka-gaiak">${orden.map((x, i) => `<button type="button" data-c="${esc(x.id)}" aria-selected="${x.id === c.id}">
        ${i + 1}. ${esc(x.nombre)} <span class="g-kop ${kopurua(x.id) >= 5 ? 'osoa' : ''}">${kopurua(x.id)}</span></button>`).join('')}</div>
      <div class="borroka-hasi formulario fila-form">
        <label>Taldea <select id="b-taldea">${grupos.map(g => `<option value="${esc(g.id)}">${esc(g.nombre)}</option>`).join('')}</select></label>
        <button type="button" class="boton-pri" id="b-hasi" ${kopurua(c.id) ? '' : 'disabled'}>⚔ Borroka hasi (${kopurua(c.id)} etsai)</button>
        <span class="vacio">Leiho berri batean irekitzen da: jarri proiektorean.</span>
      </div>`;
    cab.querySelectorAll('[data-c]').forEach(btn => btn.onclick = () => { casillaSel = btn.dataset.c; pintar(); });
    cab.querySelector('#b-hasi').onclick = () => {
      const grupo = cab.querySelector('#b-taldea').value;
      open(`borroka.html?aventura=${encodeURIComponent(A.avId)}&casilla=${encodeURIComponent(c.id)}&grupo=${encodeURIComponent(grupo)}`, '_blank');
    };
    cont.append(cab);

    // Editor de preguntas de esta casilla (el mismo editor genérico que el resto del panel).
    A.editor(cont, {
      titulo: `${c.nombre}: galderak (etsaiak)`, coleccion: 'galderak', items: galderak[c.id] || [], extra: { aventura: A.avId, casilla: c.id },
      etiqueta: (q, i) => `${i + 1}. ${q.testua.length > 60 ? q.testua.slice(0, 60) + '…' : q.testua}`,
    });

    // Combates ya hechos en este tema.
    const sec = document.createElement('section');
    sec.className = 'pergamino caja';
    const kidea = (g, id) => buscar(g?.miembros, id)?.alias || id;
    sec.innerHTML = `<h2>Egindako borrokak</h2>` + (combates.length ? `<table class="tabla"><thead><tr><th>Data</th><th>Taldea</th><th>Emaitza</th><th>Txandak</th></tr></thead><tbody>${
      combates.slice().reverse().map(e => {
        const g = buscar(A.datos.grupos.grupos, e.grupo);
        return `<tr class="${anulados.has(e.id) ? 'baliogabetua' : ''}"><td>${esc(new Date(e.fecha).toLocaleString())}</td><td>${esc(g?.nombre || e.grupo)}</td>
          <td><b>${e.datos.asmatuak} / ${e.datos.guztira}</b> · ${{ garaipena: '🏆 Garaipena', porrota: '💀 Porrota', amaitu_gabe: '⏸ Amaitu gabe' }[e.datos.emaitza]}</td>
          <td>${e.datos.txandak.map(t => `<span class="txanda ${t.zuzena ? 'ondo' : 'gaizki'}">${t.zuzena ? '✔' : '✖'} ${esc(kidea(g, t.kidea))}${t.objektuak ? ' 🎒' : ''}</span>`).join(' ')}</td></tr>`;
      }).join('')}</tbody></table><p class="vacio">Borroka bat baliogabetzeko: ⚔️ Kontrola → Azken gertaerak.</p>` : '<p class="vacio">Oraindik ez da borrokarik egin gai honetan.</p>');
    cont.append(sec);
  }

  A.modulos.push({ pintar });
})();
