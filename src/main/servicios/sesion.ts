// Quién está usando el sistema AHORA. Vive en la memoria del proceso main:
// la ventana no puede "decir" quién es, tiene que poner el PIN.
import type { BaseDeDatos } from '../db/conexion';
import type { Usuario } from '@compartido/tipos';
import { ErrorDeUsuario } from './errores';
import { verificarPin } from './usuarios';

let actual: Usuario | null = null;

// Después de 5 PIN mal seguidos, hay que esperar 30 segundos (por usuario)
const MAXIMO_INTENTOS = 5;
const ESPERA_MS = 30_000;
const fallos = new Map<number, { cantidad: number; hasta: number }>();

export function iniciarSesion(db: BaseDeDatos, usuarioId: number, pin: string, ahora: number = Date.now()): Usuario {
  const registro = fallos.get(usuarioId) ?? { cantidad: 0, hasta: 0 };
  if (registro.hasta > ahora) throw new ErrorDeUsuario(`Demasiados intentos. Esperá ${Math.ceil((registro.hasta - ahora) / 1000)} segundos.`);
  const usuario = verificarPin(db, usuarioId, pin);
  if (!usuario) {
    // Si ya había cumplido una espera, vuelve a contar desde cero
    const cantidad = registro.hasta !== 0 ? 1 : registro.cantidad + 1;
    const bloqueado = cantidad >= MAXIMO_INTENTOS;
    fallos.set(usuarioId, { cantidad, hasta: bloqueado ? ahora + ESPERA_MS : 0 });
    throw new ErrorDeUsuario(bloqueado ? 'PIN incorrecto. Esperá 30 segundos para volver a probar.' : 'PIN incorrecto.');
  }
  fallos.delete(usuarioId);
  actual = usuario;
  return usuario;
}

export function cerrarSesion(): void {
  actual = null;
}

export function sesionActual(): Usuario | null {
  return actual;
}

/**
 * Quién puede usar cada canal:
 * - 'libre': sin sesión (pantalla de ingreso).
 * - 'sesion': cualquiera que haya puesto su PIN.
 * - 'clinica': solo quien está vinculado a un profesional (historia clínica).
 * - 'admin': solo administración.
 */
export type Permiso = 'libre' | 'sesion' | 'clinica' | 'admin';

/** Revisa el permiso y devuelve el usuario de la sesión (null solo en 'libre'). */
export function requerir(permiso: Permiso): Usuario | null {
  if (permiso === 'libre') return actual;
  if (!actual) throw new ErrorDeUsuario('La sesión se cerró. Volvé a ingresar con tu PIN.');
  if (permiso === 'admin' && actual.rol !== 'admin') throw new ErrorDeUsuario('Eso lo puede hacer solo administración.');
  if (permiso === 'clinica' && actual.profesionalId === null) {
    throw new ErrorDeUsuario('La historia clínica la ven solo los profesionales.');
  }
  return actual;
}

/** Cuando se edita al usuario que está adentro (nombre, rol o vínculo), la sesión se actualiza. */
export function refrescarSesion(usuario: Usuario | null): void {
  if (actual && usuario && usuario.id === actual.id) actual = usuario;
}

/** Solo para las pruebas. */
export function reiniciarSesionParaPruebas(usuario: Usuario | null = null): void {
  actual = usuario;
  fallos.clear();
}
