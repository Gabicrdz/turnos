// Tipos que comparten el main y la ventana (lo que VUELVE del main).
import type { COLORES_PROFESIONAL } from './esquemas';
import type { Franja } from './horarios';
import type { EstadoTurno } from './agenda';

export type Respuesta<T> = { ok: true; datos: T } | { ok: false; error: string };

export type ColorProfesional = (typeof COLORES_PROFESIONAL)[number];

export interface ObraSocial {
  id: number;
  nombre: string;
  activo: boolean;
  pacientes: number;
}

export interface Profesional {
  id: number;
  titulo: string;
  nombre: string;
  apellido: string;
  especialidad: string;
  matricula: string;
  color: ColorProfesional;
  duracionTurnoMin: number;
  activo: boolean;
  horarios: Franja[];
}

export interface Bloqueo {
  id: number;
  profesionalId: number | null;
  /** "Todo el consultorio" o el nombre del profesional. */
  quien: string;
  desde: string;
  hasta: string;
  motivo: string;
}

export interface Paciente {
  id: number;
  nombre: string;
  apellido: string;
  dni: string | null;
  fechaNacimiento: string | null;
  telefono: string;
  email: string;
  obraSocialId: number | null;
  obraSocial: string | null;
  numeroAfiliado: string;
  notas: string;
  activo: boolean;
}

export interface Consultorio {
  nombreConsultorio: string;
  direccion: string;
  telefono: string;
}

export interface Resumen {
  pacientes: number;
  profesionales: number;
  obrasSociales: number;
  /** Todos los turnos cargados (para saber si la agenda está vacía). */
  turnos: number;
}

export interface InfoSistema {
  version: string;
  baseDeDatos: string;
}

export interface Turno {
  id: number;
  profesionalId: number;
  pacienteId: number;
  fecha: string;
  desde: string;
  hasta: string;
  estado: EstadoTurno;
  motivo: string;
  llegoEn: string | null;
  /** "Apellido, Nombre" */
  paciente: string;
  dni: string | null;
  telefono: string;
  obraSocial: string | null;
  numeroAfiliado: string;
  pacienteActivo: boolean;
}

/** Lo que necesita la agenda para un rango de días. */
export interface Agenda {
  turnos: Turno[];
  bloqueos: Bloqueo[];
}

export interface HorarioLibre {
  fecha: string;
  desde: string;
}

/** Un turno visto desde la ficha del paciente. */
export interface TurnoDePaciente {
  id: number;
  fecha: string;
  desde: string;
  estado: EstadoTurno;
  profesional: string;
  color: ColorProfesional;
}

export interface TurnosDePaciente {
  proximos: TurnoDePaciente[];
  anteriores: TurnoDePaciente[];
}

export interface BloqueoCreado {
  id: number;
  /** Turnos que ya estaban dados en esos días (hay que avisarles a los pacientes). */
  turnosAfectados: number;
}
