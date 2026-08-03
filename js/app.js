// =============================================================================
// RADAR POLÍTICO — LÓGICA PRINCIPAL DEL DASHBOARD
// frontend/js/app.js
// =============================================================================
// Este módulo maneja toda la lógica del dashboard:
//   - Selección de turno
//   - Carga y renderizado del reporte
//   - Expansión/colapso de fichas
//   - Descarga del PDF
//   - Panel de administrador
// =============================================================================


// Estado de la aplicación
let _reporteActual     = null;
let _turnoSeleccionado = null;

const TABS = ['resumen', 'tablero', 'crisis', 'cambios'];

function activarTab(nombre) {
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.toggle('tab-activo', panel.dataset.tab === nombre);
  });
  document.querySelectorAll('.m-tab').forEach(btn => {
    btn.classList.toggle('activo', btn.dataset.tab === nombre);
  });
}


// =============================================================================
// INICIALIZACIÓN
// =============================================================================

/**
 * Punto de entrada del dashboard.
 * Se llama al cargar la página.
 */
async function iniciarApp() {
  // Verificar sesión activa
  if (!requiereAutenticacion()) return;

  // Mostrar datos del usuario
  const usuario = obtenerUsuario();
  if (usuario) {
    const el = document.getElementById("navbar-usuario");
    if (el) el.textContent = formatearNombreUsuario(usuario);
  }

  // Cargar disponibilidad de reportes por turno
  await cargarSelectorTurnos();

  // Verificar si es administrador para mostrar panel admin
  await verificarAdmin();
}


// =============================================================================
// SELECTOR DE TURNOS
// =============================================================================

/**
 * Carga la disponibilidad de reportes para cada turno
 * y actualiza los botones del selector con la fecha disponible.
 */
async function cargarSelectorTurnos() {
  const turnos = ["matutino", "vespertino", "nocturno"];

  for (const turno of turnos) {
    const resultado = await obtenerReportePorTurno(turno);
    const btn       = document.getElementById(`btn-turno-${turno}`);
    const fecha     = document.getElementById(`fecha-turno-${turno}`);

    if (!btn || !fecha) continue;

    if (resultado.exito && resultado.datos) {
      // Reporte disponible — mostrar fecha
      const creado  = new Date(resultado.datos.creado_en);
      const hoy     = new Date();
      const esHoy   = creado.toDateString() === hoy.toDateString();
      const textoFecha = esHoy
        ? `Hoy ${creado.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })} hrs`
        : creado.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" });

      fecha.textContent = textoFecha;
      btn.disabled      = false;
      btn.classList.remove("btn-deshabilitado");
    } else {
      // Sin reporte disponible
      fecha.textContent = "Sin reporte";
      btn.disabled      = true;
      btn.classList.add("btn-deshabilitado");
    }
  }
}


/**
 * Carga y muestra el reporte del turno seleccionado.
 *
 * Parámetros:
 *   turno: 'matutino', 'vespertino' o 'nocturno'
 */
async function seleccionarTurno(turno) {
  _turnoSeleccionado = turno;

  // Marcar botón activo y actualizar aria-pressed
  ["matutino", "vespertino", "nocturno"].forEach(t => {
    const btn = document.getElementById(`btn-turno-${t}`);
    if (!btn) return;
    const esActivo = t === turno;
    btn.classList.toggle("activo", esActivo);
    btn.setAttribute("aria-pressed", esActivo ? "true" : "false");
  });

  // Mostrar loader
  mostrarLoader("cargando-reporte", true);
  ocultarSeccion("reporte-contenido");

  // Cargar reporte
  const resultado = await obtenerReportePorTurno(turno);

  mostrarLoader("cargando-reporte", false);

  if (!resultado.exito) {
    mostrarNotificacion(resultado.mensaje || "No se pudo cargar el reporte", "error");
    return;
  }

  _reporteActual = resultado.datos.contenido;
  renderizarReporte(_reporteActual);
  // Eliminar el display:none inline para que el CSS controle el layout (grid en escritorio, block en móvil)
  const grid = document.getElementById("reporte-contenido");
  if (grid) grid.style.display = "";
  activarTab('resumen');
}


// =============================================================================
// MENÚ DE USUARIO (navbar)
// =============================================================================

/**
 * A partir de los datos de sesión, arma el texto a mostrar en el menú:
 * prioriza el nombre de usuario (ej. "Abraham.Hau" → "Abraham Hau") y
 * usa el correo como respaldo si no hay nombre de usuario disponible.
 */
