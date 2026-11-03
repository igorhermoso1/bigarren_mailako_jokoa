// Tutorial guiado del panel («🎓 Tutoriala»): un capítulo por módulo. Cada paso abre el módulo, ilumina
// una parte del panel y explica qué hacer con ella. El panel sigue funcionando debajo (se puede probar
// mientras se lee). Lo terminado se marca en este navegador (localStorage, solo comodidad).
(function () {
  // Si un paso necesita un grupo elegido y no lo hay, el tutorial elige el primero.
  const LEHEN_TALDEA = '[data-modulo=taldeak] .ed-lista button[data-id]';
  const KAPITULUAK = [
    { id: 'hasiera', izena: '🧭 Lehen urratsak', modulua: 'kontrola', urratsak: [
      { izenburua: 'Ongi etorri, maisu!', testua: 'Tutorial honek panelaren atal bakoitza erakutsiko dizu. Erabili <kbd>→</kbd> eta <kbd>←</kbd> (edo botoiak) aurrera eta atzera joateko, eta <kbd>Esc</kbd> irteteko. Bitartean panela erabil dezakezu.' },
      { sel: '#pestanas', izenburua: 'Abentura aktiboa', testua: 'Hemen aukeratzen duzu zein abenturatan ari zaren lanean. Panel osoak abentura horren datuak erakusten ditu (taldeak berdinak dira bietan).' },
      { sel: '.modulos', izenburua: 'Moduluak', testua: 'Panela atal hauetan banatuta dago. Tutorialeko kapitulu bakoitzak horietako bat azaltzen du.' },
      { sel: '.tarjeta-grupo', izenburua: 'Taldeen txartelak', testua: 'Talde bakoitzaren laukia, puntuak, maila eta azken gertaera.' },
      { sel: '.tarjeta-grupo .tg-acciones', izenburua: 'Ekintza azkarrak', testua: '<b>▶ Aurreratu</b>: hurrengo laukira. <b>Garaiz +3</b> / <b>Berandu −2</b>: puntuak klik batean. <b>✎</b>: beheko formularioa talde honekin betetzen du. Beti berresteko laburpen bat agertzen da.' },
      { sel: '#formulario', izenburua: 'Gertaera berria', testua: 'Edozein gertaera erregistratzeko: aurrerapena, puntuak, objektuak, egoerak, mugarriak, lorpenak, oharrak… Aukeratu <b>Mota</b> eta behar diren eremuak bakarrik agertuko dira. «Publikoa» kenduta, ikasleek ez dute ikusiko.' },
      { sel: '#ultimos', izenburua: 'Azken gertaerak', testua: 'Akatsen bat? Sakatu <b>Baliogabetu</b>. Ezer ez da ezabatzen: gertaera baliogabetuta geratzen da eta historia osoa gordetzen da.' },
      { sel: '#verificar', izenburua: 'Egiaztatu', testua: 'Erregistroen kate-katea (hash-ak) osorik dagoen egiaztatzen du. Zerbait hondatuta badago, panelak ez du idazten.' },
      { sel: '#publicar', izenburua: 'Argitaratu', testua: 'Aldaketak GitHub-era igotzen ditu, eta ikasleek web publikoan ikusiko dituzte minutu batzuk barru. <b>Zenbaki gorriak</b> argitaratu gabeko aldaketak adierazten ditu. Datu pribatuak (notak, galderak) ez dira inoiz igotzen.' },
    ] },
    { id: 'balorazioak', izena: '📜 Balorazioak', modulua: 'balorazioak', urratsak: [
      { sel: '[data-modulo=balorazioak] .barra-sel', izenburua: 'Taldea aukeratu', testua: 'Aukeratu baloratu nahi duzun taldea. «Abentura guztiak erakutsi» markatuta, bi abenturetako notak batera ikusten dira.' },
      { sel: 'form[data-nota-grupo]', izenburua: 'Taldearen nota', testua: 'Entrega bakoitzeko nota (0-10), irizpideak eta iruzkina. <b>Zuzentzeko</b>, jarri nota berri bat: azkena da balio duena, eta aurrekoa historian geratzen da.' },
      { sel: '[data-modulo=balorazioak] .kpis', izenburua: 'Laburpena', testua: 'Batezbestekoa, azken nota eta joera, begi-kolpe batean.' },
      { sel: '[data-modulo=balorazioak] .grafica', izenburua: 'Grafika', testua: 'Notak denboran zehar.' },
      { sel: '[data-modulo=balorazioak] form.formulario:not(.fila-form)', izenburua: 'Loteka baloratu 🔒', testua: 'Kide guztiak batera baloratzeko. Banakako notak <b>pribatuak</b> dira: ez dira inoiz web publikoan agertzen.' },
    ] },
    { id: 'taldeak', izena: '🛡️ Taldeak eta fitxak', modulua: 'taldeak', urratsak: [
      { sel: '[data-modulo=taldeak] .editor', izenburua: 'Taldeak', testua: 'Aukeratu talde bat zerrendan haren izena eta kolorea aldatzeko, edo sakatu <b>＋ Berria</b>. «Artxibatu»-k ez du ezer ezabatzen.' },
      { sel: '[data-modulo=taldeak] .editor:nth-of-type(2)', aurretik: LEHEN_TALDEA, izenburua: 'Kideak', testua: 'Talde bat aukeratuta, haren kideak agertzen dira: ezizena, klasea eta abentura bakoitzeko zeregina. Kide bat aukeratuta, haren <b>borrokako sprite-a</b> igo dezakezu.' },
      { sel: '.fe', aurretik: LEHEN_TALDEA, izenburua: 'Taldearen fitxa', testua: 'Igo taldearen argazkia (arrastatu edo sakatu), aukeratu markoa eta egokitu zooma eta posizioa. Ezkerrean, mapan nola ikusiko den. Bukatzean: <b>Gorde fitxa</b>.' },
    ] },
    { id: 'katalogoa', izena: '💎 Katalogoa', modulua: 'katalogoa', urratsak: [
      { sel: '[data-modulo=katalogoa] .sub-pestanas', izenburua: 'Zer sortu', testua: 'Objektuak, egoerak, mugarriak eta lorpenak. Zuk sortzen dituzu guztiak, eta gero Kontrolatik ematen dizkiezu taldeei.' },
      { sel: '[data-modulo=katalogoa] .editor', izenburua: 'Editorea', testua: 'Aukeratu bat zerrendan edo sortu berria. Ikonoa emoji bat edo irudi baten bidea izan daiteke. Objektu batek <b>«Borrokan (efektua)»</b> badu (50/50, pista, erantzuna, +1 bizitza), taldeak borroketan erabil dezake.' },
    ] },
    { id: 'entregak', izena: '📅 Entregak eta errubrika', modulua: 'entregak', urratsak: [
      { sel: '[data-modulo=entregak] .editor', izenburua: 'Entregak', testua: 'Ariketa bakoitzaren izena, data eta azalpena. Mapako lauki bakoitza entrega bati lotuta dago.' },
      { sel: '[data-modulo=entregak] .editor:nth-of-type(2)', izenburua: 'Errubrika 🔒', testua: 'Ebaluazio-irizpideak. Pribatuak dira: ez dira GitHub-era igotzen.' },
    ] },
    { id: 'taulera', izena: '🗺️ Taulera eta mapa', modulua: 'taulera', urratsak: [
      { sel: '.te-mapa', izenburua: 'Taulera', testua: 'Sakatu lauki bat hura aukeratzeko eta <b>arrastatu</b> mugitzeko (askatzean gordetzen da). Geziekin ere mugi daiteke.' },
      { sel: '.te-lado', izenburua: 'Laukiaren datuak', testua: 'Izena, mapako lekua, mota, entrega, kartelaren eskualdea eta konexioak. <b>＋ Honen ondoren txertatu</b>-k lauki berri bat sortzen du bidean.' },
      { sel: '[data-modulo=taulera] section:last-of-type', izenburua: 'Mapa', testua: 'Igo mapa berri bat (JPG, WebP edo SVG). Bertsio guztiak gordetzen dira eta <b>Leheneratu</b> sakatuta aurrekora itzul zaitezke.' },
    ] },
    { id: 'borrokak', izena: '⚔️ Borrokak', modulua: 'borrokak', urratsak: [
      { sel: '.b-urratsak', izenburua: 'Hiru urrats', testua: 'Borroka bat prestatzea erraza da: <b>1</b> gaia aukeratu, <b>2</b> etsaiak (galderak) prestatu eta <b>3</b> taldearekin hasi.' },
      { sel: '.b-gaiak', izenburua: '① Gaiak', testua: 'Mapako gai bakoitza. Puntu gorriek zenbat galdera dituen erakusten dute (5 gomendatuta); ✔ prest dagoenean.' },
      { sel: '.b-etsaiak', izenburua: '② Etsaiak', testua: 'Galdera bakoitza etsai bat da: 4 erantzun eta zuzena berdez. Sakatu txartel bat aldatzeko edo <b>＋ Etsai berria</b>. Pista aukerakoa da («Pista» objektuarekin ikusten da). Galderak pribatuak dira.' },
      { sel: '.b-taldeak', izenburua: '③ Borroka hasi', testua: 'Sakatu talde bat: borroka leiho berri batean irekitzen da, proiektorean jartzeko. Taldeak bizitza bat du galdera bakoitzeko.' },
      { izenburua: 'Borrokan', testua: '<kbd>←</kbd> <kbd>→</kbd>: nork erasotzen duen. Aukeratu etsaia eta erantzuna. Asmatuz gero, etsaia erortzen da; hutsegitean, taldeak bizitza bat galtzen du. Objektuak galderaren leihoan erabiltzen dira. Bukatzean emaitza gordetzen da eta web publikoan ikusten da (argitaratu ondoren).' },
    ] },
    { id: 'konparaketa', izena: '⚖️ Konparaketa', modulua: 'konparaketa', urratsak: [
      { sel: '#mod-konparaketa', izenburua: 'Bi abenturak', testua: 'Talde bakoitza abentura bakoitzean non dagoen, puntuak eta maila, taula bakarrean.' },
    ] },
  ];

  const gorde = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };
  const eginda = id => { try { return localStorage.getItem('tutoriala:' + id) === 'bai'; } catch { return false; } };
  const ikusgai = el => el && el.getClientRects().length;
  let kap = null, i = 0, argia, bunbuiloa, menua;

  function menuaIreki() {
    itxi();
    menua = document.createElement('div');
    menua.className = 'tut-fondoa';
    menua.innerHTML = `<div class="tut-menua pergamino" role="dialog" aria-modal="true" aria-labelledby="tut-izenburua">
        <h2 id="tut-izenburua">🎓 Tutoriala</h2>
        <p class="vacio">Zer ikasi nahi duzu? Kapitulu bakoitzak panelaren atal bat erakusten du, urratsez urrats.</p>
        <div class="tut-kapituluak">${KAPITULUAK.map((k, n) => `<button type="button" data-k="${n}" class="${eginda(k.id) ? 'eginda' : ''}">
          <span>${k.izena}</span><small>${k.urratsak.length} urrats${eginda(k.id) ? ' · ✔' : ''}</small></button>`).join('')}</div>
        <div class="d-botones"><button type="button" class="boton-sec" data-itxi>Itxi</button></div>
      </div>`;
    menua.querySelectorAll('[data-k]').forEach(b => b.onclick = () => hasi(KAPITULUAK[b.dataset.k]));
    menua.querySelector('[data-itxi]').onclick = itxi;
    menua.onclick = e => { if (e.target === menua) itxi(); };
    document.body.append(menua);
    menua.querySelector('[data-k]').focus();
    addEventListener('keydown', tekla);
  }

  function hasi(k) {
    itxi();
    kap = k; i = 0;
    argia = document.createElement('div');
    argia.className = 'tut-argia';
    bunbuiloa = document.createElement('div');
    bunbuiloa.className = 'tut-bunbuiloa pergamino';
    bunbuiloa.setAttribute('role', 'dialog');
    bunbuiloa.setAttribute('aria-live', 'polite');
    document.body.append(argia, bunbuiloa);
    addEventListener('keydown', tekla);
    addEventListener('scroll', kokatu, { passive: true });
    addEventListener('resize', kokatu);
    erakutsi();
  }

  async function erakutsi() {
    const u = kap.urratsak[i];
    document.querySelector(`[data-ir="${kap.modulua}"]:not([aria-current])`)?.click();
    if (u.aurretik && !ikusgai(document.querySelector(u.sel))) {
      document.querySelector(u.aurretik)?.click();
      for (let n = 0; n < 20 && !ikusgai(document.querySelector(u.sel)); n++) await new Promise(r => setTimeout(r, 100));
      if (!kap || kap.urratsak[i] !== u) return; // se cerró o se cambió de paso mientras tanto
    }
    const azkena = i === kap.urratsak.length - 1;
    bunbuiloa.innerHTML = `<p class="tut-kap">${kap.izena} · ${i + 1} / ${kap.urratsak.length}</p>
      <h3>${u.izenburua}</h3><p>${u.testua}</p>
      ${u.sel && !ikusgai(document.querySelector(u.sel)) ? '<p class="tut-oharra">(Atal hau ez dago orain ikusgai: aukeratu lehenik zerbait zerrendan.)</p>' : ''}
      <div class="tut-botoiak">
        <button type="button" class="boton-sec" data-tut="irten">✕</button>
        <span class="tut-puntuak">${kap.urratsak.map((_, n) => `<i class="${n === i ? 'orain' : ''}"></i>`).join('')}</span>
        <button type="button" class="boton-sec" data-tut="atzera" ${i ? '' : 'disabled'}>◀</button>
        <button type="button" class="boton-pri" data-tut="aurrera">${azkena ? 'Amaitu ✔' : 'Aurrera ▶'}</button>
      </div>`;
    bunbuiloa.querySelector('[data-tut=irten]').onclick = itxi;
    bunbuiloa.querySelector('[data-tut=atzera]').onclick = () => joan(-1);
    bunbuiloa.querySelector('[data-tut=aurrera]').onclick = () => joan(1);
    const el = u.sel && document.querySelector(u.sel);
    if (ikusgai(el)) el.scrollIntoView({ block: 'center' });
    kokatu();
    bunbuiloa.querySelector('[data-tut=aurrera]').focus({ preventScroll: true });
  }

  // Coloca la luz sobre el elemento del paso y el bocadillo debajo (o encima si no cabe).
  function kokatu() {
    if (!kap) return;
    const u = kap.urratsak[i];
    const el = u.sel && document.querySelector(u.sel);
    const b = bunbuiloa.getBoundingClientRect();
    if (!ikusgai(el)) {
      argia.hidden = true;
      Object.assign(bunbuiloa.style, { left: `${(innerWidth - b.width) / 2}px`, top: `${(innerHeight - b.height) / 2}px` });
      return;
    }
    const r = el.getBoundingClientRect(), m = 6;
    argia.hidden = false;
    Object.assign(argia.style, { left: `${r.left - m}px`, top: `${r.top - m}px`, width: `${r.width + 2 * m}px`, height: `${r.height + 2 * m}px` });
    const behean = r.bottom + m + 12 + b.height < innerHeight;
    const goian = r.top - m - 12 - b.height > 0;
    const top = behean ? r.bottom + m + 12 : goian ? r.top - m - 12 - b.height : innerHeight - b.height - 12;
    const left = Math.min(Math.max(12, r.left + r.width / 2 - b.width / 2), innerWidth - b.width - 12);
    Object.assign(bunbuiloa.style, { left: `${left}px`, top: `${top}px` });
  }

  function joan(d) {
    if (i + d >= kap.urratsak.length) { gorde('tutoriala:' + kap.id, 'bai'); return menuaIreki(); }
    i = Math.max(0, i + d);
    erakutsi();
  }

  function tekla(e) {
    if (e.key === 'Escape') { e.preventDefault(); itxi(); return; }
    // Las flechas solo pasan de paso si no se está usando otra cosa (p. ej. mover una casilla del tablero).
    if (!kap || (e.target !== document.body && !bunbuiloa.contains(e.target))) return;
    if (e.key === 'ArrowRight') joan(1);
    else if (e.key === 'ArrowLeft') joan(-1);
  }

  function itxi() {
    argia?.remove(); bunbuiloa?.remove(); menua?.remove();
    argia = bunbuiloa = menua = kap = null;
    removeEventListener('keydown', tekla);
    removeEventListener('scroll', kokatu);
    removeEventListener('resize', kokatu);
  }

  document.getElementById('tutoriala').onclick = menuaIreki;
})();
