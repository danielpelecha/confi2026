/* CONFI2026 · Parroquia Santiago Apóstol
   App de catequesis de Confirmación con dos departamentos:
   - Joven (alumno): código del grupo.
   - Catequista: código propio. Su material nunca se envía al móvil del joven.
   Sin dependencias: HTML + JS + Supabase (RPC). Ver docs/ARQUITECTURA.md */
(function () {
  "use strict";
  var C = window.CONFI;
  var app = document.getElementById("app");
  var btnSalir = document.getElementById("salir");
  var DATOS = null;   // departamento del joven
  var CAT = null;     // departamento del catequista
  var videosCache = {};

  /* ---------- utilidades ---------- */
  function guardar(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function leer(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function borrar(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function guardarS(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
  function leerS(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function borrarS(k) { try { sessionStorage.removeItem(k); } catch (e) {} }
  function el(tag, attrs, hijos) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (attrs[k] == null) continue;
      if (k === "class") n.className = attrs[k];
      else if (k === "text") n.textContent = attrs[k];
      else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    }
    (hijos || []).forEach(function (h) { if (h != null) n.appendChild(typeof h === "string" ? document.createTextNode(h) : h); });
    return n;
  }
  function limpiar() { app.innerHTML = ""; window.scrollTo(0, 0); }
  function fechaBonita(f) {
    if (!f) return "";
    var d = new Date(f + "T12:00:00");
    return d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }
  function rpc(nombre, cuerpo) {
    return fetch(C.supabaseUrl + "/rest/v1/rpc/" + nombre, {
      method: "POST",
      headers: { "apikey": C.supabaseKey, "Authorization": "Bearer " + C.supabaseKey, "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo)
    }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (j) {
        if (!r.ok) { var e = new Error((j && j.message) || ("Error " + r.status)); throw e; }
        return j;
      });
    });
  }
  function migas(href, texto) { return el("p", { class: "migas" }, [el("a", { href: href, text: texto })]); }
  function cabecera(rol) {
    btnSalir.hidden = !rol;
    document.body.classList.toggle("modo-cat", rol === "cat");
  }

  /* ---------- entrada: elegir departamento ---------- */
  function pantallaEntrada() {
    cabecera(null); limpiar();
    app.appendChild(el("div", { class: "acceso" }, [
      el("div", { class: "logo", text: "✝" }),
      el("h1", { text: "Catequesis de Confirmación" }),
      el("p", { class: "lema", text: "Parroquia Santiago Apóstol · La Pobla de Vallbona" }),
      el("a", { class: "boton oro grande", href: "#/joven/entrar" }, [el("span", { class: "icono", text: "🎒" }), "Soy joven"]),
      el("div", { style: "height:12px" }),
      el("a", { class: "boton grande", href: "#/catequista/entrar" }, [el("span", { class: "icono", text: "📋" }), "Soy catequista"])
    ]));
  }
  function pantallaCodigo(rol, error) {
    cabecera(null); limpiar();
    var esCat = rol === "cat";
    var input = el("input", { type: esCat ? "password" : "text", autocomplete: "off", autocapitalize: "characters", placeholder: esCat ? "Código del catequista" : "Código del grupo", "aria-label": esCat ? "Código del catequista" : "Código del grupo" });
    var msg = el("p", { class: "error", text: error || "" });
    var boton = el("button", { class: "boton " + (esCat ? "" : "oro"), type: "submit", text: "Entrar" });
    var form = el("form", { class: "acceso" }, [
      el("div", { class: "logo", text: esCat ? "📋" : "🎒" }),
      el("h1", { text: esCat ? "Departamento del catequista" : "Departamento del joven" }),
      el("p", { class: "fecha", text: esCat ? "Escribe tu código personal de catequista." : "Escribe el código de tu grupo." }),
      input, msg, boton, el("p", null, [el("a", { href: "#/", class: "migas", text: "← Volver" })])
    ]);
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var cod = input.value.trim().toUpperCase();
      if (!cod) return;
      boton.disabled = true; boton.textContent = "Entrando…"; msg.textContent = "";
      (esCat ? cargarCat(cod) : cargarJoven(cod)).then(function () {
        if (esCat) { guardarS("confi_cat", cod); location.hash = "#/catequista"; }
        else { guardar("confi_codigo", cod); location.hash = "#/joven"; }
        router();
      }).catch(function (e) {
        boton.disabled = false; boton.textContent = "Entrar";
        msg.textContent = /codigo_incorrecto/.test(e.message) ? "Código incorrecto." : "No se ha podido conectar. Revisa tu conexión e inténtalo de nuevo.";
      });
    });
    app.appendChild(form);
    input.focus();
  }
  function cargarJoven(cod) { return rpc("app_datos", { p_codigo: cod }).then(function (d) { DATOS = d; return d; }); }
  function cargarCat(cod) { return rpc("catequista_datos", { p_codigo: cod }).then(function (d) { CAT = d; return d; }); }
  btnSalir.addEventListener("click", function () {
    borrar("confi_codigo"); borrarS("confi_cat"); DATOS = null; CAT = null; location.hash = "#/";
  });

  /* ---------- vídeo cifrado ---------- */
  function b64aBytes(b64) { var s = atob(b64), a = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }
  function bloqueVideo(v, clave) {
    var caja = el("div", { class: "video" });
    if (videosCache[v.carpeta]) { mostrarVideo(caja, videosCache[v.carpeta]); return caja; }
    var barra = el("div", { class: "barra" }, [el("i")]);
    var estado = el("div", { style: "font-size:14px;margin-top:8px;opacity:.85" });
    var play = el("button", { class: "play", text: "▶  Ver el vídeo" + (v.duracion ? " (" + v.duracion + ")" : "") });
    var dentro = el("div", null, [play, estado]);
    caja.appendChild(dentro);
    play.addEventListener("click", function () {
      play.disabled = true; play.textContent = "Preparando el vídeo…"; dentro.appendChild(barra);
      descargarVideo(v, clave, function (p) { barra.firstChild.style.width = Math.round(p * 100) + "%"; })
        .then(function (url) { videosCache[v.carpeta] = url; caja.innerHTML = ""; mostrarVideo(caja, url, true); })
        .catch(function () { play.disabled = false; play.textContent = "Reintentar"; estado.textContent = "No se ha podido cargar el vídeo. Revisa tu conexión."; });
    });
    return caja;
  }
  function mostrarVideo(caja, url, auto) {
    var vid = el("video", { controls: "", playsinline: "", src: url, preload: "metadata" });
    caja.appendChild(vid);
    if (auto) vid.play().catch(function () {});
  }
  function descargarVideo(v, claveB64, progreso) {
    return Promise.all([
      crypto.subtle.importKey("raw", b64aBytes(claveB64), "AES-GCM", false, ["decrypt"]),
      fetch(v.carpeta + "/info.json").then(function (r) { if (!r.ok) throw new Error("info"); return r.json(); })
    ]).then(function (res) {
      var clave = res[0], meta = res[1], partes = [], hechas = 0, tareas = [];
      for (var i = 0; i < meta.partes; i++) (function (i) {
        tareas.push(fetch(v.carpeta + "/" + String(i).padStart(3, "0") + ".bin")
          .then(function (r) { if (!r.ok) throw new Error("parte"); return r.arrayBuffer(); })
          .then(function (buf) { return crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(buf, 0, 12) }, clave, new Uint8Array(buf, 12)); })
          .then(function (plano) { partes[i] = plano; hechas++; progreso(hechas / meta.partes); }));
      })(i);
      return Promise.all(tareas).then(function () { return URL.createObjectURL(new Blob(partes, { type: meta.tipo || "video/mp4" })); });
    });
  }

  /* ---------- bloques de contenido ---------- */
  function barraFila(texto, valor, total) {
    return el("div", { class: "fila" }, [el("div", { class: "txt" }, [el("span", { text: texto }), el("b", { text: valor + " de " + total })]), el("div", { class: "pista" }, [el("i", { style: "width:" + (total ? Math.round(valor / total * 100) : 0) + "%" })])]);
  }
  function bloque(b) {
    var t = b.titulo ? el("h2", { text: b.titulo }) : null;
    switch (b.tipo) {
      case "texto": return el("section", null, [t, el("p", { text: b.texto })]);
      case "aviso": return el("section", { class: "tarjeta aviso" }, [el("b", { text: b.titulo }), el("p", { text: b.texto, style: "margin:6px 0 0" })]);
      case "cita": return el("section", { class: "tarjeta cita" }, [el("b", { text: b.titulo }), el("blockquote", { text: b.texto }), el("cite", { text: b.referencia })]);
      case "cifras": return el("section", null, [t, el("div", { class: "cifras" }, b.items.map(function (i) { return el("div", { class: "cifra" }, [el("b", { text: i.valor }), el("span", { text: i.texto })]); }))]);
      case "barras": return el("section", { class: "tarjeta" }, [el("b", { text: b.titulo })].concat(b.items.map(function (i) { return barraFila(i.texto, i.valor, i.total || b.total); })));
      case "nube": return el("section", null, [t, el("div", { class: "nube" }, b.items.map(function (w) { return el("span", { text: w }); }))]);
      case "lista": return el("section", null, [t, b.texto ? el("p", { class: "fecha", text: b.texto }) : null, el("ul", { class: "puntos" }, b.items.map(function (w) { return el("li", { text: w }); }))]);
      case "dialogo":
        if (b.grupos.length === 1 && !b.titulo) return el("section", { class: "tarjeta dialogo" }, [el("span", { class: "etiqueta", text: "💬 Para dialogar · " + b.grupos[0].momento }), el("ul", { class: "puntos" }, b.grupos[0].preguntas.map(function (p) { return el("li", { text: p }); }))]);
        return el("section", null, [t, b.texto ? el("p", { class: "fecha", text: b.texto }) : null].concat(b.grupos.map(function (g) {
        return el("div", { class: "tarjeta" }, [el("span", { class: "etiqueta", text: g.momento }), el("ul", { class: "puntos" }, g.preguntas.map(function (p) { return el("li", { text: p }); }))]);
      })));
      case "youtube":
        var q = "?rel=0&modestbranding=1&playsinline=1" + (b.inicio ? "&start=" + b.inicio : "") + (b.fin ? "&end=" + b.fin : "");
        return el("section", null, [t, b.texto ? el("p", { text: b.texto }) : null,
          el("div", { class: "video" }, [el("iframe", { src: "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(b.id) + q, title: b.tituloVideo || "Vídeo", allow: "encrypted-media; picture-in-picture; fullscreen", allowfullscreen: "", loading: "lazy", style: "width:100%;height:100%;border:0" })]),
          el("p", { class: "fuente" }, ["📺 Fuente: «" + b.tituloVideo + "», del canal ", el("b", { text: b.canal }), " (YouTube)." + (b.tramo ? " Fragmento " + b.tramo + "." : "") + " ", el("a", { href: b.url, target: "_blank", rel: "noopener", text: "Ver el vídeo completo" })])]);
      default: return null;
    }
  }
  function preguntaVF(p, corregirAlMomento, alElegir) {
    var caja = el("div", { class: "pregunta tarjeta" });
    var expl = el("p", { class: "expl" });
    var botones = ["V", "F"].map(function (v) { return el("button", { type: "button", "aria-pressed": "false", text: v === "V" ? "Verdadero" : "Falso", "data-v": v }); });
    botones.forEach(function (b) {
      b.addEventListener("click", function () {
        botones.forEach(function (o) { o.setAttribute("aria-pressed", o === b ? "true" : "false"); o.classList.remove("bien", "malr"); });
        if (alElegir) alElegir(b.getAttribute("data-v"));
        if (corregirAlMomento) {
          var ok = b.getAttribute("data-v") === p.correcta;
          b.classList.add(ok ? "bien" : "malr");
          expl.textContent = (ok ? "✓ ¡Correcto! " : "✗ No es así. ") + (p.explicacion || "");
        }
      });
    });
    caja.appendChild(el("span", { class: "enun", text: p.enunciado }));
    caja.appendChild(el("div", { class: "vf" }, botones));
    caja.appendChild(expl);
    caja._corregir = function (elegida) {
      botones.forEach(function (o) { o.disabled = true; if (o.getAttribute("data-v") === elegida) o.classList.add(elegida === p.correcta ? "bien" : "malr"); });
      expl.textContent = (elegida === p.correcta ? "✓ ¡Correcto! " : "✗ La respuesta es " + (p.correcta === "V" ? "verdadero" : "falso") + ". ") + (p.explicacion || "");
    };
    return caja;
  }
  function sobres(lista) {
    var porNombre = {};
    lista.forEach(function (x) { (porNombre[x.nombre] = porNombre[x.nombre] || []).push(x.cualidad); });
    var sec = el("section", null, [el("h2", { text: "El sobre digital ✉" }), el("p", { class: "fecha", text: "Lo que vuestros compañeros ven en cada uno. Sin decir quién lo escribió." })]);
    Object.keys(porNombre).sort(function (a, b) { return a.localeCompare(b, "es"); }).forEach(function (n) {
      sec.appendChild(el("details", { class: "tarjeta sobre" }, [el("summary", { text: n }), el("ul", { class: "puntos" }, porNombre[n].map(function (c) { return el("li", { text: c }); }))]));
    });
    sec.appendChild(el("p", { class: "lema", text: "¿Qué don o dones descubrirás en estos años? El Espíritu Santo ya los ha puesto en ti." }));
    return sec;
  }
  /* Material del alumno de una sesión (se usa en los dos departamentos) */
  function materialAlumno(cont, s, clave, opciones) {
    opciones = opciones || {};
    if (s.contenido && s.contenido.lema) cont.appendChild(el("p", { class: "lema", text: s.contenido.lema }));
    if (s.contenido && s.contenido.objetivo) cont.appendChild(el("section", { class: "tarjeta" }, [el("b", { text: "Objetivo" }), el("p", { text: s.contenido.objetivo, style: "margin:6px 0 0" })]));
    if (opciones.botonResponder) cont.appendChild(opciones.botonResponder);
    var bloques = (s.contenido && s.contenido.bloques) || [];
    var videoEnSuSitio = bloques.some(function (b) { return b.tipo === "video"; });
    if (s.video && !videoEnSuSitio) cont.appendChild(bloqueVideo(s.video, clave));
    bloques.forEach(function (b) {
      if (b.tipo === "video") { if (s.video) cont.appendChild(el("section", null, [b.titulo ? el("h2", { text: b.titulo }) : null, bloqueVideo(s.video, clave)])); return; }
      var n = bloque(b); if (n) cont.appendChild(n);
    });
    if (!opciones.ocultarActividades) {
      var vf = s.preguntas.filter(function (p) { return p.tipo === "vf"; });
      var txt = s.preguntas.filter(function (p) { return p.tipo !== "vf"; });
      if (vf.length || txt.length) cont.appendChild(el("h2", { text: "Actividades de la sesión" }));
      if (vf.length) {
        cont.appendChild(el("p", { class: "fecha", text: "Cuestionario de verdadero o falso: al responder verás si has acertado. Nadie ve tus respuestas." }));
        vf.forEach(function (p) { cont.appendChild(preguntaVF(p, true)); });
      }
      if (txt.length) cont.appendChild(el("section", { class: "tarjeta" }, [el("b", { text: "Preguntas para responder" }), el("ul", { class: "puntos" }, txt.map(function (p) { return el("li", { text: p.enunciado }); }))]));
    }
  }

  /* =====================================================================
     DEPARTAMENTO DEL JOVEN
     ===================================================================== */
  function abierta(s) { return DATOS.sesion_abierta != null && Number(DATOS.sesion_abierta) === Number(s.numero); }
  function claveEnviado(s) { return "confi_enviado_" + DATOS.grupo + "_" + s.id; }
  function jovenInicio() {
    cabecera("joven"); limpiar();
    app.appendChild(el("span", { class: "etiqueta", text: "🎒 Departamento del joven · Grupo " + DATOS.grupo }));
    app.appendChild(el("h1", { text: "Hola 👋" }));
    app.appendChild(el("p", { text: "Aquí tienes el material de cada sesión y, aparte, lo que hemos compartido como grupo." }));
    var ab = DATOS.material.filter(abierta)[0];
    if (ab) app.appendChild(el("a", { class: "boton oro", href: "#/joven/sesion/" + ab.numero + "/responder", style: "margin:12px 0", text: leer(claveEnviado(ab)) ? "✏️  Revisar o cambiar mis respuestas de la Sesión " + ab.numero : "✍️  Responder a las preguntas de la Sesión " + ab.numero }));
    app.appendChild(el("h2", { text: "📘 Material de catequesis" }));
    DATOS.material.slice().sort(function (a, b) { return a.numero - b.numero; }).forEach(function (s) {
      app.appendChild(el("a", { class: "tarjeta", href: "#/joven/sesion/" + s.numero }, [
        el("span", { class: "etiqueta", text: "Sesión " + s.numero }), abierta(s) ? el("span", { class: "nueva", text: "Hoy" }) : null,
        el("h2", { text: s.titulo, style: "margin:2px 0 4px" }),
        s.contenido && s.contenido.objetivo ? el("div", { class: "fecha", text: s.contenido.objetivo }) : null
      ]));
    });
    app.appendChild(el("h2", { text: "📊 Lo que hemos compartido como grupo" }));
    var res = DATOS.resultados.slice().sort(function (a, b) { return a.sesion - b.sesion; });
    if (!res.length) app.appendChild(el("p", { class: "fecha", text: "Tu catequista publicará aquí el resumen de cada sesión." }));
    res.forEach(function (r) {
      app.appendChild(el("a", { class: "tarjeta resultado", href: "#/joven/grupo/" + r.sesion }, [
        el("span", { class: "etiqueta", text: "Sesión " + r.sesion + (r.fecha ? " · " + fechaBonita(r.fecha) : "") }),
        el("h2", { text: r.titulo, style: "margin:2px 0 4px" }),
        el("div", { class: "fecha", text: "Resumen del grupo" })
      ]));
    });
  }
  function jovenSesion(num) {
    var s = DATOS.material.filter(function (x) { return String(x.numero) === String(num); })[0];
    cabecera("joven"); limpiar();
    app.appendChild(migas("#/joven", "← Inicio"));
    if (!s) { app.appendChild(el("p", { class: "vacio", text: "No encuentro esa sesión." })); return; }
    app.appendChild(el("span", { class: "etiqueta", text: "📘 Material · Sesión " + s.numero }));
    app.appendChild(el("h1", { text: s.titulo }));
    var boton = abierta(s) ? el("a", { class: "boton oro", href: "#/joven/sesion/" + s.numero + "/responder", style: "text-align:center;text-decoration:none;margin:8px 0 16px", text: leer(claveEnviado(s)) ? "✏️  Ya has respondido: revisar o cambiar" : "✍️  Responder a las preguntas de hoy" }) : null;
    var enviada = DATOS.resultados.some(function (r) { return r.sesion === s.numero; });
    materialAlumno(app, s, DATOS.clave_video, { botonResponder: boton, ocultarActividades: abierta(s) || !enviada });
    if (!abierta(s) && !enviada) app.appendChild(el("p", { class: "aviso-cat", text: "🔒 Las actividades y el cuestionario de esta sesión aparecerán cuando tu catequista inicie la sesión." }));
  }
  function jovenGrupo(num) {
    var r = DATOS.resultados.filter(function (x) { return String(x.sesion) === String(num); })[0];
    cabecera("joven"); limpiar();
    app.appendChild(migas("#/joven", "← Inicio"));
    if (!r) { app.appendChild(el("p", { class: "vacio", text: "Todavía no hay resumen de esta sesión." })); return; }
    app.appendChild(el("span", { class: "etiqueta", text: "📊 Grupo " + DATOS.grupo + " · Sesión " + r.sesion }));
    app.appendChild(el("h1", { text: r.titulo }));
    if (r.fecha) app.appendChild(el("p", { class: "fecha", text: fechaBonita(r.fecha) }));
    app.appendChild(el("p", { text: "Lo que compartimos entre todos. Siempre de forma anónima." }));
    ((r.contenido && r.contenido.bloques) || []).forEach(function (b) { var n = bloque(b); if (n) app.appendChild(n); });
    var s = DATOS.material.filter(function (x) { return x.numero === r.sesion; })[0];
    if (s && r.respuestas && r.respuestas.length) respuestasGrupo(app, s, r.respuestas, r.envios);
    if (r.sobres.length) app.appendChild(sobres(r.sobres));
  }
  /* Respuestas validadas por el catequista: agrupadas por pregunta, sin saber de quién es cada una */
  function respuestasGrupo(cont, s, respuestas, envios) {
    var porP = {};
    respuestas.forEach(function (x) { (porP[x.pregunta] = porP[x.pregunta] || []).push(x.valor); });
    cont.appendChild(el("h2", { text: "Lo que respondimos" }));
    if (envios) cont.appendChild(el("div", { class: "cifras" }, [el("div", { class: "cifra" }, [el("b", { text: String(envios) }), el("span", { text: envios === 1 ? "joven respondió" : "jóvenes respondieron" })])]));
    var vf = s.preguntas.filter(function (p) { return p.tipo === "vf" && porP[p.id]; });
    if (vf.length) cont.appendChild(el("section", { class: "tarjeta" }, [el("b", { text: "Aciertos del grupo en el verdadero o falso" })].concat(vf.map(function (p) {
      var rs = porP[p.id]; return barraFila(p.enunciado, rs.filter(function (v) { return v === p.correcta; }).length, rs.length);
    }))));
    s.preguntas.filter(function (p) { return p.tipo !== "vf" && porP[p.id]; }).forEach(function (p) {
      cont.appendChild(el("section", { class: "tarjeta" }, [el("b", { text: p.enunciado }), el("ul", { class: "puntos" }, porP[p.id].map(function (v) { return el("li", { text: v }); }))]));
    });
  }
  function jovenResponder(num) {
    var s = DATOS.material.filter(function (x) { return String(x.numero) === String(num); })[0];
    cabecera("joven"); limpiar();
    if (!s || !abierta(s)) { app.appendChild(migas("#/joven", "← Inicio")); app.appendChild(el("p", { class: "vacio", text: "Las preguntas de esta sesión ya están cerradas." })); return; }
    app.appendChild(migas("#/joven/sesion/" + s.numero, "← Volver a la sesión"));
    app.appendChild(el("h1", { text: "Tus respuestas · Sesión " + s.numero }));
    app.appendChild(el("p", { text: "Son anónimas: nadie sabrá quién ha escrito cada respuesta. Después de la sesión, tu catequista las revisará y el grupo podrá leerlas, sin nombres. Contesta con sinceridad." }));
    var previas = null;
    try { previas = JSON.parse(leer(claveEnviado(s) + "_resp") || "null"); } catch (e) {}
    var envioPrevio = leer(claveEnviado(s) + "_envio");
    if (previas) app.appendChild(el("p", { class: "aviso-cat", text: "Ya enviaste tus respuestas. Tu catequista ha abierto la sesión: puedes cambiar lo que quieras y volver a enviarlas. Se sustituirán las anteriores." }));
    var resp = previas ? Object.assign({}, previas) : {}, cajasVF = {};
    var form = el("form");
    s.preguntas.forEach(function (p) {
      if (p.tipo === "vf") {
        var c = preguntaVF(p, false, function (v) { resp[p.id] = v; }); cajasVF[p.id] = c; form.appendChild(c);
        if (resp[p.id]) { var bt = c.querySelector('[data-v="' + resp[p.id] + '"]'); if (bt) bt.setAttribute("aria-pressed", "true"); }
      } else {
        var id = "p" + p.id, ta = el("textarea", { id: id, maxlength: "2000" });
        if (resp[p.id]) ta.value = resp[p.id];
        ta.addEventListener("input", function () { resp[p.id] = ta.value; });
        form.appendChild(el("div", { class: "pregunta tarjeta" }, [el("label", { for: id }, [p.enunciado, p.opcional ? el("span", { class: "opc", text: " (opcional)" }) : null]), ta]));
      }
    });
    var msg = el("p", { class: "error" });
    var boton = el("button", { class: "boton", type: "submit", text: previas ? "Volver a enviar mis respuestas" : "Enviar mis respuestas" });
    form.appendChild(msg); form.appendChild(boton);
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var faltan = s.preguntas.filter(function (p) { return !p.opcional && !(resp[p.id] && String(resp[p.id]).trim()); });
      if (faltan.length) { msg.textContent = "Te falta responder " + faltan.length + (faltan.length === 1 ? " pregunta." : " preguntas."); return; }
      boton.disabled = true; boton.textContent = "Enviando…"; msg.textContent = "";
      rpc("enviar_respuestas", { p_codigo: leer("confi_codigo"), p_sesion: s.id, p_respuestas: resp, p_envio: envioPrevio || null }).then(function (r) {
        guardar(claveEnviado(s), "1");
        guardar(claveEnviado(s) + "_resp", JSON.stringify(resp));
        if (r && r.envio) guardar(claveEnviado(s) + "_envio", r.envio);
        Object.keys(cajasVF).forEach(function (k) { cajasVF[k]._corregir(resp[k]); });
        form.querySelectorAll("textarea").forEach(function (t) { t.disabled = true; });
        boton.remove();
        form.insertBefore(el("div", { class: "tarjeta gracias" }, [el("b", { text: "¡Gracias! 🙌" }), el("p", { text: "Tus respuestas se han enviado. Abajo puedes ver las correcciones." })]), form.firstChild);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }).catch(function (e) {
        boton.disabled = false; boton.textContent = "Enviar mis respuestas";
        msg.textContent = /formulario_cerrado/.test(e.message) ? "Las preguntas de esta sesión ya están cerradas." : "No se ha podido enviar. Revisa tu conexión e inténtalo otra vez.";
      });
    });
    app.appendChild(form);
  }

  /* =====================================================================
     DEPARTAMENTO DEL CATEQUISTA
     ===================================================================== */
  function codCat() { return leerS("confi_cat"); }
  function recargarCat() { return cargarCat(codCat()); }
  function catInicio() {
    cabecera("cat"); limpiar();
    app.appendChild(el("span", { class: "etiqueta", text: "📋 Departamento del catequista" }));
    app.appendChild(el("h1", { text: "Hola, catequista" }));
    app.appendChild(el("p", { text: "Aquí tienes el guion de cada sesión, las orientaciones para el diálogo, el material que ven los jóvenes y sus respuestas." }));
    CAT.grupos.forEach(function (g) {
      app.appendChild(el("section", { class: "tarjeta" }, [
        el("span", { class: "etiqueta", text: "Grupo " + g.nombre }),
        el("p", { style: "margin:4px 0 0", text: g.sesion_abierta ? "🟢 Sesión " + g.sesion_abierta + " en curso: los jóvenes pueden responder." : "⚪ Ninguna sesión en curso. Entra en una sesión para iniciarla." })
      ]));
    });
    app.appendChild(el("h2", { text: "Sesiones" }));
    CAT.material.forEach(function (s) {
      var info = CAT.grupos.map(function (g) {
        var x = g.sesiones.filter(function (y) { return y.numero === s.numero; })[0] || {};
        return g.nombre + ": " + estadoSesion(g, s, x).texto + " · " + (x.envios || 0) + " respuestas" + (x.publicado ? " · enviadas a los jóvenes ✓" : "");
      }).join(" · ");
      app.appendChild(el("a", { class: "tarjeta", href: "#/catequista/sesion/" + s.numero + "/guion" }, [
        el("span", { class: "etiqueta", text: "Sesión " + s.numero }),
        el("h2", { text: s.titulo, style: "margin:2px 0 4px" }),
        el("div", { class: "fecha", text: info })
      ]));
    });
    var bHist = el("button", { class: "boton", type: "button", style: "margin-top:20px", text: "⬇ Descargar todo el histórico (Excel)" });
    bHist.addEventListener("click", descargarHistorico);
    app.appendChild(bHist);
    app.appendChild(el("p", { class: "fecha", text: "Todas las sesiones, todos los grupos, todas las respuestas y tus valoraciones en un solo archivo. Guárdalo de vez en cuando como copia de seguridad." }));
  }
  var PESTANAS = [["guion", "Guion"], ["dialogo", "Diálogo"], ["alumno", "Material del alumno"], ["respuestas", "Respuestas"], ["balance", "Balance"]];
  function catSesion(num, pest) {
    var s = CAT.material.filter(function (x) { return String(x.numero) === String(num); })[0];
    cabecera("cat"); limpiar();
    app.appendChild(migas("#/catequista", "← Departamento del catequista"));
    if (!s) { app.appendChild(el("p", { class: "vacio", text: "No encuentro esa sesión." })); return; }
    pest = pest || "guion";
    app.appendChild(el("span", { class: "etiqueta", text: "📋 Catequista · Sesión " + s.numero }));
    app.appendChild(el("h1", { text: s.titulo }));
    CAT.grupos.forEach(function (g) { app.appendChild(controlSesion(g, s)); });
    app.appendChild(el("nav", { class: "pestanas" }, PESTANAS.map(function (p) {
      return el("a", { href: "#/catequista/sesion/" + s.numero + "/" + p[0], class: p[0] === pest ? "activa" : null, text: p[1] });
    })));
    var cont = el("div");
    app.appendChild(cont);
    var m = s.catequista || {};
    if (pest === "guion") catGuion(cont, m);
    else if (pest === "dialogo") catDialogo(cont, m);
    else if (pest === "alumno") { cont.appendChild(el("p", { class: "aviso-cat", text: "Esto es lo que ven los jóvenes. El cuestionario con soluciones (al final) solo les aparece después de que valides y envíes las respuestas; durante la sesión responden en el formulario." })); materialAlumno(cont, s, CAT.clave_video); }
    else if (pest === "respuestas") catRespuestas(cont, s);
    else if (pest === "balance") catBalance(cont, s);
  }
  function catGuion(cont, m) {
    if (m.objetivo) cont.appendChild(el("section", { class: "tarjeta" }, [el("b", { text: "Objetivo" }), el("p", { text: m.objetivo, style: "margin:6px 0 0" }), m.duracion ? el("p", { class: "fecha", text: "Duración: " + m.duracion }) : null]));
    if (m.materiales && m.materiales.length) cont.appendChild(el("section", null, [el("h2", { text: "Material necesario" }), el("ul", { class: "puntos" }, m.materiales.map(function (x) { return el("li", { text: x }); }))]));
    if (m.guion && m.guion.length) {
      cont.appendChild(el("h2", { text: "Desarrollo de la sesión" }));
      m.guion.forEach(function (g) { cont.appendChild(el("section", { class: "tarjeta paso" }, [el("span", { class: "tiempo", text: g.tiempo }), el("b", { text: g.momento }), el("p", { text: g.desarrollo, style: "margin:6px 0 0" })])); });
    }
    if (m.notas && m.notas.length) cont.appendChild(el("section", { class: "tarjeta aviso" }, [el("b", { text: "Notas pastorales" }), el("ul", { class: "puntos" }, m.notas.map(function (x) { return el("li", { text: x }); }))]));
    if (!m.guion) cont.appendChild(el("p", { class: "vacio", text: "Esta sesión aún no tiene guion." }));
  }
  function catDialogo(cont, m) {
    cont.appendChild(el("p", { class: "fecha", text: "Los jóvenes ven estas preguntas en su material. Las orientaciones solo las ves tú: son pistas para acompañar, no respuestas únicas." }));
    (m.dialogo || []).forEach(function (g) {
      cont.appendChild(el("h2", { text: g.momento }));
      g.preguntas.forEach(function (p) {
        cont.appendChild(el("section", { class: "tarjeta" }, [
          el("b", { text: p.pregunta }),
          el("p", { class: "orientacion" }, [el("span", { class: "etiqueta", text: "Orientación" }), el("br"), p.orientacion]),
          p.apoyo ? el("p", { class: "fuente", text: "📖 " + p.apoyo }) : null
        ]));
      });
    });
    if (!m.dialogo || !m.dialogo.length) cont.appendChild(el("p", { class: "vacio", text: "Esta sesión aún no tiene preguntas para dialogar." }));
  }
  /* Estado de una sesión para un grupo: no iniciada, en curso, cerrada */
  function estadoSesion(g, s, x) {
    if (Number(g.sesion_abierta) === s.numero) return { clave: "curso", texto: "🟢 En curso" };
    if (x && (x.envios || x.publicado)) return { clave: "cerrada", texto: "🔒 Cerrada" };
    return { clave: "nueva", texto: "⚪ Sin iniciar" };
  }
  function datosGrupoSesion(g, s) { return g.sesiones.filter(function (y) { return y.numero === s.numero; })[0] || { envios: 0, respuestas: [] }; }
  function cambiarSesion(g, numero, boton, s, pest) {
    boton.disabled = true;
    rpc("catequista_abrir", { p_codigo: codCat(), p_grupo: g.nombre, p_numero: numero })
      .then(recargarCat).then(function () { catSesion(s.numero, pest); })
      .catch(function () { boton.disabled = false; boton.textContent = "✗ No se ha podido guardar. Reintentar"; });
  }
  function controlSesion(g, s) {
    var x = datosGrupoSesion(g, s), e = estadoSesion(g, s, x);
    var pest = (location.hash.split("/")[4]) || "guion";
    var caja = el("section", { class: "tarjeta control " + e.clave }, [
      el("span", { class: "etiqueta", text: "Grupo " + g.nombre }),
      el("p", { style: "margin:2px 0 8px", text: e.texto + (e.clave === "curso" ? ": los jóvenes ya pueden responder en su móvil." : e.clave === "cerrada" ? ": los jóvenes ya no pueden responder." : ": los jóvenes aún no pueden responder.") })
    ]);
    var otra = g.sesion_abierta && Number(g.sesion_abierta) !== s.numero;
    var b;
    if (e.clave === "curso") b = el("button", { class: "boton", type: "button", text: "🔒 Cerrar la sesión" });
    else b = el("button", { class: "boton oro", type: "button", text: e.clave === "cerrada" ? "🔓 Reabrir la sesión" : "▶ Iniciar la sesión" });
    b.addEventListener("click", function () { cambiarSesion(g, e.clave === "curso" ? null : s.numero, b, s, pest); });
    caja.appendChild(b);
    if (e.clave === "cerrada") caja.appendChild(el("p", { class: "fecha", style: "margin:6px 0 0", text: "Reabrir permite que los jóvenes corrijan o completen sus respuestas. Ciérrala de nuevo al terminar." }));
    if (otra && e.clave !== "curso") caja.appendChild(el("p", { class: "fecha", style: "margin:6px 0 0", text: "Ahora está en curso la Sesión " + g.sesion_abierta + ". Al iniciar esta, aquella se cerrará." }));
    return caja;
  }
  function catRespuestas(cont, s) {
    var bAct = el("button", { class: "boton", type: "button", style: "margin:12px 0 0", text: "🔄 Actualizar respuestas" });
    bAct.addEventListener("click", function () {
      bAct.disabled = true; bAct.textContent = "Actualizando…";
      recargarCat().then(function () { catSesion(s.numero, "respuestas"); }).catch(function () { bAct.disabled = false; bAct.textContent = "✗ Sin conexión. Reintentar"; });
    });
    cont.appendChild(bAct);
    CAT.grupos.forEach(function (g) {
      var x = datosGrupoSesion(g, s);
      cont.appendChild(el("h2", { text: "Grupo " + g.nombre }));
      var porWhatsapp = x.respuestas.some(function (r) { return r.origen === "whatsapp"; });
      cont.appendChild(el("p", { text: porWhatsapp ? "Respuestas recogidas por WhatsApp, antes de la app: " + x.envios + " envíos (el cuestionario y el reto se enviaron por separado). Están ocultas al grupo: los jóvenes ven el resumen que ya se publicó." : x.envios + (x.envios === 1 ? " joven ha respondido en la app." : " jóvenes han respondido en la app.") }));
      if (x.envios) cont.appendChild(el("p", { class: "fecha", text: "Revisa las respuestas antes de enviarlas. Puedes corregir una falta, quitar un nombre propio u ocultar una respuesta que no deba ver el grupo. Cada joven solo ve las respuestas agrupadas por pregunta, sin saber de quién son." }));
      var porP = {};
      x.respuestas.forEach(function (r) { (porP[r.pregunta] = porP[r.pregunta] || []).push(r); });
      s.preguntas.forEach(function (p) {
        var rs = porP[p.id] || [];
        var c = el("section", { class: "tarjeta" }, [el("b", { text: p.orden + ". " + p.enunciado })]);
        if (p.tipo === "vf") {
          var bien = rs.filter(function (r) { return r.valor === p.correcta; }).length;
          c.appendChild(rs.length ? barraFila("Aciertos (correcta: " + (p.correcta === "V" ? "verdadero" : "falso") + ")", bien, rs.length) : el("p", { class: "fecha", text: "Sin respuestas todavía." }));
        } else if (!rs.length) c.appendChild(el("p", { class: "fecha", text: "Sin respuestas todavía." }));
        else rs.forEach(function (r) { c.appendChild(filaRespuesta(r, s)); });
        cont.appendChild(c);
      });
      cont.appendChild(cajaEnviar(g, s, x));
      if (x.resumen && x.resumen.bloques && x.resumen.bloques.length) {
        cont.appendChild(el("h2", { text: "Resumen preparado de la sesión" }));
        x.resumen.bloques.forEach(function (b) { var n = bloque(b); if (n) cont.appendChild(n); });
      }
      if (x.respuestas.length) {
        var bajar = el("button", { class: "boton", type: "button", style: "margin-top:12px", text: "⬇ Descargar respuestas (Excel / CSV)" });
        bajar.addEventListener("click", function () { descargarCSV(g.nombre, s, x.respuestas); });
        cont.appendChild(bajar);
      }
    });
  }
  function filaRespuesta(r, s) {
    var fila = el("div", { class: "resp" + (r.oculta ? " oculta" : "") });
    var texto = el("div", { class: "valor" }, [el("span", { class: "envio", text: "#" + r.envio + (r.editado ? " · corregida" : "") + (r.oculta ? " · oculta al grupo" : "") }), el("br"), r.valor]);
    var bEd = el("button", { type: "button", class: "mini", text: "Editar" });
    var bOc = el("button", { type: "button", class: "mini", text: r.oculta ? "Mostrar" : "Ocultar" });
    var acciones = el("div", { class: "acciones" }, [bEd, bOc]);
    function guardarCambio(cuerpo, boton) {
      boton.disabled = true;
      rpc("catequista_respuesta", Object.assign({ p_codigo: codCat(), p_id: r.id }, cuerpo))
        .then(recargarCat).then(function () { var y = window.scrollY; catSesion(s.numero, "respuestas"); window.scrollTo(0, y); })
        .catch(function () { boton.disabled = false; boton.textContent = "✗ Error"; });
    }
    bOc.addEventListener("click", function () { guardarCambio({ p_oculta: !r.oculta }, bOc); });
    bEd.addEventListener("click", function () {
      var ta = el("textarea", { maxlength: "2000" }); ta.value = r.valor;
      var bG = el("button", { type: "button", class: "mini oro", text: "Guardar" });
      var bC = el("button", { type: "button", class: "mini", text: "Cancelar" });
      bG.addEventListener("click", function () { guardarCambio({ p_valor: ta.value }, bG); });
      bC.addEventListener("click", function () { fila.replaceWith(filaRespuesta(r, s)); });
      texto.replaceWith(el("div", { class: "valor" }, [ta])); acciones.replaceChildren(bG, bC); ta.focus();
    });
    fila.appendChild(texto); fila.appendChild(acciones);
    return fila;
  }
  function cajaEnviar(g, s, x) {
    var abierta = Number(g.sesion_abierta) === s.numero;
    var caja = el("section", { class: "tarjeta aviso" }, [el("b", { text: "Enviar las respuestas a los jóvenes" })]);
    var estado = el("p", { class: "fecha" });
    if (x.publicado) {
      caja.appendChild(el("p", { style: "margin:6px 0", text: "✓ Enviadas" + (x.enviado ? " el " + new Date(x.enviado).toLocaleString("es-ES", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "") + ". Los jóvenes las ven en «Lo que hemos compartido como grupo» y quedan guardadas como material del grupo. Si corriges u ocultas algo, el cambio les llega al momento." }));
      var bRet = el("button", { class: "boton", type: "button", text: "Retirar el envío" });
      bRet.addEventListener("click", function () {
        if (bRet.dataset.ok !== "1") { bRet.dataset.ok = "1"; bRet.textContent = "¿Seguro? Pulsa otra vez para retirarlas"; return; }
        bRet.disabled = true;
        rpc("catequista_publicar", { p_codigo: codCat(), p_grupo: g.nombre, p_numero: s.numero, p_publicado: false, p_contenido: null })
          .then(recargarCat).then(function () { catSesion(s.numero, "respuestas"); })
          .catch(function () { bRet.disabled = false; estado.textContent = "✗ No se ha podido retirar"; });
      });
      caja.appendChild(bRet);
    } else {
      caja.appendChild(el("p", { style: "margin:6px 0", text: "Cuando hayas revisado todas las respuestas, dalas por válidas y envíalas. Los jóvenes podrán verlas siempre, y quedarán como material de este grupo." }));
      if (abierta) caja.appendChild(el("p", { class: "fecha", text: "La sesión sigue en curso: lo normal es cerrarla antes de enviar." }));
      var bEnv = el("button", { class: "boton oro", type: "button", text: "✅ Validar y enviar respuestas" });
      if (!x.envios && !x.resumen) bEnv.disabled = true;
      bEnv.addEventListener("click", function () {
        if (bEnv.dataset.ok !== "1") { bEnv.dataset.ok = "1"; bEnv.textContent = "¿Las has revisado todas? Pulsa otra vez para enviar"; return; }
        bEnv.disabled = true; bEnv.textContent = "Enviando…";
        rpc("catequista_publicar", { p_codigo: codCat(), p_grupo: g.nombre, p_numero: s.numero, p_publicado: true, p_contenido: null })
          .then(recargarCat).then(function () { catSesion(s.numero, "respuestas"); })
          .catch(function () { bEnv.disabled = false; bEnv.textContent = "✅ Validar y enviar respuestas"; estado.textContent = "✗ No se ha podido enviar"; });
      });
      caja.appendChild(bEnv);
    }
    caja.appendChild(estado);
    return caja;
  }
  /* ---------- Balance: lo que ha llegado a los jóvenes, comparando grupos y años ---------- */
  function nombreGrupo(g) { return g.nombre + (g.curso ? " (" + g.curso + ")" : ""); }
  function fechaCorta(f) { return f ? new Date(String(f).length === 10 ? f + "T12:00:00" : f).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" }) : ""; }
  function catBalance(cont, s) {
    cont.appendChild(el("p", { class: "fecha", text: "El material dice lo que queremos transmitir; las respuestas dicen lo que ha llegado. Aquí se guarda todo, de todos los grupos y años, para valorar y mejorar el material. Los jóvenes no ven esta pestaña." }));
    /* 1. Valoración del catequista */
    cont.appendChild(el("h2", { text: "Valoración del catequista" }));
    CAT.grupos.forEach(function (g) {
      var x = datosGrupoSesion(g, s), v = x.valoracion || {};
      var ta = el("textarea", { maxlength: "10000", placeholder: "¿Qué funcionó? ¿Qué no se entendió? ¿Qué te sorprendió de los jóvenes? ¿Qué cambiarías del material para el próximo grupo?", style: "min-height:140px" });
      ta.value = v.texto || "";
      var estado = el("span", { class: "fecha", text: v.actualizado ? " Guardada el " + new Date(v.actualizado).toLocaleString("es-ES", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "" });
      var b = el("button", { class: "boton oro", type: "button", style: "margin-top:8px", text: "Guardar valoración" });
      b.addEventListener("click", function () {
        b.disabled = true; estado.textContent = " Guardando…";
        rpc("catequista_valorar", { p_codigo: codCat(), p_grupo: g.nombre, p_numero: s.numero, p_texto: ta.value })
          .then(recargarCat).then(function () { b.disabled = false; estado.textContent = " ✓ Guardada"; })
          .catch(function () { b.disabled = false; estado.textContent = " ✗ No se ha podido guardar. Revisa la conexión"; });
      });
      cont.appendChild(el("section", { class: "tarjeta" }, [el("span", { class: "etiqueta", text: "Grupo " + nombreGrupo(g) }), ta, b, estado]));
    });
    /* 2. Participación y aciertos por grupo */
    cont.appendChild(el("h2", { text: "¿Ha llegado el mensaje?" }));
    var vfs = s.preguntas.filter(function (p) { return p.tipo === "vf"; });
    CAT.grupos.forEach(function (g) {
      var x = datosGrupoSesion(g, s);
      var rvf = x.respuestas.filter(function (r) { return vfs.some(function (p) { return p.id === r.pregunta; }); });
      var bien = rvf.filter(function (r) { return vfs.some(function (p) { return p.id === r.pregunta && p.correcta === r.valor; }); }).length;
      var wa = x.respuestas.some(function (r) { return r.origen === "whatsapp"; });
      var items = [{ valor: String(x.envios || 0), texto: wa ? "envíos por WhatsApp (cuestionario y reto por separado)" : "respondieron en la app" }];
      if (rvf.length) items.push({ valor: Math.round(bien / rvf.length * 100) + " %", texto: "de aciertos en el verdadero o falso" });
      cont.appendChild(el("section", { class: "tarjeta" }, [
        el("span", { class: "etiqueta", text: "Grupo " + nombreGrupo(g) + (x.fecha ? " · " + fechaCorta(x.fecha) : "") }),
        el("div", { class: "cifras", style: "margin-top:6px" }, items.map(function (i) { return el("div", { class: "cifra" }, [el("b", { text: i.valor }), el("span", { text: i.texto })]); }))
      ]));
      if ((wa || !x.envios) && x.resumen && x.resumen.bloques && x.resumen.bloques.length) {
        var det = el("details", { class: "tarjeta" }, [el("summary", { text: "Esta sesión se trabajó antes de la app (por WhatsApp). Ver el resumen que se hizo" })]);
        x.resumen.bloques.forEach(function (b) { var n = bloque(b); if (n) det.appendChild(n); });
        cont.appendChild(det);
      }
    });
    /* 3. Pregunta a pregunta */
    cont.appendChild(el("h2", { text: "Pregunta a pregunta" }));
    s.preguntas.forEach(function (p) {
      var c = el("section", { class: "tarjeta" }, [el("b", { text: p.orden + ". " + p.enunciado })]);
      if (p.tipo === "vf") c.appendChild(el("p", { class: "fecha", style: "margin:4px 0", text: "Correcta: " + (p.correcta === "V" ? "verdadero" : "falso") + (p.explicacion ? ". " + p.explicacion : "") }));
      var hay = false;
      CAT.grupos.forEach(function (g) {
        var rs = datosGrupoSesion(g, s).respuestas.filter(function (r) { return r.pregunta === p.id; });
        if (!rs.length) return;
        hay = true;
        if (p.tipo === "vf") c.appendChild(barraFila(nombreGrupo(g), rs.filter(function (r) { return r.valor === p.correcta; }).length, rs.length));
        else c.appendChild(el("div", { style: "margin-top:10px" }, [el("span", { class: "etiqueta", text: nombreGrupo(g) + " · " + rs.length + (rs.length === 1 ? " respuesta" : " respuestas") }),
          el("ul", { class: "puntos" }, rs.map(function (r) { return el("li", { text: r.valor + (r.oculta && r.origen === "app" ? "  (oculta al grupo)" : "") }); }))]));
      });
      if (!hay) c.appendChild(el("p", { class: "fecha", text: "Sin respuestas registradas todavía." }));
      cont.appendChild(c);
    });
  }
  /* Excel con todo el histórico: todas las sesiones, todos los grupos, respuestas y valoraciones */
  function descargarHistorico() {
    var filas = [["grupo", "curso", "sesion", "titulo", "fecha", "n_pregunta", "pregunta", "tipo", "respuesta", "correcta", "acierto", "oculta_al_grupo", "corregida", "origen"]];
    CAT.grupos.forEach(function (g) {
      CAT.material.forEach(function (s) {
        var x = datosGrupoSesion(g, s);
        var pre = {}; s.preguntas.forEach(function (p) { pre[p.id] = p; });
        x.respuestas.forEach(function (r) {
          var p = pre[r.pregunta] || {};
          filas.push([g.nombre, g.curso || "", s.numero, s.titulo, String(r.hora || "").slice(0, 10), p.orden || "", p.enunciado || "", p.tipo === "vf" ? "verdadero/falso" : "abierta",
            r.valor, p.tipo === "vf" ? (p.correcta === "V" ? "V" : "F") : "", p.tipo === "vf" ? (r.valor === p.correcta ? "sí" : "no") : "", r.oculta ? "sí" : "", r.editado ? "sí" : "", r.origen || "app"]);
        });
        if (x.valoracion && x.valoracion.texto) filas.push([g.nombre, g.curso || "", s.numero, s.titulo, String(x.valoracion.actualizado || "").slice(0, 10), "", "VALORACIÓN DEL CATEQUISTA", "valoración", x.valoracion.texto, "", "", "", "", "catequista"]);
      });
    });
    var txt = "﻿" + filas.map(function (f) { return f.map(function (v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; }).join(";"); }).join("\r\n");
    var hoy = new Date().toISOString().slice(0, 10);
    var a = el("a", { href: URL.createObjectURL(new Blob([txt], { type: "text/csv;charset=utf-8" })), download: "CONFI_historico_" + hoy + ".csv" });
    document.body.appendChild(a); a.click(); a.remove();
  }
  function descargarCSV(grupo, s, respuestas) {
    var enun = {}; s.preguntas.forEach(function (p) { enun[p.id] = [p.orden, p.enunciado]; });
    var filas = [["grupo", "sesion", "pregunta", "enunciado", "envio", "respuesta", "hora", "oculta"]].concat(respuestas.map(function (r) {
      var e = enun[r.pregunta] || ["", ""]; return [grupo, s.numero, e[0], e[1], r.envio, r.valor, r.hora, r.oculta ? "sí" : ""];
    }));
    var txt = "﻿" + filas.map(function (f) { return f.map(function (v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; }).join(";"); }).join("\r\n");
    var a = el("a", { href: URL.createObjectURL(new Blob([txt], { type: "text/csv;charset=utf-8" })), download: grupo + "_sesion" + s.numero + "_respuestas.csv" });
    document.body.appendChild(a); a.click(); a.remove();
  }

  /* ---------- rutas ---------- */
  function cargando() { app.innerHTML = '<p class="cargando">Cargando…</p>'; }
  function router() {
    var h = location.hash.replace(/^#\/?/, "").split("/");
    if (h[0] === "panel") { location.hash = "#/catequista"; return; }
    if (h[0] === "catequista") {
      if (h[1] === "entrar") return pantallaCodigo("cat");
      if (!CAT) {
        if (!codCat()) return pantallaCodigo("cat");
        cargando();
        return cargarCat(codCat()).then(router).catch(function (e) { borrarS("confi_cat"); pantallaCodigo("cat", /codigo_incorrecto/.test(e.message) ? "El código ha cambiado." : "No se ha podido conectar."); });
      }
      if (h[1] === "sesion") return catSesion(h[2], h[3]);
      return catInicio();
    }
    if (h[0] === "joven" || (h[0] === "" && leer("confi_codigo"))) {
      if (h[1] === "entrar") return pantallaCodigo("joven");
      if (!DATOS) {
        if (!leer("confi_codigo")) return pantallaCodigo("joven");
        cargando();
        return cargarJoven(leer("confi_codigo")).then(router).catch(function (e) { if (/codigo_incorrecto/.test(e.message)) { borrar("confi_codigo"); pantallaCodigo("joven", "El código ha cambiado. Pídeselo a tu catequista."); } else pantallaCodigo("joven", "No se ha podido conectar. Revisa tu conexión."); });
      }
      if (h[0] === "" ) { location.hash = "#/joven"; return; }
      if (h[1] === "sesion" && h[3] === "responder") return jovenResponder(h[2]);
      if (h[1] === "sesion") return jovenSesion(h[2]);
      if (h[1] === "grupo") return jovenGrupo(h[2]);
      return jovenInicio();
    }
    /* compatibilidad con enlaces antiguos */
    if (h[0] === "sesion" || h[0] === "respuestas") { location.hash = "#/joven/" + (h[0] === "respuestas" ? "grupo" : "sesion") + "/" + h.slice(1).join("/"); return; }
    pantallaEntrada();
  }
  window.addEventListener("hashchange", router);
  router();
})();
