// Motor de estado: calcula cómo está cada grupo en una aventura recorriendo sus eventos.
// Función pura: no lee archivos ni toca la página. Se usa en la web, en el admin y en los tests.
(function () {
  // Junta los eventos de la aventura y los globales, marca los anulados y los ordena por fecha.
  // Cada registro tiene sus propios ids, así que una anulación solo afecta a su registro.
  function prepararEventos(aventuraId, eventos, eventosGlobales) {
    const marcar = (registro, origen) => {
      const anulados = new Set(registro.filter(e => e.tipo === 'anulacion').map(e => e.referencia));
      return registro
        .filter(e => origen === 'global' || e.aventura === aventuraId) // un evento de otra aventura nunca cuenta
        .map(e => ({ ...e, origen, anulado: anulados.has(e.id) }));
    };
    return [...marcar(eventos, 'aventura'), ...marcar(eventosGlobales, 'global')]
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha)); // sort estable: a igual fecha se mantiene el orden del registro
  }

  function nivelDe(puntos, niveles) {
    let actual = niveles[0];
    for (const n of niveles) if (puntos >= n.puntos) actual = n;
    return actual;
  }

  // Casillas activas en el orden del recorrido: desde la de inicio, siguiendo "siguientes" (en anchura).
  // Las que no se alcanzan desde el inicio van al final. Es el orden con el que se numeran en el mapa.
  function ordenCasillas(tablero) {
    const activas = tablero.casillas.filter(c => c.activo !== false);
    const porId = new Map(activas.map(c => [c.id, c]));
    const inicio = activas.find(c => c.tipo === 'inicio') || activas[0];
    const orden = [], vistos = new Set(), cola = inicio ? [inicio.id] : [];
    while (cola.length) {
      const id = cola.shift();
      if (vistos.has(id) || !porId.has(id)) continue;
      vistos.add(id);
      orden.push(porId.get(id));
      cola.push(...porId.get(id).siguientes);
    }
    return [...orden, ...activas.filter(c => !vistos.has(c.id))];
  }

  // Devuelve { grupos: { g1: {...}, ... }, eventos: [...] } para la aventura indicada.
  function calcularEstado(aventuraId, eventos, eventosGlobales, catalogo, tablero, grupos, config) {
    const inicio = ordenCasillas(tablero)[0].id;
    const estado = {};
    for (const g of grupos.grupos) {
      estado[g.id] = {
        posicion: inicio, camino: [inicio], puntos: 0, nivel: null,
        inventario: {}, estados: [], hitos: [], logros: [], notas: {}, historial: [],
      };
    }

    const lista = prepararEventos(aventuraId, eventos, eventosGlobales);
    for (const ev of lista) {
      // Un evento sin grupo y con puntos (p. ej. un bonus global) afecta a todos los grupos.
      const afectados = ev.grupo ? [ev.grupo] : (ev.puntos ? Object.keys(estado) : []);
      for (const gid of afectados) if (estado[gid]) estado[gid].historial.push(ev);
      if (ev.anulado || ev.tipo === 'anulacion') continue;

      if (ev.tipo === 'entrega_cerrada' && !ev.grupo) {
        // Los estados con duración se descuentan al cerrar cada entrega de esta aventura.
        for (const g of Object.values(estado)) {
          g.estados.forEach(s => s.restantes--);
          g.estados = g.estados.filter(s => s.restantes > 0);
        }
      }

      for (const gid of afectados) {
        const g = estado[gid];
        if (!g) continue;
        g.puntos += ev.puntos || 0;
        const d = ev.datos || {};
        switch (ev.tipo) {
          case 'avance':
          case 'retroceso':
            g.posicion = d.hasta;
            g.camino.push(d.hasta);
            break;
          case 'objeto_ganado':
            g.inventario[d.objeto] = (g.inventario[d.objeto] || 0) + 1;
            break;
          case 'objeto_usado':
          case 'objeto_perdido':
            if (g.inventario[d.objeto] > 1) g.inventario[d.objeto]--;
            else delete g.inventario[d.objeto];
            break;
          case 'estado_aplicado': {
            const plantilla = catalogo.estados.find(s => s.id === d.estado) || {};
            g.estados = g.estados.filter(s => s.id !== d.estado); // reaplicar renueva la duración
            g.estados.push({ id: d.estado, restantes: d.duracion_entregas ?? plantilla.duracion_entregas ?? 1 });
            break;
          }
          case 'estado_expirado':
            g.estados = g.estados.filter(s => s.id !== d.estado);
            break;
          case 'hito':
            if (!g.hitos.includes(d.hito)) g.hitos.push(d.hito);
            break;
          case 'logro':
            if (!g.logros.includes(d.logro)) g.logros.push(d.logro);
            break;
          case 'nota_grupo':
            g.notas[d.entrega] = ev; // la última no anulada es la vigente
            break;
        }
      }
    }

    for (const g of Object.values(estado)) g.nivel = nivelDe(g.puntos, config.niveles);
    return { grupos: estado, eventos: lista };
  }

  const Motor = { calcularEstado, prepararEventos, nivelDe, ordenCasillas };
  if (typeof module !== 'undefined') module.exports = Motor;
  else window.Motor = Motor;
})();
