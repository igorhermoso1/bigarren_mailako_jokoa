# Abentura-mapa (Zerbitzuak + Sareak)

Web que convierte la evaluación por grupos en dos aventuras sobre un mapa. Los alumnos solo miran la web pública (GitHub Pages); el profesor registra todo desde un panel local.

> Estado: **Fase 2**. La web pública ya funciona con los datos de ejemplo. El panel admin llega en la Fase 3.

## Requisitos
- [Node.js](https://nodejs.org) (versión 20 o superior). No hay que instalar nada más.
- Git.

## Cómo está organizado
| Carpeta / archivo | Qué contiene |
|---|---|
| `data/publico/config.json` | Título, aventuras, niveles, marcos de ficha y tipos de casilla |
| `data/publico/grupos.json` | Los 6 grupos y sus miembros (solo alias, nunca nombres reales) |
| `data/publico/catalogo.json` | Objetos, estados, hitos y logros |
| `data/publico/aventuras/<id>/` | Mapa, tablero, entregas y **registro de eventos** de cada asignatura |
| `data/privado/` | Rúbricas y notas individuales. **No se sube a GitHub** (`.gitignore`) |
| `img/mapa/` | Fondo de cada mapa |
| `img/fichas/marcos.png` | Los 6 marcos de ficha |
| `cadena.js` | Cadena de hashes que impide que se modifiquen eventos sin que se note |

## Cómo funciona: nada se borra
Todo lo que pasa (avanzar, ganar un objeto, una nota…) es un **evento** que se añade al final de un registro. La posición, los puntos y el inventario se calculan recorriendo los eventos.

- **Corregir un error** = añadir un evento `anulacion` que apunta al evento erróneo. El original sigue en el historial, tachado.
- Cada evento lleva un **hash** encadenado con el anterior. Si alguien edita un evento antiguo a mano, la verificación lo detecta.

## Ver la web en tu equipo
Abre una terminal en la carpeta del proyecto y ejecuta:
```bash
python -m http.server 8080
```
Después abre <http://localhost:8080>. Abrir `index.html` con doble clic no funciona: el navegador no deja leer los JSON desde archivos locales.

## Comprobar que todo está bien
```bash
node --test
```
El test «los registros de datos del repositorio son íntegros» verifica las cadenas de hashes de todos los registros públicos.

## Copias de seguridad
- **GitHub** es la copia principal: cada `git push` guarda una versión completa.
- **`data/privado/` no va a GitHub.** Cópiala a mano a un USB o a la nube del centro (por ejemplo, una vez por semana).
- Al cerrar cada trimestre, pon una etiqueta: `git tag 2026-T1 && git push --tags`.
- Protege la rama `main` en GitHub (Settings → Branches → no permitir *force push* ni borrado).

### Restaurar
- Una sola aventura a una fecha anterior: `git checkout <commit> -- data/publico/aventuras/sareak/`
- Todo el proyecto: `git checkout <commit> -- .`

Después, haz commit de la restauración. Así el historial también guarda la vuelta atrás.

## Privacidad
- En `grupos.json` solo van **alias**. Los nombres reales y las notas individuales se quedan en `data/privado/`.
- Lo que se sube con `push` a un repositorio público **queda en el historial de Git aunque luego se borre**. Revisa las fotos de los grupos antes de publicarlas.
