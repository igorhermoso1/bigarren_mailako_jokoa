const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { anadirEvento, cargarDatos, verificarTodo, crearServidor } = require('../admin.js');

// Cada test trabaja sobre una copia de los datos en una carpeta temporal: nunca toca los datos reales.
const ORIGEN = path.join(__dirname, '..');
let raiz;
before(() => {
  raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'abentura-'));
  fs.cpSync(path.join(ORIGEN, 'data', 'publico'), path.join(raiz, 'data', 'publico'), { recursive: true });
  fs.cpSync(path.join(ORIGEN, 'img', 'mapa'), path.join(raiz, 'img', 'mapa'), { recursive: true });
  fs.mkdirSync(path.join(raiz, 'data', 'privado'), { recursive: true });
  const criterios = [{ id: 'ekarpena', nombre: 'Ekarpena' }];
  fs.writeFileSync(path.join(raiz, 'data', 'privado', 'rubricas.json'),
    JSON.stringify({ zerbitzuak: { escala: [0, 10], criterios }, sareak: { escala: [0, 10], criterios } }));
  fs.writeFileSync(path.join(raiz, 'admin.html'), '<meta name="token" content="%%TOKEN%%">');
});
after(() => fs.rmSync(raiz, { recursive: true, force: true }));

const leerEventos = id => JSON.parse(fs.readFileSync(path.join(raiz, 'data', 'publico', 'aventuras', id, 'eventos.json'), 'utf8'));

test('un avance se añade al final, con el origen calculado por el servidor y la cadena íntegra', () => {
  const antes = leerEventos('zerbitzuak');
  const { evento } = anadirEvento(raiz, { aventura: 'zerbitzuak', tipo: 'avance', grupo: 'g5', datos: { desde: 'z09', hasta: 'z02' }, puntos: 10, id: 999, hash: 'x' });
  const despues = leerEventos('zerbitzuak');
  assert.strictEqual(despues.length, antes.length + 1);
  assert.deepStrictEqual(despues.slice(0, -1), antes);          // lo anterior no cambia
  assert.strictEqual(evento.datos.desde, 'z01');               // ignora el "desde" del navegador
  assert.strictEqual(evento.id, antes.at(-1).id + 1);          // ignora el id del navegador
  assert.ok(verificarTodo(raiz).ok);
});

test('registrar en una aventura no toca la otra', () => {
  const sareak = fs.readFileSync(path.join(raiz, 'data', 'publico', 'aventuras', 'sareak', 'eventos.json'), 'utf8');
  anadirEvento(raiz, { aventura: 'zerbitzuak', tipo: 'bonus', grupo: 'g1', datos: { motivo: 'Proba' }, puntos: 3 });
  assert.strictEqual(fs.readFileSync(path.join(raiz, 'data', 'publico', 'aventuras', 'sareak', 'eventos.json'), 'utf8'), sareak);
});

test('rechaza datos que no cuadran', () => {
  const malos = [
    { aventura: 'zerbitzuak', tipo: 'borrar', grupo: 'g1' },
    { aventura: 'inventada', tipo: 'bonus', grupo: 'g1', datos: { motivo: 'x' } },
    { aventura: 'zerbitzuak', tipo: 'avance', grupo: 'g1', datos: { hasta: 's03' } },          // casilla de Sareak
    { aventura: 'zerbitzuak', tipo: 'objeto_ganado', grupo: 'g1', datos: { objeto: 'o-kablea' } }, // objeto solo de Sareak
    { aventura: 'zerbitzuak', tipo: 'nota_grupo', grupo: 'g1', datos: { entrega: 'z-e1', nota: 11 } },
    { aventura: 'zerbitzuak', tipo: 'bonus', grupo: 'g1', datos: {} },                         // sin motivo
    { aventura: 'zerbitzuak', tipo: 'anulacion', referencia: 9999, datos: { motivo: 'x' } },
    { ambito: 'global', tipo: 'avance', grupo: 'g1', datos: { hasta: 'z02' } },
  ];
  const antes = leerEventos('zerbitzuak');
  for (const m of malos) assert.throws(() => anadirEvento(raiz, m), undefined, JSON.stringify(m));
  assert.deepStrictEqual(leerEventos('zerbitzuak'), antes);
});

