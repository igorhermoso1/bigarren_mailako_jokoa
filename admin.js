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

function texto(v, nombre, obligatorio = false) {
  if (v == null || v === '') { if (obligatorio) throw new Error(`Falta ${nombre}`); return undefined; }
  if (typeof v !== 'string') throw new Error(`${nombre} debe ser texto`);
  const t = v.trim();
  if (t.length > MAX_TEXTO) throw new Error(`${nombre} es demasiado largo`);
  if (obligatorio && !t) throw new Error(`Falta ${nombre}`);
  return t || undefined;
}
function numero(v, nombre, min, max) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) throw new Error(`${nombre} debe ser un número entre ${min} y ${max}`);
  return n;
}
const enAmbito = (item, aventura) => item && (item.ambito === 'todas' || item.ambito === aventura);
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
      if (!av.tablero.casillas.some(c => c.id === d.hasta)) throw new Error('Casilla de destino desconocida');
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
      for (const c of rubrica.criterios) {
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

function leerCuerpo(req) {
  return new Promise((ok, mal) => {
    let tam = 0;
    const trozos = [];
    req.on('data', t => {
      tam += t.length;
      if (tam > LIMITE_CUERPO) { mal(new Error('Petición demasiado grande')); req.destroy(); } else trozos.push(t);
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
        if (req.method === 'POST' && url.pathname === '/api/evento') {
          if (!String(req.headers['content-type']).startsWith('application/json')) return enviar(res, 415, { error: 'Se espera JSON' });
          const entrada = await leerCuerpo(req);
          try { return enviar(res, 200, anadirEvento(raiz, entrada)); } catch (e) { return enviar(res, 400, { error: e.message }); }
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

module.exports = { validarEvento, anadirEvento, cargarDatos, verificarTodo, crearServidor };

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
