// Conecta los pedidos de la ventana (ipcRenderer.invoke) con los servicios.
// Cada canal:
//   1. revisa QUIÉN pide (sesión, rol y vínculo con un profesional). Los
//      permisos se controlan ACÁ, en el main: esconder un botón en la ventana
//      no alcanza, porque la ventana podría pedir cualquier cosa;
//   2. valida lo que llega con Zod ANTES de tocar la base de datos.
import { ipcMain, shell } from 'electron';
import { z, type ZodType } from 'zod';
import { CANALES } from '@compartido/api';
import {
  esquemaBloqueo,
  esquemaBuscarPacientes,
  esquemaCobro,
  esquemaConsulta,
  esquemaConsultorio,
  esquemaEstado,
  esquemaFecha,
  esquemaMensajeRecordatorio,
  esquemaMoverTurno,
  esquemaObraSocial,
  esquemaPaciente,
  esquemaPeriodo,
  esquemaPin,
  esquemaProfesional,
  esquemaRango,
  esquemaTurno,
  esquemaUsuario,
  id,
} from '@compartido/esquemas';
import type { InfoSistema, Respuesta, Usuario } from '@compartido/tipos';
import { obtenerDb } from './db/conexion';
import { ErrorDeUsuario } from './servicios/errores';
import { buscarPacientes, cambiarActivoPaciente, guardarPaciente } from './servicios/pacientes';
import { cambiarActivoProfesional, guardarProfesional, listarProfesionales } from './servicios/profesionales';
import { bloqueosProximos, borrarBloqueo, crearBloqueo } from './servicios/bloqueos';
import { cambiarActivoObraSocial, guardarObraSocial, listarObrasSociales } from './servicios/obras-sociales';
import { guardarConsultorio, guardarMensajeRecordatorio, obtenerConsultorio, resumen } from './servicios/consultorio';
import { guardarConsulta, historiaClinica } from './servicios/consultas';
import { anularCobro, registrarCobro } from './servicios/cobros';
import { enlaceRecordatorio, marcarRecordado } from './servicios/recordatorios';
import { cargarEjemplo, cargarTurnosEjemplo } from './servicios/ejemplo';
import { darDeBajaUsuario, guardarUsuario, hayUsuarios, listarUsuarios } from './servicios/usuarios';
import { reporte } from './servicios/reportes';
import { abrirCarpetaCopias, elegirCopia, estadoCopias, exportarCopia, exportarOrdenes, restaurarCopiaElegida } from './copias';
import { cerrarSesion, iniciarSesion, refrescarSesion, requerir, sesionActual, type Permiso } from './servicios/sesion';
import { agenda, cambiarEstado, darTurno, horariosLibres, moverTurno, proximosLibres, turnosDePaciente } from './servicios/turnos';

/** Convierte cualquier error en un mensaje para la ventana. */
export function mensajeDeError(error: unknown): string {
  if (error instanceof ErrorDeUsuario) return error.message;
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? 'Hay datos inválidos.';
  console.error(error);
  return 'Ocurrió un error inesperado. Si se repite, avisale a quien te instaló el sistema.';
}

/**
 * Registra un canal con su permiso ('libre', 'sesion', 'clinica' o 'admin').
 * `esquema` describe los argumentos que manda la ventana (como lista);
 * `fn` los recibe ya validados y, al final, el usuario de la sesión.
 */
export function manejar<E extends ZodType<unknown[]>, T>(
  canal: string,
  permiso: Permiso,
  esquema: E,
  fn: (...args: [...z.output<E>, Usuario]) => T | Promise<T>,
): void {
  ipcMain.handle(canal, async (_evento, ...args: unknown[]): Promise<Respuesta<T>> => {
    try {
      const usuario = requerir(permiso);
      const validados = esquema.parse(args) as z.output<E>;
      return { ok: true, datos: await fn(...validados, usuario as Usuario) };
    } catch (error) {
      return { ok: false, error: mensajeDeError(error) };
    }
  });
}