function formatearNombreUsuario(usuario) {
  if (usuario?.nombre_usuario) {
    return usuario.nombre_usuario.replace(/\./g, " ");
  }
  return usuario?.email || "";
}

/**
 * Abre/cierra el menú desplegable de usuario (correo, historial, salir).
 * El estado abierto/cerrado se controla con la clase "abierto" — es la
 * que dispara la animación definida en estilos.css (opacity + transform).
 */
function alternarMenuUsuario() {
  const menu = document.getElementById("menu-usuario");
  if (!menu) return;

  if (menu.classList.contains("abierto")) {
    cerrarMenuUsuario();
  } else {
    menu.classList.add("abierto");
    document.getElementById("btn-menu-usuario")?.setAttribute("aria-expanded", "true");
    document.addEventListener("click", _cerrarMenuUsuarioFuera);
    document.addEventListener("keydown", _cerrarMenuUsuarioConEscape);
  }
}

/**
 * Cierra el menú de usuario.
 */
function cerrarMenuUsuario() {
  const menu = document.getElementById("menu-usuario");
  if (menu) menu.classList.remove("abierto");
  document.getElementById("btn-menu-usuario")?.setAttribute("aria-expanded", "false");
  document.removeEventListener("click", _cerrarMenuUsuarioFuera);
  document.removeEventListener("keydown", _cerrarMenuUsuarioConEscape);
}

function _cerrarMenuUsuarioFuera(evento) {
  const menu = document.getElementById("menu-usuario");
  const btn  = document.getElementById("btn-menu-usuario");
  if (!menu || !btn) return;
  if (!menu.contains(evento.target) && !btn.contains(evento.target)) {
    cerrarMenuUsuario();
  }
}

function _cerrarMenuUsuarioConEscape(evento) {
  if (evento.key === "Escape") cerrarMenuUsuario();
}


// =============================================================================
// MODAL DE HISTORIAL DE REPORTES
// =============================================================================

/**
 * Abre el modal de historial y carga la lista de reportes guardados.
 */
async function abrirHistorial() {
  const modal = document.getElementById("modal-historial");
  const lista = document.getElementById("historial-lista");
  if (!modal || !lista) return;

  modal.style.display = "flex";
  document.addEventListener("keydown", _cerrarHistorialConEscape);
  lista.innerHTML = "<p class='historial-mensaje'>Cargando historial...</p>";

  const resultado = await obtenerHistorial(20);

  if (!resultado.exito) {
    lista.innerHTML = `<p class='historial-mensaje'>${resultado.mensaje || "No se pudo cargar el historial"}</p>`;
    return;
  }

  if (!resultado.datos?.reportes?.length) {
    lista.innerHTML = "<p class='historial-mensaje'>No hay reportes guardados.</p>";
    return;
  }

  lista.innerHTML = resultado.datos.reportes.map(r => {
    const creado      = new Date(r.creado_en);
    const fechaTexto  = creado.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
    const horaTexto   = creado.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });

    return `
      <button class="historial-item" onclick="seleccionarReporteHistorial('${r.id}')">
        <span class="historial-item-turno">${(r.version || "").toUpperCase()}</span>
        <span class="historial-item-fecha">${fechaTexto} — ${horaTexto} hrs</span>
      </button>
    `;
  }).join("");
}

/**
 * Cierra el modal de historial.
 */
function cerrarHistorial() {
  const modal = document.getElementById("modal-historial");
  if (modal) modal.style.display = "none";
  document.removeEventListener("keydown", _cerrarHistorialConEscape);
}

function _cerrarHistorialConEscape(evento) {
  if (evento.key === "Escape") cerrarHistorial();
}


// =============================================================================
// MODAL DE FENÓMENOS SUGERIDOS (curador semanal)
// =============================================================================

/**
 * Abre el modal de fenómenos sugeridos y carga las sugerencias pendientes
 * del curador semanal (analyzer/curador_fenomenos.py). Solo disponible
 * para el administrador — si el backend responde sin permisos, se muestra
 * el mensaje de error igual que cualquier otra llamada a /admin/*.
 */
async function abrirFenomenosSugeridos() {
  const modal = document.getElementById("modal-fenomenos-sugeridos");
  const lista = document.getElementById("fenomenos-sugeridos-lista");
  if (!modal || !lista) return;

  modal.style.display = "flex";
  document.addEventListener("keydown", _cerrarFenomenosSugeridosConEscape);
  await _cargarFenomenosSugeridos();
}

