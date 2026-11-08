# Arquitectura

## Piezas
- **Web estática** (GitHub Pages): `index.html` + `app.js` + `estilos.css`. Sin librerías externas.
- **Base de datos** (Supabase, proyecto *CONFI2026 Parroquia Santiago Apostol*, región París).
  - Tablas: `config`, `sesiones`, `preguntas`, `respuestas`, `sobres`.
  - Todas con RLS activado y **sin políticas**: nadie lee ni escribe las tablas directamente.
  - El acceso es solo mediante tres funciones (`SECURITY DEFINER`) que comprueban un código:
    - `app_datos(codigo)` → sesiones publicadas, preguntas, sobres y la clave de los vídeos. Requiere el código del grupo.
    - `enviar_respuestas(codigo, sesion, respuestas)` → guarda respuestas anónimas si el formulario de la sesión está abierto.
    - `panel_respuestas(codigo)` → todas las respuestas. Requiere el código del catequista.
  - Los códigos se guardan cifrados (bcrypt) en `config`.
- **Vídeos**: comprimidos (H.264, ~750 kbps, 720p) y cifrados con AES-GCM en partes de 8 MB (`media/sesionN/000.bin…` + `info.json`). La clave solo la entrega `app_datos` con el código correcto; el navegador descifra y reproduce.

## Añadir una sesión nueva
1. Comprimir el vídeo:
   `ffmpeg -i entrada.mp4 -vf scale=1280:720,fps=30 -c:v libx264 -b:v 750k -maxrate 1000k -bufsize 2000k -c:a aac -b:a 96k -movflags +faststart sesionN.mp4`
2. Cifrarlo: `python3 herramientas/cifrar_video.py sesionN.mp4 media/sesionN <clave_video>` (la clave está en la tabla `config`).
3. Insertar la sesión en `sesiones` (campo `video` = `{"carpeta":"media/sesionN","partes":X,"duracion":"m:ss"}`), su `contenido` (bloques) y sus `preguntas`.
4. Abrir el formulario de la sesión (`formulario_abierto = true`) y cerrar el de la anterior.

## Tipos de bloque de contenido
`texto`, `cita` (texto bíblico literal + referencia), `aviso`, `cifras`, `barras`, `nube`, `lista`.
