const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { encadenar, verificar } = require('../cadena.js');

test('una cadena recién creada es íntegra', () => {
  const registro = [];
  registro.push(encadenar(registro, { tipo: 'comentario', datos: { texto: 'a' } }));
  registro.push(encadenar(registro, { tipo: 'comentario', datos: { texto: 'b' } }));
  assert.deepStrictEqual(verificar(registro), []);
  assert.strictEqual(registro[1].id, 2);
});

test('detecta un evento antiguo editado a mano', () => {
  const registro = [];
  registro.push(encadenar(registro, { tipo: 'bonus', puntos: 3 }));
  registro.push(encadenar(registro, { tipo: 'bonus', puntos: 5 }));
  registro[0].puntos = 300;
  assert.match(verificar(registro)[0], /Evento 1: contenido modificado/);
});

test('detecta un evento borrado del medio', () => {
  const registro = [];
  for (let i = 0; i < 3; i++) registro.push(encadenar(registro, { tipo: 'bonus', puntos: i }));
  registro.splice(1, 1);
  assert.ok(verificar(registro).length > 0);
});

test('los registros de datos del repositorio son íntegros', () => {
  const pub = path.join(__dirname, '..', 'data', 'publico');
  const config = JSON.parse(fs.readFileSync(path.join(pub, 'config.json'), 'utf8'));
  const archivos = [path.join(pub, 'eventos_globales.json'),
    ...config.aventuras.map(a => path.join(pub, 'aventuras', a.id, 'eventos.json'))];
  for (const archivo of archivos) {
    assert.deepStrictEqual(verificar(JSON.parse(fs.readFileSync(archivo, 'utf8'))), [], archivo);
  }
});
