# Arquitectura

## Piezas
- **Web estática** (GitHub Pages): `index.html` + `app.js` + `estilos.css`. Sin librerías externas.
- **Base de datos** (Supabase, proyecto *CONFI2026 Parroquia Santiago Apostol*, región París).
  - **Material** (común a todos los grupos, sin respuestas): `sesiones` (contenido, vídeo) y `preguntas`.
  - **Respuestas del grupo** (separadas, una por grupo): `grupos` (nombre, código cifrado, sesión con el formulario abierto), `respuestas` (anónimas), `resultados` (resumen de cada sesión que prepara el catequista) y `sobres`.
  - Un grupo futuro (p. ej. CONFI2028) usa el mismo material con su propio código y solo ve sus propias respuestas.
  - `config`: código del catequista (cifrado) y clave de los vídeos.
  - Todas con RLS activado y **sin políticas**: nadie lee ni escribe las tablas directamente.
  - El acceso es solo mediante tres funciones (`SECURITY DEFINER`) que comprueban un código:
    - `app_datos(codigo)` → identifica el grupo por su código y devuelve el material, los resultados de ese grupo y la clave de los vídeos.
    - `enviar_respuestas(codigo, sesion, respuestas)` → guarda respuestas anónimas del grupo si esa sesión es la abierta (`grupos.sesion_abierta`).
    - `panel_respuestas(codigo)` → todas las respuestas. Requiere el código del catequista.
  - Los códigos se guardan cifrados (bcrypt) en `config`.
- **Vídeos**: comprimidos (H.264, ~750 kbps, 720p) y cifrados con AES-GCM en partes de 8 MB (`media/sesionN/000.bin…` + `info.json`). La clave solo la entrega `app_datos` con el código correcto; el navegador descifra y reproduce.

## Añadir una sesión nueva
1. Comprimir el vídeo:
   `ffmpeg -i entrada.mp4 -vf scale=1280:720,fps=30 -c:v libx264 -b:v 750k -maxrate 1000k -bufsize 2000k -c:a aac -b:a 96k -movflags +faststart sesionN.mp4`
2. Cifrarlo: `python3 herramientas/cifrar_video.py sesionN.mp4 media/sesionN <clave_video>` (la clave está en la tabla `config`).
3. Insertar la sesión en `sesiones` (campo `video` = `{"carpeta":"media/sesionN","partes":X,"duracion":"m:ss"}`), su `contenido` (bloques) y sus `preguntas`.
4. Abrir el formulario de la sesión para el grupo: `update grupos set sesion_abierta = N where nombre = 'CONFI2026'`.
5. Tras la sesión, el catequista añade el resumen en `resultados` (bloques), separado del material.

## Crear un grupo nuevo
`insert into grupos(nombre, codigo, sesion_abierta) values ('CONFI2028', extensions.crypt('CONFI2028', extensions.gen_salt('bf')), 1);`

## Tipos de bloque de contenido
`texto`, `cita` (texto bíblico literal + referencia), `aviso`, `cifras`, `barras`, `nube`, `lista`.

## Dos departamentos (8-11-2026)

| Departamento | Código | Función RPC | Qué recibe |
|---|---|---|---|
| 🎒 Joven | código del grupo (CONFI2026) | `app_datos` | Material del alumno (contenido, vídeo, preguntas, bloque «Para dialogar y reflexionar» sin orientaciones) y **solo** los resúmenes que el catequista ha publicado, más los sobres. |
| 📋 Catequista | código propio (`config.codigo_catequista`) | `catequista_datos` | Todo lo anterior + `material_catequista` (objetivo, materiales, guion por tiempos, diálogo con orientaciones y apoyo bíblico/Catecismo, notas pastorales) + respuestas anónimas en bruto. |

El material del catequista **nunca viaja** al móvil del joven: lo filtra la base de datos, no la app.

Funciones del catequista: `catequista_abrir(codigo, grupo, numero|null)` abre o cierra las preguntas; `catequista_publicar(codigo, grupo, numero, publicado, contenido|null)` publica u oculta el resumen (con `contenido` null conserva el guardado).

Modelo de respuestas: el catequista lo ve todo; los jóvenes solo ven el resumen que el catequista decide publicar (participación, aciertos del verdadero/falso y las respuestas abiertas que marque). Nada se publica automáticamente.

Rutas: `#/joven`, `#/joven/sesion/N`, `#/joven/sesion/N/responder`, `#/joven/grupo/N`, `#/catequista`, `#/catequista/sesion/N/{guion|dialogo|alumno|respuestas}`. El código del joven se recuerda en el móvil; el del catequista solo mientras la pestaña está abierta.
