#!/usr/bin/env node
// Servidor local del profesor. Sin dependencias: solo módulos de Node.
//   node admin.js              → arranca en http://localhost:3000/admin.html
//   node admin.js --verificar  → comprueba las cadenas de hashes de todos los registros
// Solo AÑADE eventos al final de los registros: no hay forma de borrar ni editar uno existente.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { encadenar, verificar } = require('./cadena.js');
const Motor = require('./js/motor.js');

const PUERTO = Number(process.env.PUERTO) || 3000;
const LIMITE_CUERPO = 1024 * 1024;
const MAX_TEXTO = 1000;

// ---------- Archivos ----------
const leer = (archivo, defecto) => {
  try { return JSON.parse(fs.readFileSync(archivo, 'utf8')); } catch (e) {
    if (e.code === 'ENOENT' && defecto !== undefined) return defecto;
    throw new Error(`No se puede leer ${archivo}: ${e.message}`);
  }
};

// Escritura atómica: archivo temporal + renombrar, así nunca queda un JSON a medias.
function escribirAtomico(archivo, datos) {
  fs.mkdirSync(path.dirname(archivo), { recursive: true });
  const tmp = `${archivo}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(datos, null, 2) + '\n');
  fs.renameSync(tmp, archivo);
}

const rutas = raiz => ({
  pub: path.join(raiz, 'data', 'publico'),
  priv: path.join(raiz, 'data', 'privado'),
});

function archivoRegistro(raiz, registro, aventura) {
  const { pub, priv } = rutas(raiz);
  if (registro === 'global') return path.join(pub, 'eventos_globales.json');
  if (registro === 'privado') return path.join(priv, 'eventos_privados.json');
  return path.join(pub, 'aventuras', aventura, 'eventos.json');
}

function cargarDatos(raiz) {
  const { pub, priv } = rutas(raiz);
  const config = leer(path.join(pub, 'config.json'));
  const aventuras = {};
  for (const a of config.aventuras) {
    const dir = path.join(pub, 'aventuras', a.id);
    aventuras[a.id] = {
      aventura: leer(path.join(dir, 'aventura.json')),
      tablero: leer(path.join(dir, 'tablero.json')),
      entregas: leer(path.join(dir, 'entregas.json'), { entregas: [] }),
      eventos: leer(path.join(dir, 'eventos.json'), []),
    };
  }
  return {
    config,
    grupos: leer(path.join(pub, 'grupos.json')),
    catalogo: leer(path.join(pub, 'catalogo.json')),
    globales: leer(path.join(pub, 'eventos_globales.json'), []),
    aventuras,
    privado: {
      rubricas: leer(path.join(priv, 'rubricas.json'), {}),
      eventos: leer(path.join(priv, 'eventos_privados.json'), []),
    },
  };
}

function verificarTodo(raiz) {
  const datos = cargarDatos(raiz);
  const informe = [
    { registro: 'global', errores: verificar(datos.globales) },
    ...Object.entries(datos.aventuras).map(([id, a]) => ({ registro: id, errores: verificar(a.eventos) })),
    { registro: 'privado', errores: verificar(datos.privado.eventos) },
  ];
  return { ok: informe.every(r => !r.errores.length), informe };
}

// ---------- Validación de eventos (frontera de confianza: todo lo que llega del navegador) ----------
const TIPOS = ['avance', 'retroceso', 'objeto_ganado', 'objeto_usado', 'objeto_perdido', 'estado_aplicado', 'estado_expirado',
  'hito', 'logro', 'bonus', 'penalizacion', 'nota_grupo', 'nota_miembro', 'entrega_cerrada', 'comentario', 'anulacion'];
const TIPOS_GLOBALES = ['bonus', 'penalizacion', 'comentario', 'anulacion'];
const SIN_GRUPO = ['entrega_cerrada', 'comentario', 'anulacion'];

function texto(v, nombre, obligatorio = false, max = MAX_TEXTO) {
  if (v == null || v === '') { if (obligatorio) throw new Error(`Falta ${nombre}`); return undefined; }
  if (typeof v !== 'string') throw new Error(`${nombre} debe ser texto`);
  const t = v.trim();
  if (t.length > max) throw new Error(`${nombre} es demasiado largo (máx. ${max})`);
  if (obligatorio && !t) throw new Error(`Falta ${nombre}`);
  return t || undefined;
}
function numero(v, nombre, min, max) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) throw new Error(`${nombre} debe ser un número entre ${min} y ${max}`);
  return n;
}
// Un elemento archivado (activo: false) ya no se puede otorgar.
const enAmbito = (item, aventura) => item && item.activo !== false && (item.ambito === 'todas' || item.ambito === aventura);
const limpiar = obj => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

// Devuelve { registro, evento } listo para encadenar, o lanza un Error con el motivo.
function validarEvento(entrada, datos) {
  if (!entrada || typeof entrada !== 'object') throw new Error('Petición vacía');
  const { tipo } = entrada;
  if (!TIPOS.includes(tipo)) throw new Error(`Tipo de evento desconocido: ${tipo}`);
  const global = entrada.ambito === 'global';
  if (global && !TIPOS_GLOBALES.includes(tipo)) throw new Error(`${tipo} no se puede registrar en las dos aventuras a la vez`);

  const aventura = global ? null : entrada.aventura;
  const av = datos.aventuras[aventura];
  if (!global && !av) throw new Error(`Aventura desconocida: ${aventura}`);

  let grupo = entrada.grupo || null;
  const g = grupo && datos.grupos.grupos.find(x => x.id === grupo);
  if (grupo && !g) throw new Error(`Grupo desconocido: ${grupo}`);
  if (SIN_GRUPO.includes(tipo)) grupo = null;
  else if (!grupo && !['bonus', 'penalizacion'].includes(tipo)) throw new Error('Falta el grupo');

  const puntos = entrada.puntos == null || entrada.puntos === '' ? 0 : numero(entrada.puntos, 'Puntos', -1000, 1000);
  const d = entrada.datos || {};
  const cat = datos.catalogo;
  const motivo = texto(d.motivo, 'Motivo');
  let datosLimpios;
  let registro = global ? 'global' : 'aventura';
  let visible = entrada.visible_publico !== false;
  let referencia = null;
  let miembro = null;

  switch (tipo) {
    case 'avance':
    case 'retroceso': {
      if (!av.tablero.casillas.some(c => c.id === d.hasta && c.activo !== false)) throw new Error('Casilla de destino desconocida o archivada');
      // La casilla de origen la calcula el servidor a partir de los eventos, no la manda el navegador.
      const estado = Motor.calcularEstado(aventura, av.eventos, datos.globales, cat, av.tablero, datos.grupos, datos.config);
      const desde = estado.grupos[grupo].posicion;
      if (desde === d.hasta) throw new Error('El grupo ya está en esa casilla');
      datosLimpios = { desde, hasta: d.hasta, motivo };
      break;
    }
    case 'objeto_ganado': case 'objeto_usado': case 'objeto_perdido':
      if (!enAmbito(cat.objetos.find(o => o.id === d.objeto), aventura)) throw new Error('Objeto desconocido o de otra aventura');
      datosLimpios = { objeto: d.objeto, motivo };
      break;
    case 'estado_aplicado': {
      const p = cat.estados.find(s => s.id === d.estado);
      if (!enAmbito(p, aventura)) throw new Error('Estado desconocido o de otra aventura');
      const duracion = d.duracion_entregas == null || d.duracion_entregas === '' ? p.duracion_entregas : d.duracion_entregas;
      datosLimpios = { estado: d.estado, duracion_entregas: numero(duracion, 'Duración', 1, 50), motivo };
      break;
    }
    case 'estado_expirado':
      if (!cat.estados.some(s => s.id === d.estado)) throw new Error('Estado desconocido');
      datosLimpios = { estado: d.estado, motivo };
      break;
    case 'hito':
      if (!enAmbito(cat.hitos.find(h => h.id === d.hito), aventura)) throw new Error('Hito desconocido o de otra aventura');
      datosLimpios = { hito: d.hito, motivo };
      break;
    case 'logro':
      if (!enAmbito(cat.logros.find(l => l.id === d.logro), aventura)) throw new Error('Logro desconocido o de otra aventura');
      datosLimpios = { logro: d.logro, motivo };
      break;
    case 'bonus': case 'penalizacion':
      datosLimpios = { motivo: texto(d.motivo, 'Motivo', true) };
      break;
    case 'entrega_cerrada':
      if (!av.entregas.entregas.some(e => e.id === d.entrega)) throw new Error('Entrega desconocida');
      datosLimpios = { entrega: d.entrega };
      break;
    case 'nota_grupo':
      if (!av.entregas.entregas.some(e => e.id === d.entrega)) throw new Error('Entrega desconocida');
      datosLimpios = { entrega: d.entrega, nota: numero(d.nota, 'Nota', 0, 10), comentario: texto(d.comentario, 'Comentario') };
      if (!visible) registro = 'privado'; // el JSON público lo puede leer cualquiera: lo privado va aparte
      break;
    case 'nota_miembro': {
      miembro = entrada.miembro;
      if (!g.miembros.some(m => m.id === miembro)) throw new Error('El miembro no pertenece a ese grupo');
      if (!av.entregas.entregas.some(e => e.id === d.entrega)) throw new Error('Entrega desconocida');
      const rubrica = datos.privado.rubricas[aventura];
      if (!rubrica) throw new Error('No hay rúbrica para esta aventura en data/privado/rubricas.json');
      const [min, max] = rubrica.escala;
      const criterios = {};
      for (const c of rubrica.criterios.filter(x => x.activo !== false)) {
        if (d.criterios?.[c.id] != null && d.criterios[c.id] !== '') criterios[c.id] = numero(d.criterios[c.id], c.nombre, min, max);
      }
      if (!Object.keys(criterios).length) throw new Error('Pon al menos un criterio de la rúbrica');
      datosLimpios = { entrega: d.entrega, criterios, comentario: texto(d.comentario, 'Comentario') };
      registro = 'privado';
      visible = false;
      break;
    }
    case 'comentario':
      datosLimpios = { texto: texto(d.texto, 'Texto', true) };
      break;
    case 'anulacion': {
      registro = ['global', 'privado'].includes(entrada.registro) ? entrada.registro : registro;
      const lista = registro === 'global' ? datos.globales : registro === 'privado' ? datos.privado.eventos : av.eventos;
      referencia = numero(entrada.referencia, 'Evento a anular', 1, Number.MAX_SAFE_INTEGER);
      const objetivo = lista.find(e => e.id === referencia);
      if (!objetivo) throw new Error(`No existe el evento ${referencia} en ese registro`);
      if (objetivo.tipo === 'anulacion') throw new Error('Una anulación no se anula: registra de nuevo el evento correcto');
      if (objetivo.tipo === 'auditoria') throw new Error('Los cambios de datos no se anulan: vuelve a editar el elemento');
      if (lista.some(e => e.tipo === 'anulacion' && e.referencia === referencia)) throw new Error(`El evento ${referencia} ya está anulado`);
      datosLimpios = { motivo: texto(d.motivo, 'Motivo', true) };
      if (registro === 'privado') visible = false;
      break;
    }
  }

  return {
    registro,
    evento: {
      aventura, grupo, miembro, tipo, datos: limpiar(datosLimpios),
      puntos: tipo === 'anulacion' || tipo === 'nota_miembro' ? 0 : puntos,
      visible_publico: registro === 'privado' ? false : visible, referencia,
    },
  };
}

// Añade un evento validado al final de su registro. Lectura, validación y escritura van seguidas
// y son síncronas, así dos peticiones no pueden mezclarse.
function anadirEvento(raiz, entrada) {
  const datos = cargarDatos(raiz);
  const { registro, evento } = validarEvento(entrada, datos);
  const archivo = archivoRegistro(raiz, registro, evento.aventura);
  const lista = leer(archivo, []);
  const errores = verificar(lista);
  if (errores.length) throw new Error(`El registro ${path.basename(archivo)} está dañado; no se añade nada: ${errores[0]}`);
  const nuevo = encadenar(lista, evento);
  escribirAtomico(archivo, [...lista, nuevo]);
  return { registro, evento: nuevo };
}

// ---------- Entidades editables (grupos, miembros, catálogo, entregas, rúbricas) ----------
// Se guardan en su estado actual, pero cada cambio deja un evento "auditoria" con el antes y el después.
// No se borra nada: "eliminar" es poner activo: false.
const V = {
  texto: (max, obligatorio = false) => (v, n) => texto(v, n, obligatorio, max),
  bool: () => (v, n) => { if (typeof v !== 'boolean') throw new Error(`${n} debe ser sí/no`); return v; },
  num: (min, max) => (v, n) => numero(v, n, min, max),
  opcion: lista => (v, n, ctx) => {
    const l = typeof lista === 'function' ? lista(ctx) : lista;
    if (!l.includes(v)) throw new Error(`${n}: valor no permitido (${v})`);
    return v;
  },
  color: () => (v, n) => { if (!/^#[0-9a-f]{6}$/i.test(v)) throw new Error(`${n} debe ser un color #rrggbb`); return v; },
  fecha: () => (v, n) => {
    if (v == null || v === '') return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(new Date(v))) throw new Error(`${n} debe ser una fecha AAAA-MM-DD`);
    return v;
  },
  // Emoji o ruta a una imagen del propio repositorio.
  icono: () => (v, n) => {
    const t = texto(v, n, false, 200);
    if (t && /[/.]/.test(t) && !/^img\/[\w/-]+\.(svg|png|webp|jpe?g)$/i.test(t)) throw new Error(`${n}: usa un emoji o una ruta tipo img/objetos/espada.svg`);
    return t ?? null;
  },
};
const ambitos = ctx => ['todas', ...ctx.config.aventuras.map(a => a.id)];
const TIPOS_OBJETO = ['arma', 'armadura', 'pocion', 'mapa', 'llave', 'reliquia'];

