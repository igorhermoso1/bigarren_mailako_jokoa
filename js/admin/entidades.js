// Módulos de gestión: grupos y miembros, editor de fichas, catálogo, entregas y rúbrica.
// Todo se guarda con /api/entidad, que deja un evento de auditoría. No se borra nada: se archiva.
(function () {
  const A = window.Admin;
  const { esc, buscar } = A;
  const seleccion = {};   // elemento elegido en cada editor
  let pestanaCatalogo = 'objetos';

  const TIPOS_OBJETO = [['arma', '⚔️ Arma'], ['armadura', '🛡️ Armadura'], ['pocion', '🧪 Edabea'], ['mapa', '🗺️ Mapa'], ['llave', '🗝️ Giltza'], ['reliquia', '💎 Erlikia']];
  const ambitos = () => [['todas', 'Abentura guztiak'], ...A.datos.config.aventuras.map(a => [a.id, a.nombre])];
  const rarezas = () => A.datos.catalogo.rarezas.map(r => [r.id, r.nombre]);

  // Catálogo de enemigos (img/etsaiak): aspecto animado que se elige para cada pregunta de combate.
  A.etsaiak = [];
  fetch('img/etsaiak/katalogoa.json').then(r => r.json()).then(k => { A.etsaiak = k; if (A.datos) A.modulos.forEach(m => m.pintar()); }).catch(() => {});
  A.etsaiIrudia = id => {
    const e = buscar(A.etsaiak, id);
    return e ? `<span class="etsai-irudia" style="--n:${e.fotogramak};--w:${e.zabalera};--h:${e.altuera};background-image:url(img/etsaiak/${esc(e.id)}.webp)"></span>` : '';
  };

  const CAMPOS = {
    objetos: [
      { k: 'nombre', e: 'Izena' }, { k: 'icono', e: 'Ikonoa (emojia edo img/objetos/…)' },
      { k: 'rareza', e: 'Arraritasuna', t: 'select', o: rarezas }, { k: 'tipo', e: 'Mota', t: 'select', o: () => TIPOS_OBJETO },
      { k: 'ambito', e: 'Esparrua', t: 'select', o: ambitos }, { k: 'descripcion', e: 'Deskribapena', t: 'textarea' },
      { k: 'consumible', e: 'Kontsumigarria (behin erabiltzekoa)', t: 'checkbox' },
      { k: 'borroka', e: 'Borrokan (efektua)', t: 'select', o: () => [['', '— Ez du efekturik —'], ['erdia', '✂️ 50/50: bi erantzun oker kendu'], ['pista', '💡 Pista erakutsi'], ['erantzuna', '👁️ Erantzun zuzena erakutsi'], ['bizitza', '❤️ +1 bizitza']] },
    ],
    estados: [
      { k: 'nombre', e: 'Izena' }, { k: 'tipo', e: 'Mota', t: 'select', o: () => [['upgrade', '▲ Hobekuntza'], ['downgrade', '▼ Zigorra']] },
      { k: 'ambito', e: 'Esparrua', t: 'select', o: ambitos }, { k: 'efecto.puntos', e: 'Puntuak (ezartzean)', t: 'number' },
      { k: 'duracion_entregas', e: 'Iraupena (entregak)', t: 'number' }, { k: 'descripcion', e: 'Deskribapena', t: 'textarea' },
    ],
    hitos: [
      { k: 'nombre', e: 'Izena' }, { k: 'icono', e: 'Ikonoa' }, { k: 'ambito', e: 'Esparrua', t: 'select', o: ambitos },
      { k: 'descripcion', e: 'Deskribapena', t: 'textarea' },
    ],
    logros: [
      { k: 'nombre', e: 'Izena' }, { k: 'icono', e: 'Ikonoa' }, { k: 'ambito', e: 'Esparrua', t: 'select', o: ambitos },
      { k: 'oculto', e: 'Ezkutukoa (lortu arte ez da ikusten)', t: 'checkbox' }, { k: 'descripcion', e: 'Deskribapena', t: 'textarea' },
    ],
    entregas: [
      { k: 'nombre', e: 'Izena' }, { k: 'fecha_limite', e: 'Epemuga', t: 'date' }, { k: 'puntos_max', e: 'Puntu maximoak', t: 'number' },
      { k: 'descripcion', e: 'Deskribapena', t: 'textarea' },
    ],
    criterios: [{ k: 'nombre', e: 'Irizpidea' }],
    galderak: [
      { k: 'testua', e: 'Galdera', t: 'textarea' },
      { k: 'aukerak.0', e: 'A erantzuna' }, { k: 'aukerak.1', e: 'B erantzuna' }, { k: 'aukerak.2', e: 'C erantzuna' }, { k: 'aukerak.3', e: 'D erantzuna' },
      { k: 'zuzena', e: 'Erantzun zuzena', t: 'select', o: () => [['0', 'A'], ['1', 'B'], ['2', 'C'], ['3', 'D']] },
      { k: 'pista', e: 'Pista (aukerakoa, «Pista» objektuarekin ikusten da)', t: 'textarea' },
      { k: 'etsaia', e: 'Etsaiaren itxura', t: 'etsaia' },
    ],
    grupos: [{ k: 'nombre', e: 'Izena' }, { k: 'lema', e: 'Leloa' }, { k: 'color', e: 'Kolorea', t: 'color' }],
    miembros: () => [
      { k: 'alias', e: 'Ezizena (publikoa)' },
      { k: 'clase', e: 'Klasea', t: 'select', o: () => [['', '—'], ...(A.datos.config.clases || []).map(c => [c.nombre, `${c.icono} ${c.nombre}`])] },
      ...A.datos.config.aventuras.map(a => ({ k: `cometido.${a.id}`, e: `Zeregina (${a.nombre})` })),
    ],
  };

  const leerRuta = (obj, k) => k.split('.').reduce((o, p) => o?.[p], obj);
  const ponerRuta = (obj, k, v) => { const p = k.split('.'); const ult = p.pop(); p.reduce((o, x) => (o[x] ||= {}), obj)[ult] = v; };

  function campoHtml(c, item) {
    const v = item ? leerRuta(item, c.k) : undefined;
    const nombre = `name="${esc(c.k)}"`;
    if (c.t === 'select') return `<label>${esc(c.e)}<select ${nombre}>${c.o().map(([val, txt]) =>
      `<option value="${esc(val)}"${String(v ?? '') === val ? ' selected' : ''}>${esc(txt)}</option>`).join('')}</select></label>`;
    // Selector visual: una miniatura animada por enemigo del catálogo (radio, para que el formulario lo lea igual).
    if (c.t === 'etsaia') return `<fieldset class="etsai-hautatzailea"><legend>${esc(c.e)}</legend>
      <label class="etsai-aukera"><input type="radio" ${nombre} value=""${v ? '' : ' checked'}><span class="etsai-lehenetsia">👹</span><small>Lehenetsia</small></label>
      ${A.etsaiak.map(e => `<label class="etsai-aukera" title="${esc(e.id)}"><input type="radio" ${nombre} value="${esc(e.id)}"${v === e.id ? ' checked' : ''}>${A.etsaiIrudia(e.id)}<small>${esc(e.id)}</small></label>`).join('')}
    </fieldset>`;
    if (c.t === 'checkbox') return `<label class="check"><input type="checkbox" ${nombre}${v ? ' checked' : ''}> ${esc(c.e)}</label>`;
    if (c.t === 'textarea') return `<label>${esc(c.e)}<textarea ${nombre} rows="2" maxlength="500">${esc(v ?? '')}</textarea></label>`;
    const tipo = c.t || 'text';
    const valor = tipo === 'color' ? (v || '#888888') : (v ?? '');
    return `<label>${esc(c.e)}<input type="${tipo}" ${nombre} value="${esc(valor)}"${tipo === 'number' ? ' step="any"' : ''} maxlength="200"></label>`;
  }

  async function guardar(coleccion, extra, valor, mensaje) {
    try {
      const r = await A.api('/api/entidad', { coleccion, ...extra, valor });
      A.avisar(r.sinCambios ? 'Ez dago aldaketarik' : `✔ ${mensaje || 'Gordeta'}`);
      return r.item;
    } catch (e) {
      A.avisar('✖ ' + e.message, 'error');
      return null;
    }
  }

  // Editor genérico: lista de elementos (los archivados, atenuados) y formulario del elegido.
  function editor(cont, { titulo, coleccion, items, extra = {}, etiqueta = x => x.nombre, alGuardar }) {
    const clave = coleccion + JSON.stringify(extra);
    const campos = typeof CAMPOS[coleccion] === 'function' ? CAMPOS[coleccion]() : CAMPOS[coleccion];
    const elegido = seleccion[clave] === '__nuevo' ? null : buscar(items, seleccion[clave]) || null;
    const nuevo = seleccion[clave] === '__nuevo';
    const sec = document.createElement('section');
    sec.className = 'pergamino caja editor';
    sec.innerHTML = `<h2>${esc(titulo)}</h2>
      <div class="ed-cuerpo">
        <ul class="ed-lista">${items.map((x, i) => `<li><button type="button" data-id="${esc(x.id)}" class="${x.activo === false ? 'archivado' : ''}"
          ${x.id === elegido?.id ? 'aria-current="true"' : ''}>${esc(etiqueta(x, i))}${x.activo === false ? ' <small>(artxibatua)</small>' : ''}</button></li>`).join('')}
          <li><button type="button" data-id="__nuevo" class="nuevo"${nuevo ? ' aria-current="true"' : ''}>＋ Berria</button></li></ul>
        ${elegido || nuevo ? `<form class="ed-form formulario">
          <p class="ed-id">${elegido ? `ID: <code>${esc(elegido.id)}</code>` : 'Elementu berria'}</p>
          ${campos.map(c => campoHtml(c, elegido)).join('')}
          <div class="d-botones">
            ${elegido ? `<button type="button" class="${elegido.activo === false ? 'boton-sec' : 'boton-mal'}" data-archivar>${elegido.activo === false ? 'Berreskuratu' : 'Artxibatu'}</button>` : ''}
            <button type="submit" class="boton-pri">Gorde</button>
          </div></form>` : '<p class="vacio">Aukeratu elementu bat edo sortu berri bat.</p>'}
      </div>`;
    sec.querySelectorAll('.ed-lista button').forEach(b => b.onclick = () => { seleccion[clave] = b.dataset.id; A.recargar(); });
    const form = sec.querySelector('form');
    if (form) {
      form.onsubmit = async e => {
        e.preventDefault();
        const valor = elegido ? { id: elegido.id } : {};
        for (const c of campos) {
          const el = form.elements[c.k];
          let v = c.t === 'checkbox' ? el.checked : el.value;
          if (c.t === 'number') { if (v === '') continue; v = Number(v); }
          ponerRuta(valor, c.k, v);
        }
        const item = await guardar(coleccion, extra, valor);
        if (item) { seleccion[clave] = item.id; alGuardar?.(item); await A.recargar(); }
      };
      form.querySelector('[data-archivar]')?.addEventListener('click', async () => {
        const archivar = elegido.activo !== false;
        if (!await A.confirmar(archivar ? 'Artxibatu?' : 'Berreskuratu?',
          `<p><b>${esc(etiqueta(elegido, 0))}</b> ${archivar ? 'ez da gehiago erabiliko, baina ez da ezabatzen: historian geratzen da.' : 'berriro erabilgarri egongo da.'}</p>`,
          archivar ? 'Artxibatu' : 'Berreskuratu')) return;
        if (await guardar(coleccion, extra, { id: elegido.id, activo: !archivar })) await A.recargar();
      });
    }
    cont.append(sec);
    return elegido;
  }

  // ---------- Editor de fichas ----------
  let pendiente = null; // foto nueva aún sin guardar: { grupo, foto, original, aviso }

  function reducir(archivo) {
    return new Promise((ok, mal) => {
      const img = new Image();
      img.onload = () => {
        const lado = 512, escala = Math.min(1, lado / Math.max(img.width, img.height));
        const lienzo = document.createElement('canvas');
        lienzo.width = Math.round(img.width * escala);
        lienzo.height = Math.round(img.height * escala);
        lienzo.getContext('2d').drawImage(img, 0, 0, lienzo.width, lienzo.height);
        const foto = lienzo.toDataURL('image/webp', 0.86);
        URL.revokeObjectURL(img.src);
        if (!foto.startsWith('data:image/webp')) return mal(new Error('Nabigatzaile honek ezin du WebP sortu: erabili Chrome, Edge edo Firefox.'));
        const minimo = Math.min(img.width, img.height);
        ok({ foto, aviso: minimo < 300 ? `⚠️ Bereizmen baxua (${img.width}×${img.height}): fitxan lausotuta ikus daiteke.` : '' });
      };
      img.onerror = () => mal(new Error('Ezin da irudia ireki (JPG, PNG edo WebP erabili).'));
      img.src = URL.createObjectURL(archivo);
    });
  }
  const leerDataUrl = archivo => new Promise((ok, mal) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = mal; r.readAsDataURL(archivo); });

  function editorFicha(cont, g) {
    const d = A.datos;
    const ficha = JSON.parse(JSON.stringify(g.ficha));
    const previa = () => ({ ...g, foto_grupo: pendiente?.grupo === g.id ? pendiente.foto : g.foto_grupo, ficha });
    // Versiones anteriores: salen de los eventos de auditoría de este grupo.
    const versiones = d.globales.filter(e => e.tipo === 'auditoria' && e.datos.coleccion === 'grupos' && e.datos.id === g.id && e.datos.cambio === 'ficha_modificada')
      .reverse().map(e => ({ fecha: e.fecha, valor: e.datos.antes }));

    const sec = document.createElement('section');
    sec.className = 'pergamino caja';
    sec.innerHTML = `<h2>Fitxa: ${esc(g.nombre)}</h2>
      <div class="fe">
        <div class="fe-previa">
          <div class="fe-grande"></div>
          <div class="fe-mapa"><div class="fe-fondo" style="background-image:url(${esc(d.aventuras[A.avId].aventura.mapa.archivo)})"></div></div>
          <small>Mapan horrela ikusiko da</small>
        </div>
        <div class="fe-controles formulario">
          <label class="soltar" tabindex="0">📷 <b>Taldearen argazkia</b><br>Arrastatu hona edo sakatu hautatzeko
            <input type="file" accept="image/jpeg,image/png,image/webp" hidden></label>
          <p class="fe-aviso">${pendiente?.grupo === g.id ? esc(pendiente.aviso || 'Argazki berria prest: sakatu «Gorde fitxa».') : ''}</p>
          <label>Markoa <select name="marco">${d.config.marcos.map(m => `<option value="${esc(m.id)}"${m.id === ficha.marco ? ' selected' : ''}>${esc(m.nombre)}</option>`).join('')}</select></label>
          <label>Zooma <input type="range" name="zoom" min="0.5" max="4" step="0.05" value="${ficha.encuadre.zoom}"></label>
          <label>Ezker ↔ eskuin <input type="range" name="x" min="-1" max="1" step="0.01" value="${ficha.encuadre.x}"></label>
          <label>Gora ↕ behera <input type="range" name="y" min="-1" max="1" step="0.01" value="${ficha.encuadre.y}"></label>
          <div class="d-botones"><button type="button" class="boton-sec" data-reset>Zentratu</button><button type="button" class="boton-pri" data-guardar>Gorde fitxa</button></div>
        </div>
      </div>
      <h3>Aurreko bertsioak</h3>
      <ul class="versiones">${versiones.map((v, i) => `<li><span class="fe-mini" data-v="${i}"></span><small>${esc(new Date(v.fecha).toLocaleString())}</small>
        <button type="button" class="boton-sec pequeno" data-restaurar="${i}">Leheneratu</button></li>`).join('') || '<li class="vacio">Oraindik ez dago bertsio zaharrik.</li>'}</ul>`;

    const pintar = () => {
      const grande = sec.querySelector('.fe-grande');
      grande.replaceChildren(Mapa.crearFicha(previa(), d.config));
      const mapa = sec.querySelector('.fe-mapa');
      mapa.querySelector('.ficha')?.remove();
      mapa.append(Mapa.crearFicha(previa(), d.config));
    };
    sec.querySelectorAll('[data-v]').forEach(el => el.append(Mapa.crearFicha({ ...g, ...versiones[el.dataset.v].valor }, d.config)));
    const f = sec.querySelector('.fe-controles');
    f.querySelector('[name=marco]').onchange = e => { ficha.marco = e.target.value; pintar(); };
    for (const k of ['zoom', 'x', 'y']) f.querySelector(`[name=${k}]`).oninput = e => { ficha.encuadre[k] = Number(e.target.value); pintar(); };
    f.querySelector('[data-reset]').onclick = () => {
      ficha.encuadre = { zoom: 1, x: 0, y: 0 };
      for (const k of ['zoom', 'x', 'y']) f.querySelector(`[name=${k}]`).value = ficha.encuadre[k];
      pintar();
    };

    const cargarArchivo = async archivo => {
      if (!archivo) return;
      try {
        const { foto, aviso } = await reducir(archivo);
        pendiente = { grupo: g.id, foto, original: await leerDataUrl(archivo), aviso };
        f.querySelector('.fe-aviso').textContent = aviso || 'Argazki berria prest: egokitu eta sakatu «Gorde fitxa».';
        pintar();
      } catch (e) { A.avisar('✖ ' + e.message, 'error'); }
    };
    const soltar = f.querySelector('.soltar');
    const input = soltar.querySelector('input');
    input.onchange = () => cargarArchivo(input.files[0]);
    soltar.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } };
    soltar.ondragover = e => { e.preventDefault(); soltar.classList.add('encima'); };
    soltar.ondragleave = () => soltar.classList.remove('encima');
    soltar.ondrop = e => { e.preventDefault(); soltar.classList.remove('encima'); cargarArchivo(e.dataTransfer.files[0]); };

    f.querySelector('[data-guardar]').onclick = async () => {
      if (pendiente?.grupo === g.id) {
        try { await A.api('/api/imagen', { grupo: g.id, foto: pendiente.foto, original: pendiente.original }); }
        catch (e) { return A.avisar('✖ ' + e.message, 'error'); }
        pendiente = null;
      }
      if (await guardar('grupos', {}, { id: g.id, ficha }, 'Fitxa gordeta')) await A.recargar();
    };
    sec.querySelectorAll('[data-restaurar]').forEach(b => b.onclick = async () => {
      const v = versiones[b.dataset.restaurar].valor;
      if (!await A.confirmar('Bertsio hau leheneratu?', '<p>Uneko fitxa ez da galtzen: bertsioen zerrendan geratuko da.</p>', 'Leheneratu')) return;
      if (await guardar('grupos', {}, { id: g.id, ficha: v.ficha, foto_grupo: v.foto_grupo }, 'Bertsioa leheneratuta')) await A.recargar();
    });
    pintar();
    cont.append(sec);
  }

  // ---------- Módulos ----------
  // Sprite de combate de un alumno: se sube tal cual (sin reducir, para no estropear el pixel art).
  function editorSprite(cont, g, m) {
    const sec = document.createElement('section');
    sec.className = 'pergamino caja';
    sec.innerHTML = `<h2>${esc(m.alias)}: borrokako sprite-a</h2>
      <div class="sprite-ed">
        <div class="sprite-aurrebista">${m.sprite ? `<img src="${esc(m.sprite)}" alt="">` : '<span class="vacio">Oraindik ez dago sprite-rik</span>'}</div>
        <label class="soltar" tabindex="0">🗡️ <b>Sprite-a igo</b><br>PNG, GIF edo WebP (atzeko plano gardenarekin hobeto). Arrastatu hona edo sakatu.
          <input type="file" accept="image/png,image/gif,image/webp" hidden></label>
      </div>`;
    const img = sec.querySelector('img');
    if (img) img.onload = () => { if (img.naturalWidth <= 160) img.style.imageRendering = 'pixelated'; };
    const soltar = sec.querySelector('.soltar');
    const input = soltar.querySelector('input');
    const subir = async archivo => {
      if (!archivo) return;
      const dataUrl = await leerDataUrl(archivo);
      try {
        await A.api('/api/sprite', { grupo: g.id, miembro: m.id, sprite: dataUrl });
        A.avisar('✔ Sprite-a gordeta');
        await A.recargar();
      } catch (e) { A.avisar('✖ ' + e.message, 'error'); }
    };
    input.onchange = () => subir(input.files[0]);
    soltar.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } };
    soltar.ondragover = e => { e.preventDefault(); soltar.classList.add('encima'); };
    soltar.ondragleave = () => soltar.classList.remove('encima');
    soltar.ondrop = e => { e.preventDefault(); soltar.classList.remove('encima'); subir(e.dataTransfer.files[0]); };
    cont.append(sec);
  }

  function pintarTaldeak() {
    const cont = document.getElementById('mod-taldeak');
    cont.replaceChildren();
    const d = A.datos;
    const fila = document.createElement('div');
    fila.className = 'dos-columnas';
    cont.append(fila);
    const g = editor(fila, { titulo: 'Taldeak', coleccion: 'grupos', items: d.grupos.grupos });
    if (!g) return;
    const m = editor(fila, {
      titulo: `${g.nombre}: kideak`, coleccion: 'miembros', items: g.miembros, extra: { grupo: g.id },
      etiqueta: m => `${m.sprite ? '🗡️ ' : ''}${m.alias}${m.clase ? ' · ' + m.clase : ''}`,
    });
    if (m) editorSprite(cont, g, m);
    editorFicha(cont, g);
  }

  function pintarKatalogoa() {
    const cont = document.getElementById('mod-katalogoa');
    const cat = A.datos.catalogo;
    const pestanas = { objetos: '💎 Objektuak', estados: '🌀 Egoerak', hitos: '🏰 Mugarriak', logros: '🏆 Lorpenak' };
    cont.innerHTML = `<div class="sub-pestanas" role="tablist">${Object.entries(pestanas).map(([k, v]) =>
      `<button type="button" role="tab" data-p="${k}" aria-selected="${k === pestanaCatalogo}">${v}</button>`).join('')}</div>`;
    cont.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { pestanaCatalogo = b.dataset.p; pintarKatalogoa(); });
    const etiquetaAmbito = x => x.ambito === 'todas' ? '' : ` · ${buscar(A.datos.config.aventuras, x.ambito)?.nombre || x.ambito}`;
    const etiquetas = {
      objetos: x => `${x.icono && !/[./]/.test(x.icono) ? x.icono + ' ' : ''}${x.nombre} (${buscar(cat.rarezas, x.rareza)?.nombre || x.rareza})${etiquetaAmbito(x)}`,
      estados: x => `${x.tipo === 'downgrade' ? '▼' : '▲'} ${x.nombre}${etiquetaAmbito(x)}`,
      hitos: x => `${x.nombre}${etiquetaAmbito(x)}`,
      logros: x => `${x.oculto ? '🔒 ' : ''}${x.nombre}${etiquetaAmbito(x)}`,
    };
    editor(cont, { titulo: pestanas[pestanaCatalogo], coleccion: pestanaCatalogo, items: cat[pestanaCatalogo], etiqueta: etiquetas[pestanaCatalogo] });
  }

  function pintarEntregak() {
    const cont = document.getElementById('mod-entregak');
    cont.replaceChildren();
    const fila = document.createElement('div');
    fila.className = 'dos-columnas';
    cont.append(fila);
    const av = A.datos.aventuras[A.avId];
    editor(fila, {
      titulo: `${A.nombreAv()}: entregak`, coleccion: 'entregas', items: av.entregas.entregas, extra: { aventura: A.avId },
      etiqueta: (e, i) => `${i + 1}. ${e.nombre}${e.fecha_limite ? ' · ' + e.fecha_limite : ''}${A.estado.cerradas.has(e.id) ? ' 🔒' : ''}`,
    });
    editor(fila, {
      titulo: `${A.nombreAv()}: errubrika (pribatua 🔒)`, coleccion: 'criterios',
      items: A.datos.privado.rubricas[A.avId]?.criterios || [], extra: { aventura: A.avId },
    });
  }

  A.editor = editor; // lo usa también borrokak.js
  A.modulos.push({ pintar: () => { pintarTaldeak(); pintarKatalogoa(); pintarEntregak(); } });
})();
