const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { calcularEstado } = require('../js/motor.js');
const { encadenar } = require('../cadena.js');

// Datos ficticios solo para los tests; los reales empiezan vacíos.
const PUB = path.join(__dirname, 'datos_prueba', 'publico');
const leer = rel => JSON.parse(fs.readFileSync(path.join(PUB, rel), 'utf8'));
const comun = { catalogo: leer('catalogo.json'), grupos: leer('grupos.json'), config: leer('config.json'), globales: leer('eventos_globales.json') };
const av = id => ({ eventos: leer(`aventuras/${id}/eventos.json`), tablero: leer(`aventuras/${id}/tablero.json`) });
const estado = (id, eventos = av(id).eventos, globales = comun.globales) =>
  calcularEstado(id, eventos, globales, comun.catalogo, av(id).tablero, comun.grupos, comun.config);

test('posiciones, puntos e inventario a partir de los datos de ejemplo', () => {
  const { grupos } = estado('zerbitzuak');
  assert.strictEqual(grupos.g1.posicion, 'z03');
  assert.strictEqual(grupos.g1.puntos, 25);           // 10 + 10 + hito 5
  assert.deepStrictEqual(grupos.g1.inventario, { 'o-ezpata': 1 });
  assert.deepStrictEqual(grupos.g1.hitos, ['h-z-elfoak']);
  assert.strictEqual(grupos.g5.posicion, 'z01');      // no avanzó
  assert.strictEqual(grupos.g5.puntos, -5);
});

test('un evento anulado no cuenta pero sigue en el historial', () => {
  const { grupos } = estado('zerbitzuak');
  assert.strictEqual(grupos.g3.posicion, 'z03');      // el avance erróneo a z04 está anulado
  assert.strictEqual(grupos.g3.puntos, 18);
  assert.ok(grupos.g3.historial.some(e => e.anulado && e.datos.hasta === 'z04'));
});

test('los estados se descuentan al cerrar entregas', () => {
  assert.deepStrictEqual(estado('zerbitzuak').grupos.g5.estados, []);                  // duración 1, ya cerró z-e2
  assert.deepStrictEqual(estado('sareak').grupos.g2.estados, [{ id: 'e-korrontea', restantes: 1 }]);
});

test('la nota vigente es la última no anulada', () => {
  const ev = av('zerbitzuak').eventos;
  const base = { aventura: 'zerbitzuak', grupo: 'g1', miembro: null, visible_publico: true, referencia: null, puntos: 0 };
  const nueva = encadenar(ev, { ...base, tipo: 'nota_grupo', datos: { entrega: 'z-e1', nota: 9 } });
  const conCorreccion = [...ev, nueva];
  assert.strictEqual(estado('zerbitzuak', conCorreccion).grupos.g1.notas['z-e1'].datos.nota, 9);
  const anulacion = encadenar(conCorreccion, { ...base, grupo: null, tipo: 'anulacion', datos: {}, referencia: nueva.id });
  assert.strictEqual(estado('zerbitzuak', [...conCorreccion, anulacion]).grupos.g1.notas['z-e1'].datos.nota, 8.5);
});

test('registrar algo en una aventura no altera la otra', () => {
  const antes = estado('zerbitzuak');
  // Se añade un avance a Sareak y, por error, un evento de Sareak dentro del registro de Zerbitzuak.
  const evS = av('sareak').eventos;
  const extraS = encadenar(evS, { aventura: 'sareak', grupo: 'g1', tipo: 'avance', datos: { desde: 's02', hasta: 's03' }, puntos: 50 });
  const evZ = av('zerbitzuak').eventos;
  const intruso = encadenar(evZ, { aventura: 'sareak', grupo: 'g1', tipo: 'bonus', datos: {}, puntos: 99 });
  assert.strictEqual(estado('sareak', [...evS, extraS]).grupos.g1.puntos, 58);
  assert.deepStrictEqual(estado('zerbitzuak', [...evZ, intruso]).grupos, antes.grupos);
});

test('un evento global con puntos afecta a todos los grupos de cada aventura', () => {
  const g = comun.globales;
  const tormenta = encadenar(g, { aventura: null, grupo: null, tipo: 'bonus', datos: { motivo: 'Ekaitz-astea' }, puntos: 4 });
  const z = estado('zerbitzuak', undefined, [...g, tormenta]).grupos;
  const s = estado('sareak', undefined, [...g, tormenta]).grupos;
  assert.strictEqual(z.g5.puntos, -1);
  assert.strictEqual(s.g1.puntos, 12);
});

test('las casillas se numeran por el recorrido, no por su posición en el archivo', () => {
  const { ordenCasillas } = require('../js/motor.js');
  const tablero = { casillas: [
    { id: 'a', tipo: 'inicio', siguientes: ['b'] },
    { id: 'c', tipo: 'meta', siguientes: [] },
    { id: 'x', tipo: 'normal', siguientes: ['c'], activo: false },
    { id: 'b', tipo: 'normal', siguientes: ['n'] },
    { id: 'n', tipo: 'normal', siguientes: ['c'] },   // insertada después, pero va entre b y c
    { id: 'suelta', tipo: 'normal', siguientes: [] },
  ] };
  assert.deepStrictEqual(ordenCasillas(tablero).map(c => c.id), ['a', 'b', 'n', 'c', 'suelta']);
});
