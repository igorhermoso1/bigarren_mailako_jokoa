// Módulo «Borrokak», en tres pasos: ① elegir el tema (lista de la izquierda), ② preparar sus enemigos
// (preguntas privadas, 5 recomendadas) y ③ empezar el combate con un grupo (se abre borroka.html, pensado
// para el proyector). Debajo, los combates ya hechos en ese tema.
(function () {
  const A = window.Admin;
  const { esc, buscar } = A;
  const GOMENDATUA = 5;
  const EMAITZA = { garaipena: '🏆 Garaipena', porrota: '💀 Porrota', amaitu_gabe: '⏸ Amaitu gabe' };
  let casillaSel = null;
  let editorIrekia = false, korritu = false; // el editor solo se ve tras pulsar una tarjeta

  function pintar() {
    const cont = document.getElementById('mod-borrokak');
    cont.replaceChildren();
    const av = A.datos.aventuras[A.avId];
    const orden = Motor.ordenCasillas(av.tablero).filter(c => c.tipo !== 'meta');
    if (!orden.length) { cont.innerHTML = '<p class="vacio">Ez dago laukirik.</p>'; return; }
    if (!orden.some(c => c.id === casillaSel)) casillaSel = orden[0].id;
    const galderak = A.datos.privado.galderak?.[A.avId] || {};
    const aktiboak = id => (galderak[id] || []).filter(q => q.activo !== false);
    const c = buscar(orden, casillaSel);
    const n = aktiboak(c.id).length;
    const grupos = A.datos.grupos.grupos.filter(g => g.activo);
    const anulados = new Set(av.eventos.filter(e => e.tipo === 'anulacion').map(e => e.referencia));
    const borrokak = av.eventos.filter(e => e.tipo === 'borroka' && !anulados.has(e.id));
    const azkena = (g, casilla) => borrokak.filter(e => e.grupo === g.id && e.datos.casilla === casilla).pop();
    const pipak = k => `<span class="b-pipak" aria-label="${k} / ${GOMENDATUA}">${Array.from({ length: Math.max(GOMENDATUA, k) }, (_, i) =>
      `<i class="${i < k ? 'bete' : ''}"></i>`).join('')}</span>`;

    const panela = document.createElement('div');
    panela.className = 'b-panela';
    panela.innerHTML = `
      <ol class="b-urratsak" aria-label="Urratsak">
        <li class="egina"><b>1</b> Gaia aukeratu</li>
        <li class="${n >= GOMENDATUA ? 'egina' : 'orain'}"><b>2</b> Etsaiak prestatu <small>${n} / ${GOMENDATUA}</small></li>
        <li class="${n ? 'orain' : ''}"><b>3</b> Borroka hasi</li>
      </ol>
      <nav class="b-gaiak pergamino caja" aria-label="Gaiak">
        <h2>① Gaiak</h2>
        <ul>${orden.map((x, i) => {
          const k = aktiboak(x.id).length;
          return `<li><button type="button" data-c="${esc(x.id)}" ${x.id === c.id ? 'aria-current="true"' : ''}>
            <span class="b-zenb">${i + 1}</span><span class="b-izena">${esc(x.nombre)}</span>${pipak(k)}${k >= GOMENDATUA ? '<span class="b-prest" title="Prest">✔</span>' : ''}</button></li>`;
        }).join('')}</ul>
      </nav>
      <div class="b-nagusia">
        <section class="pergamino caja b-gaia">
          <h2>② ${orden.indexOf(c) + 1}. ${esc(c.nombre)}: etsaiak</h2>
          <p class="vacio">Galdera bakoitza etsai bat da (4 erantzun, bat zuzena). Sakatu txartel bat aldatzeko. Galderak <b>pribatuak</b> dira: ez dira inoiz GitHub-era igotzen.</p>
          <div class="b-etsaiak">${(galderak[c.id] || []).map((q, i) => `<button type="button" class="b-etsaia${q.activo === false ? ' archivado' : ''}" data-q="${esc(q.id)}">
              ${A.etsaiIrudia(q.etsaia)}<span class="b-etsaia-buru">👹 ${i + 1}. etsaia${q.pista ? ' <span title="Pista du">💡</span>' : ''}${q.activo === false ? ' <small>(artxibatua)</small>' : ''}</span>
              <span class="b-testua">${esc(q.testua)}</span>
              <span class="b-aukerak">${q.aukerak.map((o, j) => `<span class="${j === q.zuzena ? 'zuzena' : ''}"><b>${'ABCD'[j]}</b> ${esc(o)}</span>`).join('')}</span>
            </button>`).join('')}
            <button type="button" class="b-etsaia b-berria" data-q="__nuevo">＋<br>Etsai berria</button>
          </div>
        </section>
        <div class="b-editorea"></div>
        <section class="pergamino caja b-hasi">
          <h2>③ Borroka hasi</h2>
          ${n ? `<p class="vacio">Aukeratu taldea: borroka leiho berri batean irekitzen da (jarri proiektorean). <b>${n}</b> etsai, <b>${n}</b> bizitza.</p>` :
            '<p class="b-oharra">⚠ Gai honek ez du etsairik oraindik: sortu gutxienez galdera bat goian.</p>'}
          <div class="b-taldeak">${grupos.map(g => {
            const kideak = (g.miembros || []).filter(m => m.activo !== false).length;
            const bk = azkena(g, c.id);
            return `<button type="button" class="b-taldea" data-g="${esc(g.id)}" style="--color:${esc(g.color)}" ${n && kideak ? '' : 'disabled'}>
              <span class="b-fitxa" data-ficha="${esc(g.id)}"></span>
              <span><b>${esc(g.nombre)}</b><br><small>${kideak ? `${kideak} kide` : 'Kiderik ez (gehitu «Taldeak eta fitxak» atalean)'}</small><br>
              <small>${bk ? `Azkena: ${EMAITZA[bk.datos.emaitza]} ${bk.datos.asmatuak}/${bk.datos.guztira}` : 'Oraindik borrokarik ez'}</small></span>
              <span class="b-ezpata" aria-hidden="true">⚔</span></button>`;
          }).join('')}</div>
        </section>
      </div>`;
    panela.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { casillaSel = b.dataset.c; editorIrekia = false; pintar(); });
    panela.querySelectorAll('[data-ficha]').forEach(el => el.append(Mapa.crearFicha(buscar(grupos, el.dataset.ficha), A.datos.config)));
    panela.querySelectorAll('[data-g]').forEach(b => b.onclick = () =>
      open(`borroka.html?aventura=${encodeURIComponent(A.avId)}&casilla=${encodeURIComponent(c.id)}&grupo=${encodeURIComponent(b.dataset.g)}`, '_blank'));
    cont.append(panela);

    // Editor genérico del panel; su lista queda oculta (CSS) porque las tarjetas de arriba hacen de lista:
    // al pulsar una tarjeta se pulsa el botón equivalente de esa lista.
    const ed = panela.querySelector('.b-editorea');
    const elegida = A.editor(ed, {
      titulo: 'Etsaia editatu', coleccion: 'galderak', items: galderak[c.id] || [], extra: { aventura: A.avId, casilla: c.id },
      etiqueta: (q, i) => `${i + 1}. ${q.testua}`,
    });
    const editando = elegida?.id ?? (ed.querySelector('.ed-form') ? '__nuevo' : null);
    ed.hidden = !(editorIrekia && editando);
    ed.querySelector('h2').insertAdjacentHTML('beforeend', '<button type="button" class="boton-sec b-itxi">✕ Itxi</button>');
    ed.querySelector('.b-itxi').onclick = () => { editorIrekia = false; pintar(); };
    panela.querySelectorAll('[data-q]').forEach(b => {
      if (!ed.hidden && b.dataset.q === editando) b.setAttribute('aria-current', 'true');
      b.onclick = () => { editorIrekia = korritu = true; ed.querySelector(`.ed-lista [data-id="${CSS.escape(b.dataset.q)}"]`)?.click(); };
    });
    if (korritu && !ed.hidden) { korritu = false; ed.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }

    // Combates ya hechos en este tema.
    const combates = av.eventos.filter(e => e.tipo === 'borroka' && e.datos.casilla === c.id);
    const sec = document.createElement('section');
    sec.className = 'pergamino caja';
    const kidea = (g, id) => buscar(g?.miembros, id)?.alias || id;
    sec.innerHTML = `<h2>📜 Egindako borrokak: ${esc(c.nombre)}</h2>` + (combates.length ? `<table class="tabla"><thead><tr><th>Data</th><th>Taldea</th><th>Emaitza</th><th>Txandak</th></tr></thead><tbody>${
      combates.slice().reverse().map(e => {
        const g = buscar(A.datos.grupos.grupos, e.grupo);
        return `<tr class="${anulados.has(e.id) ? 'baliogabetua' : ''}"><td>${esc(new Date(e.fecha).toLocaleString())}</td><td>${esc(g?.nombre || e.grupo)}</td>
          <td><b>${e.datos.asmatuak} / ${e.datos.guztira}</b> · ${EMAITZA[e.datos.emaitza]}</td>
          <td>${e.datos.txandak.map(t => `<span class="txanda ${t.zuzena ? 'ondo' : 'gaizki'}">${t.zuzena ? '✔' : '✖'} ${esc(kidea(g, t.kidea))}${t.objektuak ? ' 🎒' : ''}</span>`).join(' ')}</td></tr>`;
      }).join('')}</tbody></table><p class="vacio">Borroka bat baliogabetzeko: ⚔️ Kontrola → Azken gertaerak.</p>` : '<p class="vacio">Oraindik ez da borrokarik egin gai honetan.</p>');
    cont.append(sec);
  }

  A.modulos.push({ pintar });
})();
