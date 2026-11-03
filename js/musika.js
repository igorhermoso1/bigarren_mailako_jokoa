// Música de fondo: canciones de la carpeta music/ (lista en music/zerrenda.json, la genera el panel)
// en orden aleatorio y sin repetir ninguna hasta que hayan sonado todas.
// Los navegadores no dejan sonar nada sin que la persona toque la página: por eso hay botón.
(function () {
  const $ = id => document.getElementById(id);
  const audio = new Audio();
  audio.preload = 'none';
  let lista = [], bolsa = [], ultima = null, fallos = 0;

  const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };
  const recuperar = k => { try { return localStorage.getItem(k); } catch { return null; } };
  const titulo = f => f.replace(/\.[^.]+$/, '').replace(/_+/g, ' ');

  function barajar(xs) {
    const a = [...xs];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  // Siguiente canción de la «bolsa»; al vaciarse se baraja otra vez, sin empezar por la que acaba de sonar.
  function siguiente() {
    if (!lista.length) return;
    if (!bolsa.length) {
      bolsa = barajar(lista);
      if (bolsa.length > 1 && bolsa[0] === ultima) bolsa.push(bolsa.shift());
    }
    ultima = bolsa.shift();
    audio.src = 'music/' + encodeURIComponent(ultima);
    mostrarTitulo(titulo(ultima));
    sonar();
  }

  function sonar() {
    audio.play().then(() => { fallos = 0; pintar(true); }).catch(() => pintar(false));
  }

  function pintar(sonando) {
    const caja = $('musika');
    caja.classList.toggle('sonando', sonando);
    $('m-jo').textContent = sonando ? '❚❚' : '▶';
    $('m-jo').setAttribute('aria-label', sonando ? 'Musika gelditu' : 'Musika piztu');
  }

  // Si el título no cabe, se desplaza como un letrero.
  function mostrarTitulo(texto) {
    const zinta = $('m-abestia');
    zinta.textContent = texto;
    zinta.classList.remove('desplazar');
    requestAnimationFrame(() => {
      const sobra = zinta.scrollWidth - zinta.parentElement.clientWidth;
      if (sobra > 0) { zinta.style.setProperty('--sobra', `-${sobra + 12}px`); zinta.classList.add('desplazar'); }
    });
  }

  function alternar() {
    if (!audio.src) { guardar('musika', 'bai'); return siguiente(); }
    if (audio.paused) { guardar('musika', 'bai'); sonar(); }
    else { guardar('musika', 'ez'); audio.pause(); pintar(false); }
  }

  audio.addEventListener('ended', siguiente);
  audio.addEventListener('error', () => { if (++fallos < lista.length) setTimeout(siguiente, 300); else pintar(false); });

  async function iniciar() {
    try {
      const r = await fetch('music/zerrenda.json', { cache: 'no-cache' });
      if (!r.ok) return;
      lista = (await r.json()).filter(f => typeof f === 'string');
    } catch { return; }
    if (!lista.length) return;
    $('musika').hidden = false;
    $('m-jo').onclick = alternar;
    $('m-hurrengoa').onclick = () => { guardar('musika', 'bai'); siguiente(); };
    const vol = $('m-bolumena');
    vol.value = recuperar('musika-bolumena') ?? .6;
    audio.volume = Number(vol.value);
    vol.oninput = () => { audio.volume = Number(vol.value); guardar('musika-bolumena', vol.value); };
    // Si la última vez estaba encendida, vuelve a sonar con el primer toque en la página.
    // Al pasar la pantalla de inicio (que ya ha sido un toque), sigue la música de la web si estaba encendida.
    document.addEventListener('hasiera-amaitu', () => { if (recuperar('musika') === 'bai' && audio.paused) siguiente(); });
    if (recuperar('musika') === 'bai') {
      const reanudar = e => {
        removeEventListener('pointerdown', reanudar);
        if (e.target.closest('#musika')) return; // el propio botón ya lo gestiona
        if (recuperar('musika') === 'bai' && audio.paused) siguiente();
      };
      addEventListener('pointerdown', reanudar);
    }
  }

  iniciar();
})();