async function _cargarFenomenosSugeridos() {
  const lista = document.getElementById("fenomenos-sugeridos-lista");
  if (!lista) return;

  lista.innerHTML = "<p class='historial-mensaje'>Cargando sugerencias...</p>";

  const resultado = await obtenerFenomenosSugeridos();

  if (!resultado.exito) {
    lista.innerHTML = `<p class='historial-mensaje'>${resultado.mensaje || "No se pudo cargar las sugerencias"}</p>`;
    return;
  }

  const sugerencias = resultado.datos?.sugerencias || [];

  if (!sugerencias.length) {
    lista.innerHTML = "<p class='historial-mensaje'>No hay fenómenos sugeridos pendientes.</p>";
    return;
  }

  lista.innerHTML = sugerencias.map(s => `
    <div class="historial-item" style="flex-direction:column; align-items:stretch; gap:8px; cursor:default;">
      <div>
        <strong>${escapeHtml(s.nombre || "")}</strong>
        <span class="historial-item-fecha"> — ${escapeHtml(s.categoria || "")}</span>
      </div>
      ${s.justificacion ? `<div class="historial-item-fecha">${escapeHtml(s.justificacion)}</div>` : ""}
      <div style="display:flex; gap:8px;">
        <button class="btn btn-primario btn-sm" onclick="_resolverFenomenoSugerido('${s.id}', 'aprobar')">
          Aprobar
        </button>
        <button class="btn btn-secundario btn-sm" onclick="_resolverFenomenoSugerido('${s.id}', 'rechazar')">
          Rechazar
        </button>
      </div>
    </div>
  `).join("");
}

/**
 * Aprueba o rechaza una sugerencia y recarga la lista. Aprobar crea el
 * fenómeno real en fenomenos_seguimiento (vacío, sin noticias vinculadas
 * retroactivamente — ver api/main.py); rechazar solo cambia su estado.
 */
async function _resolverFenomenoSugerido(sugeridoId, accion) {
  const resultado = accion === "aprobar"
    ? await aprobarFenomenoSugerido(sugeridoId)
    : await rechazarFenomenoSugerido(sugeridoId);

  if (!resultado.exito) {
    mostrarNotificacion(resultado.mensaje || "No se pudo procesar la sugerencia", "error");
    return;
  }

  mostrarNotificacion(
    accion === "aprobar" ? "Fenómeno creado correctamente" : "Sugerencia rechazada",
    "exito"
  );
  await _cargarFenomenosSugeridos();
}

/**
 * Cierra el modal de fenómenos sugeridos.
 */
function cerrarFenomenosSugeridos() {
  const modal = document.getElementById("modal-fenomenos-sugeridos");
  if (modal) modal.style.display = "none";
  document.removeEventListener("keydown", _cerrarFenomenosSugeridosConEscape);
}

function _cerrarFenomenosSugeridosConEscape(evento) {
  if (evento.key === "Escape") cerrarFenomenosSugeridos();
}

/**
 * Carga y muestra un reporte específico elegido desde el historial.
 * A diferencia de seleccionarTurno(), el reporte no corresponde
 * necesariamente al turno actual de ninguno de los 3 botones — se
 * deseleccionan para no marcar un turno equivocado como activo.
 */
async function seleccionarReporteHistorial(reporteId) {
  cerrarHistorial();

  ["matutino", "vespertino", "nocturno"].forEach(t => {
    const btn = document.getElementById(`btn-turno-${t}`);
    if (!btn) return;
    btn.classList.remove("activo");
    btn.setAttribute("aria-pressed", "false");
  });
  _turnoSeleccionado = null;

  mostrarLoader("cargando-reporte", true);
  ocultarSeccion("reporte-contenido");

  const resultado = await obtenerReporteDetalle(reporteId);

  mostrarLoader("cargando-reporte", false);

  if (!resultado.exito) {
    mostrarNotificacion(resultado.mensaje || "No se pudo cargar el reporte", "error");
    return;
  }

  _reporteActual = resultado.datos.contenido;
  renderizarReporte(_reporteActual);
  const grid = document.getElementById("reporte-contenido");
  if (grid) grid.style.display = "";
  activarTab('resumen');
}