function validarFicha(v, n, ctx) {
  if (!v || typeof v !== 'object') throw new Error(`${n} no válida`);
  const e = v.encuadre || {};
  return {
    marco: V.opcion(c => c.config.marcos.map(m => m.id))(v.marco, 'Marco', ctx),
    encuadre: { zoom: numero(e.zoom ?? 1, 'Zoom', 0.5, 4), x: numero(e.x ?? 0, 'Posición X', -1, 1), y: numero(e.y ?? 0, 'Posición Y', -1, 1) },
  };
}
function validarCometido(v, n, ctx) {
  if (!v || typeof v !== 'object') throw new Error(`${n} no válido`);
  const r = {};
  for (const a of ctx.config.aventuras) { const t = texto(v[a.id], `${n} (${a.nombre})`, false, 80); if (t) r[a.id] = t; }
  return r;
}
// Solo se acepta una foto ya subida por /api/imagen (sirve para restaurar versiones anteriores).
function validarFotoGrupo(v, n, ctx) {
  if (v == null) return null;
  if (typeof v !== 'string' || !/^img\/fichas\/[\w-]+\.webp$/.test(v) || !fs.existsSync(path.join(ctx.raiz, v))) throw new Error(`${n} no existe`);
  return v;
}

const pub = (raiz, ...p) => path.join(rutas(raiz).pub, ...p);
const ESQUEMAS = {
  grupos: {
    archivo: raiz => pub(raiz, 'grupos.json'), lista: obj => obj.grupos, prefijo: () => 'g',
    obligatorios: ['nombre', 'color'],
    campos: { nombre: V.texto(60, true), lema: V.texto(120), color: V.color(), activo: V.bool(), ficha: validarFicha, foto_grupo: validarFotoGrupo },
    nuevo: () => ({ foto_grupo: null, ficha: { marco: 'harria', encuadre: { zoom: 1, x: 0, y: 0 } }, activo: true, miembros: [] }),
  },
  miembros: {
    archivo: raiz => pub(raiz, 'grupos.json'),
    lista: (obj, entrada) => {
      const g = obj.grupos.find(x => x.id === entrada.grupo);
      if (!g) throw new Error('Grupo desconocido');
      return g.miembros;
    },
    prefijo: entrada => `${entrada.grupo}-a`, obligatorios: ['alias'],
    campos: { alias: V.texto(40, true), clase: V.texto(40), cometido: validarCometido, activo: V.bool() },
    nuevo: () => ({ cometido: {}, activo: true }),
  },
  objetos: {
    archivo: raiz => pub(raiz, 'catalogo.json'), lista: obj => obj.objetos, prefijo: () => 'o', obligatorios: ['nombre', 'rareza', 'tipo', 'ambito'],
    campos: {
      nombre: V.texto(60, true), icono: V.icono(), rareza: V.opcion(ctx => ctx.catalogo.rarezas.map(r => r.id)), tipo: V.opcion(TIPOS_OBJETO),
      ambito: V.opcion(ambitos), descripcion: V.texto(300), consumible: V.bool(), activo: V.bool(),
    },
    nuevo: () => ({ icono: null, consumible: false, activo: true }),
  },
  estados: {
    archivo: raiz => pub(raiz, 'catalogo.json'), lista: obj => obj.estados, prefijo: () => 'e', obligatorios: ['nombre', 'tipo', 'ambito'],
    campos: {
      nombre: V.texto(60, true), tipo: V.opcion(['upgrade', 'downgrade']), ambito: V.opcion(ambitos), descripcion: V.texto(300),
      efecto: (v, n) => ({ puntos: numero(v?.puntos ?? 0, 'Puntos del efecto', -1000, 1000) }),
      duracion_entregas: V.num(1, 50), activo: V.bool(),
    },
    nuevo: () => ({ efecto: { puntos: 0 }, duracion_entregas: 1, activo: true }),
  },
  hitos: {
    archivo: raiz => pub(raiz, 'catalogo.json'), lista: obj => obj.hitos, prefijo: () => 'h', obligatorios: ['nombre', 'ambito'],
    campos: { nombre: V.texto(60, true), icono: V.icono(), ambito: V.opcion(ambitos), descripcion: V.texto(300), activo: V.bool() },
    nuevo: () => ({ activo: true }),
  },
  logros: {
    archivo: raiz => pub(raiz, 'catalogo.json'), lista: obj => obj.logros, prefijo: () => 'l', obligatorios: ['nombre', 'ambito'],
    campos: { nombre: V.texto(60, true), icono: V.icono(), ambito: V.opcion(ambitos), descripcion: V.texto(300), oculto: V.bool(), activo: V.bool() },
    nuevo: () => ({ oculto: false, activo: true }),
  },
  entregas: {
    archivo: (raiz, entrada) => pub(raiz, 'aventuras', entrada.aventura, 'entregas.json'), lista: obj => obj.entregas,
    prefijo: entrada => `${entrada.aventura[0]}-e`, obligatorios: ['nombre'],
    campos: { nombre: V.texto(80, true), fecha_limite: V.fecha(), puntos_max: V.num(0, 1000), descripcion: V.texto(500), activo: V.bool() },
    nuevo: () => ({ fecha_limite: null, puntos_max: 10, activo: true }),
  },
  casillas: {
    archivo: (raiz, entrada) => pub(raiz, 'aventuras', entrada.aventura, 'tablero.json'), lista: obj => obj.casillas,
    prefijo: entrada => `${entrada.aventura[0]}-c`, obligatorios: ['nombre', 'tipo', 'x', 'y'],
    campos: {
      nombre: V.texto(80, true), lugar: V.texto(80), tipo: V.opcion(ctx => Object.keys(ctx.config.tipos_casilla)),
      x: V.num(0, 100), y: V.num(0, 100), descripcion: V.texto(500),
      entrega: (v, n, ctx) => {
        if (v == null || v === '') return undefined;
        if (!ctx.aventuras[ctx.entrada.aventura].entregas.entregas.some(e => e.id === v)) throw new Error('Entrega desconocida');
        return v;
      },
      siguientes: (v, n, ctx) => {
        if (!Array.isArray(v)) throw new Error('Siguientes debe ser una lista');
        const ids = ctx.aventuras[ctx.entrada.aventura].tablero.casillas.map(c => c.id);
        for (const id of v) if (!ids.includes(id) || id === ctx.idActual) throw new Error(`Conexión no válida: ${id}`);
        return [...new Set(v)];
      },
      // No se archiva una casilla en la que está algún grupo: su posición dejaría de existir.
      activo: (v, n, ctx) => {
        V.bool()(v, n);
        if (v === false) {
          const a = ctx.aventuras[ctx.entrada.aventura];
          const estado = Motor.calcularEstado(ctx.entrada.aventura, a.eventos, ctx.globales, ctx.catalogo, a.tablero, ctx.grupos, ctx.config);
          const aqui = Object.entries(estado.grupos).filter(([, g]) => g.posicion === ctx.idActual).map(([id]) => id);
          if (aqui.length) throw new Error(`No se puede archivar: hay grupos en esa casilla (${aqui.join(', ')})`);
        }
        return v;
      },
    },
    nuevo: () => ({ siguientes: [], activo: true }),
  },
  criterios: {
    privado: true,
    archivo: raiz => path.join(rutas(raiz).priv, 'rubricas.json'),
    lista: (obj, entrada) => (obj[entrada.aventura] ||= { escala: [0, 10], criterios: [] }).criterios,
    prefijo: () => 'c', obligatorios: ['nombre'],
    campos: { nombre: V.texto(60, true), activo: V.bool() },
    nuevo: () => ({ activo: true }),
  },
};

