// Tipos que comparten el main y la ventana (lo que VUELVE del main).
import type { COLORES_PROFESIONAL, METODOS, ROLES } from './esquemas';
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
  precioConsultaCentavos: number;
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
  mensajeRecordatorio: string;
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
  recordadoEn: string | null;
  /** Quién dio el turno (null si se cargó antes de que hubiera usuarios) y cuándo. */
  dadoPor: string | null;
  creadoEn: string;
  /** El cobro vigente del turno, si ya se cobró. */
  cobro: CobroDeTurno | null;
  /** Si ya tiene las notas de la consulta. */
  consultaId: number | null;
  /** "Apellido, Nombre" */
  paciente: string;
  dni: string | null;
  telefono: string;
  obraSocialId: number | null;
  obraSocial: string | null;
  numeroAfiliado: string;
  fechaNacimiento: string | null;
  notasPaciente: string;
  pacienteActivo: boolean;
}

export type MetodoPago = (typeof METODOS)[number];

export interface CobroDeTurno {
  id: number;
  tipo: 'particular' | 'obra_social';
  obraSocial: string | null;
  numeroAutorizacion: string;
  montoCentavos: number;
  metodo: MetodoPago | null;
  /** Quién cobró y cuándo. */
  usuario: string | null;
  creadoEn: string;
}

/** Una entrada de la historia clínica. */
export interface Consulta {
  id: number;
  turnoId: number;
  fecha: string;
  profesional: string;
  profesionalId: number;
  motivo: string;
  evolucion: string;
  diagnostico: string;
  indicaciones: string;
  /** Solo se puede corregir el mismo día; después queda cerrada. */
  editable: boolean;
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

export type Rol = (typeof ROLES)[number];

export const NOMBRE_ROL: Record<Rol, string> = {
  admin: 'Administración',
  profesional: 'Profesional',
  recepcion: 'Recepción',
};

export interface Usuario {
  id: number;
  nombre: string;
  rol: Rol;
  /** Si está vinculado a un profesional: ve la historia clínica y carga las notas de sus turnos. */
  profesionalId: number | null;
}

/** Lo que devuelve "Cargar datos de ejemplo": los conteos y los usuarios creados con su PIN. */
export interface ResultadoEjemplo extends Resumen {
  usuarios: { nombre: string; rol: Rol; pin: string }[];
}