const nada = z.tuple([]);
const activo = z.boolean();

export function registrarCanales(info: () => InfoSistema): void {
  const db = () => obtenerDb();

  // ── Sesión y usuarios ──
  manejar(CANALES.sesionActual, 'libre', nada, () => sesionActual());
  manejar(CANALES.sesionIniciar, 'libre', z.tuple([id, z.string().max(10)]), (uid, pin) => iniciarSesion(db(), uid, pin));
  manejar(CANALES.sesionCerrar, 'libre', nada, () => {
    cerrarSesion();
    return null;
  });
  manejar(CANALES.usuariosParaIngresar, 'libre', nada, () => listarUsuarios(db()));
  manejar(CANALES.usuariosCrearPrimero, 'libre', z.tuple([z.string(), esquemaPin]), (nombre, pin) => {
    // Solo sirve la primera vez: después, los usuarios los crea administración
    if (hayUsuarios(db())) throw new ErrorDeUsuario('Ya hay usuarios creados. Ingresá con tu PIN.');
    const nuevo = guardarUsuario(db(), esquemaUsuario.parse({ nombre, rol: 'admin', pin }));
    return iniciarSesion(db(), nuevo, pin);
  });
  manejar(CANALES.usuariosListar, 'admin', nada, () => listarUsuarios(db()));
  manejar(CANALES.usuariosGuardar, 'admin', z.tuple([esquemaUsuario]), (datos) => {
    const uid = guardarUsuario(db(), datos);
    refrescarSesion(listarUsuarios(db()).find((u) => u.id === uid) ?? null);
    return uid;
  });
  manejar(CANALES.usuariosBaja, 'admin', z.tuple([id]), (uid, yo) => {
    darDeBajaUsuario(db(), uid, yo.id);
    return null;
  });

  // ── Pacientes ──
  manejar(CANALES.pacientesBuscar, 'sesion', z.tuple([esquemaBuscarPacientes]), (filtro) => buscarPacientes(db(), filtro));
  manejar(CANALES.pacientesGuardar, 'sesion', z.tuple([esquemaPaciente]), (datos) => guardarPaciente(db(), datos));
  manejar(CANALES.pacientesActivo, 'sesion', z.tuple([id, activo]), (pid, a) => {
    cambiarActivoPaciente(db(), pid, a);
    return null;
  });

  // ── Profesionales y días sin atención (la configuración, solo administración) ──
  manejar(CANALES.profesionalesListar, 'sesion', nada, () => listarProfesionales(db()));
  manejar(CANALES.profesionalesGuardar, 'admin', z.tuple([esquemaProfesional]), (datos) => guardarProfesional(db(), datos));
  manejar(CANALES.profesionalesActivo, 'admin', z.tuple([id, activo]), (pid, a) => {
    cambiarActivoProfesional(db(), pid, a);
    return null;
  });
  manejar(CANALES.bloqueosProximos, 'sesion', nada, () => bloqueosProximos(db()));
  manejar(CANALES.bloqueosCrear, 'admin', z.tuple([esquemaBloqueo]), (datos) => crearBloqueo(db(), datos));
  manejar(CANALES.bloqueosBorrar, 'admin', z.tuple([id]), (bid) => {
    borrarBloqueo(db(), bid);
    return null;
  });

  // ── Turnos ──
  manejar(CANALES.turnosAgenda, 'sesion', z.tuple([esquemaRango]), (rango) => agenda(db(), rango));
  manejar(CANALES.turnosLibres, 'sesion', z.tuple([id, esquemaFecha]), (pid, fecha) => horariosLibres(db(), pid, fecha));
  manejar(CANALES.turnosProximosLibres, 'sesion', z.tuple([id]), (pid) => proximosLibres(db(), pid));
  manejar(CANALES.turnosDar, 'sesion', z.tuple([esquemaTurno]), (datos, yo) => darTurno(db(), datos, new Date(), yo.id));
  manejar(CANALES.turnosMover, 'sesion', z.tuple([esquemaMoverTurno]), (datos) => {
    moverTurno(db(), datos);
    return null;
  });
  manejar(CANALES.turnosEstado, 'sesion', z.tuple([id, esquemaEstado]), (tid, estado) => {
    cambiarEstado(db(), tid, estado);
    return null;
  });
  manejar(CANALES.turnosDePaciente, 'sesion', z.tuple([id]), (pid) => turnosDePaciente(db(), pid));
  manejar(CANALES.turnosRecordar, 'sesion', z.tuple([id]), async (tid) => {
    // El enlace lo arma el main con datos de la base; se abre con el navegador o WhatsApp de la compu
    await shell.openExternal(enlaceRecordatorio(db(), tid));
    marcarRecordado(db(), tid);
    return null;
  });

  // ── Historia clínica: solo usuarios vinculados a un profesional ──
  manejar(CANALES.consultasHistoria, 'clinica', z.tuple([id]), (pid) => historiaClinica(db(), pid));
  manejar(CANALES.consultasGuardar, 'clinica', z.tuple([esquemaConsulta]), (datos, yo) => guardarConsulta(db(), datos, yo));

  // ── Cobros ──
  manejar(CANALES.cobrosRegistrar, 'sesion', z.tuple([esquemaCobro]), (datos, yo) => registrarCobro(db(), datos, new Date(), yo.id));
  manejar(CANALES.cobrosAnular, 'sesion', z.tuple([id]), (cid, yo) => {
    anularCobro(db(), cid, yo);
    return null;
  });

  // ── Obras sociales ──
  manejar(CANALES.obrasListar, 'sesion', nada, () => listarObrasSociales(db()));
  manejar(CANALES.obrasGuardar, 'admin', z.tuple([esquemaObraSocial]), (datos) => guardarObraSocial(db(), datos));
  manejar(CANALES.obrasActivo, 'admin', z.tuple([id, activo]), (oid, a) => {
    cambiarActivoObraSocial(db(), oid, a);
    return null;
  });

  // ── Consultorio y sistema ──
  // El nombre del consultorio se ve en la pantalla de ingreso: es 'libre'
  manejar(CANALES.consultorioObtener, 'libre', nada, () => obtenerConsultorio(db()));
  manejar(CANALES.consultorioGuardar, 'admin', z.tuple([esquemaConsultorio]), (datos) => {
    guardarConsultorio(db(), datos);
    return null;
  });
  manejar(CANALES.consultorioMensaje, 'admin', z.tuple([esquemaMensajeRecordatorio]), (mensaje) => {
    guardarMensajeRecordatorio(db(), mensaje);
    return null;
  });
  manejar(CANALES.sistemaInfo, 'sesion', nada, info);
  manejar(CANALES.sistemaResumen, 'sesion', nada, () => resumen(db()));
  // ── Reportes y copias (solo administración) ──
  manejar(CANALES.reportesObtener, 'admin', z.tuple([esquemaPeriodo]), (periodo) => reporte(db(), periodo));
  manejar(CANALES.reportesOrdenes, 'admin', z.tuple([esquemaPeriodo, id]), (periodo, oid) => exportarOrdenes(periodo, oid));
  manejar(CANALES.copiasEstado, 'admin', nada, estadoCopias);
  manejar(CANALES.copiasExportar, 'admin', nada, exportarCopia);
  manejar(CANALES.copiasElegir, 'admin', nada, elegirCopia);
  manejar(CANALES.copiasRestaurar, 'admin', nada, restaurarCopiaElegida);
  manejar(CANALES.copiasAbrirCarpeta, 'admin', nada, abrirCarpetaCopias);

  manejar(CANALES.sistemaEjemplo, 'admin', nada, () => cargarEjemplo(db()));
  manejar(CANALES.sistemaEjemploTurnos, 'admin', nada, () => cargarTurnosEjemplo(db()));
}

