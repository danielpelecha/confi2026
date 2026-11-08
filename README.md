# CONFI2026 · Parroquia Santiago Apóstol

App web de la catequesis de Confirmación de la Parroquia Santiago Apóstol (La Pobla de Vallbona), itinerario 2026-2028.

Los jóvenes entran desde el móvil con el enlace que el catequista comparte en el grupo de WhatsApp y el **código del grupo**. En cada sesión encuentran el vídeo, lo trabajado, los resultados del grupo (siempre **anónimos**) y las preguntas para responder.

## Para el catequista

- **Enlace para los jóvenes:** la dirección de GitHub Pages de este repositorio.
- **Panel del catequista:** la misma dirección terminada en `#/panel`. Pide un código propio, distinto del del grupo. Desde ahí se ven todas las respuestas y se pueden descargar en un archivo para Excel.
- Los códigos **no** están en este repositorio.

## Qué hay aquí

| Ruta | Contenido |
|---|---|
| `index.html`, `app.js`, `estilos.css` | La app (sin dependencias externas) |
| `config.js` | Dirección del proyecto Supabase y su clave publicable |
| `media/sesionN/` | Vídeo de cada sesión, cifrado en partes |
| `supabase/esquema.sql` | Estructura de la base de datos y funciones |
| `herramientas/cifrar_video.py` | Script para cifrar un vídeo nuevo |
| `docs/ARQUITECTURA.md` | Cómo funciona y cómo añadir una sesión |
| `docs/DIARIO.md` | Diario de la catequesis, sesión a sesión |

## Principios

1. La Palabra de Dios se cita siempre de forma literal (versión oficial de la Conferencia Episcopal Española), con su referencia.
2. Las respuestas de los jóvenes son anónimas.
3. La app acompaña; el centro es siempre el catequista y la comunidad.
