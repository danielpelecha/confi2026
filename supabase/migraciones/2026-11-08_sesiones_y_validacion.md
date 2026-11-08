# Migración 8-11-2026 · Iniciar/cerrar sesión, corregir y validar respuestas

Aplicada en Supabase como `validar_y_enviar_respuestas`.

- `respuestas.oculta` (bool): el catequista oculta una respuesta al grupo (sigue viéndola él y sale en el CSV).
- `respuestas.editado` (bool): el catequista ha corregido el texto (falta, nombre propio…).
- `resultados.enviado` (timestamptz): cuándo se validaron y enviaron las respuestas.
- `enviar_respuestas(codigo, sesion, respuestas, p_envio uuid default null)`: si el joven ya respondió y la sesión está reabierta, sus respuestas anteriores se **sustituyen** (no se duplican). Devuelve `envio`, que el móvil guarda.
- `catequista_respuesta(codigo, id, valor?, oculta?)`: editar u ocultar una respuesta.
- `catequista_publicar(codigo, grupo, numero, publicado, contenido?)`: «Validar y enviar respuestas» (publicado = true) o «Retirar el envío».
- `app_datos` devuelve, solo de sesiones enviadas, las respuestas no ocultas **agrupadas por pregunta y en orden alfabético**, sin envío ni hora, para que no se pueda saber qué respuestas son de la misma persona.
- `catequista_datos` añade `id`, `oculta`, `editado` y `enviado`.

Para ver el código exacto de cada función: `select pg_get_functiondef('public.app_datos'::regproc);`
