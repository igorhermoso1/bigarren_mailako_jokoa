// Cadena de integridad de los registros de eventos (solo Node; la web pública no la necesita).
// Cada evento guarda hash = SHA-256(hash_anterior + JSON del evento sin el campo hash).
// Así, si alguien edita a mano un evento antiguo, la verificación lo detecta.
const crypto = require('crypto');

function calcularHash(evento) {
  const { hash, ...resto } = evento;
  return crypto.createHash('sha256').update(resto.hash_anterior + JSON.stringify(resto)).digest('hex');
}

// Devuelve un evento nuevo listo para añadir al final del registro (no modifica el registro).
function encadenar(registro, datos) {
  const anterior = registro[registro.length - 1];
  const evento = {
    id: anterior ? anterior.id + 1 : 1,
    fecha: new Date().toISOString(),
    autor: 'profesor',
    ...datos,
    hash_anterior: anterior ? anterior.hash : '',
  };
  evento.hash = calcularHash(evento);
  return evento;
}

// Recorre el registro y devuelve la lista de problemas encontrados (vacía = cadena íntegra).
function verificar(registro) {
  const errores = [];
  registro.forEach((evento, i) => {
    const anterior = registro[i - 1];
    if (evento.id !== (anterior ? anterior.id + 1 : 1)) errores.push(`Evento ${evento.id}: id fuera de secuencia`);
    if (evento.hash_anterior !== (anterior ? anterior.hash : '')) errores.push(`Evento ${evento.id}: no enlaza con el anterior`);
    if (evento.hash !== calcularHash(evento)) errores.push(`Evento ${evento.id}: contenido modificado`);
  });
  return errores;
}

module.exports = { encadenar, verificar };
