// Efectos visuales del mapa: luciérnagas mágicas que flotan y destellos al pulsar.
// Un solo <canvas> encima del dibujo del mapa y por debajo de casillas y fichas.
// No hace nada si el sistema pide reducir movimiento, y se para con la pestaña oculta.
(function () {
  const reducir = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MOTAS = 46;
  let ctx = null, canvas = null, lienzo = null, motas = [], chispas = [], ultimo = 0, activo = false;
  let generacion = 0; // cada arranque tiene su número: así nunca corren dos bucles a la vez

  // Sprite de brillo pintado una vez y reutilizado (mucho más barato que shadowBlur en cada partícula).
  const brillo = (() => {
    const c = Object.assign(document.createElement('canvas'), { width: 32, height: 32 });
    const g = c.getContext('2d');
    const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    r.addColorStop(0, 'rgba(255,250,220,1)');
    r.addColorStop(.25, 'rgba(255,214,120,.85)');
    r.addColorStop(1, 'rgba(255,160,40,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 32, 32);
    return c;
  })();

  const azar = (a, b) => a + Math.random() * (b - a);
  const nuevaMota = () => ({ x: Math.random(), y: Math.random(), vx: azar(-.006, .006), vy: azar(-.012, -.003), fase: azar(0, 6.28), t: azar(3, 7) });

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

    for (const m of motas) {
      m.fase += dt;
      m.x += (m.vx + Math.sin(m.fase * 1.3) * .004) * dt;
      m.y += m.vy * dt;
      if (m.y < -.02 || m.x < -.02 || m.x > 1.02) Object.assign(m, nuevaMota(), { y: 1.02 });
      const alfa = .35 + .65 * Math.max(0, Math.sin(m.fase * 6.28 / m.t)); // parpadeo suave
      const tam = (10 + 8 * alfa) * escala;
      ctx.globalAlpha = alfa * .8;
      ctx.drawImage(brillo, m.x * W - tam / 2, m.y * H - tam / 2, tam, tam);
    }

    chispas = chispas.filter(c => (c.vida -= dt) > 0);
    for (const c of chispas) {
      c.vy += 420 * dt * escala; // un poco de gravedad
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      const tam = c.tam * escala * (.4 + c.vida / c.total);
      ctx.globalAlpha = Math.min(1, c.vida / c.total * 1.6);
      ctx.drawImage(brillo, c.x - tam / 2, c.y - tam / 2, tam, tam);
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
    chispas = [];
    new ResizeObserver(ajustar).observe(lienzo);
    ajustar();
    arrancar();
  }

  // Estallido de chispas doradas desde el centro de un elemento del mapa (casilla o ficha).
  function estallido(el) {
    if (!canvas || reducir()) return;
    const r = el.getBoundingClientRect(), base = canvas.getBoundingClientRect();
    const k = canvas.width / base.width;
    const x = (r.left + r.width / 2 - base.left) * k, y = (r.top + r.height / 2 - base.top) * k;
    for (let i = 0; i < 26; i++) {
      const ang = azar(0, 6.28), vel = azar(120, 320) * k;
      const vida = azar(.45, .9);
      chispas.push({ x, y, vx: Math.cos(ang) * vel, vy: Math.sin(ang) * vel - 120 * k, vida, total: vida, tam: azar(8, 16) });
    }
    arrancar();
  }

  document.addEventListener('visibilitychange', () => { if (document.hidden) activo = false; else arrancar(); });
  window.Fx = { iniciar, estallido };
})();
