/**
 * IMIN editor bridge — se instala en el sitio que se quiere editar (el hijo).
 *
 * Es generico: no sabe nada del proyecto en el que corre. Se sirve como archivo
 * estatico (por ejemplo /imin-editor-bridge.js) y funciona igual en cualquier
 * sitio, sea cual sea su framework. Lo unico configurable son los origenes del
 * editor que acepta (ver resolveAllowedOrigins).
 *
 * Recibe comandos por postMessage desde el editor IMIN (la app padre que
 * incrusta el sitio en un <iframe>) y aplica edicion en vivo:
 *   - modo "navigate": no hace nada, el sitio navega normal.
 *   - modo "text": bloquea la navegacion y ofrece dos caminos sobre el texto
 *     que YA existe (nunca crea texto nuevo). Un clic directo lo vuelve
 *     contentEditable y se escribe en el sitio, devolviendo "text-changed".
 *     Al pasar el cursor aparece un lapiz: al clickearlo avisa "text-selected"
 *     con el contenido y el color, y el editor abre su panel, que responde
 *     "set-text" (nueva descripcion) o "set-color" con colorTarget "text".
 *   - modo "media": bloquea la navegacion; al clickear una imagen (foreground o
 *     background) o un video avisa al editor con el "kind", que responde con
 *     "set-media" para reemplazar la fuente. Los videos solo aceptan mp4.
 *   - modo "style": bloquea la navegacion; al clickear un icono avisa
 *     "icon-selected" (el editor responde "set-icon" con el SVG nuevo) y al
 *     clickear un contenedor que YA tenga fondo propio avisa "color-selected"
 *     (el editor responde "set-color" con colorTarget "background"). No se
 *     pueden agregar fondos donde el diseño no los previo.
 *
 * El color del texto NO vive aqui sino en el modo "text": al seleccionar un
 * texto se manda su color actual y el editor puede responder "set-color" con
 * colorTarget "text". Asi cada modo tiene una sola responsabilidad.
 *
 * En todos los modos menos "navigate" el sitio queda "congelado": ademas de
 * bloquear los eventos que activan cosas, se anulan las APIs de navegacion
 * programatica (history, location, window.open, form.submit) para que ningun
 * router SPA ni script propio cambie el preview mientras se edita.
 *
 * El scroll nunca se bloquea (no interceptamos wheel/touch, y las teclas de
 * scroll siguen pasando). Solo se activa cuando la pagina esta dentro de un
 * iframe, asi que no afecta a visitantes.
 *
 * Protocolo: todos los mensajes que emite llevan source "imin-bridge", y solo
 * atiende los que llegan con source "imin-editor".
 *
 * Seguridad: solo acepta mensajes de los origenes permitidos. Se configuran por
 * sitio con window.IMIN_ALLOWED_ORIGINS o el atributo data-imin-origins del
 * <script>, sin editar este archivo.
 */