// Identificador legible y único a partir del nombre: "Espada del Validador" → "o-espada-del-validador".
function nuevoId(prefijo, nombre, existentes) {
  if (/-[aec]$/.test(prefijo)) { // miembros, entregas y casillas: numeración correlativa
    let n = existentes.length + 1;
    while (existentes.includes(prefijo + n)) n++;
    return prefijo + n;
  }
  const base = `${prefijo}-${String(nombre).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'nuevo'}`;
  let id = base;
  for (let i = 2; existentes.includes(id); i++) id = `${base}-${i}`;
  return id;
}

// Añade un evento de auditoría al registro global (o al privado si el dato es privado).
function auditar(raiz, registro, datosAuditoria) {
  const archivo = archivoRegistro(raiz, registro);
  const lista = leer(archivo, []);
  const nuevo = encadenar(lista, {
    aventura: datosAuditoria.aventura || null, grupo: null, miembro: null, tipo: 'auditoria', datos: datosAuditoria,
    puntos: 0, visible_publico: false, referencia: null,
  });
  escribirAtomico(archivo, [...lista, nuevo]);
  return nuevo;
}

function comprobarRegistro(raiz, registro) {
  const errores = verificar(leer(archivoRegistro(raiz, registro), []));
  if (errores.length) throw new Error(`El registro ${registro} está dañado; no se guarda nada: ${errores[0]}`);
}

