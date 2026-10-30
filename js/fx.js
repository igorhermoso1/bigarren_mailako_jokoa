// Efectos visuales del mapa, pintados en un solo <canvas> encima del dibujo y por debajo de casillas y fichas:
// luciérnagas doradas y azuladas, estrellas fugaces, chispas y ondas al pulsar, y una gran llegada
// (onda, columna de luz y fuente de chispas del color del grupo) cuando una ficha alcanza su casilla nueva.
// No hace nada si el sistema pide reducir movimiento, y se para con la pestaña oculta.
(function () {
  const reducir = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MOTAS = 70;
  let ctx = null, canvas = null, lienzo = null, ultimo = 0, activo = false;
  let motas = [], chispas = [], ondas = [], pilares = [], estrellas = [], cohetes = [], proximaEstrella = 0;
  let generacion = 0; // cada arranque tiene su número: así nunca corren dos bucles a la vez

  // Sprites de brillo por color, pintados una vez (mucho más baratos que shadowBlur en cada partícula).
  const sprites = new Map();
  function brillo(color = '#ffd678') {
    if (!sprites.has(color)) {
      const c = Object.assign(document.createElement('canvas'), { width: 32, height: 32 });
      const g = c.getContext('2d');
      const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      r.addColorStop(0, '#ffffff');
      r.addColorStop(.22, color);
      r.addColorStop(1, color + '00');
      g.fillStyle = r;
      g.fillRect(0, 0, 32, 32);
      sprites.set(color, c);
    }
    return sprites.get(color);
  }

  const azar = (a, b) => a + Math.random() * (b - a);
  const nuevaMota = () => ({
    x: Math.random(), y: Math.random(), vx: azar(-.006, .006), vy: azar(-.014, -.003), fase: azar(0, 6.28), t: azar(2.5, 6),
    color: Math.random() < .25 ? '#7fe3ff' : '#ffd678', grande: Math.random() < .12,
  });

  function ajustar() {
    if (!canvas) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = lienzo.clientWidth * dpr;
    canvas.height = lienzo.clientHeight * dpr;
  }

  function cuadro(ahora, gen) {
    if (!activo || gen !== generacion) return;
    if (!lienzo.isConnected) { activo = false; return; } // se ha cambiado de aventura: este mapa ya no existe
    const dt = Math.min(.05, (ahora - ultimo) / 1000 || 0);
    ultimo = ahora;
    const W = canvas.width, H = canvas.height, escala = W / 900;
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';

    // Luciérnagas
    for (const m of motas) {
      m.fase += dt;
      m.x += (m.vx + Math.sin(m.fase * 1.3) * .005) * dt;
      m.y += m.vy * dt;
      if (m.y < -.02 || m.x < -.02 || m.x > 1.02) Object.assign(m, nuevaMota(), { y: 1.02 });
      const alfa = .3 + .7 * Math.max(0, Math.sin(m.fase * 6.28 / m.t));
      const tam = (m.grande ? 26 : 12) * (.7 + .5 * alfa) * escala;
      ctx.globalAlpha = alfa * .85;
      ctx.drawImage(brillo(m.color), m.x * W - tam / 2, m.y * H - tam / 2, tam, tam);
    }

    // Estrellas fugaces de vez en cuando
    if (ahora > proximaEstrella) {
      proximaEstrella = ahora + azar(4500, 10000);
      const desdeIzq = Math.random() < .5;
      estrellas.push({ x: desdeIzq ? azar(0, W * .4) : azar(W * .6, W), y: azar(0, H * .35), vx: (desdeIzq ? 1 : -1) * azar(700, 1000) * escala, vy: azar(220, 380) * escala, vida: .9 });
    }
    estrellas = estrellas.filter(e => (e.vida -= dt) > 0);
    for (const e of estrellas) {
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      const largo = .09;
      const g = ctx.createLinearGradient(e.x, e.y, e.x - e.vx * largo, e.y - e.vy * largo);
      g.addColorStop(0, '#ffffffee');
      g.addColorStop(1, '#ffffff00');
      ctx.globalAlpha = Math.min(1, e.vida * 2);
      ctx.strokeStyle = g;
      ctx.lineWidth = 2.5 * escala;
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(e.x - e.vx * largo, e.y - e.vy * largo);
      ctx.stroke();
      ctx.drawImage(brillo('#bfe9ff'), e.x - 10 * escala, e.y - 10 * escala, 20 * escala, 20 * escala);
    }

    // Columnas de luz (llegadas)
    pilares = pilares.filter(p => (p.vida -= dt) > 0);
    for (const p of pilares) {
      const f = p.vida / p.total, ancho = p.ancho * (0.4 + f * .6), alto = H * .5;
      const g = ctx.createLinearGradient(0, p.y, 0, p.y - alto);
      g.addColorStop(0, p.color + 'cc');
      g.addColorStop(.6, p.color + '44');
      g.addColorStop(1, p.color + '00');
      ctx.globalAlpha = Math.min(1, f * 1.8);
      ctx.fillStyle = g;
      ctx.fillRect(p.x - ancho / 2, p.y - alto, ancho, alto);
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = Math.min(1, f * 1.8) * .7;
      ctx.fillRect(p.x - ancho / 8, p.y - alto * .8, ancho / 4, alto * .8);
    }

    // Ondas expansivas
    ondas = ondas.filter(o => (o.vida -= dt) > 0);
    for (const o of ondas) {
      const f = 1 - o.vida / o.total;
      ctx.globalAlpha = (1 - f) * .9;
      ctx.strokeStyle = o.color;
      ctx.lineWidth = (6 - 5 * f) * escala;
      ctx.beginPath();
      ctx.ellipse(o.x, o.y, o.radio * f, o.radio * f * .55, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Cohetes de los fuegos artificiales: suben y estallan
    cohetes = cohetes.filter(c => {
      c.y += c.vy * dt;
      ctx.globalAlpha = 1;
      ctx.drawImage(brillo('#fff2c0'), c.x - 8 * escala, c.y - 8 * escala, 16 * escala, 16 * escala);
      if (c.y > c.objetivo) return true;
      chorro(c.x, c.y, c.k, 70, c.color, { vel: [90, 330], subida: 0, gravedad: 90, tam: [9, 18], vida: [.9, 1.8] });
      chorro(c.x, c.y, c.k, 20, '#ffffff', { vel: [40, 160], subida: 0, gravedad: 60, tam: [6, 10], vida: [.5, 1] });
      ondas.push({ x: c.x, y: c.y, radio: 90 * c.k, vida: .6, total: .6, color: c.color });
      return false;
    });

    // Chispas
    chispas = chispas.filter(c => (c.vida -= dt) > 0);
    for (const c of chispas) {
      c.vy += c.gravedad * dt * escala;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      const tam = c.tam * escala * (.4 + c.vida / c.total);
      ctx.globalAlpha = Math.min(1, c.vida / c.total * 1.6);
      ctx.drawImage(brillo(c.color), c.x - tam / 2, c.y - tam / 2, tam, tam);
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(t => cuadro(t, gen));
  }

  function arrancar() {
    if (activo || !canvas || document.hidden || reducir()) return;
    activo = true;
    ultimo = performance.now();
    const gen = ++generacion;
    requestAnimationFrame(t => cuadro(t, gen));
  }

  // Coloca el lienzo de efectos sobre el mapa recién dibujado.
  function iniciar(nuevo) {
    activo = false;
    lienzo = nuevo;
    canvas = null;
    if (reducir()) return;
    canvas = Object.assign(document.createElement('canvas'), { className: 'fx-particulas' });
    canvas.setAttribute('aria-hidden', 'true');
    // Capas de CSS: nubes que cruzan el mapa y un rayo de luz que lo barre de vez en cuando.
    const nubes = Object.assign(document.createElement('div'), { className: 'fx-nubes' });
    const rayo = Object.assign(document.createElement('div'), { className: 'fx-rayo' });
    nubes.setAttribute('aria-hidden', 'true');
    rayo.setAttribute('aria-hidden', 'true');
    lienzo.querySelector('.fondo').after(canvas, nubes, rayo);
    ctx = canvas.getContext('2d');
    motas = Array.from({ length: MOTAS }, nuevaMota);
    chispas = []; ondas = []; pilares = []; estrellas = [];
    proximaEstrella = performance.now() + 2500;
    new ResizeObserver(ajustar).observe(lienzo);
    ajustar();
    arrancar();
  }

  // Centro de un elemento del mapa en coordenadas del canvas.
  function centro(el) {
    const r = el.getBoundingClientRect(), base = canvas.getBoundingClientRect();
    const k = canvas.width / base.width;
    return { x: (r.left + r.width / 2 - base.left) * k, y: (r.top + r.height / 2 - base.top) * k, k };
  }

  function chorro(x, y, k, n, color, { vel = [120, 320], subida = 120, gravedad = 420, tam = [8, 16], vida = [.45, .9] } = {}) {
    for (let i = 0; i < n; i++) {
      const ang = azar(0, 6.28), v = azar(...vel) * k, t = azar(...vida);
      chispas.push({ x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v - subida * k, vida: t, total: t, tam: azar(...tam), color, gravedad });
    }
  }

  // Al pulsar una casilla o una ficha: chispas doradas y una onda.
  function estallido(el) {
    if (!canvas || reducir()) return;
    const { x, y, k } = centro(el);
    chorro(x, y, k, 30, '#ffd678');
    ondas.push({ x, y, radio: 70 * k, vida: .55, total: .55, color: '#fff2c0' });
    arrancar();
  }

  // Llegada de una ficha a su casilla nueva: dos ondas, columna de luz y fuente de chispas del color del grupo.
  function llegada(el, color = '#ffd678') {
    if (!canvas || reducir() || !el.isConnected) return;
    const { x, y: yc, k } = centro(el);
    const y = yc + el.getBoundingClientRect().height / 2 * k; // a los pies de la ficha
    const c = /^#[0-9a-f]{6}$/i.test(color) ? color : '#ffd678';
    pilares.push({ x, y, ancho: 46 * k, vida: 1.3, total: 1.3, color: c });
    ondas.push({ x, y, radio: 120 * k, vida: .9, total: .9, color: c }, { x, y, radio: 80 * k, vida: .7, total: .7, color: '#ffffff' });
    chorro(x, y, k, 45, c, { vel: [80, 260], subida: 380, gravedad: 520, tam: [10, 22], vida: [.7, 1.4] });
    chorro(x, y, k, 25, '#ffd678', { vel: [60, 200], subida: 300, gravedad: 480, tam: [8, 14], vida: [.6, 1.1] });
    arrancar();
  }

  // Fuegos artificiales sobre un elemento (la meta): cohetes de colores que suben y estallan.
  const COLORES_FUEGO = ['#ff4d6d', '#ffd23f', '#3ee0ff', '#7dff6b', '#c77dff', '#ff9f1c'];
  function fuegos(el, n = 3) {
    if (!canvas || reducir() || !el.isConnected) return;
    const { x, y, k } = centro(el);
    for (let i = 0; i < n; i++) {
      setTimeout(() => cohetes.push({ x: x + azar(-140, 140) * k, y: y + 20 * k, vy: -azar(420, 560) * k, objetivo: y - azar(110, 230) * k, k,
        color: COLORES_FUEGO[Math.floor(Math.random() * COLORES_FUEGO.length)] }), i * 260);
    }
    arrancar();
  }

  document.addEventListener('visibilitychange', () => { if (document.hidden) activo = false; else arrancar(); });
  window.Fx = { iniciar, estallido, llegada, fuegos };
})();