// =============================================================================
// RENDERIZADO DEL REPORTE
// =============================================================================

/**
 * Renderiza el reporte completo en el dashboard.
 */
function renderizarReporte(reporte) {
  if (!reporte) return;

  renderizarEncabezado(reporte);
  renderizarTablero(reporte);
  renderizarAlertas(reporte);
  renderizarCambios(reporte);
  renderizarResumen(reporte);
  renderizarFichas(reporte);
  renderizarOportunidades(reporte);
}


/**
 * Renderiza el encabezado del reporte.
 */
function renderizarEncabezado(reporte) {
  setText("reporte-version",       reporte.version_turno || "");
  setText("reporte-fecha",         reporte.fecha_larga || "");
  setText("reporte-hora",          reporte.hora_corte || "");
  setText("reporte-actualizacion", reporte.texto_actualizacion || "");
}


/**
 * Renderiza el tablero ejecutivo con los contadores.
 */
function renderizarTablero(reporte) {
  setText("tablero-criticas",      reporte.num_criticas || 0);
  setText("tablero-activas",       reporte.num_activas || 0);
  setText("tablero-frentes",       reporte.num_frentes || 0);
  setText("tablero-cambios",       reporte.num_cambios || 0);
  setText("tablero-oportunidades", reporte.num_oportunidades || 0);
}


/**
 * Renderiza las alertas clave.
 */
function renderizarAlertas(reporte) {
  const contenedor = document.getElementById("lista-alertas");
  if (!contenedor) return;

  const alertas = reporte.alertas || [];

  if (!alertas.length) {
    contenedor.innerHTML = "<p class='texto-gris'>Sin alertas en este turno.</p>";
    return;
  }

  contenedor.innerHTML = alertas.map(a => `
    <div class="alerta-item">
      <strong>• ${escapeHtml(a.tema)} —</strong> ${escapeHtml(a.descripcion)}
    </div>
  `).join("");
}


