// Editor visual del tablero: arrastrar casillas sobre el mapa, conectarlas, cambiar sus datos
// y gestionar el archivo del mapa. Cada cambio se guarda como entidad (con auditoría).
(function () {
  const A = window.Admin;
  const { esc, buscar } = A;
  let elegida = null;      // id de la casilla seleccionada
  let pendienteTeclado;    // temporizador para guardar tras mover con el teclado

  const av = () => A.datos.aventuras[A.avId];
  const redondear = n => Math.round(Math.min(100, Math.max(0, n)) * 10) / 10;

  async function guardarCasilla(valor, mensaje) {
    try {
      const r = await A.api('/api/entidad', { coleccion: 'casillas', aventura: A.avId, valor });
      if (mensaje) A.avisar(`✔ ${mensaje}`);
      return r.item;
    } catch (e) {
      A.avisar('✖ ' + e.message, 'error');
      await A.recargar(); // devuelve la casilla a su sitio si no se pudo guardar
      return null;
    }
  }

  function pintar() {
    const cont = document.getElementById('mod-taulera');
    const { tablero, aventura } = av();
    const orden = Motor.ordenCasillas(tablero);
    const num = id => orden.findIndex(c => c.id === id) + 1;
    const todas = [...orden, ...tablero.casillas.filter(c => c.activo === false)];
    const c = buscar(tablero.casillas, elegida);
    const usadas = new Map(tablero.casillas.filter(x => x.entrega && x.activo !== false).map(x => [x.entrega, x]));
    const tipos = A.datos.config.tipos_casilla;
    const etiqueta = x => x.activo === false ? `✖ ${x.nombre} (artxibatua)` : `${num(x.id)}. ${x.nombre}`;

    cont.innerHTML = `<section class="pergamino caja">
        <h2>${esc(A.nombreAv())}: taulera</h2>
        <p class="vacio">Arrastatu lauki bat lekuz aldatzeko (edo aukeratu eta erabili geziak; Shift = urrats handiagoak). Zenbakiak ibilbidearen ordena dira.</p>
        <div class="te">
          <div class="te-mapa"><div class="te-lienzo" style="--aspecto:${aventura.mapa.ancho / aventura.mapa.alto}">
            <img class="fondo" src="${esc(aventura.mapa.archivo)}" alt="" draggable="false">
            <svg class="te-lineas" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${orden.flatMap(o => o.siguientes.map(s => {
              const d = buscar(orden, s);
              return d ? `<line x1="${o.x}" y1="${o.y}" x2="${d.x}" y2="${d.y}" vector-effect="non-scaling-stroke"${o.id === elegida || s === elegida ? ' class="activa"' : ''}/>` : '';
            })).join('')}</svg>
            ${todas.map(x => `<button type="button" class="te-casilla${x.activo === false ? ' archivada' : ''}" data-id="${esc(x.id)}" data-tipo="${esc(x.tipo)}"
              style="left:${x.x}%;top:${x.y}%"${x.id === elegida ? ' aria-pressed="true"' : ''} aria-label="${esc(etiqueta(x))}" title="${esc(etiqueta(x))}">${x.activo === false ? '✖' : x.tipo === 'meta' ? '⚑' : num(x.id)}</button>`).join('')}
          </div></div>
          <div class="te-lado">
            <div class="d-botones izquierda">
              <button type="button" class="boton-sec" data-nueva>＋ Lauki berria</button>
              ${c && c.activo !== false ? '<button type="button" class="boton-sec" data-despues>＋ Honen ondoren txertatu</button>' : ''}
            </div>
            ${c ? `<form class="formulario te-form">
              <p class="ed-id">ID: <code>${esc(c.id)}</code> · x ${c.x}% · y ${c.y}%</p>
              <label>Izena (gaia) <input name="nombre" value="${esc(c.nombre)}" maxlength="80"></label>
              <label>Lekua (mapako izena) <input name="lugar" value="${esc(c.lugar || '')}" maxlength="80"></label>
              <label>Mota <select name="tipo">${Object.entries(tipos).map(([k, v]) => `<option value="${esc(k)}"${k === c.tipo ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
              <label>Ariketa (entrega) <select name="entrega"><option value="">—</option>${av().entregas.entregas.map(e => {
                const otra = usadas.get(e.id);
                return `<option value="${esc(e.id)}"${e.id === c.entrega ? ' selected' : ''}>${esc(e.nombre)}${otra && otra.id !== c.id ? ` (${num(otra.id)}. laukian)` : ''}</option>`;
              }).join('')}</select></label>
              <label>Deskribapena <textarea name="descripcion" rows="2" maxlength="500">${esc(c.descripcion || '')}</textarea></label>
              <fieldset class="te-siguientes"><legend>Hurrengo laukiak (konexioak)</legend>
                ${orden.filter(x => x.id !== c.id).map(x => `<label class="check"><input type="checkbox" name="siguientes" value="${esc(x.id)}"${c.siguientes.includes(x.id) ? ' checked' : ''}> ${esc(etiqueta(x))}</label>`).join('')}
              </fieldset>
              <div class="d-botones">
                <button type="button" class="${c.activo === false ? 'boton-sec' : 'boton-mal'}" data-archivar>${c.activo === false ? 'Berreskuratu' : 'Artxibatu'}</button>
                <button type="submit" class="boton-pri">Gorde</button>
              </div>
            </form>` : '<p class="vacio">Aukeratu lauki bat mapan.</p>'}
          </div>
        </div>
      </section>
      ${seccionMapa()}`;

    // Selección y arrastre (ratón, dedo o lápiz).
    const lienzo = cont.querySelector('.te-lienzo');
    cont.querySelectorAll('.te-casilla').forEach(b => {
      let arrastrando = false, movida = false;
      b.onpointerdown = e => { arrastrando = true; movida = false; b.setPointerCapture(e.pointerId); };
      b.onpointermove = e => {
        if (!arrastrando) return;
        const r = lienzo.getBoundingClientRect();
        b.style.left = redondear((e.clientX - r.left) / r.width * 100) + '%';
        b.style.top = redondear((e.clientY - r.top) / r.height * 100) + '%';
        movida = true;
      };
      b.onpointerup = async () => {
        if (!arrastrando) return;
        arrastrando = false;
        elegida = b.dataset.id;
        if (movida) await guardarCasilla({ id: b.dataset.id, x: parseFloat(b.style.left), y: parseFloat(b.style.top) });
        await A.recargar();
        cont.querySelector(`.te-casilla[data-id="${CSS.escape(elegida)}"]`)?.focus();
      };
      b.onkeydown = e => {
        const paso = e.shiftKey ? 1 : 0.2;
        const d = { ArrowLeft: [-paso, 0], ArrowRight: [paso, 0], ArrowUp: [0, -paso], ArrowDown: [0, paso] }[e.key];
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); elegida = b.dataset.id; A.recargar(); return; }
        if (!d) return;
        e.preventDefault();
        b.style.left = redondear(parseFloat(b.style.left) + d[0]) + '%';
        b.style.top = redondear(parseFloat(b.style.top) + d[1]) + '%';
        clearTimeout(pendienteTeclado);
        pendienteTeclado = setTimeout(() => guardarCasilla({ id: b.dataset.id, x: parseFloat(b.style.left), y: parseFloat(b.style.top) }, 'Kokapena gordeta'), 600);
      };
    });

    cont.querySelector('[data-nueva]').onclick = async () => {
      const item = await guardarCasilla({ nombre: 'Lauki berria', tipo: 'normal', x: 50, y: 50, siguientes: [] }, 'Lauki berria sortuta: arrastatu bere lekura');
      if (item) { elegida = item.id; await A.recargar(); }
    };
    cont.querySelector('[data-despues]')?.addEventListener('click', async () => {
      // La nueva hereda las conexiones de la elegida y la elegida pasa a apuntar a la nueva.
      const desde = c;
      const sig = buscar(tablero.casillas, desde.siguientes[0]);
      const pos = sig ? { x: redondear((desde.x + sig.x) / 2), y: redondear((desde.y + sig.y) / 2) } : { x: redondear(desde.x + 3), y: redondear(desde.y) };
      const item = await guardarCasilla({ nombre: 'Lauki berria', tipo: 'normal', ...pos, siguientes: desde.siguientes });
      if (!item) return;
      if (await guardarCasilla({ id: desde.id, siguientes: [item.id] }, `Txertatuta ${num(desde.id)}. laukiaren ondoren`)) elegida = item.id;
      await A.recargar();
    });

    const form = cont.querySelector('.te-form');
    if (form) {
      form.onsubmit = async e => {
        e.preventDefault();
        const f = form.elements;
        const valor = {
          id: c.id, nombre: f.nombre.value, lugar: f.lugar.value, tipo: f.tipo.value, entrega: f.entrega.value,
          descripcion: f.descripcion.value, siguientes: [...form.querySelectorAll('[name=siguientes]:checked')].map(i => i.value),
        };
        if (await guardarCasilla(valor, 'Laukia gordeta')) await A.recargar();
      };
      form.querySelector('[data-archivar]').onclick = async () => {
        const archivar = c.activo !== false;
        const entrantes = tablero.casillas.filter(x => x.siguientes.includes(c.id) && x.activo !== false);
        if (!await A.confirmar(archivar ? 'Laukia artxibatu?' : 'Laukia berreskuratu?', archivar
          ? `<p>Mapatik kenduko da, baina ez da ezabatzen.</p>${entrantes.length ? `<p>⚠️ Lauki hauek hona konektatuta daude: ${entrantes.map(x => esc(etiqueta(x))).join(', ')}. Gogoratu konexioak berrikusteaz.</p>` : ''}`
          : '<p>Berriro agertuko da mapan.</p>', archivar ? 'Artxibatu' : 'Berreskuratu')) return;
        if (await guardarCasilla({ id: c.id, activo: !archivar }, archivar ? 'Artxibatuta' : 'Berreskuratuta')) await A.recargar();
      };
    }
    prepararMapa(cont);
  }

  // ---------- Gestión del archivo del mapa ----------
  function seccionMapa() {
    const { mapa } = av().aventura;
    const versiones = A.datos.globales.filter(e => e.tipo === 'auditoria' && e.datos.coleccion === 'mapa' && e.datos.aventura === A.avId).reverse();
    return `<section class="pergamino caja">
      <h2>${esc(A.nombreAv())}: mapa</h2>
      <p>Unekoa: <code>${esc(mapa.archivo)}</code> · ${mapa.ancho}×${mapa.alto}</p>
      <div class="formulario">
        <label class="soltar" tabindex="0">🗺️ <b>Mapa berria igo</b><br>SVG, JPG, PNG edo WebP. Laukiak ehunekotan daude: berrikusi haien kokapena igo ondoren.
          <input type="file" accept="image/svg+xml,image/jpeg,image/png,image/webp" hidden></label>
        <label class="check"><input type="checkbox" data-camino${mapa.dibujar_camino ? ' checked' : ''}> Bidea marraztu laukien artean (mapak berak bidea ez badakar)</label>
      </div>
      <h3>Aurreko mapak</h3>
      <ul class="versiones-mapa">${versiones.map((e, i) => `<li><img src="${esc(e.datos.antes.archivo)}" alt="" loading="lazy">
        <small>${esc(new Date(e.fecha).toLocaleString())}</small>
        <button type="button" class="boton-sec pequeno" data-volver="${i}">Leheneratu</button></li>`).join('') || '<li class="vacio">Oraindik ez dago mapa zaharrik.</li>'}</ul>
    </section>`;
  }

  async function enviarMapa(cuerpo, mensaje) {
    try {
      const r = await A.api('/api/mapa', { aventura: A.avId, ...cuerpo });
      A.avisar(r.sinCambios ? 'Ez dago aldaketarik' : `✔ ${mensaje}`);
      await A.recargar();
    } catch (e) { A.avisar('✖ ' + e.message, 'error'); }
  }

  function prepararMapa(cont) {
    const soltar = cont.querySelector('.soltar');
    const input = soltar.querySelector('input');
    const subir = async archivo => {
      if (!archivo) return;
      const dataUrl = await new Promise((ok, mal) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = mal; r.readAsDataURL(archivo); });
      const img = new Image();
      await new Promise((ok, mal) => { img.onload = ok; img.onerror = () => mal(new Error('Ezin da irudia ireki')); img.src = dataUrl; }).catch(e => A.avisar('✖ ' + e.message, 'error'));
      if (!img.naturalWidth) return;
      if (!await A.confirmar('Mapa berria erabili?', `<img src="${esc(dataUrl)}" alt="" style="width:100%;border-radius:6px">
        <p>${img.naturalWidth}×${img.naturalHeight} · ${(archivo.size / 1024).toFixed(0)} KB. Aurrekoa ez da ezabatzen.</p>`, 'Igo')) return;
      await enviarMapa({ archivo: dataUrl, ancho: img.naturalWidth, alto: img.naturalHeight }, 'Mapa berria igota');
    };
    input.onchange = () => subir(input.files[0]);
    soltar.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } };
    soltar.ondragover = e => { e.preventDefault(); soltar.classList.add('encima'); };
    soltar.ondragleave = () => soltar.classList.remove('encima');
    soltar.ondrop = e => { e.preventDefault(); soltar.classList.remove('encima'); subir(e.dataTransfer.files[0]); };
    cont.querySelector('[data-camino]').onchange = e => enviarMapa({ dibujar_camino: e.target.checked }, 'Gordeta');
    const versiones = A.datos.globales.filter(e => e.tipo === 'auditoria' && e.datos.coleccion === 'mapa' && e.datos.aventura === A.avId).reverse();
    cont.querySelectorAll('[data-volver]').forEach(b => b.onclick = async () => {
      const m = versiones[b.dataset.volver].datos.antes;
      if (await A.confirmar('Mapa hau leheneratu?', `<img src="${esc(m.archivo)}" alt="" style="width:100%;border-radius:6px">`, 'Leheneratu')) {
        await enviarMapa({ existente: m.archivo, ancho: m.ancho, alto: m.alto, dibujar_camino: m.dibujar_camino }, 'Mapa leheneratuta');
      }
    });
  }

  A.modulos.push({ pintar });
})();