(function () {
  "use strict";

  // Solo actuar cuando el sitio se ve dentro de un iframe (el editor).
  if (window.self === window.top) {
    return;
  }

  // Origenes del editor aceptados cuando el sitio no configura los suyos.
  var DEFAULT_PARENT_ORIGINS = [
    // 1) Pruebas: el editor IMIN corriendo en tu localhost.
    "http://localhost:3000",
    // 2) Produccion: donde este desplegado el editor IMIN.
    "https://appddata.netlify.app",
  ];

  // Cada sitio puede declarar los suyos sin tocar este archivo, de dos formas:
  //
  //   window.IMIN_ALLOWED_ORIGINS = ["https://editor.midominio.com"];
  //   <script src="/imin-editor-bridge.js" data-imin-origins="https://a.com,https://b.com">
  //
  // Es lo unico especifico de cada proyecto: el resto del bridge es generico.
  function resolveAllowedOrigins() {
    var list = [];
    var i;

    if (Object.prototype.toString.call(window.IMIN_ALLOWED_ORIGINS) === "[object Array]") {
      for (i = 0; i < window.IMIN_ALLOWED_ORIGINS.length; i++) {
        if (window.IMIN_ALLOWED_ORIGINS[i]) {
          list.push(String(window.IMIN_ALLOWED_ORIGINS[i]));
        }
      }
      if (list.length > 0) {
        return list;
      }
    }

    var tags = document.querySelectorAll("script[data-imin-origins]");
    if (tags.length > 0) {
      var raw = tags[tags.length - 1].getAttribute("data-imin-origins") || "";
      var parts = raw.split(",");
      for (i = 0; i < parts.length; i++) {
        var origin = parts[i].replace(/^\s+|\s+$/g, "");
        if (origin) {
          list.push(origin);
        }
      }
      if (list.length > 0) {
        return list;
      }
    }

    return DEFAULT_PARENT_ORIGINS.slice();
  }

  var ALLOWED_PARENT_ORIGINS = resolveAllowedOrigins();

  var HOVER_OUTLINE = "2px dashed #589bf9";
  var ACTIVE_OUTLINE = "2px solid #589bf9";

  var mode = "navigate";
  var parentOrigin = null;
  var currentEditable = null;
  var sendTimer = null;
  var editableInitialValue = "";
  var pencilEl = null;
  var pencilTarget = null;
  var hoverEl = null;

  function isAllowed(origin) {
    return ALLOWED_PARENT_ORIGINS.indexOf(origin) !== -1;
  }

  // Ruta CSS estable-ish para identificar el elemento entre padre e hijo.
  function cssPath(el) {
    if (!el || el.nodeType !== 1) {
      return "";
    }

    var path = [];

    while (el && el.nodeType === 1 && el !== document.body) {
      var selector = el.nodeName.toLowerCase();
      var parent = el.parentNode;

      if (parent && parent.children) {
        var sameTag = Array.prototype.filter.call(parent.children, function (child) {
          return child.nodeName === el.nodeName;
        });

        if (sameTag.length > 1) {
          selector += ":nth-of-type(" + (Array.prototype.indexOf.call(sameTag, el) + 1) + ")";
        }
      }

      path.unshift(selector);
      el = parent;
    }

    return path.join(" > ");
  }

  function post(message) {
    if (!parentOrigin) {
      return;
    }

    var payload = { source: "imin-bridge" };

    for (var key in message) {
      if (Object.prototype.hasOwnProperty.call(message, key)) {
        payload[key] = message[key];
      }
    }

    window.parent.postMessage(payload, parentOrigin);
  }

  // --- Deteccion de "donde SI se puede editar" -----------------------------

  // Verdadero si el elemento tiene texto propio (un nodo de texto directo con
  // contenido). Asi no convertimos en editable un contenedor vacio.
  function hasDirectText(el) {
    if (!el || el.nodeType !== 1) {
      return false;
    }

    var tag = el.tagName;
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") {
      return false;
    }

    for (var i = 0; i < el.childNodes.length; i++) {
      var node = el.childNodes[i];
      if (node.nodeType === 3 && node.nodeValue && node.nodeValue.trim() !== "") {
        return true;
      }
    }

    return false;
  }

  // Sube desde el elemento clickeado hasta encontrar uno con texto propio.
  function findTextEl(el) {
    while (el && el !== document.body) {
      if (hasDirectText(el)) {
        return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  // Verdadero si el elemento pinta una imagen de fondo (url(...)).
  function hasBackgroundImage(el) {
    if (!el || el.nodeType !== 1) {
      return false;
    }
    var bg = window.getComputedStyle(el).backgroundImage;
    return !!bg && bg !== "none" && bg.indexOf("url(") !== -1;
  }

  // Clasifica un elemento como medio reemplazable, o null si no lo es.
  function mediaKindOf(el) {
    if (!el || el.nodeType !== 1) {
      return null;
    }
    if (el.tagName === "IMG") {
      return "image";
    }
    if (el.tagName === "VIDEO") {
      return "video";
    }
    if (hasBackgroundImage(el)) {
      return "background";
    }
    return null;
  }

  // Sube desde el elemento clickeado hasta encontrar un medio reemplazable.
  function findMedia(el) {
    while (el && el !== document.body) {
      var kind = mediaKindOf(el);
      if (kind) {
        return { el: el, kind: kind };
      }
      el = el.parentElement;
    }
    return null;
  }

  function isRenderedEl(el) {
    var cs = window.getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) {
      return false;
    }
    var rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  // Ultimo recurso: busca <img>/<video> cuya caja contenga el punto, aunque no
  // aparezcan en elementsFromPoint (por ejemplo con pointer-events:none).
  // Se queda con el mas pequeño, que es el mas especifico bajo el cursor.
  function smallestMediaContaining(x, y) {
    var candidates = document.querySelectorAll("img, video");
    var best = null;
    var bestArea = Infinity;

    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      if (!isRenderedEl(el)) {
        continue;
      }
      var rect = el.getBoundingClientRect();
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
        continue;
      }
      var area = rect.width * rect.height;
      if (area < bestArea) {
        bestArea = area;
        best = el;
      }
    }

    return best ? { el: best, kind: best.tagName === "VIDEO" ? "video" : "image" } : null;
  }

  function areaOf(el) {
    var rect = el.getBoundingClientRect();
    return rect.width * rect.height;
  }

  // Verdadero si "inner" cabe dentro de "outer": indica que inner es el
  // elemento mas especifico de los dos para el punto consultado.
  function isContainedBy(inner, outer) {
    var a = inner.getBoundingClientRect();
    var b = outer.getBoundingClientRect();
    return a.left >= b.left && a.right <= b.right && a.top >= b.top && a.bottom <= b.bottom;
  }

  // Medio alcanzable por hit-testing: el que el navegador reporta bajo el punto.
  function hitTestedMedia(x, y) {
    var stack =
      typeof document.elementsFromPoint === "function" ? document.elementsFromPoint(x, y) : [];

    // Los descendientes vienen antes que sus ancestros, asi que una imagen
    // concreta gana sobre el contenedor con background que la rodea.
    for (var i = 0; i < stack.length; i++) {
      if (stack[i] === document.body || stack[i] === document.documentElement) {
        break;
      }
      var kind = mediaKindOf(stack[i]);
      if (kind) {
        return { el: stack[i], kind: kind };
      }
    }

    // Un medio que envuelva al punto sin estar en el apilado directo.
    return stack.length > 0 ? findMedia(stack[0]) : null;
  }

  // Resuelve el medio bajo un punto atravesando las capas que lo tapen.
  //
  // Hay dos formas de que un medio quede fuera del alcance del hit-testing:
  // que algo transparente lo cubra, o que el propio medio (o un ancestro) tenga
  // pointer-events:none. El segundo caso es el de las tarjetas de producto
  // sobre el video: el navegador reporta el video de fondo y las imagenes de
  // encima resultan invisibles al puntero.
  //
  // Por eso no basta con quedarse con lo que reporta el navegador: si existe un
  // medio geometricamente contenido dentro de el, ese es el objetivo real.
  function mediaAtPoint(x, y) {
    var hit = hitTestedMedia(x, y);
    var geo = smallestMediaContaining(x, y);

    if (!hit) {
      return geo;
    }
    if (!geo || geo.el === hit.el) {
      return hit;
    }

    // Solo se prefiere el geometrico cuando es claramente mas especifico: cabe
    // completo dentro del otro y es mas chico. Asi una imagen de 176px sobre un
    // video de fondo gana, pero un medio del mismo tamaño no le roba la seleccion.
    if (isContainedBy(geo.el, hit.el) && areaOf(geo.el) < areaOf(hit.el)) {
      return geo;
    }

    return hit;
  }

  // Sube desde el elemento clickeado hasta encontrar un icono: un <svg> inline
  // o un <i>/<span> con clases tipicas de fuentes de iconos (Font Awesome, etc).
  function findIcon(el) {
    while (el && el !== document.body) {
      if (el.nodeType === 1) {
        var tag = el.tagName ? el.tagName.toLowerCase() : "";
        if (tag === "svg") {
          return el;
        }
        if (
          (tag === "i" || tag === "span") &&
          typeof el.className === "string" &&
          /(^|\s)(fa|fas|far|fab|fa-|bi|bi-|icon|material-icons|glyphicon|material-symbols)/i.test(
            el.className,
          )
        ) {
          return el;
        }
      }
      el = el.parentElement;
    }
    return null;
  }

  // Verdadero si el elemento pinta su propio fondo. Heredar visualmente el del
  // padre no cuenta: solo un background-color opaco o una imagen de fondo.
  function hasOwnBackground(el) {
    var cs = window.getComputedStyle(el);

    if (cs.backgroundImage && cs.backgroundImage !== "none") {
      return true;
    }

    var bg = cs.backgroundColor;
    if (!bg || bg === "transparent") {
      return false;
    }

    // rgba(...) con alpha 0 es transparente aunque declare un color.
    var match = bg.match(/^rgba?\(([^)]+)\)/);
    if (match) {
      var parts = match[1].split(",");
      if (parts.length > 3 && parseFloat(parts[3]) === 0) {
        return false;
      }
    }

    return true;
  }

  // Sube hasta el contenedor mas cercano que YA tenga fondo propio.
  //
  // Se limita a esos a proposito: el editor no debe poder inventar fondos donde
  // el diseño no los previo. Se excluyen body y html porque pintarlos afectaria
  // la pagina entera en vez de un contenedor.
  function findBackgroundEl(el) {
    while (el && el.nodeType === 1 && el !== document.body && el !== document.documentElement) {
      if (hasOwnBackground(el)) {
        return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  // En modo "style" solo se editan dos cosas: iconos y fondos ya existentes.
  // El color del texto vive en el modo "text", junto al contenido.
  function styleTargetUnder(target) {
    var icon = findIcon(target);
    if (icon) {
      return { el: icon, kind: "icon" };
    }

    var background = findBackgroundEl(target);
    if (background) {
      return { el: background, kind: "background" };
    }

    return null;
  }

  // Devuelve el elemento editable bajo el cursor segun el modo, o null.
  // x/y son las coordenadas del puntero: en modo media hacen falta para poder
  // atravesar las capas que tapen la imagen.
  function editableUnder(target, x, y) {
    if (mode === "text") {
      return findTextEl(target);
    }
    if (mode === "media") {
      var media = mediaAtPoint(x, y);
      return media ? media.el : null;
    }
    if (mode === "style") {
      var styleTarget = styleTargetUnder(target);
      return styleTarget ? styleTarget.el : null;
    }
    return null;
  }

  // --- Resaltado por hover -------------------------------------------------

  function clearHover() {
    if (hoverEl && hoverEl !== currentEditable) {
      hoverEl.style.outline = "";
      hoverEl.style.outlineOffset = "";
    }
    hoverEl = null;
  }

  function setHover(el) {
    if (hoverEl === el) {
      return;
    }
    clearHover();
    if (el && el !== currentEditable) {
      el.style.outline = HOVER_OUTLINE;
      el.style.outlineOffset = "2px";
      hoverEl = el;
    }
  }

  // --- Edicion de texto ----------------------------------------------------

  // El modo texto tiene dos caminos:
  //   - clic sobre el texto: se edita en linea, como siempre.
  //   - clic en el lapiz que aparece al pasar el cursor: abre el panel del
  //     editor, donde se cambia la descripcion o el color.
  // Ojo con la reentrancia: quitar el atributo dispara "blur" de forma sincrona,
  // y ese listener vuelve a entrar aqui. Por eso se toma el elemento en una
  // variable local y se limpia el estado ANTES de tocar el DOM; si no, al
  // regresar de la llamada anidada currentEditable ya seria null y la linea
  // siguiente reventaria.
  function clearEditable() {
    var el = currentEditable;
    if (!el) {
      return;
    }

    currentEditable = null;
    el.removeAttribute("contenteditable");
    el.style.outline = "";
    el.style.outlineOffset = "";

    // Solo se avisa si el contenido de verdad cambio, para no marcar el
    // proyecto como modificado por el simple hecho de haber hecho clic.
    if ((el.textContent || "") !== editableInitialValue) {
      sendTextChange(el);
    }
  }

  function sendTextChange(el) {
    post({ type: "text-changed", selector: cssPath(el), value: el.textContent || "" });
  }

  // Reemplaza el contenido conservando el elemento (y por tanto su selector).
  function applyText(selector, value) {
    var el = document.querySelector(selector);
    if (el) {
      el.textContent = value;
    }
  }

  // --- Lapiz para abrir el panel ------------------------------------------

  // Verdadero para la UI que inyecta el bridge. Sirve para que el lapiz no se
  // trate como parte del sitio: ni se resalta, ni se congela, ni se edita.
  function isBridgeUi(node) {
    while (node) {
      if (node.nodeType === 1 && node.hasAttribute && node.hasAttribute("data-imin-ui")) {
        return true;
      }
      node = node.parentNode;
    }
    return false;
  }

  var PENCIL_SVG =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M12 20h9"></path>' +
    '<path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>';

  function ensurePencil() {
    if (pencilEl) {
      return pencilEl;
    }

    pencilEl = document.createElement("button");
    pencilEl.type = "button";
    pencilEl.setAttribute("data-imin-ui", "pencil");
    pencilEl.setAttribute("aria-label", "Editar este texto");
    pencilEl.title = "Editar texto";
    pencilEl.innerHTML = PENCIL_SVG;

    // Estilos en linea y con prioridad: el CSS del sitio no debe alterarlo.
    var style =
      "position:fixed;z-index:2147483647;display:none;align-items:center;" +
      "justify-content:center;width:26px;height:26px;padding:0;margin:0;" +
      "border:none;border-radius:9999px;background:#589bf9;color:#fff;" +
      "box-shadow:0 2px 6px rgba(0,0,0,.3);cursor:pointer;line-height:0;";
    style.split(";").forEach(function (rule) {
      var parts = rule.split(":");
      if (parts.length === 2) {
        pencilEl.style.setProperty(parts[0], parts[1], "important");
      }
    });

    pencilEl.addEventListener("click", onPencilClick, false);
    document.body.appendChild(pencilEl);
    return pencilEl;
  }

  function hidePencil() {
    if (pencilEl) {
      pencilEl.style.setProperty("display", "none", "important");
    }
    pencilTarget = null;
  }

  // Se ancla en la esquina superior derecha del texto, sin salirse de la vista.
  function showPencilFor(el) {
    if (!el) {
      hidePencil();
      return;
    }

    var button = ensurePencil();
    var rect = el.getBoundingClientRect();

    pencilTarget = el;
    button.style.setProperty("top", Math.max(2, rect.top - 13) + "px", "important");
    button.style.setProperty(
      "left",
      Math.min(window.innerWidth - 28, Math.max(2, rect.right - 13)) + "px",
      "important",
    );
    button.style.setProperty("display", "flex", "important");
  }

  function onPencilClick(event) {
    event.preventDefault();
    event.stopPropagation();

    var el = pencilTarget;
    if (!el) {
      return;
    }

    // Si se estaba editando en linea, se cierra: manda el panel.
    clearEditable();

    post({
      type: "text-selected",
      selector: cssPath(el),
      value: el.textContent || "",
      color: window.getComputedStyle(el).color,
    });
  }

  // --- Bloqueo de navegacion ----------------------------------------------

  function isInsideEditable(node) {
    while (node) {
      if (node.nodeType === 1 && node.isContentEditable) {
        return true;
      }
      node = node.parentNode;
    }
    return false;
  }


  // "Congelado" = cualquier modo de edicion. Ahi el sitio no debe navegar ni
  // reaccionar a su propio scripting: solo se edita.
  function isFrozen() {
    return mode !== "navigate";
  }

  // Eventos que disparan navegacion o logica de la pagina (routers SPA, <a>,
  // botones que navegan en mouseup/keydown, submits, drags...).
  // Deliberadamente NO tocamos wheel/touchmove/scroll: el scroll vive siempre.
  var GUARDED_EVENTS = [
    "pointerdown",
    "pointerup",
    "mousedown",
    "mouseup",
    "auxclick",
    "dblclick",
    "contextmenu",
    "submit",
    "reset",
    "change",
    "dragstart",
    "drop",
    "keydown",
    "keypress",
    "keyup",
  ];

  // Teclas que no bloqueamos aunque estemos congelados: son las que mueven el
  // scroll o la seleccion, y no activan nada.
  var SCROLL_KEYS = {
    ArrowUp: true,
    ArrowDown: true,
    ArrowLeft: true,
    ArrowRight: true,
    PageUp: true,
    PageDown: true,
    Home: true,
    End: true,
    Tab: true,
  };

  function guardNavigation(event) {
    if (!isFrozen()) {
      return;
    }

    // El lapiz del bridge y el campo activo tienen que seguir respondiendo.
    if (isBridgeUi(event.target)) {
      return;
    }

    if (mode === "text" && isInsideEditable(event.target)) {
      // El clic con rueda abriria el enlace en otra pestaña; el resto de
      // eventos (teclado, seleccion, doble clic) se dejan pasar para poder
      // escribir con normalidad.
      if (event.type === "auxclick") {
        event.preventDefault();
      }
      return;
    }

    // No matamos el scroll tactil: solo bloqueamos el puntero tipo mouse.
    if (
      (event.type === "pointerdown" || event.type === "pointerup") &&
      event.pointerType &&
      event.pointerType !== "mouse"
    ) {
      return;
    }

    // Fuera de un campo editable, el teclado no debe activar nada, pero si debe
    // poder mover el scroll.
    if (event.type.indexOf("key") === 0 && SCROLL_KEYS[event.key]) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
  }

  // Los registramos en window ademas de document para ganarle en fase de
  // captura a cualquier listener global que el sitio instale en document.
  GUARDED_EVENTS.forEach(function (type) {
    window.addEventListener(type, guardNavigation, true);
    document.addEventListener(type, guardNavigation, true);
  });

  // --- Congelado del scripting: navegacion programatica --------------------
  //
  // Bloquear eventos no basta: el sitio puede navegar desde un setTimeout, un
  // router.push, un location.href o un window.open. Envolvemos esas APIs para
  // que sean no-ops mientras estamos en un modo de edicion.

  function freezeMethod(owner, name) {
    if (!owner || typeof owner[name] !== "function") {
      return;
    }

    var original = owner[name];

    try {
      owner[name] = function () {
        if (isFrozen()) {
          return undefined;
        }
        return original.apply(this, arguments);
      };
    } catch (error) {
      /* propiedad no escribible en este navegador, se ignora */
    }
  }

  freezeMethod(window.history, "pushState");
  freezeMethod(window.history, "replaceState");
  freezeMethod(window.history, "back");
  freezeMethod(window.history, "forward");
  freezeMethod(window.history, "go");
  freezeMethod(window, "open");
  freezeMethod(window.Location && window.Location.prototype, "assign");
  freezeMethod(window.Location && window.Location.prototype, "replace");
  freezeMethod(window.Location && window.Location.prototype, "reload");
  freezeMethod(window.HTMLFormElement && window.HTMLFormElement.prototype, "submit");
  freezeMethod(window.HTMLFormElement && window.HTMLFormElement.prototype, "requestSubmit");

  // Red de seguridad final: la Navigation API intercepta TODA navegacion del
  // documento (incluido `location.href = ...`, que no se puede envolver).
  // Solo existe en Chromium; en el resto quedan las capas de arriba.
  if (window.navigation && typeof window.navigation.addEventListener === "function") {
    window.navigation.addEventListener("navigate", function (event) {
      if (isFrozen() && event.cancelable) {
        event.preventDefault();
      }
    });
  }

  // --- Click: selecciona el elemento a editar ------------------------------

  function onClickCapture(event) {
    if (mode === "navigate") {
      return;
    }

    var target = event.target;

    // El lapiz tiene su propio manejador; aqui no se toca.
    if (isBridgeUi(target)) {
      return;
    }

    if (mode === "text") {
      // Permite mover el cursor / escribir dentro del campo ya activo, pero sin
      // dejar que el clic active el <a> que lo envuelve: en un navbar el texto
      // editable vive dentro de un enlace, y sin esto el sitio navegaria.
      //
      // Solo preventDefault, no stopImmediatePropagation: el cursor se coloca
      // en mousedown, asi que la edicion sigue funcionando. Y el Link de Next
      // consulta defaultPrevented antes de enrutar, con lo que tambien se frena.
      if (isInsideEditable(target)) {
        event.preventDefault();
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();

      var textEl = findTextEl(target);

      // Sin texto propio => no se puede editar aqui (no creamos texto nuevo).
      if (!textEl) {
        clearEditable();
        return;
      }

      if (textEl === currentEditable) {
        return;
      }

      clearEditable();
      setHover(null);
      textEl.setAttribute("contenteditable", "true");
      textEl.style.outline = ACTIVE_OUTLINE;
      textEl.style.outlineOffset = "2px";
      currentEditable = textEl;
      editableInitialValue = textEl.textContent || "";
      textEl.focus();
      return;
    }

    if (mode === "media") {
      event.preventDefault();
      event.stopImmediatePropagation();

      var media = mediaAtPoint(event.clientX, event.clientY);

      // Sin medio reemplazable => no se puede agregar de mas.
      if (!media) {
        return;
      }

      post({ type: "media-selected", selector: cssPath(media.el), kind: media.kind });
      return;
    }

    if (mode === "style") {
      event.preventDefault();
      event.stopImmediatePropagation();

      var styleTarget = styleTargetUnder(target);
      if (!styleTarget) {
        return;
      }

      if (styleTarget.kind === "icon") {
        post({ type: "icon-selected", selector: cssPath(styleTarget.el) });
      } else {
        post({ type: "color-selected", selector: cssPath(styleTarget.el) });
      }
      return;
    }
  }

  // Captura en fase de captura para ganarle al router SPA y a los <a>.
  document.addEventListener("click", onClickCapture, true);

  // Hover: muestra donde SI se puede editar y marca "no permitido" donde no.
  //
  // Se limita a un calculo por frame: resolver el medio bajo el cursor puede
  // implicar medir todas las imagenes de la pagina, y hacerlo en cada mousemove
  // provocaria relayouts constantes.
  var hoverFrame = null;
  var hoverEvent = null;

  function updateHover() {
    hoverFrame = null;

    if (!hoverEvent) {
      return;
    }

    var editable = editableUnder(hoverEvent.target, hoverEvent.x, hoverEvent.y);
    setHover(editable);

    // En modo texto, el lapiz acompaña al elemento apuntado: da la via para
    // abrir el panel sin quitar la edicion en linea de un clic directo.
    if (mode === "text") {
      showPencilFor(editable);
    }

    document.body.style.cursor = editable
      ? mode === "media"
        ? "copy"
        : mode === "style"
          ? "pointer"
          : "text"
      : "not-allowed";
  }

  document.addEventListener(
    "mousemove",
    function (event) {
      if (mode === "navigate") {
        hoverEvent = null;
        setHover(null);
        hidePencil();
        return;
      }

      // Al pasar sobre el lapiz se conserva lo resaltado; si no, desapareceria
      // justo cuando se intenta hacer clic en el.
      if (isBridgeUi(event.target)) {
        return;
      }

      // Se guardan los datos, no el evento, que deja de ser valido al salir.
      hoverEvent = { target: event.target, x: event.clientX, y: event.clientY };

      if (hoverFrame === null) {
        hoverFrame = window.requestAnimationFrame(updateHover);
      }
    },
    true,
  );

  document.addEventListener(
    "input",
    function (event) {
      if (mode !== "text" || !currentEditable || event.target !== currentEditable) {
        return;
      }

      if (sendTimer) {
        clearTimeout(sendTimer);
      }

      var el = currentEditable;
      sendTimer = setTimeout(function () {
        sendTextChange(el);
      }, 300);
    },
    true,
  );

  document.addEventListener(
    "blur",
    function (event) {
      if (currentEditable && event.target === currentEditable) {
        clearEditable();
      }
    },
    true,
  );

  // --- Reemplazo de medios -------------------------------------------------

  function applyMedia(selector, kind, src) {
    var el = document.querySelector(selector);
    if (!el) {
      return;
    }

    if (kind === "image" && el.tagName === "IMG") {
      el.removeAttribute("srcset");
      el.removeAttribute("sizes");

      // Dentro de un <picture>, los <source> mandan sobre el src del <img>:
      // si no se quitan, el reemplazo no se ve. Es el caso de next/image.
      var parent = el.parentElement;
      if (parent && parent.tagName === "PICTURE") {
        var sources = parent.querySelectorAll("source");
        for (var i = 0; i < sources.length; i++) {
          sources[i].parentNode.removeChild(sources[i]);
        }
      }

      el.src = src;
      return;
    }

    if (kind === "background") {
      // JSON.stringify envuelve en comillas y escapa el data URL de forma segura.
      el.style.backgroundImage = "url(" + JSON.stringify(src) + ")";
      return;
    }

    if (kind === "video" && el.tagName === "VIDEO") {
      // Quita los <source> hijos para que no ganen sobre el nuevo src.
      while (el.firstChild) {
        el.removeChild(el.firstChild);
      }
      el.removeAttribute("srcset");
      el.src = src;
      el.load();
      return;
    }
  }

  // --- Estilo: color e iconos ---------------------------------------------

  // Direcciones cardinales y diagonales que ofrece el editor.
  function colorWithOpacity(color, opacity) {
    if (typeof opacity !== "number" || opacity >= 100) {
      return color;
    }
    var hex = String(color || "").replace("#", "");
    if (!/^[0-9a-f]{6}$/i.test(hex)) {
      return color;
    }
    return (
      "rgba(" +
      parseInt(hex.slice(0, 2), 16) + ", " +
      parseInt(hex.slice(2, 4), 16) + ", " +
      parseInt(hex.slice(4, 6), 16) + ", " +
      Math.max(0, Math.min(100, opacity)) / 100 + ")"
    );
  }

  function gradientCss(direction, from, to, opacity) {
    var directions = {
      left: "to left",
      right: "to right",
      top: "to top",
      bottom: "to bottom",
      "top-left": "to top left",
      "top-right": "to top right",
      "bottom-left": "to bottom left",
      "bottom-right": "to bottom right",
    };
    return "linear-gradient(" + (directions[direction] || directions.right) + ", " + colorWithOpacity(from, opacity) + ", " + colorWithOpacity(to, opacity) + ")";
  }

  // Quita los restos de un degradado de texto para poder volver a color solido.
  function clearTextGradient(el) {
    el.style.backgroundImage = "";
    el.style.removeProperty("-webkit-background-clip");
    el.style.removeProperty("background-clip");
    el.style.removeProperty("-webkit-text-fill-color");
  }

  // options: { colorTarget, fill, color, colorEnd, direction, opacity }
  //   colorTarget: "text" | "background"
  //   fill:        "solid" | "gradient"  (ausente = solido, por compatibilidad)
  function applyColor(selector, options) {
    var el = document.querySelector(selector);
    if (!el) {
      return;
    }

    var isGradient = options.fill === "gradient" && !!options.colorEnd;

    if (options.colorTarget === "background") {
      if (isGradient) {
        // backgroundColor se limpia para que no asome bajo el degradado.
        el.style.backgroundColor = "";
        el.style.backgroundImage = gradientCss(options.direction, options.color, options.colorEnd, options.opacity);
      } else {
        el.style.backgroundImage = "";
        el.style.backgroundColor = colorWithOpacity(options.color, options.opacity);
      }
      return;
    }

    if (isGradient) {
      // El degradado se recorta a la forma de las letras y el relleno del texto
      // se vuelve transparente para dejarlo ver.
      el.style.color = "";
      el.style.backgroundImage = gradientCss(options.direction, options.color, options.colorEnd);
      el.style.setProperty("-webkit-background-clip", "text");
      el.style.setProperty("background-clip", "text");
      el.style.setProperty("-webkit-text-fill-color", "transparent");
      return;
    }

    clearTextGradient(el);
    el.style.color = options.color;
  }

  function applyIcon(selector, svgMarkup) {
    var oldEl = document.querySelector(selector);
    if (!oldEl || !oldEl.parentNode) {
      return;
    }

    var tmp = document.createElement("div");
    tmp.innerHTML = svgMarkup;
    var newEl = tmp.firstElementChild;
    if (!newEl) {
      return;
    }

    // Conserva el tamano y color del icono original para que encaje visualmente.
    var cs = window.getComputedStyle(oldEl);
    newEl.style.width = cs.width;
    newEl.style.height = cs.height;
    newEl.style.color = cs.color;
    newEl.style.verticalAlign = cs.verticalAlign;

    oldEl.parentNode.replaceChild(newEl, oldEl);
  }

  // --- Widgets estructurales administrados por IMIN -----------------------

  var WIDGET_TYPES = {
    hero: 1, features: 1, "image-text": 1, "text-block": 1, "product-tiers": 1,
    services: 1, stats: 1, "cta-banner": 1, carousel: 1, gallery: 1,
    "bg-image": 1, "bg-video": 1, blog: 1, promos: 1, testimonials: 1, faq: 1, contact: 1,
  };

  function widgetIcon() {
    return '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v18M3 12h18"/></svg>';
  }

  function widgetImage(seed) {
    return "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1200&q=80&sig=" + encodeURIComponent(seed);
  }

  function widgetMarkup(widget) {
    var id = String(widget.id || "widget").replace(/[^a-zA-Z0-9_-]/g, "");
    var type = String(widget.type || "text-block");
    var icon = widgetIcon();
    var image = widgetImage(id);
    var cards = '<div class="imin-w-grid"><article>' + icon + '<h3>Calidad garantizada</h3><p>Edita este contenido directamente con IMIN.</p></article><article>' + icon + '<h3>Atencion personalizada</h3><p>Una seccion flexible para comunicar tu valor.</p></article><article>' + icon + '<h3>Servicio confiable</h3><p>Adapta textos, iconos, colores e imagenes.</p></article></div>';
    var body = "";
    if (type === "hero") body = '<p class="imin-w-kicker">NUEVA SECCION</p><h2>Impulsa tu marca con una experiencia real</h2><p>Este widget vive dentro del template publicado y puede editarse con las herramientas de IMIN.</p><a href="#">Conocer mas</a>';
    else if (type === "features" || type === "services") body = '<h2>' + (type === "services" ? "Nuestros servicios" : "Lo que nos distingue") + '</h2>' + cards;
    else if (type === "image-text") body = '<div class="imin-w-split"><img src="' + image + '" alt="Seccion editable"><div><h2>Imagen y contenido</h2><p>Combina un medio visual con un mensaje claro para tus visitantes.</p></div></div>';
    else if (type === "text-block") body = '<h2>Una historia que vale la pena contar</h2><p>Utiliza este bloque para explicar tu empresa, una idea o cualquier informacion relevante.</p>';
    else if (type === "product-tiers") body = '<h2>Planes y productos</h2><div class="imin-w-grid"><article><h3>Basico</h3><strong>$9</strong><p>Una opcion para comenzar.</p></article><article><h3>Pro</h3><strong>$19</strong><p>La alternativa mas popular.</p></article><article><h3>Premium</h3><strong>$29</strong><p>Todo lo que necesitas.</p></article></div>';
    else if (type === "stats") body = '<div class="imin-w-stats"><div><strong>+120</strong><span>Clientes</span></div><div><strong>8</strong><span>Años</span></div><div><strong>24/7</strong><span>Soporte</span></div></div>';
    else if (type === "cta-banner") body = '<div class="imin-w-cta"><h2>¿Listo para comenzar?</h2><a href="#">Contactanos</a></div>';
    else if (type === "carousel") body = '<div class="imin-w-carousel"><img src="' + image + '" alt="Carrusel editable"><button data-imin-carousel="prev">‹</button><button data-imin-carousel="next">›</button><h2>Experiencias que se mueven contigo</h2></div>';
    else if (type === "gallery") body = '<h2>Galeria</h2><div class="imin-w-gallery">' + [1,2,3,4,5,6].map(function (n) { return '<img src="' + widgetImage(id + n) + '" alt="Galeria editable">'; }).join("") + '</div>';
    else if (type === "bg-image") body = '<div class="imin-w-cover" style="background-image:url(' + JSON.stringify(image) + ')"><h2>Una imagen que habla por tu marca</h2></div>';
    else if (type === "bg-video") body = '<div class="imin-w-video">' + icon + '<h2>Video destacado</h2><p>Selecciona el fondo o reemplaza el contenido visual.</p></div>';
    else if (type === "blog") body = '<h2>Ultimas entradas</h2>' + cards;
    else if (type === "promos") body = '<h2>Promociones</h2><div class="imin-w-grid"><article><strong>-20%</strong><h3>Oferta especial</h3></article><article><strong>2x1</strong><h3>Solo esta semana</h3></article><article><strong>-50%</strong><h3>Ultimas piezas</h3></article></div>';
    else if (type === "testimonials") body = '<h2>Lo que dicen nuestros clientes</h2><div class="imin-w-grid"><article>' + icon + '<p>Una experiencia excelente y un equipo muy profesional.</p><strong>Ana G.</strong></article><article>' + icon + '<p>El resultado supero todas nuestras expectativas.</p><strong>Luis M.</strong></article><article>' + icon + '<p>Servicio rapido, claro y confiable.</p><strong>Sofia R.</strong></article></div>';
    else if (type === "faq") body = '<h2>Preguntas frecuentes</h2><div class="imin-w-faq"><button>¿Como funciona?<span>+</span></button><p>Selecciona el texto para personalizar esta respuesta.</p><button>¿Puedo editarlo despues?<span>+</span></button><p>Si, todos los elementos permanecen editables.</p></div>';
    else if (type === "contact") body = '<div class="imin-w-split"><div><h2>Contactanos</h2><p>hola@tumarca.com</p><p>+52 55 1234 5678</p></div><form><input placeholder="Nombre"><input placeholder="Correo"><textarea placeholder="Mensaje"></textarea><button type="button">Enviar</button></form></div>';
    return '<section class="imin-managed-widget imin-widget-' + type + '" data-imin-widget-id="' + id + '" data-imin-widget-type="' + type + '"><div class="imin-w-inner">' + body + '</div></section>';
  }

  function ensureWidgetStyles() {
    if (document.getElementById("imin-widget-styles")) return;
    var style = document.createElement("style");
    style.id = "imin-widget-styles";
    style.textContent = '.imin-managed-zone{font-family:inherit}.imin-managed-widget{padding:64px 24px;background:#fff;color:#172033}.imin-managed-widget:nth-child(even){background:#f4f7fa}.imin-w-inner{max-width:1120px;margin:auto}.imin-managed-widget h2{font-size:clamp(1.6rem,4vw,2.7rem);margin:0 0 18px}.imin-managed-widget h3{margin:10px 0 6px}.imin-managed-widget p{line-height:1.7}.imin-managed-widget a,.imin-managed-widget form button{display:inline-block;margin-top:16px;padding:10px 18px;border-radius:999px;background:#0455a2;color:#fff;text-decoration:none}.imin-w-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.imin-w-grid article{padding:22px;border:1px solid rgba(15,23,42,.12);border-radius:18px;background:rgba(255,255,255,.75)}.imin-w-split{display:grid;grid-template-columns:1fr 1fr;align-items:center;gap:34px}.imin-w-split img{width:100%;height:300px;object-fit:cover;border-radius:22px}.imin-w-stats{display:grid;grid-template-columns:repeat(3,1fr);text-align:center;gap:20px}.imin-w-stats div{display:flex;flex-direction:column}.imin-w-stats strong{font-size:2.4rem;color:#0455a2}.imin-w-cta{display:flex;align-items:center;gap:20px}.imin-w-cta a{margin-left:auto}.imin-w-carousel,.imin-w-cover,.imin-w-video{position:relative;min-height:360px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;overflow:hidden;border-radius:24px}.imin-w-carousel img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.imin-w-carousel:after{content:"";position:absolute;inset:0;background:rgba(0,0,0,.45)}.imin-w-carousel h2,.imin-w-carousel button{position:relative;z-index:1;color:#fff}.imin-w-carousel button{position:absolute;top:50%;font-size:2rem;background:rgba(0,0,0,.4);border:0;border-radius:50%;width:44px;height:44px}.imin-w-carousel button:first-of-type{left:14px}.imin-w-carousel button:nth-of-type(2){right:14px}.imin-w-gallery{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.imin-w-gallery img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:14px}.imin-w-cover{background-size:cover;background-position:center;color:#fff}.imin-w-video{background:#07111f;color:#fff}.imin-w-faq button{width:100%;display:flex;justify-content:space-between;padding:14px;border:0;border-bottom:1px solid #ddd;background:transparent;text-align:left;font:inherit;font-weight:600}.imin-w-faq p{display:none;padding:10px 14px}.imin-w-faq button[aria-expanded="true"]+p{display:block}.imin-managed-widget input,.imin-managed-widget textarea{display:block;width:100%;box-sizing:border-box;margin:8px 0;padding:11px;border:1px solid #ccd3dd;border-radius:10px}@media(max-width:700px){.imin-w-grid,.imin-w-split,.imin-w-stats,.imin-w-gallery{grid-template-columns:1fr}.imin-w-cta{flex-direction:column;text-align:center}.imin-w-cta a{margin-left:0}}';
    document.head.appendChild(style);
  }

  function applyWidgets(widgets) {
    ensureWidgetStyles();
    var zone = document.getElementById("imin-managed-widgets");
    if (!zone) {
      zone = document.createElement("div");
      zone.id = "imin-managed-widgets";
      zone.className = "imin-managed-zone";
      var footer = document.querySelector("footer");
      if (footer && footer.parentNode) footer.parentNode.insertBefore(zone, footer);
      else document.body.appendChild(zone);
    }
    var safe = Object.prototype.toString.call(widgets) === "[object Array]" ? widgets.filter(function (widget) { return widget && WIDGET_TYPES[widget.type]; }).slice(0, 40) : [];
    zone.innerHTML = safe.map(widgetMarkup).join("");
  }

  document.addEventListener("click", function (event) {
    var faq = event.target.closest && event.target.closest(".imin-w-faq button");
    if (faq && mode === "navigate") faq.setAttribute("aria-expanded", faq.getAttribute("aria-expanded") === "true" ? "false" : "true");
  });

  window.addEventListener("message", function (event) {
    if (!isAllowed(event.origin)) {
      return;
    }

    var data = event.data;

    if (!data || data.source !== "imin-editor") {
      return;
    }

    parentOrigin = event.origin;

    if (data.type === "set-mode") {
      mode = data.mode || "navigate";

      if (mode !== "text") {
        clearEditable();
        hidePencil();
      }

      setHover(null);
      document.body.style.cursor =
        mode === "media"
          ? "copy"
          : mode === "text"
            ? "text"
            : mode === "style"
              ? "pointer"
              : "";
      return;
    }

    // typeof en vez de truthy: un texto vaciado a "" es un cambio valido.
    if (data.type === "set-text" && data.selector && typeof data.value === "string") {
      applyText(data.selector, data.value);
      return;
    }

    if (data.type === "set-media" && data.selector && data.kind && data.src) {
      applyMedia(data.selector, data.kind, data.src);
      return;
    }

    if (data.type === "set-color" && data.selector && data.color) {
      applyColor(data.selector, {
        colorTarget: data.colorTarget,
        fill: data.fill,
        color: data.color,
        colorEnd: data.colorEnd,
        direction: data.direction,
        opacity: data.opacity,
      });
      return;
    }

    if (data.type === "set-icon" && data.selector && data.svg) {
      applyIcon(data.selector, data.svg);
      return;
    }

    if (data.type === "set-widgets" && Object.prototype.toString.call(data.widgets) === "[object Array]") {
      applyWidgets(data.widgets);
      return;
    }
  });

  // Anuncia disponibilidad a cualquiera de los origenes permitidos.
  ALLOWED_PARENT_ORIGINS.forEach(function (origin) {
    try {
      window.parent.postMessage({ source: "imin-bridge", type: "ready" }, origin);
    } catch (error) {
      /* origen no disponible, se ignora */
    }
  });
})();
