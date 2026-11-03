// Pantalla de inicio en pixel art. Primero «sakatu edozein tekla» (empieza la canción de inicio) y después
// hay que MANTENER pulsado para sacar la espada de la piedra; al salir, la escena se deshace en píxeles y
// aparece el mapa. Se dibuja en un canvas pequeño (~320×180) ampliado sin suavizado, así todo es pixel art.
// Sale una vez por sesión del navegador (sessionStorage).
(function () {
  const ABESTIA = 'music/' + encodeURIComponent('nugget wallahi - Release.mp3');
  const CARGA = 1.6;      // segundos manteniendo pulsado para sacar la espada
  const DESCARGA = 1.2;   // velocidad a la que vuelve a hundirse al soltar
  try { if (sessionStorage.getItem('hasiera') === 'ikusita') return; } catch { /* sin almacenamiento: se enseña */ }
  const lasai = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tactil = matchMedia('(pointer: coarse)').matches;

  const pantaila = document.createElement('div');
  pantaila.id = 'hasiera';
  pantaila.setAttribute('role', 'dialog');
  pantaila.setAttribute('aria-modal', 'true');
  pantaila.setAttribute('aria-label', 'Hasiera: eutsi sakatuta ezpata harritik ateratzeko');
  pantaila.innerHTML = `<canvas aria-hidden="true"></canvas>
    <div class="h-behea"><div class="h-karga" hidden><i></i></div>
    <p class="h-mezua" aria-live="polite">— ${tactil ? 'UKITU PANTAILA' : 'SAKATU EDOZEIN TEKLA'} —</p></div>
    <button type="button" class="h-saltatu">Saltatu ⏭</button>`;
  document.body.append(pantaila);
  document.documentElement.classList.add('hasiera-irekita');
  const lienzo = pantaila.querySelector('canvas'), ctx = lienzo.getContext('2d');
  const mezua = pantaila.querySelector('.h-mezua'), karga = pantaila.querySelector('.h-karga'), kargaBetea = karga.firstElementChild;

  // ---------- Utilidades de pixel art ----------
  function rng(semilla) { // aleatorio con semilla: el paisaje sale igual en cada visita
    return () => {
      semilla = semilla + 0x6D2B79F5 | 0;
      let t = Math.imul(semilla ^ semilla >>> 15, 1 | semilla);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  const rect = (g, c, x, y, w, h) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  function circulo(g, c, cx, cy, r) {
    g.fillStyle = c;
    for (let dy = -r; dy <= r; dy++) { const w = Math.floor(Math.sqrt(r * r - dy * dy)); g.fillRect(cx - w, cy + dy, 2 * w + 1, 1); }
  }
  // Sin medias tintas: cada píxel es opaco o transparente (quita el suavizado de textos y polígonos).
  function umbral(c) {
    const g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height);
    for (let i = 3; i < d.data.length; i += 4) d.data[i] = d.data[i] > 110 ? 255 : 0;
    g.putImageData(d, 0, 0);
    return c;
  }
  // Texto pixelado con relleno en degradado por filas, contorno de 1 px y sombra.
  function textoPixel(texto, tam, colores, borde) {
    const c = document.createElement('canvas'), g = c.getContext('2d');
    const fuente = `bold ${tam}px 'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif`;
    g.font = fuente;
    const w = Math.ceil(g.measureText(texto).width) + 6, h = Math.ceil(tam * 1.25) + 6;
    c.width = w; c.height = h;
    g.font = fuente; g.textBaseline = 'top'; g.fillStyle = '#000';
    g.fillText(texto, 3, 3);
    const m = g.getImageData(0, 0, w, h).data, lleno = (x, y) => x >= 0 && y >= 0 && x < w && y < h && m[(y * w + x) * 4 + 3] > 110;
    const out = g.createImageData(w, h), hex = s => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16));
    const pinta = (i, [r, gg, b]) => { out.data.set([r, gg, b, 255], i * 4); };
    let y0 = h, y1 = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (lleno(x, y)) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (lleno(x, y)) pinta(y * w + x, hex(colores[Math.min(colores.length - 1, Math.floor((y - y0) / (y1 - y0 + 1) * colores.length))]));
      else if (lleno(x - 1, y) || lleno(x + 1, y) || lleno(x, y - 1) || lleno(x, y + 1)) pinta(y * w + x, hex(borde));
      else if (lleno(x - 1, y - 2) || lleno(x, y - 2)) pinta(y * w + x, [10, 4, 2]);
    }
    g.putImageData(out, 0, 0);
    return c;
  }

  // ---------- Escena ----------
  let W, H, s, fondo, ventanas, estrellas, luciernagas = [], chispas = [], titulua = null, izenburua = '';
  const kuboa = document.createElement('canvas');

  function medir() {
    const px = Math.max(2, Math.floor(Math.min(innerWidth / 320, innerHeight / 180)));
    W = lienzo.width = Math.ceil(innerWidth / px);
    H = lienzo.height = Math.ceil(innerHeight / px);
    s = Math.max(1, Math.round(Math.min(W / 320, H / 180)));
    pintarFondo();
    prepararTitulo();
  }

  function cresta(base, amp, semilla) {
    const R = rng(semilla), p = [R() * 6, R() * 6, R() * 6];
    return x => Math.round(base + amp * (Math.sin(x * .021 + p[0]) * .55 + Math.sin(x * .053 + p[1]) * .3 + Math.sin(x * .13 + p[2]) * .15));
  }

  // Lo que no se mueve: cielo con tramado, luna, montañas, castillo y suelo.
  function pintarFondo() {
    fondo = document.createElement('canvas');
    fondo.width = W; fondo.height = H;
    const g = fondo.getContext('2d');
    const ZERUA = [[13, 11, 38], [29, 20, 66], [58, 26, 92], [107, 33, 99], [168, 52, 79], [224, 100, 58], [247, 165, 65]];
    const horiz = Math.round(H * .7), img = g.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = Math.min(y / horiz, .999) * (ZERUA.length - 1), b = Math.floor(t);
      img.data.set([...ZERUA[(t - b) * 16 > BAYER[y % 4][x % 4] + .5 ? b + 1 : b], 255], (y * W + x) * 4);
    }
    g.putImageData(img, 0, 0);

    const R = rng(11);
    const lx = Math.round(W * .86), ly = Math.round(H * .4), lr = Math.max(6, Math.round(H * .055));
    g.globalAlpha = .08; circulo(g, '#f6ecc8', lx, ly, lr + 8); circulo(g, '#f6ecc8', lx, ly, lr + 4); g.globalAlpha = 1;
    circulo(g, '#d9c99a', lx, ly, lr);
    circulo(g, '#f6ecc8', lx + 1, ly - 1, lr - 1);
    for (let k = 0; k < 4; k++) circulo(g, '#e2d3a6', lx + Math.round((R() - .5) * lr), ly + Math.round((R() - .5) * lr), Math.max(1, Math.round(lr * .18)));

    const lejos = cresta(H * .56, H * .08, 3), medio = cresta(H * .67, H * .05, 5), cerca = cresta(H * .8, H * .03, 9);
    for (let x = 0; x < W; x++) {
      const y = lejos(x);
      rect(g, '#4a2a5e', x, y, 1, H - y);
      if (y < H * .56 - H * .08 * .45) rect(g, '#9c84bd', x, y, 1, 2); // nieve en las cumbres
    }
    for (let x = 0; x < W; x++) { const y = medio(x); rect(g, '#2b1840', x, y, 1, H - y); }

    // Castillo en silueta sobre la montaña del medio.
    const cx = Math.round(W / 2), by = medio(cx) + 2 * s, C = '#0f0818';
    const tejado = (x, y, w, h) => { for (let j = 0; j < h; j++) { const ww = Math.max(1, Math.round(w * (1 - j / h))); rect(g, C, x + (w - ww) / 2, y - j, ww, 1); } };
    rect(g, C, cx - 15 * s, by - 24 * s, 30 * s, 24 * s);
    for (let i = 0; i < 8; i++) rect(g, C, cx - 15 * s + i * 4 * s, by - 27 * s, 2 * s, 3 * s);
    for (const tx of [cx - 21 * s, cx + 13 * s]) { rect(g, C, tx, by - 36 * s, 8 * s, 36 * s); tejado(tx - s, by - 36 * s, 10 * s, 9 * s); }
    rect(g, C, cx - 5 * s, by - 46 * s, 10 * s, 22 * s);
    tejado(cx - 6 * s, by - 46 * s, 12 * s, 11 * s);
    rect(g, C, cx, by - 64 * s, s, 8 * s);
    rect(g, '#2a1408', cx - 3 * s, by - 8 * s, 6 * s, 8 * s); // puerta
    ventanas = [[cx - 18 * s, by - 30 * s], [cx + 16 * s, by - 30 * s], [cx - s, by - 40 * s], [cx - 9 * s, by - 17 * s], [cx + 7 * s, by - 17 * s]];

    for (let x = 0; x < W; x++) {
      const y = cerca(x);
      rect(g, '#170d22', x, y, 1, H - y);
      if (R() < .25) rect(g, '#2e1c40', x, y - 1, 1, 1 + Math.round(R()));
    }

    estrellas = Array.from({ length: Math.round(W * H / 700) }, () => ({ x: Math.floor(R() * W), y: Math.floor(R() * H * .5), f: .5 + R() * 2.5, p: R() * 6, g: R() < .12 }));
    luciernagas = Array.from({ length: lasai ? 0 : 14 }, () => ({ x: R() * W, y: H * (.5 + R() * .45), p: R() * 6, v: .3 + R() * .6 }));
  }

  function prepararTitulo() {
    if (!izenburua) return;
    const palabras = izenburua.toUpperCase().split(' ');
    const ultima = palabras.length > 1 ? palabras.pop() : '';
    const prueba = textoPixel(palabras.join(' '), 100, ['#fff'], '#000');
    const tam = Math.max(10, Math.min(Math.round(H * .12), Math.floor(W * .74 * 100 / prueba.width)));
    titulua = {
      a: textoPixel(palabras.join(' '), tam, ['#fff6c8', '#ffe08a', '#f2c14e', '#d9962e', '#a8641c'], '#2a1206'),
      b: ultima && textoPixel(ultima, Math.round(tam * 1.3), ['#ffb3a0', '#ff5a44', '#d0302a', '#8e140f'], '#ffe08a'),
    };
    kuboa.width = kuboa.height = Math.round(titulua.a.height * 1.05);
  }

  // Cubo rojo en 3D (el de la marca) proyectado a mano y pixelado en cada fotograma.
  function pintarKuboa(t) {
    const n = kuboa.width, g = kuboa.getContext('2d'), a = lasai ? .6 : t * 1.2, inc = .55, r = n * .3;
    g.clearRect(0, 0, n, n);
    const V = [-1, 1].flatMap(x => [-1, 1].flatMap(y => [-1, 1].map(z => [x, y, z]))).map(([x, y, z]) => {
      const x1 = x * Math.cos(a) + z * Math.sin(a), z1 = -x * Math.sin(a) + z * Math.cos(a);
      const y2 = y * Math.cos(inc) - z1 * Math.sin(inc), z2 = y * Math.sin(inc) + z1 * Math.cos(inc);
      return [n / 2 + x1 * r, n / 2 + y2 * r, z2];
    });
    const CARAS = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];
    CARAS.map(c => {
      const [p, q, w] = c.map(i => V[i]);
      const nz = (q[0] - p[0]) * (w[1] - p[1]) - (q[1] - p[1]) * (w[0] - p[0]);
      return { c, nz, z: c.reduce((m, i) => m + V[i][2], 0) };
    }).filter(f => f.nz < 0).sort((x, y) => y.z - x.z).forEach(f => {
      const luz = Math.min(1, Math.abs(f.nz) / (r * r * 4));
      g.fillStyle = `rgb(${Math.round(120 + 135 * luz)},${Math.round(20 + 50 * luz)},${Math.round(16 + 40 * luz)})`;
      g.beginPath(); f.c.forEach((i, k) => g[k ? 'lineTo' : 'moveTo'](V[i][0], V[i][1])); g.closePath(); g.fill();
      g.strokeStyle = '#3a0805'; g.lineWidth = 1; g.stroke();
    });
    umbral(kuboa);
  }

  // ---------- Estado del juego ----------
  let fase = 'itxaron', eusten = false, p = 0, tGarai = 0, prev = 0, t = 0, orden = null, raf = 0, audio = null, fugaz = null;
  const piedra = () => ({ x: Math.round(W / 2), y: Math.round(H * .79) });

  function espada(g, x, abajo) {
    const L = 22 * s, top = abajo - L;
    rect(g, '#8d99ab', x - 1, top, 3, L); rect(g, '#eef3f8', x, top, 1, L - 1);
    rect(g, '#e2b13c', x - 5 * s, top - 2 * s, 11 * s, 2 * s); rect(g, '#8a6424', x - 5 * s, top - s, 11 * s, s);
    for (let j = 0; j < 6 * s; j++) rect(g, j % 2 ? '#8b5a2b' : '#6b3a1e', x - 1, top - 2 * s - 1 - j, 3, 1);
    rect(g, '#d0302a', x - 1, top - 8 * s - 3, 3, 3); rect(g, '#ff8a7a', x - 1, top - 8 * s - 3, 1, 1);
    return top - 8 * s; // empuñadura, para el brillo
  }

  function roca(g, x, y) {
    const w = 30 * s, h = 13 * s;
    for (let j = 0; j < h; j++) {
      const k = Math.max(0, (h * .5 - j) / (h * .5)), hw = Math.round(w / 2 * Math.sqrt(1 - k * k));
      rect(g, j < 2 ? '#9b97a6' : j > h - 4 ? '#4a4655' : '#6f6b7a', x - hw, y + j, 2 * hw + 1, 1);
      rect(g, '#4a4655', x + hw, y + j, 1, 1);
    }
    for (const [dx, dy] of [[-9, 4], [-8, 5], [6, 7], [7, 7], [10, 5]]) rect(g, '#4f7a3a', x + dx * s, y + dy * s, s, s);
    rect(g, '#1e1b24', x - 2, y + 1, 5, 1);
  }

  function chispa(x, y, fuerza) {
    const a = Math.random() * Math.PI * 2, v = Math.random() * fuerza;
    chispas.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - fuerza * .4, vida: .5 + Math.random() * .6, c: ['#fff', '#ffe08a', '#ff9a3c'][Math.floor(Math.random() * 3)] });
  }

  function fotograma(ms) {
    const dt = Math.min(.25, prev ? (ms - prev) / 1000 : 0); // tiempo real aunque el equipo vaya lento
    prev = ms; t += dt;
    if (fase === 'tira') {
      p = Math.max(0, Math.min(1, p + (eusten ? dt / CARGA : -dt * DESCARGA)));
      kargaBetea.style.width = `${p * 100}%`;
      if (p >= 1) garaipena();
    }
    const tv = fase === 'garaipena' ? t - tGarai : 0;
    const g = ctx;
    const temblor = !lasai && ((fase === 'tira' && eusten) || tv < .4 && fase === 'garaipena') ? (fase === 'garaipena' ? 2 : 1) : 0;
    g.setTransform(1, 0, 0, 1, temblor ? Math.round((Math.random() - .5) * 2 * temblor) : 0, temblor ? Math.round((Math.random() - .5) * 2 * temblor) : 0);
    g.drawImage(fondo, 0, 0);

    for (const e of estrellas) {
      const b = lasai ? .8 : .55 + .45 * Math.sin(t * e.f + e.p);
      if (b < .25) continue;
      g.globalAlpha = b;
      rect(g, '#fff8e0', e.x, e.y, 1, 1);
      if (e.g && b > .85) { rect(g, '#ffe08a', e.x - 1, e.y, 3, 1); rect(g, '#ffe08a', e.x, e.y - 1, 1, 3); }
    }
    g.globalAlpha = 1;
    // Estrella fugaz de vez en cuando.
    if (!lasai && !fugaz && Math.random() < dt / 5) fugaz = { x: Math.random() * W * .6, y: Math.random() * H * .2, t: 0 };
    if (fugaz) {
      fugaz.t += dt;
      for (let k = 0; k < 8; k++) { g.globalAlpha = 1 - k / 8; rect(g, '#fff', fugaz.x + fugaz.t * 140 - k * 2, fugaz.y + fugaz.t * 50 - k * .7, 1, 1); }
      g.globalAlpha = 1;
      if (fugaz.t > 1) fugaz = null;
    }
    // Ventanas del castillo que parpadean y bandera al viento.
    ventanas.forEach(([x, y], i) => rect(g, Math.sin(t * 3 + i * 1.7) + Math.sin(t * 7.3 + i) > -.6 ? '#ffcc55' : '#c46a22', x, y, 2 * s, 3 * s));
    const mx = Math.round(W / 2) + s, my = ventanas[2][1] - 24 * s;
    for (let k = 0; k < 7 * s; k++) rect(g, '#d0302a', mx + k, my + Math.round(Math.sin(t * 5 - k * .5) * (lasai ? 0 : 1)), 1, 4 * s);

    // Título con el cubo rojo girando a su izquierda.
    if (titulua) {
      const bote = lasai ? 0 : Math.round(Math.sin(t * 2) * 1.5);
      const { a, b } = titulua, total = kuboa.width + 2 + a.width, x0 = Math.round((W - total) / 2), y0 = Math.round(H * .06) + bote;
      pintarKuboa(t);
      g.drawImage(kuboa, x0, y0);
      g.drawImage(a, x0 + kuboa.width + 2, y0);
      if (b) g.drawImage(b, Math.round((W - b.width) / 2), y0 + a.height - Math.round(a.height * .25));
    }

    // Espada en la piedra.
    const r = piedra();
    const sube = Math.round(p * 14 * s + (fase === 'garaipena' ? Math.min(tv, .5) / .5 * 10 * s : 0));
    if (p > 0 || fase === 'garaipena') {
      const brillo = fase === 'garaipena' ? 1 : p;
      const grad = g.createRadialGradient(r.x, r.y - sube, 1, r.x, r.y - sube, 40 * s);
      grad.addColorStop(0, `rgba(255,236,160,${.55 * brillo})`); grad.addColorStop(1, 'rgba(255,236,160,0)');
      g.fillStyle = grad; g.fillRect(r.x - 40 * s, r.y - sube - 40 * s, 80 * s, 80 * s);
    }
    if (fase === 'garaipena' && tv < 1.4) { // columna de luz
      const a = 1 - tv / 1.4, w = 3 + Math.round(tv * 24);
      g.globalAlpha = a * .6; rect(g, '#ffe9a8', r.x - w / 2, 0, w, r.y);
      g.globalAlpha = a; rect(g, '#fff', r.x - 1, 0, 3, r.y);
      g.globalAlpha = 1;
    }
    espada(g, r.x, r.y + 11 * s - sube);
    roca(g, r.x, r.y);
    if (fase === 'tira' && eusten && !lasai) for (let k = 0; k < 2; k++) chispa(r.x + (Math.random() - .5) * 16 * s, r.y, 40);

    for (const l of luciernagas) {
      l.x += Math.sin(t * l.v + l.p) * .15; l.y += Math.cos(t * l.v * .7 + l.p) * .1;
      if (Math.sin(t * 2 * l.v + l.p) > -.2) rect(g, '#fff3a0', l.x, l.y, 1, 1);
    }
    chispas = chispas.filter(c => (c.vida -= dt) > 0);
    for (const c of chispas) { c.vy += 90 * dt; c.x += c.vx * dt; c.y += c.vy * dt; rect(g, c.c, c.x, c.y, 1, 1); }

    if (fase === 'garaipena' && tv < .3 && !lasai) { g.globalAlpha = (1 - tv / .3) * .85; rect(g, '#fff', -4, -4, W + 8, H + 8); g.globalAlpha = 1; }
    g.setTransform(1, 0, 0, 1, 0, 0);

    // Al final, la escena se deshace en bloques de píxeles y deja ver el mapa.
    if (fase === 'garaipena' && tv > 1.2) {
      const k = Math.min(1, (tv - 1.2) / 1.0), cols = Math.ceil(W / 4);
      for (let i = 0; i < Math.floor(k * orden.length); i++) g.clearRect((orden[i] % cols) * 4, Math.floor(orden[i] / cols) * 4, 4, 4);
      if (k >= 1) return cerrar();
    }
    raf = requestAnimationFrame(fotograma);
  }

  // ---------- Entradas ----------
  function garaipena() {
    fase = 'garaipena'; tGarai = t; eusten = false;
    karga.hidden = true;
    mezua.textContent = '⚔ ABENTURA HASTEN DA! ⚔';
    mezua.classList.add('finko');
    if (!lasai) { const r = piedra(); for (let k = 0; k < 90; k++) chispa(r.x, r.y - 14 * s, 120); }
    const n = Math.ceil(W / 4) * Math.ceil(H / 4);
    orden = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [orden[i], orden[j]] = [orden[j], orden[i]]; }
    if (lasai) setTimeout(cerrar, 900);
    apagarMusica();
  }

  function empezarMusica() {
    let vol = .6;
    try { vol = Number(localStorage.getItem('musika-bolumena') ?? .6); } catch { /* idem */ }
    audio = new Audio(ABESTIA);
    audio.loop = true;
    audio.volume = vol;
    audio.play().catch(() => { /* sin sonido: la pantalla funciona igual */ });
  }

  function apagarMusica() {
    if (!audio) return;
    const a = audio, paso = a.volume / 20;
    const id = setInterval(() => { if (a.volume <= paso) { a.pause(); clearInterval(id); } else a.volume -= paso; }, 75);
  }

  function pulsar(e) {
    if (e.target.closest?.('.h-saltatu')) return; // el botón Saltatu funciona como botón
    if (e.type === 'keydown') {
      e.preventDefault(); e.stopPropagation(); // ninguna tecla llega a la página de debajo
      if (e.key === 'Escape') return saltar();
      if (e.repeat || ['Tab', 'Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
    } else e.stopPropagation();
    if (fase === 'itxaron') {
      fase = 'tira';
      empezarMusica();
      karga.hidden = false;
      mezua.classList.add('finko');
      mezua.textContent = `EUTSI ${tactil ? 'UKITUTA' : 'SAKATUTA'} EZPATA ATERATZEKO`;
    }
    if (fase === 'tira') eusten = true;
  }
  const soltar = () => { eusten = false; };

  function saltar() {
    if (fase === 'garaipena') return;
    fase = 'garaipena';
    apagarMusica();
    pantaila.classList.add('joaten');
    setTimeout(cerrar, 450);
  }

  function cerrar() {
    if (!pantaila.isConnected) return;
    cancelAnimationFrame(raf);
    removeEventListener('keydown', pulsar, true);
    removeEventListener('keyup', soltar, true);
    removeEventListener('pointerup', soltar);
    removeEventListener('pointercancel', soltar);
    removeEventListener('resize', medir);
    pantaila.remove();
    document.documentElement.classList.remove('hasiera-irekita');
    try { sessionStorage.setItem('hasiera', 'ikusita'); } catch { /* idem */ }
    document.dispatchEvent(new Event('hasiera-amaitu'));
    document.querySelector('.boton-jarraitu')?.focus(); // «Zer berri?» espera debajo
  }

  addEventListener('keydown', pulsar, true);
  addEventListener('keyup', soltar, true);
  pantaila.addEventListener('pointerdown', pulsar);
  addEventListener('pointerup', soltar);
  addEventListener('pointercancel', soltar);
  addEventListener('resize', medir);
  pantaila.querySelector('.h-saltatu').onclick = saltar;

  medir();
  fetch('data/publico/config.json').then(r => r.json()).then(c => { izenburua = c.titulo || ''; prepararTitulo(); }).catch(() => { /* sin título */ });
  fotograma(performance.now());
})();
