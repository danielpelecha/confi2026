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
      case "dialogo": return el("section", null, [t, b.texto ? el("p", { class: "fecha", text: b.texto }) : null].concat(b.grupos.map(function (g) {
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
    if (s.video) cont.appendChild(bloqueVideo(s.video, clave));
    ((s.contenido && s.contenido.bloques) || []).forEach(function (b) { var n = bloque(b); if (n) cont.appendChild(n); });
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
    if (ab && !leer(claveEnviado(ab))) app.appendChild(el("a", { class: "boton oro", href: "#/joven/sesion/" + ab.numero + "/responder", style: "text-align:center;text-decoration:none;margin:12px 0", text: "✍️  Responder a las preguntas de la Sesión " + ab.numero }));
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
    var boton = abierta(s) ? el("a", { class: "boton oro", href: "#/joven/sesion/" + s.numero + "/responder", style: "text-align:center;text-decoration:none;margin:8px 0 16px", text: leer(claveEnviado(s)) ? "Ya has respondido ✓ (ver de nuevo)" : "✍️  Responder a las preguntas de hoy" }) : null;
    materialAlumno(app, s, DATOS.clave_video, { botonResponder: boton, ocultarActividades: abierta(s) });
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
    if (r.sobres.length) app.appendChild(sobres(r.sobres));
  }
  function jovenResponder(num) {
    var s = DATOS.material.filter(function (x) { return String(x.numero) === String(num); })[0];
    cabecera("joven"); limpiar();
    if (!s || !abierta(s)) { app.appendChild(migas("#/joven", "← Inicio")); app.appendChild(el("p", { class: "vacio", text: "Las preguntas de esta sesión ya están cerradas." })); return; }
    app.appendChild(migas("#/joven/sesion/" + s.numero, "← Volver a la sesión"));
    app.appendChild(el("h1", { text: "Tus respuestas · Sesión " + s.numero }));
    app.appendChild(el("p", { text: "Son anónimas: nadie sabrá quién ha escrito cada respuesta. Contesta con sinceridad." }));
    var resp = {}, cajasVF = {};
    var form = el("form");
    s.preguntas.forEach(function (p) {
      if (p.tipo === "vf") { var c = preguntaVF(p, false, function (v) { resp[p.id] = v; }); cajasVF[p.id] = c; form.appendChild(c); }
      else {
        var id = "p" + p.id, ta = el("textarea", { id: id, maxlength: "2000" });
        ta.addEventListener("input", function () { resp[p.id] = ta.value; });
        form.appendChild(el("div", { class: "pregunta tarjeta" }, [el("label", { for: id }, [p.enunciado, p.opcional ? el("span", { class: "opc", text: " (opcional)" }) : null]), ta]));
      }
    });
    var msg = el("p", { class: "error" });
    var boton = el("button", { class: "boton", type: "submit", text: "Enviar mis respuestas" });
    form.appendChild(msg); form.appendChild(boton);
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var faltan = s.preguntas.filter(function (p) { return !p.opcional && !(resp[p.id] && String(resp[p.id]).trim()); });
      if (faltan.length) { msg.textContent = "Te falta responder " + faltan.length + (faltan.length === 1 ? " pregunta." : " preguntas."); return; }
      boton.disabled = true; boton.textContent = "Enviando…"; msg.textContent = "";
      rpc("enviar_respuestas", { p_codigo: leer("confi_codigo"), p_sesion: s.id, p_respuestas: resp }).then(function () {
        guardar(claveEnviado(s), "1");
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
      var sel = el("select", { "aria-label": "Sesión con preguntas abiertas" }, [el("option", { value: "", text: "Ninguna (preguntas cerradas)" })].concat(CAT.material.map(function (s) {
        var o = el("option", { value: String(s.numero), text: "Sesión " + s.numero + " · " + s.titulo }); if (Number(g.sesion_abierta) === s.numero) o.selected = true; return o;
      })));
      var estado = el("span", { class: "fecha" });
      sel.addEventListener("change", function () {
        estado.textContent = " Guardando…";
        rpc("catequista_abrir", { p_codigo: codCat(), p_grupo: g.nombre, p_numero: sel.value ? Number(sel.value) : null })
          .then(function () { estado.textContent = " ✓ Guardado"; return recargarCat(); })
          .catch(function () { estado.textContent = " ✗ No se ha podido guardar"; });
      });
      app.appendChild(el("section", { class: "tarjeta" }, [
        el("span", { class: "etiqueta", text: "Grupo " + g.nombre }),
        el("p", { text: "Preguntas abiertas para los jóvenes en:", style: "margin:4px 0 6px" }), sel, estado
      ]));
    });
    app.appendChild(el("h2", { text: "Sesiones" }));
    CAT.material.forEach(function (s) {
      var info = CAT.grupos.map(function (g) {
        var x = g.sesiones.filter(function (y) { return y.numero === s.numero; })[0] || {};
        return g.nombre + ": " + (x.envios || 0) + " respuestas · " + (x.publicado ? "resumen publicado" : "resumen sin publicar");
      }).join(" · ");
      app.appendChild(el("a", { class: "tarjeta", href: "#/catequista/sesion/" + s.numero + "/guion" }, [
        el("span", { class: "etiqueta", text: "Sesión " + s.numero }),
        el("h2", { text: s.titulo, style: "margin:2px 0 4px" }),
        el("div", { class: "fecha", text: info })
      ]));
    });
  }
  var PESTANAS = [["guion", "Guion"], ["dialogo", "Diálogo"], ["alumno", "Material del alumno"], ["respuestas", "Respuestas"]];
  function catSesion(num, pest) {
    var s = CAT.material.filter(function (x) { return String(x.numero) === String(num); })[0];
    cabecera("cat"); limpiar();
    app.appendChild(migas("#/catequista", "← Departamento del catequista"));
    if (!s) { app.appendChild(el("p", { class: "vacio", text: "No encuentro esa sesión." })); return; }
    pest = pest || "guion";
    app.appendChild(el("span", { class: "etiqueta", text: "📋 Catequista · Sesión " + s.numero }));
    app.appendChild(el("h1", { text: s.titulo }));
    app.appendChild(el("nav", { class: "pestanas" }, PESTANAS.map(function (p) {
      return el("a", { href: "#/catequista/sesion/" + s.numero + "/" + p[0], class: p[0] === pest ? "activa" : null, text: p[1] });
    })));
    var cont = el("div");
    app.appendChild(cont);
    var m = s.catequista || {};
    if (pest === "guion") catGuion(cont, m);
    else if (pest === "dialogo") catDialogo(cont, m);
    else if (pest === "alumno") { cont.appendChild(el("p", { class: "aviso-cat", text: "Esto es exactamente lo que ven los jóvenes en su departamento." })); materialAlumno(cont, s, CAT.clave_video); }
    else if (pest === "respuestas") catRespuestas(cont, s);
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
  function catRespuestas(cont, s) {
    CAT.grupos.forEach(function (g) {
      var x = g.sesiones.filter(function (y) { return y.numero === s.numero; })[0] || { envios: 0, respuestas: [] };
      cont.appendChild(el("h2", { text: "Grupo " + g.nombre }));
      cont.appendChild(el("p", { text: x.envios + (x.envios === 1 ? " joven ha respondido en la app." : " jóvenes han respondido en la app.") + (Number(g.sesion_abierta) === s.numero ? " · Preguntas ABIERTAS" : " · Preguntas cerradas") }));
      var porP = {};
      x.respuestas.forEach(function (r) { (porP[r.pregunta] = porP[r.pregunta] || []).push(r); });
      var seleccion = {};
      s.preguntas.forEach(function (p) {
        var rs = porP[p.id] || [];
        var c = el("section", { class: "tarjeta" }, [el("b", { text: p.orden + ". " + p.enunciado })]);
        if (p.tipo === "vf") {
          var bien = rs.filter(function (r) { return r.valor === p.correcta; }).length;
          c.appendChild(rs.length ? barraFila("Aciertos (correcta: " + (p.correcta === "V" ? "verdadero" : "falso") + ")", bien, rs.length) : el("p", { class: "fecha", text: "Sin respuestas todavía." }));
        } else if (!rs.length) c.appendChild(el("p", { class: "fecha", text: "Sin respuestas todavía." }));
        else {
          c.appendChild(el("p", { class: "fecha", text: "Marca las respuestas que quieras incluir en el resumen para el grupo." }));
          rs.forEach(function (r, i) {
            var id = "s" + p.id + "_" + i, chk = el("input", { type: "checkbox", id: id });
            chk.addEventListener("change", function () { seleccion[p.id] = seleccion[p.id] || {}; seleccion[p.id][i] = chk.checked ? r.valor : null; });
            c.appendChild(el("div", { class: "resp" }, [chk, el("label", { for: id }, [el("span", { class: "envio", text: "#" + r.envio + " " }), r.valor])]));
          });
        }
        cont.appendChild(c);
      });
      /* Publicación */
      var estado = el("span", { class: "fecha" });
      var pub = el("section", { class: "tarjeta aviso" }, [el("b", { text: "Resumen para los jóvenes" }),
        el("p", { text: x.publicado ? "✓ Publicado: los jóvenes lo ven en «Lo que hemos compartido como grupo»." : "Sin publicar: los jóvenes no ven nada de esta sesión.", style: "margin:6px 0" })]);
      if (x.envios) {
        var bPub = el("button", { class: "boton oro", type: "button", text: x.publicado ? "Actualizar el resumen publicado" : "Publicar resumen al grupo" });
        bPub.addEventListener("click", function () {
          bPub.disabled = true; estado.textContent = " Publicando…";
          rpc("catequista_publicar", { p_codigo: codCat(), p_grupo: g.nombre, p_numero: s.numero, p_publicado: true, p_contenido: construirResumen(s, x, porP, seleccion) })
            .then(function () { return recargarCat(); }).then(function () { catSesion(s.numero, "respuestas"); })
            .catch(function () { bPub.disabled = false; estado.textContent = " ✗ No se ha podido publicar"; });
        });
        pub.appendChild(bPub);
      }
      if (x.publicado || x.resumen) {
        var bTog = el("button", { class: "boton", type: "button", style: "margin-top:8px", text: x.publicado ? "Ocultar el resumen a los jóvenes" : "Publicar el resumen guardado" });
        bTog.addEventListener("click", function () {
          bTog.disabled = true;
          rpc("catequista_publicar", { p_codigo: codCat(), p_grupo: g.nombre, p_numero: s.numero, p_publicado: !x.publicado, p_contenido: null })
            .then(function () { return recargarCat(); }).then(function () { catSesion(s.numero, "respuestas"); })
            .catch(function () { bTog.disabled = false; estado.textContent = " ✗ Error"; });
        });
        pub.appendChild(bTog);
      }
      pub.appendChild(estado);
      cont.appendChild(pub);
      if (x.resumen && x.resumen.bloques) {
        cont.appendChild(el("h2", { text: "Vista previa del resumen" }));
        x.resumen.bloques.forEach(function (b) { var n = bloque(b); if (n) cont.appendChild(n); });
      }
      if (x.respuestas.length) {
        var bajar = el("button", { class: "boton", type: "button", style: "margin-top:12px", text: "⬇ Descargar respuestas (Excel / CSV)" });
        bajar.addEventListener("click", function () { descargarCSV(g.nombre, s, x.respuestas); });
        cont.appendChild(bajar);
      }
    });
  }
  function construirResumen(s, x, porP, seleccion) {
    var bloques = [{ tipo: "cifras", titulo: "Participación", items: [{ valor: String(x.envios), texto: x.envios === 1 ? "joven ha respondido" : "jóvenes han respondido" }] }];
    var vf = s.preguntas.filter(function (p) { return p.tipo === "vf" && (porP[p.id] || []).length; });
    if (vf.length) bloques.push({ tipo: "barras", titulo: "Aciertos del grupo en el cuestionario", items: vf.map(function (p) {
      var rs = porP[p.id]; return { texto: p.enunciado, valor: rs.filter(function (r) { return r.valor === p.correcta; }).length, total: rs.length };
    }) });
    s.preguntas.filter(function (p) { return p.tipo !== "vf"; }).forEach(function (p) {
      var items = Object.keys(seleccion[p.id] || {}).map(function (k) { return seleccion[p.id][k]; }).filter(Boolean);
      if (items.length) bloques.push({ tipo: "lista", titulo: p.enunciado, items: items });
    });
    return { bloques: bloques };
  }
  function descargarCSV(grupo, s, respuestas) {
    var enun = {}; s.preguntas.forEach(function (p) { enun[p.id] = [p.orden, p.enunciado]; });
    var filas = [["grupo", "sesion", "pregunta", "enunciado", "envio", "respuesta", "hora"]].concat(respuestas.map(function (r) {
      var e = enun[r.pregunta] || ["", ""]; return [grupo, s.numero, e[0], e[1], r.envio, r.valor, r.hora];
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