test('una anulación no se puede repetir ni anular', () => {
  const { evento } = anadirEvento(raiz, { aventura: 'zerbitzuak', tipo: 'bonus', grupo: 'g2', datos: { motivo: 'Okerra' }, puntos: 50 });
  const { evento: anul } = anadirEvento(raiz, { aventura: 'zerbitzuak', tipo: 'anulacion', referencia: evento.id, datos: { motivo: 'Akatsa' } });
  assert.throws(() => anadirEvento(raiz, { aventura: 'zerbitzuak', tipo: 'anulacion', referencia: evento.id, datos: { motivo: 'x' } }), /ya está anulado/);
  assert.throws(() => anadirEvento(raiz, { aventura: 'zerbitzuak', tipo: 'anulacion', referencia: anul.id, datos: { motivo: 'x' } }), /no se anula/);
});

test('las notas privadas y las individuales van al registro privado, nunca al público', () => {
  const publico = leerEventos('zerbitzuak');
  const r1 = anadirEvento(raiz, { aventura: 'zerbitzuak', tipo: 'nota_grupo', grupo: 'g3', visible_publico: false, datos: { entrega: 'z-e2', nota: 4, comentario: 'sekretua' } });
  const r2 = anadirEvento(raiz, { aventura: 'zerbitzuak', tipo: 'nota_miembro', grupo: 'g3', miembro: 'g3-a1', datos: { entrega: 'z-e2', criterios: { ekarpena: 7 } } });
  assert.strictEqual(r1.registro, 'privado');
  assert.strictEqual(r2.registro, 'privado');
  assert.deepStrictEqual(leerEventos('zerbitzuak'), publico);
  assert.strictEqual(cargarDatos(raiz).privado.eventos.length, 2);
  assert.ok(!fs.readFileSync(path.join(raiz, 'data', 'publico', 'aventuras', 'zerbitzuak', 'eventos.json'), 'utf8').includes('sekretua'));
});

test('no añade nada si el registro ha sido manipulado', () => {
  const archivo = path.join(raiz, 'data', 'publico', 'aventuras', 'sareak', 'eventos.json');
  const original = fs.readFileSync(archivo, 'utf8');
  const lista = JSON.parse(original);
  lista[1].puntos = 500;
  fs.writeFileSync(archivo, JSON.stringify(lista));
  assert.throws(() => anadirEvento(raiz, { aventura: 'sareak', tipo: 'bonus', grupo: 'g1', datos: { motivo: 'x' } }), /dañado/);
  assert.strictEqual(verificarTodo(raiz).ok, false);
  fs.writeFileSync(archivo, original);
});