// Crea (sin id) o modifica (con id) un elemento de una colección. Solo se tocan los campos enviados.
function guardarEntidad(raiz, entrada) {
  const esquema = ESQUEMAS[entrada?.coleccion];
  if (!esquema) throw new Error(`Colección desconocida: ${entrada?.coleccion}`);
  const datos = cargarDatos(raiz);
  if (['entregas', 'criterios', 'casillas'].includes(entrada.coleccion) && !datos.aventuras[entrada.aventura]) throw new Error('Aventura desconocida');
  const ctx = { ...datos, raiz, entrada, idActual: entrada.valor?.id };
  const valor = entrada.valor || {};
  const registro = esquema.privado ? 'privado' : 'global';
  comprobarRegistro(raiz, registro);

  const archivo = esquema.archivo(raiz, entrada);
  const obj = leer(archivo, esquema.privado ? {} : undefined);
  const lista = esquema.lista(obj, entrada);
  let item = valor.id ? lista.find(x => x.id === valor.id) : null;
  if (valor.id && !item) throw new Error(`No existe ${valor.id}`);
  const antes = item ? JSON.parse(JSON.stringify(item)) : null;
  if (!item) {
    for (const k of esquema.obligatorios) if (valor[k] == null || valor[k] === '') throw new Error(`Falta ${k}`);
    item = { id: nuevoId(esquema.prefijo(entrada), valor.nombre || valor.alias, lista.map(x => x.id)), ...esquema.nuevo() };
    lista.push(item);
  }
  for (const [k, validar] of Object.entries(esquema.campos)) {
    if (!(k in valor)) continue;
    const v = validar(valor[k], k, ctx);
    if (v === undefined) delete item[k]; else item[k] = v;
  }
  if (JSON.stringify(antes) === JSON.stringify(item)) return { item, sinCambios: true };

  escribirAtomico(archivo, obj);
  const tipoCambio = entrada.coleccion === 'grupos' && antes && (JSON.stringify(antes.ficha) !== JSON.stringify(item.ficha) || antes.foto_grupo !== item.foto_grupo)
    ? 'ficha_modificada' : null;
  const evento = auditar(raiz, registro, {
    coleccion: entrada.coleccion, aventura: entrada.aventura, grupo: entrada.grupo, id: item.id, cambio: tipoCambio, antes, despues: item,
  });
  return { item, evento };
}

