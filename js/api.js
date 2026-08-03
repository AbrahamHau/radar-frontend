// =============================================================================
// RADAR POLÍTICO — COMUNICACIÓN CON LA API
// frontend/js/api.js
// =============================================================================
// Este módulo centraliza todas las peticiones al backend FastAPI.
// Ningún otro archivo hace fetch() directamente — todo pasa por aquí.
//
// MANEJO DE ERRORES:
//   Si el servidor retorna 401 (token expirado), cierra la sesión automáticamente.
//   Si el servidor retorna otro error, lo retorna para que la UI lo maneje.
// =============================================================================


// =============================================================================
// FUNCIÓN BASE DE PETICIONES
// =============================================================================

/**
 * Función base para todas las peticiones a la API.
 * Agrega autenticación, maneja errores comunes y retorna los datos.
 *
 * Parámetros:
 *   ruta:    Ruta del endpoint (ej. "/reporte/actual")
 *   metodo:  "GET" o "POST"
 *   cuerpo:  Objeto a enviar en el body (solo para POST)
 *
 * Retorna: { exito: bool, datos: any, mensaje: str }
 */
async function peticion(ruta, metodo = "GET", cuerpo = null) {
  try {
    const opciones = {
      method:  metodo,
      headers: headersAutenticados(),
    };

    if (cuerpo && metodo === "POST") {
      opciones.body = JSON.stringify(cuerpo);
    }

    const respuesta = await fetch(`${API_URL}${ruta}`, opciones);

    // Sesión expirada — cerrar automáticamente
    if (respuesta.status === 401) {
      await cerrarSesion();
      return { exito: false, mensaje: "Sesión expirada" };
    }

    // Sin permisos
    if (respuesta.status === 403) {
      return { exito: false, mensaje: "Sin permisos para esta acción" };
    }

    // No encontrado
    if (respuesta.status === 404) {
      return { exito: false, mensaje: "Recurso no encontrado" };
    }

    const datos = await respuesta.json();

    if (!respuesta.ok) {
      return { exito: false, mensaje: datos.detail || "Error del servidor" };
    }

    return { exito: true, datos };

  } catch (error) {
    console.error(`Error en petición ${metodo} ${ruta}:`, error);
    return { exito: false, mensaje: "Error de conexión con el servidor" };
  }
}


// =============================================================================
// ENDPOINTS DE REPORTE
// =============================================================================

/**
 * Obtiene el reporte más reciente del turno actual.
 * Retorna el contenido JSON del reporte.
 */
async function obtenerReporteActual() {
  return await peticion("/reporte/actual");
}


/**
 * Descarga el PDF del reporte especificado o el más reciente.
 * Dispara la descarga directamente en el navegador.
 *
 * Parámetros:
 *   reporteId: ID del reporte (opcional — si es null descarga el más reciente)
 */
async function descargarPDF(reporteId = null) {
  const ruta = reporteId
    ? `/reporte/descargar?reporte_id=${reporteId}`
    : "/reporte/descargar";

  try {
    const respuesta = await fetch(`${API_URL}${ruta}`, {
      method:  "GET",
      headers: headersAutenticados(),
    });

    if (respuesta.status === 401) {
      await cerrarSesion();
      return { exito: false, mensaje: "Sesión expirada" };
    }

    if (!respuesta.ok) {
      return { exito: false, mensaje: "No se pudo generar el PDF" };
    }

    const disposition = respuesta.headers.get("Content-Disposition") || "";
    const nombreMatch  = disposition.match(/filename="(.+)"/);
    const nombre       = nombreMatch ? nombreMatch[1] : "Radar_Politico.pdf";

    const blob = await respuesta.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = nombre;
    a.click();
    URL.revokeObjectURL(url);

    return { exito: true };

  } catch (error) {
    console.error("Error al descargar PDF:", error);
    return { exito: false, mensaje: "Error al descargar el PDF" };
  }
}


/**
 * Descarga el Word (.docx) del reporte especificado o el más reciente.
 * Dispara la descarga directamente en el navegador.
 *
 * Parámetros:
 *   reporteId: ID del reporte (opcional — si es null descarga el más reciente)
 */
async function descargarWord(reporteId = null) {
  const ruta = reporteId
    ? `/reporte/descargar-word?reporte_id=${reporteId}`
    : "/reporte/descargar-word";

  try {
    const respuesta = await fetch(`${API_URL}${ruta}`, {
      method:  "GET",
      headers: headersAutenticados(),
    });

    if (respuesta.status === 401) {
      await cerrarSesion();
      return { exito: false, mensaje: "Sesión expirada" };
    }

    if (!respuesta.ok) {
      return { exito: false, mensaje: "No se pudo generar el Word" };
    }

    const disposition = respuesta.headers.get("Content-Disposition") || "";
    const nombreMatch  = disposition.match(/filename="(.+)"/);
    const nombre       = nombreMatch ? nombreMatch[1] : "Radar_Politico.docx";

    const blob = await respuesta.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = nombre;
    a.click();
    URL.revokeObjectURL(url);

    return { exito: true };

  } catch (error) {
    console.error("Error al descargar Word:", error);
    return { exito: false, mensaje: "Error al descargar el Word" };
  }
}


/**
 * Obtiene el historial de reportes disponibles.
 * Retorna lista de reportes con id, version y fecha.
 *
 * Parámetros:
 *   limite: Número máximo de reportes a obtener (default 10)
 */
async function obtenerHistorial(limite = 10) {
  return await peticion(`/reporte/historial?limite=${limite}`);
}


/**
 * Obtiene el contenido completo de un reporte específico por su id.
 * Usado por el modal de historial para mostrar en pantalla cualquier
 * reporte guardado, no solo el más reciente.
 */
async function obtenerReporteDetalle(reporteId) {
  return await peticion(`/reporte/detalle?reporte_id=${reporteId}`);
}


// =============================================================================
// ENDPOINTS DE ADMINISTRADOR
// =============================================================================

/**
 * Obtiene el estado de los últimos turnos ejecutados.
 * Solo disponible para el administrador.
 */
async function obtenerStatus() {
  return await peticion("/admin/status");
}


/**
 * Lista las sugerencias de fenómenos pendientes de revisión (curador semanal).
 * Solo disponible para el administrador.
 */
async function obtenerFenomenosSugeridos() {
  return await peticion("/admin/fenomenos-sugeridos");
}


/**
 * Aprueba una sugerencia de fenómeno — la convierte en fenómeno activo.
 * Solo disponible para el administrador.
 */
async function aprobarFenomenoSugerido(sugeridoId) {
  return await peticion(`/admin/fenomenos-sugeridos/${sugeridoId}/aprobar`, "POST");
}


/**
 * Rechaza una sugerencia de fenómeno.
 * Solo disponible para el administrador.
 */
async function rechazarFenomenoSugerido(sugeridoId) {
  return await peticion(`/admin/fenomenos-sugeridos/${sugeridoId}/rechazar`, "POST");
}


// =============================================================================
// HEALTH CHECK
// =============================================================================

/**
 * Verifica que la API esté activa.
 * No requiere autenticación.
 */
async function verificarAPI() {
  try {
    const respuesta = await fetch(`${API_URL}/health`);
    return respuesta.ok;
  } catch {
    return false;
  }
}

async function obtenerReportePorTurno(version) {
  return await peticion(`/reporte/por-turno?version=${version}`);
}