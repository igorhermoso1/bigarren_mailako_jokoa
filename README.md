# Abentura-mapa (Zerbitzuak + Sareak)

Web que convierte la evaluación por grupos en dos aventuras sobre un mapa. Los alumnos solo miran la web pública (GitHub Pages); el profesor registra todo desde un panel local.

> Estado: **Fase 4**. Web pública y panel completo: grupos, fichas con foto, catálogo, entregas, rúbrica y valoraciones con historial. Falta el editor visual del tablero (Fase 5).

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

## Uso diario (panel del profesor)
1. Abre una terminal en la carpeta del proyecto y arranca el panel:
   ```bash
   node admin.js
   ```
2. Abre <http://localhost:3000/admin.html>. La franja de colores de arriba indica **en qué aventura** vas a registrar.
3. Registra lo que haya pasado:
   - botones de cada grupo: **▶ Aurreratu** (pasa a la siguiente zona) y los bonus/penalizaciones rápidos (se configuran en `config.json → acciones_rapidas`);
   - o el formulario **Gertaera berria** para cualquier otro tipo.

   Antes de guardar siempre sale un resumen para confirmar.
4. ¿Te has equivocado? En **Azken gertaerak**, pulsa **Baliogabetu** junto al evento. No se borra: queda tachado y deja de contar.
5. Cuando termines, publica los cambios:
   ```bash
   git add data && git commit -m "Entrega 3" && git push
   ```

### Módulos del panel
| Módulo | Para qué |
|---|---|
| ⚔️ Kontrola | Registrar lo que pasa en clase (avances, puntos, objetos, notas…) |
| 📜 Balorazioak | Historial de notas del grupo y de cada miembro, medias, gráfica y tendencia. Valorar a los 5 miembros de una vez |
| 🛡️ Taldeak eta fitxak | Grupos y miembros; subir la foto del grupo, encuadrarla, elegir el marco y restaurar versiones anteriores |
| 💎 Katalogoa | Crear y editar objetos, estados, hitos y logros |
| 📅 Entregak eta errubrika | Fechas y puntos de cada entrega y criterios de la rúbrica (privada) |
| ⚖️ Konparaketa | Los 6 grupos en las dos aventuras a la vez |

Para **corregir una nota**, pon una nueva para la misma entrega: la anterior queda marcada como «zuzendua». Para **quitar** algo (un objeto, un alumno…), usa **Artxibatu**: deja de usarse, pero no se borra.

> ⚠️ Las fotos de grupo que subas se publican en la web al hacer `push`. El original queda solo en `data/privado/fotos_reales/`.

Las notas individuales de cada alumno y las notas de grupo marcadas como no públicas se guardan en `data/privado/`, que **no** se sube a GitHub.

El panel solo atiende a tu propio equipo (127.0.0.1) y usa una clave que cambia cada vez que lo arrancas. Sin `node admin.js` no funciona, aunque `admin.html` esté publicado.

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
Para verificar solo las cadenas de hashes (también las privadas):
```bash
node admin.js --verificar
```
O pulsa **🔍 Egiaztatu** en el panel.

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