test('servidor: exige token, bloquea lo privado y otros hosts', async () => {
  const { servidor, token } = crearServidor({ raiz, puerto: 0 });
  await new Promise(ok => servidor.listen(0, '127.0.0.1', ok));
  const puerto = servidor.address().port;
  servidor.close();
  // Se vuelve a crear con el puerto real para que la lista de hosts permitidos coincida.
  const { servidor: s2 } = crearServidor({ raiz, token, puerto });
  await new Promise(ok => s2.listen(puerto, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${puerto}`;
  try {
    assert.strictEqual((await fetch(base + '/api/datos')).status, 401);
    assert.strictEqual((await fetch(base + '/api/datos', { headers: { 'x-token': token } })).status, 200);
    assert.strictEqual((await fetch(base + '/data/privado/rubricas.json')).status, 403);
    assert.strictEqual((await fetch(base + '/DATA/Privado/rubricas.json')).status, 403);
    assert.strictEqual((await fetch(base + '/data%5Cprivado%5Crubricas.json')).status, 403);
    assert.strictEqual((await fetch(base + '/api/datos', { headers: { 'x-token': token, origin: 'https://malvado.example' } })).status, 403);
    assert.match(await (await fetch(base + '/admin.html')).text(), new RegExp(token));
    const r = await fetch(base + '/api/evento', { method: 'POST', headers: { 'x-token': token, 'content-type': 'text/plain' }, body: '{}' });
    assert.strictEqual(r.status, 415);
  } finally {
    s2.close();
  }
});

// ---------- Fase 4: entidades y fotos ----------
const { guardarEntidad, guardarFoto } = require('../admin.js');
const leerPub = rel => JSON.parse(fs.readFileSync(path.join(raiz, 'data', 'publico', rel), 'utf8'));
const globales = () => leerPub('eventos_globales.json');

test('crear y editar un objeto deja auditoría con antes y después; archivar no borra', () => {
  const n = globales().length;
  const { item } = guardarEntidad(raiz, { coleccion: 'objetos', valor: { nombre: 'Ezpata Berria', rareza: 'raro', tipo: 'arma', ambito: 'sareak', icono: '🗡️' } });
  assert.strictEqual(item.id, 'o-ezpata-berria');
  guardarEntidad(raiz, { coleccion: 'objetos', valor: { id: item.id, activo: false } });
  const ev = globales().slice(n);
  assert.strictEqual(ev.length, 2);
  assert.strictEqual(ev[1].tipo, 'auditoria');
  assert.strictEqual(ev[1].datos.antes.activo, true);
  assert.strictEqual(ev[1].datos.despues.activo, false);
  assert.ok(leerPub('catalogo.json').objetos.some(o => o.id === item.id)); // sigue ahí, archivado
  assert.throws(() => anadirEvento(raiz, { aventura: 'sareak', tipo: 'objeto_ganado', grupo: 'g1', datos: { objeto: item.id } }), /desconocido/);
  assert.ok(verificarTodo(raiz).ok);
});

test('valida los campos de las entidades', () => {
  assert.throws(() => guardarEntidad(raiz, { coleccion: 'grupos', valor: { id: 'g1', color: 'rojo' } }), /color/);
  assert.throws(() => guardarEntidad(raiz, { coleccion: 'objetos', valor: { nombre: 'x', rareza: 'mitico', tipo: 'arma', ambito: 'todas' } }), /no permitido/);
  assert.throws(() => guardarEntidad(raiz, { coleccion: 'objetos', valor: { nombre: 'x', rareza: 'raro', tipo: 'arma', ambito: 'todas', icono: '../../etc/x.png' } }), /emoji/);
  assert.throws(() => guardarEntidad(raiz, { coleccion: 'grupos', valor: { id: 'g1', foto_grupo: 'data/privado/x.webp' } }), /no existe/);
  assert.throws(() => guardarEntidad(raiz, { coleccion: 'tablas', valor: {} }), /desconocida/);
  assert.throws(() => guardarEntidad(raiz, { coleccion: 'entregas', aventura: 'zerbitzuak', valor: { id: 'z-e1', fecha_limite: '31/12/2026' } }), /fecha/);
});

test('miembros nuevos con id correlativo y cometido por aventura', () => {
  const { item } = guardarEntidad(raiz, { coleccion: 'miembros', grupo: 'g2', valor: { alias: 'Berria', cometido: { sareak: 'Kableatzailea', inventada: 'x' } } });
  assert.strictEqual(item.id, 'g2-a6');
  assert.deepStrictEqual(item.cometido, { sareak: 'Kableatzailea' });
});

test('las rúbricas se auditan en el registro privado', () => {
  const n = globales().length;
  guardarEntidad(raiz, { coleccion: 'criterios', aventura: 'sareak', valor: { nombre: 'Dokumentazioa' } });
  assert.strictEqual(globales().length, n);
  assert.strictEqual(cargarDatos(raiz).privado.eventos.at(-1).tipo, 'auditoria');
});

test('foto de grupo: guarda versión nueva, original privado y permite restaurar la anterior', () => {
  // WebP mínimo válido (1x1) y un PNG de 8 bytes de cabecera para el original.
  const webp = 'data:image/webp;base64,' + Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64').toString('base64');
  const png = 'data:image/png;base64,' + Buffer.from('89504e470d0a1a0a0000', 'hex').toString('base64');
  const a = guardarFoto(raiz, { grupo: 'g4', foto: webp, original: png });
  assert.match(a.item.foto_grupo, /^img\/fichas\/g4-\d+T\d+\.webp$/);
  assert.ok(fs.existsSync(path.join(raiz, a.item.foto_grupo)));
  assert.strictEqual(fs.readdirSync(path.join(raiz, 'data', 'privado', 'fotos_reales')).length, 1);
  assert.strictEqual(a.evento.datos.cambio, 'ficha_modificada');
  guardarEntidad(raiz, { coleccion: 'grupos', valor: { id: 'g4', foto_grupo: null } }); // restaurar la versión anterior (sin foto)
  assert.strictEqual(leerPub('grupos.json').grupos.find(g => g.id === 'g4').foto_grupo, null);
  assert.ok(fs.existsSync(path.join(raiz, a.item.foto_grupo)));                      // la versión no se borra
  assert.throws(() => guardarFoto(raiz, { grupo: 'g4', foto: 'data:image/webp;base64,' + Buffer.from('hola').toString('base64') }), /no es una imagen/);
});

// ---------- Fase 5: tablero y mapas ----------
const { guardarMapa } = require('../admin.js');

test('casillas: crear, mover, conectar y no archivar si hay grupos encima', () => {
  const extra = { coleccion: 'casillas', aventura: 'sareak' };
  const { item } = guardarEntidad(raiz, { ...extra, valor: { nombre: 'Gune berria', tipo: 'normal', x: 40, y: 50, siguientes: ['s03'] } });
  assert.match(item.id, /^s-c\d+$/);
  guardarEntidad(raiz, { ...extra, valor: { id: item.id, x: 42.5, y: 51 } });
  const t = leerPub('aventuras/sareak/tablero.json');
  assert.deepStrictEqual(t.casillas.find(c => c.id === item.id).x, 42.5);
  assert.throws(() => guardarEntidad(raiz, { ...extra, valor: { id: item.id, siguientes: [item.id] } }), /Conexión no válida/);
  assert.throws(() => guardarEntidad(raiz, { ...extra, valor: { id: item.id, siguientes: ['z03'] } }), /Conexión no válida/);
  assert.throws(() => guardarEntidad(raiz, { ...extra, valor: { id: item.id, x: 140 } }), /entre 0 y 100/);
  assert.throws(() => guardarEntidad(raiz, { ...extra, valor: { id: item.id, entrega: 'z-e1' } }), /Entrega desconocida/);
  assert.throws(() => guardarEntidad(raiz, { ...extra, valor: { id: 's03', activo: false } }), /hay grupos/);
  guardarEntidad(raiz, { ...extra, valor: { id: item.id, activo: false } });
  assert.throws(() => anadirEvento(raiz, { aventura: 'sareak', tipo: 'avance', grupo: 'g1', datos: { hasta: item.id } }), /archivada/);
});

test('mapas: SVG seguro sí, SVG con código no; versión nueva con auditoría', () => {
  const svg = s => 'data:image/svg+xml;base64,' + Buffer.from(s).toString('base64');
  const bueno = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800"><defs><linearGradient id="a"/></defs><rect fill="url(#a)" width="10" height="10"/></svg>';
  const r = guardarMapa(raiz, { aventura: 'sareak', archivo: svg(bueno) });
  assert.deepStrictEqual([r.mapa.ancho, r.mapa.alto], [1200, 800]);
  assert.ok(fs.existsSync(path.join(raiz, r.mapa.archivo)));
  assert.strictEqual(r.evento.datos.cambio, 'mapa');
  for (const malo of [
    '<svg viewBox="0 0 1 1"><script>alert(1)</script></svg>',
    '<svg viewBox="0 0 1 1" onload="alert(1)"></svg>',
    '<svg viewBox="0 0 1 1"><image href="https://ejemplo.com/x.png"/></svg>',
    '<svg width="10"></svg>',
  ]) assert.throws(() => guardarMapa(raiz, { aventura: 'sareak', archivo: svg(malo) }), undefined, malo);
  const vuelta = guardarMapa(raiz, { aventura: 'sareak', existente: 'img/mapa/sareak.svg', ancho: 1600, alto: 1000, dibujar_camino: true });
  assert.strictEqual(vuelta.mapa.archivo, 'img/mapa/sareak.svg');
  assert.ok(fs.existsSync(path.join(raiz, r.mapa.archivo))); // la versión anterior no se borra
});