function formatearListaCambios(texto) {
  if (!texto) return "<span class='texto-gris'>Sin cambios</span>";

  const items = texto
    .split(/[•\n]/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  if (items.length <= 1) return escapeHtml(texto);

  return `<ul class="lista-cambios">${items.map(i => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`;
}

/**
 * Renderiza la tabla de cambios vs turno anterior.
 */
function renderizarCambios(reporte) {
  const cambios = reporte.cambios || {};
  const filas = [
    { id: "cambios-permanecen", cat: "A) PERMANECEN", clase: "cat-permanecen", texto: cambios.permanecen },
    { id: "cambios-escalan",    cat: "B) ESCALAN",    clase: "cat-escalan",    texto: cambios.escalan },
    { id: "cambios-disminuyen", cat: "C) DISMINUYEN", clase: "cat-disminuyen", texto: cambios.disminuyen },
    { id: "cambios-salen",      cat: "D) SALEN",      clase: "cat-salen",      texto: cambios.salen },
    { id: "cambios-nuevos",     cat: "E) NUEVOS",     clase: "cat-nuevos",     texto: cambios.nuevos },
  ];

  const tabla = document.getElementById("tabla-cambios-body");
  if (!tabla) return;

  tabla.innerHTML = filas.map(f => `
    <tr>
      <td class="cat-cell ${f.clase}">${f.cat}</td>
      <td>${formatearListaCambios(f.texto)}</td>
    </tr>
  `).join("");
}


/**
 * Renderiza el resumen ejecutivo.
 */
function renderizarResumen(reporte) {
  setText("resumen-balance", reporte.resumen_balance || "");

  const contenedor = document.getElementById("resumen-bloques");
  if (!contenedor) return;

  const bloques = reporte.resumen_bloques || [];
  contenedor.innerHTML = bloques.map(b => `
    <div class="resumen-subtitulo">${escapeHtml(b.titulo)}</div>
    <div class="resumen-texto">${escapeHtml(b.texto)}</div>
  `).join("");
}


/**
 * Renderiza las fichas de crisis con opción de expandir/colapsar.
 */
function renderizarFichas(reporte) {
  const contenedor = document.getElementById("lista-fichas");
  if (!contenedor) return;

  const fichas = reporte.fichas || [];

  if (!fichas.length) {
    contenedor.innerHTML = "<p class='texto-gris'>Sin fichas de crisis en este turno.</p>";
    return;
  }

  contenedor.innerHTML = fichas.map((f, i) => `
    <div class="ficha" id="ficha-${i}">
      <div class="ficha-encabezado">
        <div class="ficha-numero">#${f.numero}</div>
        <div class="ficha-titulo">${escapeHtml(f.descripcion_corta)}</div>
        <div class="ficha-nivel-tag nivel-${f.nivel_css}" style="background-color:${f.nivel_color}">
          ${escapeHtml(f.nivel_texto)}
        </div>
      </div>
      <div class="ficha-cuerpo" id="cuerpo-ficha-${i}">
        <div class="ficha-cuerpo-inner">
          <p><strong>Contexto:</strong> ${escapeHtml(f.contexto || "")}</p>
          ${f.analisis_profundo ? `<p class="mt-8"><strong>Análisis profundo:</strong> ${escapeHtml(f.analisis_profundo)}</p>` : ""}
          ${f.riesgo_politico ? `<p class="mt-8"><strong>Riesgo político:</strong> ${escapeHtml(f.riesgo_politico)}</p>` : ""}
          ${f.riesgo_reputacional ? `<p class="mt-8"><strong>Riesgo reputacional:</strong> ${escapeHtml(f.riesgo_reputacional)}</p>` : ""}
          ${f.riesgo_operativo ? `<p class="mt-8"><strong>Riesgo operativo:</strong> ${escapeHtml(f.riesgo_operativo)}</p>` : ""}
          ${f.riesgo_social ? `<p class="mt-8"><strong>Riesgo social:</strong> ${escapeHtml(f.riesgo_social)}</p>` : ""}
          ${f.accion_inmediata ? `<p class="mt-8"><strong>Inmediata:</strong> ${escapeHtml(f.accion_inmediata)}</p>` : ""}
          ${f.accion_preventiva ? `<p class="mt-8"><strong>Preventiva:</strong> ${escapeHtml(f.accion_preventiva)}</p>` : ""}
          ${f.accion_comunicacional ? `<p class="mt-8"><strong>Comunicacional:</strong> ${escapeHtml(f.accion_comunicacional)}</p>` : ""}
          ${(f.accion_inmediata || f.accion_preventiva || f.accion_comunicacional) ? `
          <p class="mt-8" style="font-size:0.75rem;">
            <strong>Dependencia:</strong> ${escapeHtml(f.dependencia || "")} | <strong>Ventana:</strong> ${escapeHtml(f.ventana || "")}
          </p>
          ` : ""}
          ${f.url ? `
            <a href="${escapeHtml(f.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-secundario btn-sm mt-8">
              Ver ↗
            </a>
          ` : ""}
        </div>
      </div>
      <button class="ficha-toggle" onclick="toggleFicha(${i})">
        <span class="ficha-toggle-texto">Mostrar más</span>
        <span class="ficha-toggle-flecha">▼</span>
      </button>
    </div>
  `).join("");
}


/**
 * Renderiza las oportunidades activas.
 */
function renderizarOportunidades(reporte) {
  const contenedor = document.getElementById("lista-oportunidades");
  if (!contenedor) return;

  const ops = reporte.oportunidades || [];

  if (!ops.length) {
    contenedor.innerHTML = "<p class='texto-gris'>Sin oportunidades en este turno.</p>";
    return;
  }

  contenedor.innerHTML = ops.map((op, i) => `
    <div class="ficha" style="border-color: var(--oportunidad);">
      <div class="ficha-encabezado">
        <div class="ficha-numero" style="background-color: var(--oportunidad);">#O${i + 1}</div>
        <div class="ficha-titulo">${escapeHtml(op.descripcion_corta)}</div>
        <div class="ficha-nivel-tag" style="background-color: var(--oportunidad);">OPORTUNIDAD</div>
      </div>
      <div class="ficha-cuerpo expandido">
        <p>${(op.puntos || []).map(p => escapeHtml(p)).join(" ")}</p>
        ${op.url ? `
          <a href="${escapeHtml(op.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-secundario btn-xs mt-8">
            Ver ↗
          </a>
        ` : ""}
      </div>
    </div>
  `).join("");
}


// =============================================================================
// INTERACCIONES
// =============================================================================

/**
 * Expande o colapsa el detalle de una ficha.
 */
function toggleFicha(indice) {
  const cuerpo  = document.getElementById(`cuerpo-ficha-${indice}`);
  const btn     = document.querySelector(`#ficha-${indice} .ficha-toggle`);
  const texto   = btn && btn.querySelector(".ficha-toggle-texto");
  if (!cuerpo || !btn || !texto) return;

  const expandido = cuerpo.classList.toggle("expandido");
  btn.classList.toggle("expandido", expandido);
  texto.textContent = expandido ? "Ocultar" : "Mostrar más";
}


/**
 * Descarga el reporte actual en el formato indicado.
 *
 * Parámetros:
 *   formato: "pdf" o "word"
 *   btnId:   id del botón que disparó la descarga (para mostrar el estado de carga)
 */
async function descargarReporte(formato = "pdf", btnId = "btn-descargar") {
  const btn        = document.getElementById(btnId);
  const esWord     = formato === "word";
  const textoOriginal = btn ? btn.textContent : "";

  if (btn) {
    btn.textContent = esWord ? "Generando Word..." : "Generando PDF...";
    btn.disabled    = true;
  }

  cerrarMenuDescarga();

  const resultado = esWord ? await descargarWord() : await descargarPDF();

  if (!resultado.exito) {
    mostrarNotificacion(resultado.mensaje, "error");
  }

  if (btn) {
    btn.textContent = textoOriginal;
    btn.disabled    = false;
  }
}


/**
 * Abre/cierra el menú de selección de formato (PDF/Word) del botón flotante móvil.
 */
function alternarMenuDescarga(evento) {
  if (evento) evento.stopPropagation();
  const menu = document.getElementById("menu-descarga-flotante");
  if (menu) menu.classList.toggle("abierto");
}

function cerrarMenuDescarga() {
  const menu = document.getElementById("menu-descarga-flotante");
  if (menu) menu.classList.remove("abierto");
}

document.addEventListener("click", (evento) => {
  const menu = document.getElementById("menu-descarga-flotante");
  const btn  = document.getElementById("btn-descarga-flotante");
  if (!menu || !menu.classList.contains("abierto")) return;
  if (menu.contains(evento.target) || (btn && btn.contains(evento.target))) return;
  cerrarMenuDescarga();
});


// =============================================================================
// ADMINISTRADOR
// =============================================================================

/**
 * Verifica si el usuario es administrador y muestra el panel admin.
 */
async function verificarAdmin() {
  const resultado = await obtenerStatus();
  if (resultado.exito) {
    // Si puede acceder a /admin/status es administrador
    mostrarSeccion("panel-admin");
  }
}


// =============================================================================
// UTILIDADES DE UI
// =============================================================================

function setText(id, texto) {
  const el = document.getElementById(id);
  if (el) el.textContent = texto;
}

function mostrarLoader(id, visible) {
  const el = document.getElementById(id);
  if (el) el.style.display = visible ? "flex" : "none";
}

function mostrarSeccion(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = "block";
}

function ocultarSeccion(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = "none";
}

function mostrarNotificacion(mensaje, tipo = "error") {
  const id = tipo === "error" ? "notificacion-error" : "notificacion-exito";
  const el = document.getElementById(id);
  if (!el) return;

  el.textContent = mensaje;
  el.classList.add("mensaje-visible");

  // Ocultar automáticamente después de 5 segundos
  setTimeout(() => el.classList.remove("mensaje-visible"), 5000);
}

// =============================================================================
// SWIPE HORIZONTAL ENTRE PESTAÑAS (móvil/tablet)
// =============================================================================
(function () {
  let _touchStartX = 0;

  document.addEventListener('touchstart', function (e) {
    _touchStartX = e.changedTouches[0].clientX;
  }, { passive: true });

  document.addEventListener('touchend', function (e) {
    const delta = e.changedTouches[0].clientX - _touchStartX;
    if (Math.abs(delta) < 50) return;

    const panelActivo = document.querySelector('.tab-panel.tab-activo');
    if (!panelActivo) return;

    const indiceActual = TABS.indexOf(panelActivo.dataset.tab);
    const siguiente = delta < 0
      ? Math.min(indiceActual + 1, TABS.length - 1)
      : Math.max(indiceActual - 1, 0);

    if (siguiente !== indiceActual) activarTab(TABS[siguiente]);
  }, { passive: true });
})();


/**
 * Escapa HTML para evitar inyección de código.
 */
function escapeHtml(texto) {
  if (!texto) return "";
  return String(texto)
    .replace(/&/g,  "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;")
    .replace(/"/g,  "&quot;")
    .replace(/'/g,  "&#39;");
}