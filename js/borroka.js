// Pantalla de combate (estilo RPG clásico). Se abre desde el panel del profesor y solo funciona con
// `node admin.js` en marcha: las preguntas (con sus respuestas) son privadas y nunca se publican.
// Cada enemigo es una pregunta de la casilla. Se elige quién ataca y a qué enemigo; si la respuesta es
// correcta el enemigo cae, y si no el grupo pierde 1 de vida (la vida inicial = número de preguntas).
// Al terminar se guarda el combate; el servidor vuelve a corregirlo y gasta los objetos usados.
(function () {
  const TOKEN = document.querySelector('meta[name="token"]').content;
  const $ = id => document.getElementById(id);
  const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reducir = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const espera = ms => new Promise(r => setTimeout(r, reducir() ? Math.min(ms, 60) : ms));
  const parametros = new URLSearchParams(location.search);
  const avId = parametros.get('aventura'), casillaId = parametros.get('casilla'), grupoId = parametros.get('grupo');

  // Efectos de los objetos en combate (campo `borroka` del objeto en el catálogo).
  const EFEKTUAK = {
    erdia: { izena: '50 / 50', azalpena: 'Bi erantzun oker kentzen ditu' },
    pista: { izena: 'Pista', azalpena: 'Galderaren pista erakusten du' },
    erantzuna: { izena: 'Erantzuna', azalpena: 'Erantzun zuzena erakusten du' },
    bizitza: { izena: '+1 bizitza', azalpena: 'Taldeari bizitza bat ematen dio' },
  };
  const ICONO_OBJETO = { arma: '⚔️', armadura: '🛡️', pocion: '🧪', mapa: '🗺️', llave: '🗝️', reliquia: '💎' };

  const b = { // estado del combate
    datos: null, g: null, kideak: [], etsaiak: [], bizitza: 0, txandak: [], aktiboa: 0,
    inventario: {}, objektuak: [], lanpetuta: false, unekoa: null, amaituta: false, gordeta: false,
  };

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

  const mezua = t => { $('mezua').innerHTML = t; };

  // ---------- Sprites provisionales de los enemigos (SVG, teñidos con el color de la región) ----------
  const MONSTRUOAK = [
    // Limo
    '<svg viewBox="0 0 100 100"><path d="M10 84 C10 50 28 22 50 22 C72 22 90 50 90 84 Q70 92 50 86 Q30 92 10 84Z" fill="var(--e1)" stroke="#0008" stroke-width="3"/><path d="M28 40 Q38 28 50 30" stroke="#fff8" stroke-width="5" fill="none" stroke-linecap="round"/><circle cx="38" cy="56" r="7" fill="#fff"/><circle cx="62" cy="56" r="7" fill="#fff"/><circle cx="40" cy="58" r="3.5" fill="#111"/><circle cx="60" cy="58" r="3.5" fill="#111"/><path d="M40 72 Q50 78 60 72" stroke="#111" stroke-width="3" fill="none"/></svg>',
    // Murciélago
    '<svg viewBox="0 0 100 100"><path d="M50 40 L20 22 L26 40 L6 38 L22 56 L14 70 L40 58 Z M50 40 L80 22 L74 40 L94 38 L78 56 L86 70 L60 58 Z" fill="var(--e2)" stroke="#0008" stroke-width="3"/><ellipse cx="50" cy="54" rx="16" ry="20" fill="var(--e1)" stroke="#0008" stroke-width="3"/><path d="M38 38 L40 28 L46 36 M62 38 L60 28 L54 36" fill="var(--e1)" stroke="#0008" stroke-width="2"/><circle cx="44" cy="50" r="4" fill="#ffe14d"/><circle cx="56" cy="50" r="4" fill="#ffe14d"/><path d="M44 64 L47 69 L50 64 L53 69 L56 64" stroke="#fff" stroke-width="2" fill="none"/></svg>',
    // Fantasma
    '<svg viewBox="0 0 100 100"><path d="M22 88 L22 46 C22 24 36 12 50 12 C64 12 78 24 78 46 L78 88 L68 80 L59 88 L50 80 L41 88 L32 80 Z" fill="var(--e1)" opacity=".92" stroke="#0008" stroke-width="3"/><ellipse cx="40" cy="44" rx="6" ry="9" fill="#111"/><ellipse cx="60" cy="44" rx="6" ry="9" fill="#111"/><circle cx="41" cy="41" r="2" fill="#fff"/><circle cx="61" cy="41" r="2" fill="#fff"/><ellipse cx="50" cy="64" rx="7" ry="9" fill="#111"/></svg>',
    // Gólem de piedra
    '<svg viewBox="0 0 100 100"><path d="M30 20 L70 20 L80 40 L74 58 L84 88 L60 88 L56 70 L44 70 L40 88 L16 88 L26 58 L20 40 Z" fill="var(--e2)" stroke="#0008" stroke-width="3"/><path d="M14 44 L22 40 L26 64 L10 70 Z M86 44 L78 40 L74 64 L90 70 Z" fill="var(--e1)" stroke="#0008" stroke-width="3"/><rect x="36" y="32" width="10" height="6" fill="#ff5a3c"/><rect x="54" y="32" width="10" height="6" fill="#ff5a3c"/><path d="M38 50 L62 50" stroke="#0008" stroke-width="4"/><path d="M34 24 L44 30 M66 26 L58 30" stroke="#fff5" stroke-width="2"/></svg>',
    // Ojo flotante
    '<svg viewBox="0 0 100 100"><path d="M30 64 Q24 82 30 94 M42 68 Q40 84 46 96 M58 68 Q60 84 54 96 M70 64 Q76 82 70 94" stroke="var(--e2)" stroke-width="6" fill="none" stroke-linecap="round"/><circle cx="50" cy="44" r="30" fill="var(--e1)" stroke="#0008" stroke-width="3"/><circle cx="50" cy="44" r="18" fill="#fff"/><circle cx="54" cy="44" r="9" fill="var(--e2)"/><circle cx="55" cy="44" r="4.5" fill="#111"/><circle cx="58" cy="40" r="2" fill="#fff"/><path d="M24 30 L18 20 M76 30 L82 20 M50 14 L50 4" stroke="var(--e2)" stroke-width="5" stroke-linecap="round"/></svg>',
  ];
  // Puestos en el escenario (en %): enemigos a la izquierda, grupo a la derecha.
  const PUESTOS_ETSAI = [[16, 40], [32, 32], [12, 62], [30, 56], [22, 80], [40, 46], [42, 72], [8, 28], [6, 82], [38, 20]];
// Los miembros se reparten en zigzag de arriba abajo, con más separación cuantos menos son.
  const puestoKide = (i, n) => [i % 2 ? 87 : 75, n === 1 ? 52 : 24 + i * (58 / (n - 1))];

  // ---------- Arranque ----------
  async function iniciar() {
    if (TOKEN.startsWith('%%')) return fallo('Borroka irakaslearen ordenagailuan bakarrik dabil: abiarazi <code>node admin.js</code> eta ireki panelatik.');
    try { b.datos = await api('/api/datos'); } catch (e) { return fallo('Ezin da zerbitzariarekin konektatu: ' + esc(e.message)); }
    const d = b.datos, av = d.aventuras[avId];
    const casilla = av?.tablero.casillas.find(c => c.id === casillaId);
    b.g = d.grupos.grupos.find(x => x.id === grupoId);
    if (!av || !casilla || !b.g) return fallo('Borroka ez da aurkitu (abentura, gaia edo taldea falta da).');
    const preguntas = (d.privado.galderak?.[avId]?.[casillaId] || []).filter(q => q.activo !== false).slice(0, 10);
    if (!preguntas.length) return fallo('Gai honek ez du galderarik. Gehitu itzazu panelean (⚔️ Borrokak).');
    b.kideak = b.g.miembros.filter(m => m.activo !== false);
    if (!b.kideak.length) return fallo('Talde honek ez du kiderik. Gehitu itzazu panelean (🛡️ Taldeak eta fitxak).');

    const estado = Motor.calcularEstado(avId, av.eventos, d.globales, d.catalogo, av.tablero, d.grupos, d.config);
    b.inventario = { ...estado.grupos[b.g.id].inventario };
    b.objektuak = d.catalogo.objetos.filter(o => o.borroka && EFEKTUAK[o.borroka]);
    b.etsaiak = preguntas.map((q, i) => ({ q, i, egoera: 'bizirik' }));
    b.bizitza = preguntas.length;

    const orden = Motor.ordenCasillas(av.tablero);
    document.body.dataset.estiloa = casilla.estiloa || 'lehenetsia';
    document.title = `Borroka: ${b.g.nombre} · ${casilla.nombre}`;
    $('b-taldea').textContent = b.g.nombre;
    $('b-gaia').textContent = `${orden.findIndex(c => c.id === casilla.id) + 1}. ${casilla.nombre}${casilla.lugar ? ' · ' + casilla.lugar : ''}`;
    document.querySelector('.b-izenburua .b-ficha').append(Mapa.crearFicha(b.g, d.config));

    pintarEtsaiak();
    pintarTaldea();
    pintarBihotzak();
    Fx.iniciar($('eszena'));
    $('b-amaitu').onclick = () => { if (!b.amaituta && confirm('Borroka orain amaitu? Erantzun gabeko galderak ez dira kontatuko.')) amaitu(); };
    addEventListener('keydown', teclado);
    mezua(`<b>${esc(b.kideak[0].alias)}</b>-ren txanda. Aukeratu <b>nork</b> erasotzen duen (← →) eta gero <b>etsai</b> bat.`);
    await sarrera();
  }

  function fallo(html) {
    document.body.classList.add('akatsa');
    document.body.innerHTML = `<p class="aviso-error pergamino" style="margin:20vh auto">${html}</p>`;
  }

  // ---------- Pintado ----------
  function pintarEtsaiak() {
    const cont = $('etsaiak');
    cont.innerHTML = '';
    for (const e of b.etsaiak) {
      const [x, y] = PUESTOS_ETSAI[e.i];
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'etsaia';
      el.dataset.i = e.i;
      el.style.left = x + '%';
      el.style.top = y + '%';
      el.style.setProperty('--n', e.i);
      el.setAttribute('aria-label', `${e.i + 1}. etsaia`);
      el.innerHTML = `<span class="itzala"></span><span class="e-sprite">${MONSTRUOAK[e.i % MONSTRUOAK.length]}</span><span class="e-zenbakia">${e.i + 1}</span>`;
      el.onclick = () => erasoa(e.i);
      cont.append(el);
    }
    $('hud-etsaiak').innerHTML = b.etsaiak.map(e => `<li data-i="${e.i}" class="${e.egoera}"><span>${e.i + 1}. etsaia</span><em>${{ bizirik: '', garaitua: '✔', ihes: '✖' }[e.egoera]}</em></li>`).join('');
  }

  function spriteKide(m, i) {
    if (m.sprite) return `<img src="${esc(m.sprite)}" alt="" class="k-irudia" onload="if(this.naturalWidth<=160)this.style.imageRendering='pixelated'">`;
    // Sin sprite todavía: caballero con las iniciales y el color del grupo.
    const ini = esc(m.alias.split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase());
    return `<svg viewBox="0 0 100 120" class="k-irudia"><path d="M30 118 L34 74 L22 60 L30 40 L70 40 L78 60 L66 74 L70 118 Z" fill="var(--kolorea)" stroke="#0009" stroke-width="3"/><circle cx="50" cy="28" r="18" fill="#e9d6b4" stroke="#0009" stroke-width="3"/><path d="M30 26 Q50 2 70 26 L70 32 L30 32 Z" fill="#9aa3ad" stroke="#0009" stroke-width="3"/><path d="M84 30 L84 92" stroke="#cfd6de" stroke-width="5"/><path d="M78 40 L90 40" stroke="#c9a246" stroke-width="5"/><text x="50" y="96" text-anchor="middle" font-size="22" font-weight="700" fill="#fff" font-family="Georgia,serif" style="paint-order:stroke" stroke="#0008" stroke-width="3">${ini}</text></svg>`;
  }

  function pintarTaldea() {
    const cont = $('taldea');
    cont.innerHTML = '';
    b.kideak.forEach((m, i) => {
      const [x, y] = puestoKide(i, b.kideak.length);
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'kidea' + (i === b.aktiboa ? ' aktiboa' : '');
      el.dataset.i = i;
      el.style.left = x + '%';
      el.style.top = y + '%';
      el.style.setProperty('--kolorea', b.g.color);
      el.style.setProperty('--n', i);
      el.setAttribute('aria-label', `${m.alias}${i === b.aktiboa ? ' (txanda)' : ''}`);
      el.innerHTML = `<span class="itzala"></span><span class="k-sprite">${spriteKide(m, i)}</span><span class="k-izena">${esc(m.alias)}</span><span class="k-kurtsorea" aria-hidden="true">▼</span>`;
      el.onclick = () => aukeratuKidea(i);
      cont.append(el);
    });
    const kontatu = (m, z) => b.txandak.filter(t => t.kidea === m.id && t.zuzena === z).length;
    $('hud-taldea').innerHTML = b.kideak.map((m, i) => `<li class="${i === b.aktiboa ? 'aktiboa' : ''}" data-i="${i}">
      <span class="h-kurtsorea">▶</span><span class="h-izena">${esc(m.alias)}</span>
      <span class="h-emaitza"><b class="ondo">${kontatu(m, true)}</b> / <b class="gaizki">${kontatu(m, false)}</b></span></li>`).join('');
    $('hud-taldea').querySelectorAll('li').forEach(li => li.onclick = () => aukeratuKidea(Number(li.dataset.i)));
  }

  function pintarBihotzak(efektua) {
    const max = Math.max(b.bizitza, b.etsaiak.length);
    $('bihotzak').innerHTML = Array.from({ length: max }, (_, i) => `<span class="bihotza${i < b.bizitza ? '' : ' hutsa'}${efektua === 'galdu' && i === b.bizitza ? ' apurtzen' : ''}${efektua === 'irabazi' && i === b.bizitza - 1 ? ' sortzen' : ''}">♥</span>`).join('');
  }

  function aukeratuKidea(i) {
    if (b.lanpetuta || b.amaituta || b.unekoa) return;
    b.aktiboa = (i + b.kideak.length) % b.kideak.length;
    pintarTaldea();
    mezua(`<b>${esc(b.kideak[b.aktiboa].alias)}</b>-ren txanda. Aukeratu etsai bat erasotzeko.`);
  }

  // ---------- Entrada al combate ----------
  async function sarrera() {
    document.body.classList.add('sartzen');
    const banda = document.createElement('div');
    banda.className = 'b-banda';
    banda.innerHTML = `<span>⚔ BORROKA ⚔</span>`;
    $('efektuak').append(banda);
    await espera(1700);
    banda.remove();
    document.body.classList.remove('sartzen');
  }

  // ---------- Ataque: abre la pregunta del enemigo ----------
  function erasoa(i) {
    const e = b.etsaiak[i];
    if (b.lanpetuta || b.amaituta || b.unekoa || e.egoera !== 'bizirik') return;
    const kidea = b.kideak[b.aktiboa];
    b.unekoa = { e, kidea, objektuak: [], kenduak: new Set() };
    document.querySelectorAll('.etsaia').forEach(x => x.classList.toggle('helburua', Number(x.dataset.i) === i));
    $('g-nor').textContent = kidea.alias;
    $('g-etsaia').textContent = `${i + 1}. etsaia`;
    $('g-testua').textContent = e.q.testua;
    $('g-pista').hidden = true;
    pintarAukerak();
    pintarObjektuak();
    $('galdera').hidden = false;
    $('g-aukerak').querySelector('button')?.focus();
  }

  function pintarAukerak(zuzenaErakutsi = false) {
    const q = b.unekoa.e.q;
    $('g-aukerak').innerHTML = q.aukerak.map((t, j) => `<li><button type="button" data-j="${j}" class="aukera${b.unekoa.kenduak.has(j) ? ' kendua' : ''}${zuzenaErakutsi && j === q.zuzena ? ' argitua' : ''}"
      ${b.unekoa.kenduak.has(j) ? 'disabled' : ''}><span class="a-letra">${'ABCD'[j]}</span><span class="a-testua">${esc(t)}</span></button></li>`).join('');
    $('g-aukerak').querySelectorAll('button').forEach(btn => btn.onclick = () => erantzun(Number(btn.dataset.j)));
  }

  function pintarObjektuak() {
    const q = b.unekoa.e.q;
    const erabilgarriak = b.objektuak.filter(o => b.inventario[o.id] > 0 && !b.unekoa.objektuak.includes(o.id) && (o.borroka !== 'pista' || q.pista));
    $('g-objektuak').innerHTML = erabilgarriak.length
      ? `<span class="o-izenburua">🎒 Objektuak</span>` + erabilgarriak.map(o => `<button type="button" class="objektua" data-o="${esc(o.id)}" title="${esc(EFEKTUAK[o.borroka].azalpena)}">
          <span class="o-ikonoa">${o.icono && !/[./]/.test(o.icono) ? esc(o.icono) : (ICONO_OBJETO[o.tipo] || '✨')}</span>
          <span class="o-izena">${esc(o.nombre)}<small>${esc(EFEKTUAK[o.borroka].izena)}</small></span>
          <span class="o-kopurua">×${b.inventario[o.id]}</span></button>`).join('')
      : '';
    $('g-objektuak').querySelectorAll('button').forEach(btn => btn.onclick = () => erabiliObjektua(btn.dataset.o));
  }

  // Objetos: actúan sobre la pregunta abierta y quedan apuntados en el turno.
  function erabiliObjektua(id) {
    const o = b.objektuak.find(x => x.id === id);
    const u = b.unekoa, q = u.e.q;
    if (!o || !u || !(b.inventario[id] > 0)) return;
    u.objektuak.push(id);
    if (o.consumible) b.inventario[id]--;
    let zuzenaErakutsi = false;
    if (o.borroka === 'erdia') {
      const okerrak = [0, 1, 2, 3].filter(j => j !== q.zuzena && !u.kenduak.has(j)).sort(() => Math.random() - .5);
      okerrak.slice(0, 2).forEach(j => u.kenduak.add(j));
    } else if (o.borroka === 'pista') {
      $('g-pista').hidden = false;
      $('g-pista').textContent = '💡 ' + q.pista;
    } else if (o.borroka === 'erantzuna') {
      zuzenaErakutsi = true;
    } else if (o.borroka === 'bizitza') {
      b.bizitza++;
      pintarBihotzak('irabazi');
    }
    distira($('galdera').querySelector('.galdera'));
    pintarAukerak(zuzenaErakutsi);
    pintarObjektuak();
  }

  function distira(el) {
    if (reducir()) return;
    el.animate([{ boxShadow: '0 0 0 0 #fff0' }, { boxShadow: '0 0 40px 10px #fff8' }, { boxShadow: '0 0 0 0 #fff0' }], { duration: 600 });
  }

  // ---------- Respuesta y animaciones ----------
  async function erantzun(j) {
    const u = b.unekoa;
    if (!u || b.lanpetuta) return;
    b.lanpetuta = true;
    $('galdera').hidden = true;
    const zuzena = j === u.e.q.zuzena;
    b.txandak.push({ galdera: u.e.q.id, kidea: u.kidea.id, aukera: j, zuzena, objektuak: u.objektuak.length ? [...u.objektuak] : undefined });
    const kideEl = document.querySelector(`.kidea[data-i="${b.aktiboa}"]`);
    const etsaiEl = document.querySelector(`.etsaia[data-i="${u.e.i}"]`);
    etsaiEl.classList.remove('helburua');
    if (zuzena) {
      await kolpea(kideEl, etsaiEl);
      u.e.egoera = 'garaitua';
      mezua(`💥 <b>${esc(u.kidea.alias)}</b>-k ${u.e.i + 1}. etsaia garaitu du!`);
    } else {
      b.bizitza--;
      await kolpeaJaso(etsaiEl, kideEl);
      u.e.egoera = 'ihes';
      mezua(`💢 Erantzun okerra! ${u.e.i + 1}. etsaiak eraso eta ihes egin du. Taldeak bizitza bat galdu du.`);
    }
    b.unekoa = null;
    pintarTaldea();
    $('hud-etsaiak').querySelector(`[data-i="${u.e.i}"]`).className = u.e.egoera;
    $('hud-etsaiak').querySelector(`[data-i="${u.e.i}"] em`).textContent = u.e.egoera === 'garaitua' ? '✔' : '✖';
    b.lanpetuta = false;
    if (b.bizitza <= 0 || b.etsaiak.every(e => e.egoera !== 'bizirik')) { await espera(700); amaitu(); return; }
    // Pasa la txanda al siguiente miembro, como en los combates por turnos.
    aukeratuKidea(b.aktiboa + 1);
  }

  const centro = el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };

  function popup(el, texto, clase) {
    const [x, y] = centro(el);
    const p = document.createElement('span');
    p.className = 'b-zenbakia ' + clase;
    p.textContent = texto;
    p.style.left = x + 'px';
    p.style.top = (y - 30) + 'px';
    $('efektuak').append(p);
    setTimeout(() => p.remove(), 1400);
  }

  // Acierto: el miembro corre hacia el enemigo, tajo, destello y el enemigo se deshace en chispas.
  async function kolpea(kideEl, etsaiEl) {
    const [kx, ky] = centro(kideEl), [ex, ey] = centro(etsaiEl);
    kideEl.classList.add('erasotzen');
    if (!reducir()) {
      await kideEl.animate([{ transform: 'translate(0,0)' }, { transform: `translate(${(ex - kx) * .78}px, ${(ey - ky) * .78}px)` }], { duration: 260, easing: 'ease-in', fill: 'forwards' }).finished;
    }
    const tajo = document.createElement('span');
    tajo.className = 'b-tajoa';
    tajo.style.left = ex + 'px';
    tajo.style.top = ey + 'px';
    $('efektuak').append(tajo);
    setTimeout(() => tajo.remove(), 600);
    etsaiEl.classList.add('jota');
    popup(etsaiEl, 'KO!', 'kritikoa');
    Fx.estallido(etsaiEl);
    await espera(380);
    if (!reducir()) kideEl.animate([{ transform: `translate(${(ex - kx) * .78}px, ${(ey - ky) * .78}px)` }, { transform: 'translate(0,0)' }], { duration: 320, easing: 'ease-out', fill: 'forwards' });
    etsaiEl.classList.add('garaitua');
    Fx.llegada(etsaiEl, '#ffd678');
    await espera(800);
    kideEl.classList.remove('erasotzen');
  }

  // Fallo: el enemigo se abalanza, la pantalla tiembla, se rompe un corazón y el enemigo huye.
  async function kolpeaJaso(etsaiEl, kideEl) {
    const [kx, ky] = centro(kideEl), [ex, ey] = centro(etsaiEl);
    if (!reducir()) {
      await etsaiEl.animate([{ transform: 'translate(0,0)' }, { transform: `translate(${(kx - ex) * .7}px, ${(ky - ey) * .7}px) scale(1.15)` }], { duration: 240, easing: 'ease-in', fill: 'forwards' }).finished;
      $('eszena').animate([{ transform: 'translate(0,0)' }, { transform: 'translate(-12px,6px)' }, { transform: 'translate(10px,-8px)' }, { transform: 'translate(-6px,4px)' }, { transform: 'translate(0,0)' }], { duration: 380 });
    }
    document.body.classList.add('mina');
    setTimeout(() => document.body.classList.remove('mina'), 450);
    kideEl.classList.add('zauritua');
    popup(kideEl, '−1 ♥', 'kaltea');
    pintarBihotzak('galdu');
    await espera(420);
    if (!reducir()) await etsaiEl.animate([{ transform: `translate(${(kx - ex) * .7}px, ${(ky - ey) * .7}px) scale(1.15)` }, { transform: 'translate(0,0)' }], { duration: 300, fill: 'forwards' }).finished;
    kideEl.classList.remove('zauritua');
    etsaiEl.classList.add('ihes');
    await espera(700);
  }

  // ---------- Fin del combate ----------
  function amaitu() {
    if (b.amaituta) return;
    b.amaituta = true;
    const N = b.etsaiak.length, asmatuak = b.txandak.filter(t => t.zuzena).length;
    const emaitza = b.bizitza <= 0 ? 'porrota' : b.txandak.length === N ? 'garaipena' : 'amaitu_gabe';
    const titulua = { garaipena: 'GARAIPENA!', porrota: 'PORROTA', amaitu_gabe: 'AMAITU GABE' }[emaitza];
    document.body.classList.add('amaiera-' + emaitza);
    const lerroak = b.kideak.map(m => {
      const nire = b.txandak.filter(t => t.kidea === m.id);
      const obj = nire.flatMap(t => t.objektuak || []).map(id => b.objektuak.find(o => o.id === id)?.nombre || id);
      return `<tr><th>${esc(m.alias)}</th><td class="ondo">${nire.filter(t => t.zuzena).length}</td><td class="gaizki">${nire.filter(t => !t.zuzena).length}</td><td>${esc(obj.join(', ') || '—')}</td></tr>`;
    }).join('');
    $('amaiera').innerHTML = `<div class="b-leihoa amaiera" data-emaitza="${emaitza}" role="dialog" aria-modal="true" aria-labelledby="a-titulua">
        <h2 id="a-titulua" class="a-titulua">${titulua}</h2>
        <p class="a-puntuazioa"><b>${asmatuak}</b> / ${N}</p>
        <p class="a-azpititulua">${esc(b.g.nombre)} · ${esc($('b-gaia').textContent)} · ♥ ${Math.max(0, b.bizitza)}</p>
        <table class="a-taula"><thead><tr><th>Kidea</th><th>✔</th><th>✖</th><th>Objektuak</th></tr></thead><tbody>${lerroak}</tbody></table>
        <p id="a-egoera" class="a-egoera"></p>
        <div class="a-botoiak">
          <button type="button" id="a-gorde" class="b-botoia">💾 Gorde emaitza</button>
          <button type="button" id="a-itxi" class="b-botoia txikia">Itxi gorde gabe</button>
        </div>
      </div>`;
    $('amaiera').hidden = false;
    $('a-gorde').onclick = gorde;
    $('a-itxi').onclick = () => { if (b.gordeta || confirm('Emaitza gorde gabe itxi?')) location.href = 'admin.html'; };
    $('a-gorde').focus();
    if (emaitza === 'garaipena') {
      const ospatu = n => { if (n <= 0 || !document.querySelector('.taldea-lerroa')) return; Fx.fuegos(document.querySelector('.kidea'), 3); setTimeout(() => ospatu(n - 1), 1400); };
      ospatu(5);
    }
  }

  async function gorde() {
    const btn = $('a-gorde');
    btn.disabled = true;
    $('a-egoera').textContent = 'Gordetzen…';
    try {
      const txandak = b.txandak.map(({ galdera, kidea, aukera, objektuak }) => ({ galdera, kidea, aukera, objektuak }));
      const r = await api('/api/borroka', { aventura: avId, grupo: b.g.id, datos: { casilla: casillaId, etsaiak: b.etsaiak.map(e => e.q.id), txandak } });
      b.gordeta = true;
      $('a-egoera').innerHTML = `✔ Gordeta (#${r.evento.id}). Gogoratu <b>⬆ Argitaratu</b> sakatzea ikasleek ikus dezaten.`;
      btn.textContent = '✔ Gordeta';
      $('a-itxi').textContent = 'Panelera itzuli';
    } catch (e) {
      btn.disabled = false;
      $('a-egoera').textContent = '✖ ' + e.message;
    }
  }

  // ---------- Teclado ----------
  function teclado(e) {
    if (b.amaituta) return;
    if (b.unekoa && !b.lanpetuta) {
      const j = { a: 0, b: 1, c: 2, d: 3, 1: 0, 2: 1, 3: 2, 4: 3 }[e.key.toLowerCase()];
      if (j != null && !b.unekoa.kenduak.has(j)) { e.preventDefault(); erantzun(j); }
      if (e.key === 'Escape' && !b.unekoa.objektuak.length) { // se puede cambiar de enemigo si aún no se ha usado ningún objeto
        $('galdera').hidden = true;
        document.querySelectorAll('.etsaia.helburua').forEach(x => x.classList.remove('helburua'));
        b.unekoa = null;
      }
      return;
    }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') aukeratuKidea(b.aktiboa + 1);
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') aukeratuKidea(b.aktiboa - 1);
    const n = Number(e.key);
    if (n >= 1 && n <= b.etsaiak.length) erasoa(n - 1);
  }

  iniciar();
})();