// ---------- Fotos de grupo ----------
const LIMITE_IMAGEN = 15 * 1024 * 1024;
const FIRMAS = { webp: b => b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP', jpg: b => b[0] === 0xff && b[1] === 0xd8, png: b => b.toString('hex', 0, 4) === '89504e47' };
function decodificarImagen(dataUrl, permitidos) {
  const m = /^data:image\/(webp|jpeg|png);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  if (!m) throw new Error('Imagen no válida');
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const buf = Buffer.from(m[2], 'base64');
  if (!permitidos.includes(ext) || !FIRMAS[ext](buf)) throw new Error('El contenido no es una imagen del tipo indicado');
  return { ext, buf };
}

// Guarda la foto reducida (pública, WebP) con un nombre nuevo por versión y el original en data/privado.
// Las versiones anteriores no se borran: así se pueden restaurar desde el historial.
function guardarFoto(raiz, entrada) {
  const datos = cargarDatos(raiz);
  const g = datos.grupos.grupos.find(x => x.id === entrada?.grupo);
  if (!g) throw new Error('Grupo desconocido');
  const reducida = decodificarImagen(entrada.foto, ['webp']);
  if (reducida.buf.length > 2 * 1024 * 1024) throw new Error('La foto reducida pesa demasiado');
  const sello = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '');
  const relativa = `img/fichas/${g.id}-${sello}.webp`;
  comprobarRegistro(raiz, 'global');
  fs.mkdirSync(path.join(raiz, 'img', 'fichas'), { recursive: true });
  fs.writeFileSync(path.join(raiz, relativa), reducida.buf);
  if (entrada.original) {
    const orig = decodificarImagen(entrada.original, ['webp', 'jpg', 'png']);
    const dir = path.join(rutas(raiz).priv, 'fotos_reales');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${g.id}-${sello}.${orig.ext}`), orig.buf);
  }
  return guardarEntidad(raiz, { coleccion: 'grupos', valor: { id: g.id, foto_grupo: relativa } });
}

// ---------- Mapas ----------
// Un SVG se acepta solo si no puede ejecutar código ni cargar nada de fuera.
function validarSvg(buf) {
  const t = buf.toString('utf8');
  if (!/<svg[\s>]/i.test(t)) throw new Error('El archivo no es un SVG');
  if (/<script|<foreignObject|\son\w+\s*=|javascript:/i.test(t)) throw new Error('El SVG contiene código (script, on…=): no se acepta');
  if (/(?:xlink:)?href\s*=\s*["'](?!#)/i.test(t) || /url\(\s*["']?(?!#)/i.test(t)) throw new Error('El SVG carga recursos externos: solo se permiten referencias internas (#id)');
  const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(t);
  if (!vb) throw new Error('El SVG necesita un viewBox');
  return { ancho: Number(vb[1]), alto: Number(vb[2]) };
}

// Sube un mapa nuevo (una versión nueva por archivo; las anteriores no se borran) o vuelve a uno anterior.
// También permite cambiar solo "dibujar_camino".
function guardarMapa(raiz, entrada) {
  const datos = cargarDatos(raiz);
  const av = datos.aventuras[entrada?.aventura];
  if (!av) throw new Error('Aventura desconocida');
  const mapa = { ...av.aventura.mapa };
  if (entrada.archivo) {
    const m = /^data:image\/(svg\+xml|webp|jpeg|png);base64,([A-Za-z0-9+/=]+)$/.exec(entrada.archivo);
    if (!m) throw new Error('Formato de mapa no válido (SVG, JPG, PNG o WebP)');
    const buf = Buffer.from(m[2], 'base64');
    const ext = { 'svg+xml': 'svg', jpeg: 'jpg', webp: 'webp', png: 'png' }[m[1]];
    let medidas;
    if (ext === 'svg') medidas = validarSvg(buf);
    else {
      if (!FIRMAS[ext](buf)) throw new Error('El contenido no es una imagen del tipo indicado');
      medidas = { ancho: numero(entrada.ancho, 'Ancho', 1, 20000), alto: numero(entrada.alto, 'Alto', 1, 20000) };
    }
    const sello = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '');
    mapa.archivo = `img/mapa/${entrada.aventura}-${sello}.${ext}`;
    Object.assign(mapa, medidas);
    comprobarRegistro(raiz, 'global');
    fs.mkdirSync(path.join(raiz, 'img', 'mapa'), { recursive: true });
    fs.writeFileSync(path.join(raiz, mapa.archivo), buf);
  } else if (entrada.existente) {
    if (!/^img\/mapa\/[\w-]+\.(svg|jpe?g|png|webp)$/.test(entrada.existente) || !fs.existsSync(path.join(raiz, entrada.existente))) throw new Error('Ese mapa no existe');
    Object.assign(mapa, { archivo: entrada.existente, ancho: numero(entrada.ancho, 'Ancho', 1, 20000), alto: numero(entrada.alto, 'Alto', 1, 20000) });
  }
  if (entrada.dibujar_camino !== undefined) mapa.dibujar_camino = V.bool()(entrada.dibujar_camino, 'Dibujar camino');
  if (JSON.stringify(mapa) === JSON.stringify(av.aventura.mapa)) return { mapa, sinCambios: true };

  comprobarRegistro(raiz, 'global');
  const archivo = pub(raiz, 'aventuras', entrada.aventura, 'aventura.json');
  escribirAtomico(archivo, { ...av.aventura, mapa });
  const evento = auditar(raiz, 'global', { coleccion: 'mapa', aventura: entrada.aventura, id: entrada.aventura, cambio: 'mapa', antes: av.aventura.mapa, despues: mapa });
  return { mapa, evento };
}

// ---------- HTTP ----------
const TIPOS_MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
};
// Insensible a mayúsculas: en Windows «DATA/Privado» es la misma carpeta.
const PROHIBIDO = [/^\.git(\/|$)/i, /^data\/privado(\/|$)/i, /^backups(\/|$)/i];

function enviar(res, estado, cuerpo, tipo = 'application/json; charset=utf-8') {
  res.writeHead(estado, { 'Content-Type': tipo, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(typeof cuerpo === 'string' || Buffer.isBuffer(cuerpo) ? cuerpo : JSON.stringify(cuerpo));
}

function leerCuerpo(req, limite = LIMITE_CUERPO) {
  return new Promise((ok, mal) => {
    let tam = 0;
    const trozos = [];
    req.on('data', t => {
      tam += t.length;
      if (tam > limite) { mal(new Error('Petición demasiado grande')); req.destroy(); } else trozos.push(t);
    });
    req.on('end', () => { try { ok(JSON.parse(Buffer.concat(trozos).toString('utf8'))); } catch { mal(new Error('JSON no válido')); } });
    req.on('error', mal);
  });
}

function crearServidor({ raiz = __dirname, token = crypto.randomBytes(24).toString('hex'), puerto = PUERTO } = {}) {
  const hosts = new Set([`localhost:${puerto}`, `127.0.0.1:${puerto}`]);
  const tokenValido = t => typeof t === 'string' && t.length === token.length && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(token));

  const servidor = http.createServer(async (req, res) => {
    try {
      // Evita ataques de "DNS rebinding": solo se atiende a peticiones dirigidas a este equipo.
      if (!hosts.has(req.headers.host)) return enviar(res, 403, { error: 'Host no permitido' });
      const url = new URL(req.url, 'http://localhost');

      if (url.pathname.startsWith('/api/')) {
        const origen = req.headers.origin;
        if (origen && !hosts.has(origen.replace(/^https?:\/\//, ''))) return enviar(res, 403, { error: 'Origen no permitido' });
        if (!tokenValido(req.headers['x-token'])) return enviar(res, 401, { error: 'Token no válido: recarga admin.html' });

        if (req.method === 'GET' && url.pathname === '/api/datos') return enviar(res, 200, cargarDatos(raiz));
        if (req.method === 'GET' && url.pathname === '/api/verificar') return enviar(res, 200, verificarTodo(raiz));
        const POST = { '/api/evento': [anadirEvento, LIMITE_CUERPO], '/api/entidad': [guardarEntidad, LIMITE_CUERPO], '/api/imagen': [guardarFoto, LIMITE_IMAGEN], '/api/mapa': [guardarMapa, LIMITE_IMAGEN] };
        if (req.method === 'POST' && POST[url.pathname]) {
          if (!String(req.headers['content-type']).startsWith('application/json')) return enviar(res, 415, { error: 'Se espera JSON' });
          const [accion, limite] = POST[url.pathname];
          let entrada;
          try { entrada = await leerCuerpo(req, limite); } catch (e) { return enviar(res, 413, { error: e.message }); }
          try { return enviar(res, 200, accion(raiz, entrada)); } catch (e) { return enviar(res, 400, { error: e.message }); }
        }
        return enviar(res, 404, { error: 'Ruta desconocida' });
      }

      if (req.method !== 'GET' && req.method !== 'HEAD') return enviar(res, 405, { error: 'Método no permitido' });
      // Las barras invertidas cuentan como separadores (Windows) antes de comprobar la ruta.
      let rel = decodeURIComponent(url.pathname).replace(/\\/g, '/').replace(/^\/+/, '') || 'index.html';
      rel = path.posix.normalize(rel);
      const archivo = path.join(raiz, rel);
      if (rel.startsWith('..') || !archivo.startsWith(path.join(raiz, path.sep)) || PROHIBIDO.some(r => r.test(rel))) {
        return enviar(res, 403, { error: 'Prohibido' });
      }
      fs.readFile(archivo, (err, contenido) => {
        if (err) return enviar(res, 404, 'No encontrado', 'text/plain; charset=utf-8');
        const tipo = TIPOS_MIME[path.extname(archivo).toLowerCase()] || 'application/octet-stream';
        // El token solo viaja dentro de admin.html: otra web no puede leer esta respuesta.
        if (rel === 'admin.html') contenido = contenido.toString('utf8').replace('%%TOKEN%%', token);
        enviar(res, 200, contenido, tipo);
      });
    } catch (e) {
      enviar(res, 500, { error: e.message });
    }
  });
  return { servidor, token };
}

module.exports = { validarEvento, anadirEvento, guardarEntidad, guardarFoto, guardarMapa, cargarDatos, verificarTodo, crearServidor };

if (require.main === module) {
  if (process.argv.includes('--verificar')) {
    const { ok, informe } = verificarTodo(__dirname);
    for (const r of informe) console.log(`${r.errores.length ? '✖' : '✔'} ${r.registro}${r.errores.map(e => '\n    ' + e).join('')}`);
    process.exit(ok ? 0 : 1);
  }
  const { servidor } = crearServidor();
  servidor.listen(PUERTO, '127.0.0.1', () => {
    console.log(`Panel del profesor: http://localhost:${PUERTO}/admin.html`);
    console.log(`Web pública:        http://localhost:${PUERTO}/`);
    console.log('Ctrl+C para parar.');
  });
}
