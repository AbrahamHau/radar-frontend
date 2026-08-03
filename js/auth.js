// =============================================================================
// RADAR POLÍTICO — AUTENTICACIÓN
// frontend/js/auth.js
// =============================================================================
// Este módulo maneja todo lo relacionado con la sesión del usuario.
// El frontend NUNCA habla directamente con Supabase — todo pasa por FastAPI.
//
// SEGURIDAD:
//   El token JWT se guarda en memoria (variable JS) durante la sesión.
//   Al cerrar el navegador o recargar, la sesión expira automáticamente.
//   No hay credenciales de Supabase expuestas en el frontend.
//
// CONFIGURACIÓN:
//   MODIFICAR: cambia API_URL cuando despliegues en Render
// =============================================================================

// -----------------------------------------------------------------------------
// CONFIGURACIÓN
// En local (localhost/127.0.0.1) usa la API local; en cualquier otro host
// (Render) usa la API desplegada. Si el nombre del servicio "radar-api" en
// Render cambia, actualiza la URL de abajo.
// -----------------------------------------------------------------------------
const API_URL = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? "http://localhost:8000"
  : "https://radar-api-rm0m.onrender.com";

// Token en memoria — nunca en localStorage por seguridad
let _token   = null;
let _usuario = null;

// Recuperar sesión de sessionStorage al recargar
_token   = sessionStorage.getItem("token");
_usuario = JSON.parse(sessionStorage.getItem("usuario") || "null");


// =============================================================================
// FUNCIONES PRINCIPALES
// =============================================================================

/**
 * Inicia sesión enviando credenciales a FastAPI.
 * FastAPI se encarga de verificarlas con Supabase.
 * Guarda el token en memoria si el login es exitoso.
 *
 * Parámetros:
 *   usuario: nombre de usuario o correo electrónico
 *
 * Retorna: { exito: bool, mensaje: str }
 */
async function login(usuario, contrasena) {
  try {
    const respuesta = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario: usuario, password: contrasena })
    });

    const datos = await respuesta.json();

    if (!respuesta.ok) {
      return { exito: false, mensaje: datos.detail || "Credenciales incorrectas" };
    }

    // Guardar token y usuario en memoria
    _token   = datos.token;
    _usuario = { id: datos.id, email: datos.email, nombre_usuario: datos.nombre_usuario };
    sessionStorage.setItem("token",   _token);
    sessionStorage.setItem("usuario", JSON.stringify(_usuario));

    return { exito: true };

  } catch (error) {
    console.error("Error en login:", error);
    return { exito: false, mensaje: "Error de conexión con el servidor." };
  }
}


/**
 * Cierra la sesión del usuario.
 * Limpia el token de memoria y redirige al index.
 */
async function cerrarSesion() {
  try {
    if (_token) {
      await fetch(`${API_URL}/auth/logout`, {
        method: "POST",
        headers: headersAutenticados()
      });
    }
  } catch (error) {
    console.warn("Error al cerrar sesión remota:", error);
  } finally {
    _token   = null;
    _usuario = null;
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("usuario");
    window.location.href = "index.html";
  }
}


/**
 * Retorna el token actual en memoria.
 * Retorna null si no hay sesión activa.
 */
function obtenerToken() {
  return _token;
}


/**
 * Retorna los datos del usuario actual.
 * Retorna null si no hay sesión activa.
 */
function obtenerUsuario() {
  return _usuario;
}


/**
 * Verifica si hay sesión activa.
 * Si no hay token, redirige al login.
 * Usar al inicio de cada página protegida.
 */
function requiereAutenticacion() {
  if (!_token) {
    window.location.href = "index.html";
    return false;
  }
  return true;
}


/**
 * Retorna los headers para peticiones autenticadas a FastAPI.
 */
function headersAutenticados() {
  return {
    "Content-Type":  "application/json",
    "Authorization": `Bearer ${_token}`,
  };
}