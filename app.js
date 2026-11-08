/* CONFI2026 · Parroquia Santiago Apóstol
   App de catequesis de Confirmación. Sin dependencias: HTML + JS + Supabase (RPC).
   Ver docs/ARQUITECTURA.md */
(function () {
  "use strict";
  var C = window.CONFI;
  var app = document.getElementById("app");
  var btnSalir = document.getElementById("salir");
  var DATOS = null;
  var videosCache = {};

  /* ---------- utilidades ---------- */
  function guardar(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function leer(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function borrar(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function el(tag, attrs, hijos) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) {
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
        if (!r.ok) { var e = new Error((j && j.message) || ("Error " + r.status)); e.codigo = j && j.message; throw e; }
        return j;
      });
    });
  }

  /* ---------- acceso ---------- */
  function pantallaAcceso(error) {
    btnSalir.hidden = true;
    limpiar();
    var input = el("input", { type: "text", autocomplete: "off", autocapitalize: "characters", placeholder: "Código del grupo", "aria-label": "Código del grupo" });
    var msg = el("p", { class: "error", text: error || "" });
    var boton = el("button", { class: "boton oro", type: "submit", text: "Entrar" });
    var form = el("form", { class: "acceso" }, [
      el("div", { class: "logo", text: "✝" }),
      el("h1", { text: "Catequesis de Confirmación" }),
      el("p", { class: "lema", text: "Parroquia Santiago Apóstol · La Pobla de Vallbona" }),
      input, msg, boton
    ]);
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var cod = input.value.trim().toUpperCase();
      if (!cod) return;
      boton.disabled = true; boton.textContent = "Entrando…"; msg.textContent = "";
      cargar(cod).then(function () {
        guardar("confi_codigo", cod); router();
      }).catch(function (e) {
        boton.disabled = false; boton.textContent = "Entrar";
        msg.textContent = /codigo_incorrecto/.test(e.message) ? "Código incorrecto. Pídeselo a tu catequista." : "No se ha podido conectar. Revisa tu conexión e inténtalo de nuevo.";
      });
    });
    app.appendChild(form);
    input.focus();
  }
  function cargar(cod) {
    return rpc("app_datos", { p_codigo: cod }).then(function (d) { DATOS = d; return d; });
  }
  btnSalir.addEventListener("click", function () { borrar("confi_codigo"); DATOS = null; location.hash = "#/"; pantallaAcceso(); });

  /* ---------- inicio ---------- */
  function abierta(s) { return DATOS.sesion_abierta != null && Number(DATOS.sesion_abierta) === Number(s.numero); }
  function pantallaInicio() {
    limpiar();
    app.appendChild(el("h1", { text: "Hola 👋" }));
    app.appendChild(el("p", { text: "Aquí tienes el material de cada sesión de la catequesis y, aparte, las respuestas de tu grupo." }));
    var abiertaS = DATOS.material.filter(abierta)[0];
    if (abiertaS && !leer("confi_enviado_" + DATOS.grupo + "_" + abiertaS.id)) {
      app.appendChild(el("a", { class: "boton oro", href: "#/sesion/" + abiertaS.numero + "/responder", style: "text-align:center;text-decoration:none;margin:12px 0", text: "✍️  Responder a las preguntas de la Sesión " + abiertaS.numero }));
    }
    app.appendChild(el("h2", { text: "📘 Material de catequesis" }));
    var ses = DATOS.material.slice().sort(function (a, b) { return a.numero - b.numero; });
    if (!ses.length) app.appendChild(el("p", { class: "vacio", text: "Todavía no hay sesiones." }));
    ses.forEach(function (s) {
      app.appendChild(el("a", { class: "tarjeta", href: "#/sesion/" + s.numero }, [
        el("span", { class: "etiqueta", text: "Sesión " + s.numero }),
        abierta(s) ? el("span", { class: "nueva", text: "Hoy" }) : null,
        el("h2", { text: s.titulo, style: "margin:2px 0 4px" }),
        s.contenido && s.contenido.objetivo ? el("div", { class: "fecha", text: s.contenido.objetivo }) : null
      ]));
    });
    app.appendChild(el("h2", { text: "📊 Respuestas del grupo " + DATOS.grupo }));
    var res = DATOS.resultados.slice().sort(function (a, b) { return a.sesion - b.sesion; });
    if (!res.length) app.appendChild(el("p", { class: "fecha", text: "Todavía no hay respuestas de tu grupo." }));
    res.forEach(function (r) {
      app.appendChild(el("a", { class: "tarjeta resultado", href: "#/respuestas/" + r.sesion }, [
        el("span", { class: "etiqueta", text: "Sesión " + r.sesion + (r.fecha ? " · " + fechaBonita(r.fecha) : "") }),
        el("h2", { text: r.titulo, style: "margin:2px 0 4px" }),
        el("div", { class: "fecha", text: "Lo que respondió el grupo" })
      ]));
    });
  }

  /* ---------- vídeo cifrado ---------- */
  function b64aBytes(b64) { var s = atob(b64), a = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }
  function bloqueVideo(v) {
    var caja = el("div", { class: "video" });
    if (videosCache[v.carpeta]) { mostrarVideo(caja, videosCache[v.carpeta]); return caja; }
    var barra = el("div", { class: "barra" }, [el("i")]);
    var estado = el("div", { style: "font-size:14px;margin-top:8px;opacity:.85" });
    var play = el("button", { class: "play", text: "▶  Ver el vídeo" + (v.duracion ? " (" + v.duracion + ")" : "") });
    var dentro = el("div", null, [play, estado]);
    caja.appendChild(dentro);
    play.addEventListener("click", function () {
      play.disabled = true; play.textContent = "Preparando el vídeo…"; dentro.appendChild(barra);
      descargarVideo(v, function (p) { barra.firstChild.style.width = Math.round(p * 100) + "%"; })
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
  function descargarVideo(v, progreso) {
    var info = v.carpeta + "/info.json";
    return Promise.all([
      crypto.subtle.importKey("raw", b64aBytes(DATOS.clave_video), "AES-GCM", false, ["decrypt"]),
      fetch(info).then(function (r) { if (!r.ok) throw new Error("info"); return r.json(); })
    ]).then(function (res) {
      var clave = res[0], meta = res[1], partes = [], hechas = 0;
      var tareas = [];
      for (var i = 0; i < meta.partes; i++) (function (i) {
        tareas.push(fetch(v.carpeta + "/" + String(i).padStart(3, "0") + ".bin")
          .then(function (r) { if (!r.ok) throw new Error("parte"); return r.arrayBuffer(); })
          .then(function (buf) {
            return crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(buf, 0, 12) }, clave, new Uint8Array(buf, 12));
          })
          .then(function (plano) { partes[i] = plano; hechas++; progreso(hechas / meta.partes); }));
      })(i);
      return Promise.all(tareas).then(function () {
        return URL.createObjectURL(new Blob(partes, { type: meta.tipo || "video/mp4" }));
      });
    });
  }

  /* ---------- bloques de contenido ---------- */
  function bloque(b) {
    var t = b.titulo ? el("h2", { text: b.titulo }) : null;
    switch (b.tipo) {
      case "texto": return el("section", null, [t, el("p", { text: b.texto })]);
      case "aviso": return el("section", { class: "tarjeta aviso" }, [el("b", { text: b.titulo }), el("p", { text: b.texto, style: "margin:6px 0 0" })]);
      case "cita": return el("section", { class: "tarjeta cita" }, [el("b", { text: b.titulo }), el("blockquote", { text: b.texto }), el("cite", { text: b.referencia })]);
      case "cifras": return el("section", null, [t, el("div", { class: "cifras" }, b.items.map(function (i) { return el("div", { class: "cifra" }, [el("b", { text: i.valor }), el("span", { text: i.texto })]); }))]);
      case "barras": return el("section", { class: "tarjeta" }, [el("b", { text: b.titulo }), el("div", null, b.items.map(function (i) {
        return el("div", { class: "fila" }, [el("div", { class: "txt" }, [el("span", { text: i.texto }), el("b", { text: i.valor + " de " + b.total })]), el("div", { class: "pista" }, [el("i", { style: "width:" + Math.round(i.valor / b.total * 100) + "%" })])]);
      }))]);
      case "nube": return el("section", null, [t, el("div", { class: "nube" }, b.items.map(function (w) { return el("span", { text: w }); }))]);
      case "lista": return el("section", null, [t, b.texto ? el("p", { class: "fecha", text: b.texto }) : null, el("ul", { class: "puntos" }, b.items.map(function (w) { return el("li", { text: w }); }))]);
      default: return null;
    }
  }

  /* ---------- sesión ---------- */
  function pantallaSesion(num) {
    var s = DATOS.material.filter(function (x) { return String(x.numero) === String(num); })[0];
    limpiar();
    if (!s) { app.appendChild(el("p", { class: "vacio", text: "No encuentro esa sesión." })); return; }
    app.appendChild(el("p", { class: "migas" }, [el("a", { href: "#/", text: "← Inicio" })]));
    app.appendChild(el("span", { class: "etiqueta", text: "📘 Material · Sesión " + s.numero }));
    app.appendChild(el("h1", { text: s.titulo }));
    if (s.contenido && s.contenido.lema) app.appendChild(el("p", { class: "lema", text: s.contenido.lema }));
    if (s.contenido && s.contenido.objetivo) app.appendChild(el("section", { class: "tarjeta" }, [el("b", { text: "Objetivo" }), el("p", { text: s.contenido.objetivo, style: "margin:6px 0 0" })]));
    if (abierta(s)) app.appendChild(el("a", { class: "boton oro", href: "#/sesion/" + s.numero + "/responder", style: "text-align:center;text-decoration:none;margin:8px 0 16px", text: leer("confi_enviado_" + DATOS.grupo + "_" + s.id) ? "Ya has respondido ✓ (ver de nuevo)" : "✍️  Responder a las preguntas de hoy" }));
    if (s.video) app.appendChild(bloqueVideo(s.video));
    ((s.contenido && s.contenido.bloques) || []).forEach(function (b) { var n = bloque(b); if (n) app.appendChild(n); });
    if (!abierta(s) && s.preguntas.length) app.appendChild(actividades(s));
  }
  function actividades(s) {
    var sec = el("section", null, [el("h2", { text: "Actividades de la sesión" })]);
    var vf = s.preguntas.filter(function (p) { return p.tipo === "vf"; });
    var txt = s.preguntas.filter(function (p) { return p.tipo !== "vf"; });
    if (vf.length) {
      sec.appendChild(el("p", { class: "fecha", text: "Cuestionario de verdadero o falso. Pon a prueba lo que sabes: al responder verás si has acertado. Nadie ve tus respuestas." }));
      vf.forEach(function (p) { sec.appendChild(preguntaVF(p, true)); });
    }
    if (txt.length) {
      sec.appendChild(el("h2", { text: "Para pensar" }));
      sec.appendChild(el("ul", { class: "puntos" }, txt.map(function (p) { return el("li", { text: p.enunciado }); })));
    }
    return sec;
  }
  function pantallaRespuestas(num) {
    var r = DATOS.resultados.filter(function (x) { return String(x.sesion) === String(num); })[0];
    limpiar();
    app.appendChild(el("p", { class: "migas" }, [el("a", { href: "#/", text: "← Inicio" })]));
    if (!r) { app.appendChild(el("p", { class: "vacio", text: "Todavía no hay respuestas de tu grupo en esta sesión." })); return; }
    app.appendChild(el("span", { class: "etiqueta", text: "📊 Respuestas del grupo " + DATOS.grupo + " · Sesión " + r.sesion }));
    app.appendChild(el("h1", { text: r.titulo }));
    if (r.fecha) app.appendChild(el("p", { class: "fecha", text: fechaBonita(r.fecha) }));
    app.appendChild(el("p", { text: "Lo que respondisteis entre todos. Siempre de forma anónima." }));
    var bloques = (r.contenido && r.contenido.bloques) || [];
    if (!bloques.length) {
      if (r.envios) app.appendChild(bloque({ tipo: "cifras", titulo: "Participación", items: [{ valor: String(r.envios), texto: r.envios === 1 ? "joven ha respondido" : "jóvenes han respondido" }] }));
      var vfs = r.vf.filter(function (v) { return v.total > 0; });
      if (vfs.length) app.appendChild(el("section", { class: "tarjeta" }, [el("b", { text: "Aciertos en el cuestionario" })].concat(vfs.map(function (v) {
        return el("div", { class: "fila" }, [el("div", { class: "txt" }, [el("span", { text: v.enunciado }), el("b", { text: v.aciertos + " de " + v.total })]), el("div", { class: "pista" }, [el("i", { style: "width:" + Math.round(v.aciertos / v.total * 100) + "%" })])]);
      }))));
      app.appendChild(el("p", { class: "fecha", text: "Tu catequista completará este apartado con el resumen de la sesión." }));
    }
    bloques.forEach(function (b) { var n = bloque(b); if (n) app.appendChild(n); });
    if (r.sobres.length) app.appendChild(sobres(r.sobres));
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
  function preguntaVF(p, corregirAlMomento, alElegir) {
    var caja = el("div", { class: "pregunta tarjeta" });
    var expl = el("p", { class: "expl" });
    var botones = ["V", "F"].map(function (v) {
      return el("button", { type: "button", "aria-pressed": "false", text: v === "V" ? "Verdadero" : "Falso", "data-v": v });
    });
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

  /* ---------- formulario ---------- */
  function pantallaResponder(num) {
    var s = DATOS.material.filter(function (x) { return String(x.numero) === String(num); })[0];
    limpiar();
    if (!s || !abierta(s)) { app.appendChild(el("p", { class: "vacio", text: "Las preguntas de esta sesión ya están cerradas." })); return; }
    app.appendChild(el("p", { class: "migas" }, [el("a", { href: "#/sesion/" + s.numero, text: "← Volver a la sesión" })]));
    app.appendChild(el("h1", { text: "Tus respuestas · Sesión " + s.numero }));
    app.appendChild(el("p", { text: "Son anónimas: nadie sabrá quién ha escrito cada respuesta. Contesta con sinceridad." }));
    var resp = {}, cajasVF = {};
    var form = el("form");
    s.preguntas.forEach(function (p) {
      if (p.tipo === "vf") {
        var c = preguntaVF(p, false, function (v) { resp[p.id] = v; });
        cajasVF[p.id] = c; form.appendChild(c);
      } else {
        var id = "p" + p.id;
        var ta = el("textarea", { id: id, maxlength: "2000" });
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
        guardar("confi_enviado_" + DATOS.grupo + "_" + s.id, "1");
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

  /* ---------- panel del catequista ---------- */
  function pantallaPanel() {
    btnSalir.hidden = true;
    limpiar();
    app.appendChild(el("h1", { text: "Panel del catequista" }));
    var input = el("input", { type: "password", placeholder: "Código del catequista", autocomplete: "off" });
    var msg = el("p", { class: "error" });
    var boton = el("button", { class: "boton", type: "submit", text: "Ver respuestas" });
    var res = el("div");
    var form = el("form", null, [input, el("div", { style: "height:10px" }), boton, msg]);
    form.addEventListener("submit", function (ev) {
      ev.preventDefault(); boton.disabled = true; msg.textContent = "";
      rpc("panel_respuestas", { p_codigo: input.value.trim().toUpperCase() }).then(function (d) {
        form.remove(); pintarPanel(res, d);
      }).catch(function (e) { boton.disabled = false; msg.textContent = /codigo_incorrecto/.test(e.message) ? "Código incorrecto." : "Error de conexión."; });
    });
    app.appendChild(form); app.appendChild(res);
  }
  function pintarPanel(res, d) {
    var csv = [["grupo", "sesion", "pregunta", "enunciado", "envio", "respuesta", "hora"]];
    d.slice().reverse().forEach(function (s) {
      res.appendChild(el("h2", { text: s.grupo + " · Sesión " + s.sesion + " · " + s.titulo }));
      res.appendChild(el("p", { class: "fecha", text: s.envios + (s.envios === 1 ? " joven ha respondido en la app" : " jóvenes han respondido en la app") }));
      s.preguntas.forEach(function (p) {
        var c = el("div", { class: "tarjeta" }, [el("b", { text: p.orden + ". " + p.enunciado })]);
        if (p.tipo === "vf") {
          var bien = p.respuestas.filter(function (r) { return r.valor === p.correcta; }).length;
          c.appendChild(el("p", { text: p.respuestas.length ? "Aciertos: " + bien + " de " + p.respuestas.length + " (correcta: " + (p.correcta === "V" ? "verdadero" : "falso") + ")" : "Sin respuestas todavía." }));
        } else {
          if (!p.respuestas.length) c.appendChild(el("p", { class: "fecha", text: "Sin respuestas todavía." }));
          else c.appendChild(el("table", { class: "tabla" }, p.respuestas.map(function (r) { return el("tr", null, [el("td", { class: "h", text: "#" + r.envio }), el("td", { text: r.valor })]); })));
        }
        p.respuestas.forEach(function (r) { csv.push([s.grupo, s.sesion, p.orden, p.enunciado, r.envio, r.valor, r.hora]); });
        res.appendChild(c);
      });
    });
    var bajar = el("button", { class: "boton oro", type: "button", text: "⬇ Descargar todo (Excel / CSV)" });
    bajar.addEventListener("click", function () {
      var txt = "﻿" + csv.map(function (f) { return f.map(function (x) { return '"' + String(x == null ? "" : x).replace(/"/g, '""') + '"'; }).join(";"); }).join("\r\n");
      var a = el("a", { href: URL.createObjectURL(new Blob([txt], { type: "text/csv;charset=utf-8" })), download: "CONFI2026_respuestas.csv" });
      document.body.appendChild(a); a.click(); a.remove();
    });
    res.insertBefore(bajar, res.firstChild);
    res.appendChild(el("p", { class: "fecha", text: "El número (#) identifica cada envío anónimo, para saber qué respuestas son de la misma persona sin saber quién es." }));
  }

  /* ---------- rutas ---------- */
  function router() {
    var h = location.hash.replace(/^#\/?/, "").split("/");
    if (h[0] === "panel") return pantallaPanel();
    var cod = leer("confi_codigo");
    if (!DATOS) {
      if (!cod) return pantallaAcceso();
      app.innerHTML = '<p class="cargando">Cargando…</p>';
      return cargar(cod).then(router).catch(function (e) {
        if (/codigo_incorrecto/.test(e.message)) { borrar("confi_codigo"); pantallaAcceso("El código ha cambiado. Pídeselo a tu catequista."); }
        else pantallaAcceso("No se ha podido conectar. Revisa tu conexión.");
      });
    }
    btnSalir.hidden = false;
    if (h[0] === "sesion" && h[2] === "responder") return pantallaResponder(h[1]);
    if (h[0] === "sesion") return pantallaSesion(h[1]);
    if (h[0] === "respuestas") return pantallaRespuestas(h[1]);
    pantallaInicio();
  }
  window.addEventListener("hashchange", router);
  router();
})();
