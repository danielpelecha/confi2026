#!/bin/sh
# Pone un número de versión nuevo a estilos.css, config.js y app.js en index.html,
# para que los móviles carguen siempre la última versión tras cada cambio.
cd "$(dirname "$0")/.." && V=$(date +%Y%m%d%H%M) && sed -i -E "s#(estilos\.css|config\.js|app\.js)(\?v=[0-9]+)?\"#\1?v=$V\"#g" index.html && echo "Versión $V"
