// Conecta los pedidos de la ventana (ipcRenderer.invoke) con los servicios.
// Cada canal valida lo que llega con Zod ANTES de tocar la base de datos:
// nunca confiamos en lo que manda la ventana.
import { ipcMain } from 'electron';
import { z, type ZodType } from 'zod';
import { CANALES } from '@compartido/api';
import {
  esquemaBloqueo,
  esquemaBuscarPacientes,
  esquemaConsultorio,
  esquemaEstado,
  esquemaFecha,
  esquemaMoverTurno,
  esquemaObraSocial,
  esquemaPaciente,
  esquemaProfesional,
  esquemaRango,
  esquemaTurno,
  id,
} from '@compartido/esquemas';
import type { InfoSistema, Respuesta } from '@compartido/tipos';
import { obtenerDb } from './db/conexion';
import { ErrorDeUsuario } from './servicios/errores';
import { buscarPacientes, cambiarActivoPaciente, guardarPaciente } from './servicios/pacientes';
import { cambiarActivoProfesional, guardarProfesional, listarProfesionales } from './servicios/profesionales';
import { bloqueosProximos, borrarBloqueo, crearBloqueo } from './servicios/bloqueos';
import { cambiarActivoObraSocial, guardarObraSocial, listarObrasSociales } from './servicios/obras-sociales';
import { guardarConsultorio, obtenerConsultorio, resumen } from './servicios/consultorio';
import { cargarEjemplo, cargarTurnosEjemplo } from './servicios/ejemplo';
import { agenda, cambiarEstado, darTurno, horariosLibres, moverTurno, proximosLibres, turnosDePaciente } from './servicios/turnos';

/** Convierte cualquier error en un mensaje para la ventana. */
export function mensajeDeError(error: unknown): string {
  if (error instanceof ErrorDeUsuario) return error.message;
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? 'Hay datos inválidos.';
  console.error(error);
  return 'Ocurrió un error inesperado. Si se repite, avisale a quien te instaló el sistema.';
}

/**
 * Registra un canal. `esquema` describe los argumentos que manda la ventana
 * (como lista: [arg1, arg2…]); `fn` los recibe ya validados.
 */
export function manejar<E extends ZodType<unknown[]>, T>(canal: string, esquema: E, fn: (...args: z.output<E>) => T | Promise<T>): void {
  ipcMain.handle(canal, async (_evento, ...args: unknown[]): Promise<Respuesta<T>> => {
    try {
      const validados = esquema.parse(args) as z.output<E>;
      return { ok: true, datos: await fn(...validados) };
    } catch (error) {
      return { ok: false, error: mensajeDeError(error) };
    }
  });
}

const nada = z.tuple([]);
const activo = z.boolean();

export function registrarCanales(info: () => InfoSistema): void {
  const db = () => obtenerDb();

  // ── Pacientes ──
  manejar(CANALES.pacientesBuscar, z.tuple([esquemaBuscarPacientes]), (filtro) => buscarPacientes(db(), filtro));
  manejar(CANALES.pacientesGuardar, z.tuple([esquemaPaciente]), (datos) => guardarPaciente(db(), datos));
  manejar(CANALES.pacientesActivo, z.tuple([id, activo]), (pid, a) => {
    cambiarActivoPaciente(db(), pid, a);
    return null;
  });

  // ── Profesionales y días sin atención ──
  manejar(CANALES.profesionalesListar, nada, () => listarProfesionales(db()));
  manejar(CANALES.profesionalesGuardar, z.tuple([esquemaProfesional]), (datos) => guardarProfesional(db(), datos));
  manejar(CANALES.profesionalesActivo, z.tuple([id, activo]), (pid, a) => {
    cambiarActivoProfesional(db(), pid, a);
    return null;
  });
  manejar(CANALES.bloqueosProximos, nada, () => bloqueosProximos(db()));
  manejar(CANALES.bloqueosCrear, z.tuple([esquemaBloqueo]), (datos) => crearBloqueo(db(), datos));
  manejar(CANALES.bloqueosBorrar, z.tuple([id]), (bid) => {
    borrarBloqueo(db(), bid);
    return null;
  });

  // ── Turnos ──
  manejar(CANALES.turnosAgenda, z.tuple([esquemaRango]), (rango) => agenda(db(), rango));
  manejar(CANALES.turnosLibres, z.tuple([id, esquemaFecha]), (pid, fecha) => horariosLibres(db(), pid, fecha));
  manejar(CANALES.turnosProximosLibres, z.tuple([id]), (pid) => proximosLibres(db(), pid));
  manejar(CANALES.turnosDar, z.tuple([esquemaTurno]), (datos) => darTurno(db(), datos));
  manejar(CANALES.turnosMover, z.tuple([esquemaMoverTurno]), (datos) => {
    moverTurno(db(), datos);
    return null;
  });
  manejar(CANALES.turnosEstado, z.tuple([id, esquemaEstado]), (tid, estado) => {
    cambiarEstado(db(), tid, estado);
    return null;
  });
  manejar(CANALES.turnosDePaciente, z.tuple([id]), (pid) => turnosDePaciente(db(), pid));

  // ── Obras sociales ──
  manejar(CANALES.obrasListar, nada, () => listarObrasSociales(db()));
  manejar(CANALES.obrasGuardar, z.tuple([esquemaObraSocial]), (datos) => guardarObraSocial(db(), datos));
  manejar(CANALES.obrasActivo, z.tuple([id, activo]), (oid, a) => {
    cambiarActivoObraSocial(db(), oid, a);
    return null;
  });

  // ── Consultorio y sistema ──
  manejar(CANALES.consultorioObtener, nada, () => obtenerConsultorio(db()));
  manejar(CANALES.consultorioGuardar, z.tuple([esquemaConsultorio]), (datos) => {
    guardarConsultorio(db(), datos);
    return null;
  });
  manejar(CANALES.sistemaInfo, nada, info);
  manejar(CANALES.sistemaResumen, nada, () => resumen(db()));
  manejar(CANALES.sistemaEjemplo, nada, () => cargarEjemplo(db()));
  manejar(CANALES.sistemaEjemploTurnos, nada, () => cargarTurnosEjemplo(db()));
}
