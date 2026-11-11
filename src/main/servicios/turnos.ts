// Turnos: dar, reprogramar, cambiar de estado y armar la agenda.
//
// Las reglas se controlan ACÁ, en el main, antes de escribir (para dar un
// mensaje claro: "se pisa con el turno de Pérez, Juan"). Además, la base tiene
// un trigger que rechaza cualquier superposición (migración 2): si algo se
// escapara, la agenda igual no se rompe.
import type { z } from 'zod';
import type { BaseDeDatos } from '../db/conexion';
import type { esquemaMoverTurno, esquemaRango, esquemaTurno } from '@compartido/esquemas';
import { NOMBRE_DIA } from '@compartido/esquemas';
import type { Agenda, CobroDeTurno, ColorProfesional, HorarioLibre, Turno, TurnoDePaciente, TurnosDePaciente } from '@compartido/tipos';
import {
  NOMBRE_ESTADO,
  dentroDeLasFranjas,
  duracion,
  espaciosLibres,
  estadosPosibles,
  sePuedeReprogramar,
  sumarMinutos,
  type EstadoTurno,
} from '@compartido/agenda';
import { aMinutos, diaDeLaSemana, type Franja } from '@compartido/horarios';
import { ErrorDeUsuario } from './errores';
import { fechaLocal, horaLocal, momentoLocal } from './fechas';
import { bloqueoDelDia, bloqueosEntre } from './bloqueos';

type Lector = Pick<BaseDeDatos, '$client'>;

const SELECT_TURNO = /* sql */ `
  SELECT t.id, t.profesional_id AS profesionalId, t.paciente_id AS pacienteId, t.fecha, t.desde, t.hasta,
         t.estado, t.motivo, t.llego_en AS llegoEn, t.recordado_en AS recordadoEn,
         ud.nombre AS dadoPor, t.creado_en AS creadoEn,
         p.apellido || ', ' || p.nombre AS paciente, p.dni, p.telefono, p.obra_social_id AS obraSocialId, o.nombre AS obraSocial,
         p.numero_afiliado AS numeroAfiliado, p.fecha_nacimiento AS fechaNacimiento, p.notas AS notasPaciente,
         p.activo AS pacienteActivo,
         c.id AS cobroId, c.tipo AS cobroTipo, oc.nombre AS cobroObraSocial, c.numero_autorizacion AS cobroAutorizacion,
         c.monto_centavos AS cobroMonto, c.metodo AS cobroMetodo, uc.nombre AS cobroUsuario, c.creado_en AS cobroCreadoEn,
         co.id AS consultaId
  FROM turnos t
  JOIN pacientes p ON p.id = t.paciente_id
  LEFT JOIN obras_sociales o ON o.id = p.obra_social_id
  LEFT JOIN cobros c ON c.turno_id = t.id AND c.anulado = 0
  LEFT JOIN obras_sociales oc ON oc.id = c.obra_social_id
  LEFT JOIN consultas co ON co.turno_id = t.id
  LEFT JOIN usuarios ud ON ud.id = t.dado_por
  LEFT JOIN usuarios uc ON uc.id = c.usuario_id`;

type FilaTurno = Omit<Turno, 'pacienteActivo' | 'cobro'> & {
  pacienteActivo: number;
  cobroId: number | null;
  cobroTipo: CobroDeTurno['tipo'] | null;
  cobroObraSocial: string | null;
  cobroAutorizacion: string | null;
  cobroMonto: number | null;
  cobroMetodo: CobroDeTurno['metodo'];
  cobroUsuario: string | null;
  cobroCreadoEn: string | null;
};
const aTurno = ({ cobroId, cobroTipo, cobroObraSocial, cobroAutorizacion, cobroMonto, cobroMetodo, cobroUsuario, cobroCreadoEn, ...f }: FilaTurno): Turno => ({
  ...f,
  pacienteActivo: f.pacienteActivo === 1,
  cobro:
    cobroId === null
      ? null
      : {
          id: cobroId,
          tipo: cobroTipo!,
          obraSocial: cobroObraSocial,
          numeroAutorizacion: cobroAutorizacion ?? '',
          montoCentavos: cobroMonto ?? 0,
          metodo: cobroMetodo,
          usuario: cobroUsuario,
          creadoEn: cobroCreadoEn ?? '',
        },
});

/** Todos los turnos (también los cancelados) y los días sin atención de un rango. */
export function agenda(db: Lector, rango: z.output<typeof esquemaRango>): Agenda {
  const turnos = (
    db.$client.prepare(`${SELECT_TURNO} WHERE t.fecha BETWEEN ? AND ? ORDER BY t.fecha, t.desde, t.profesional_id`).all(rango.desde, rango.hasta) as FilaTurno[]
  ).map(aTurno);
  return { turnos, bloqueos: bloqueosEntre(db, rango.desde, rango.hasta) };
}

export function obtenerTurno(db: Lector, id: number): Turno {
  const fila = db.$client.prepare(`${SELECT_TURNO} WHERE t.id = ?`).get(id) as FilaTurno | undefined;
  if (!fila) throw new ErrorDeUsuario('Ese turno ya no existe.');
  return aTurno(fila);
}

// ---------- Datos que necesitan las reglas ----------
interface ProfesionalAgenda {
  id: number;
  nombre: string;
  activo: boolean;
  duracionTurnoMin: number;
}

function datosProfesional(db: Lector, id: number): ProfesionalAgenda {
  const p = db.$client
    .prepare(
      `SELECT id, trim(titulo || ' ' || nombre || ' ' || apellido) AS nombre, activo, duracion_turno_min AS duracionTurnoMin FROM profesionales WHERE id = ?`,
    )
    .get(id) as (Omit<ProfesionalAgenda, 'activo'> & { activo: number }) | undefined;
  if (!p) throw new ErrorDeUsuario('Ese profesional ya no existe.');
  return { ...p, activo: p.activo === 1 };
}

function franjasDelDia(db: Lector, profesionalId: number, fecha: string): Pick<Franja, 'desde' | 'hasta'>[] {
  return db.$client
    .prepare('SELECT desde, hasta FROM horarios WHERE profesional_id = ? AND dia_semana = ? ORDER BY desde')
    .all(profesionalId, diaDeLaSemana(fecha)) as Pick<Franja, 'desde' | 'hasta'>[];
}

/** Turnos que ocupan el horario (no cancelados) de un profesional en un día. */
function ocupadosDelDia(db: Lector, profesionalId: number, fecha: string, excluirId: number | null) {
  return db.$client
    .prepare(
      `SELECT t.id, t.desde, t.hasta, p.apellido || ', ' || p.nombre AS paciente
       FROM turnos t JOIN pacientes p ON p.id = t.paciente_id
       WHERE t.profesional_id = ? AND t.fecha = ? AND t.estado <> 'cancelado' AND t.id IS NOT ?
       ORDER BY t.desde`,
    )
    .all(profesionalId, fecha, excluirId) as { id: number; desde: string; hasta: string; paciente: string }[];
}

const listaDeFranjas = (franjas: Pick<Franja, 'desde' | 'hasta'>[]) => franjas.map((f) => `${f.desde} a ${f.hasta}`).join(' y ');

interface Horario {
  profesionalId: number;
  pacienteId: number;
  fecha: string;
  desde: string;
  hasta: string;
}

/**
 * Todas las reglas para ocupar un horario. `excluirId` es el turno que se está
 * moviendo o reactivando (no se puede pisar consigo mismo).
 */
function validarHorario(db: Lector, h: Horario, excluirId: number | null, ahora: Date): void {
  const profesional = datosProfesional(db, h.profesionalId);
  if (!profesional.activo) throw new ErrorDeUsuario(`${profesional.nombre} está dado de baja: no se le pueden dar turnos.`);

  const paciente = db.$client.prepare('SELECT apellido || \', \' || nombre AS nombre, activo FROM pacientes WHERE id = ?').get(h.pacienteId) as
    | { nombre: string; activo: number }
    | undefined;
  if (!paciente) throw new ErrorDeUsuario('Ese paciente ya no existe.');
  if (paciente.activo !== 1) throw new ErrorDeUsuario(`${paciente.nombre} está dado de baja. Reactivalo en Pacientes para darle un turno.`);

  const hoy = fechaLocal(ahora);
  if (h.fecha < hoy) throw new ErrorDeUsuario('No se pueden dar turnos en días que ya pasaron.');
  if (aMinutos(h.hasta) > 24 * 60 || h.desde >= h.hasta) throw new ErrorDeUsuario('El turno tiene que terminar el mismo día.');

  const bloqueo = bloqueoDelDia(db, h.profesionalId, h.fecha);
  if (bloqueo) throw new ErrorDeUsuario(`${profesional.nombre} no atiende ese día${bloqueo.motivo ? ` (${bloqueo.motivo})` : ''}.`);

  const franjas = franjasDelDia(db, h.profesionalId, h.fecha);
  const dia = NOMBRE_DIA[diaDeLaSemana(h.fecha)];
  if (!franjas.length) throw new ErrorDeUsuario(`${profesional.nombre} no atiende los ${dia === 'sábado' || dia === 'domingo' ? `${dia}s` : dia}.`);
  if (!dentroDeLasFranjas(franjas, h)) {
    throw new ErrorDeUsuario(`Ese horario queda fuera de la atención de ${profesional.nombre} (ese día atiende de ${listaDeFranjas(franjas)}).`);
  }

  const pisado = ocupadosDelDia(db, h.profesionalId, h.fecha, excluirId).find((o) => o.desde < h.hasta && h.desde < o.hasta);
  if (pisado) throw new ErrorDeUsuario(`Ese horario se pisa con el turno de ${pisado.paciente} (${pisado.desde} a ${pisado.hasta}).`);

  // El mismo paciente no puede estar en dos consultorios a la vez
  const otro = db.$client
    .prepare(
      `SELECT t.desde, trim(pr.titulo || ' ' || pr.nombre || ' ' || pr.apellido) AS profesional
       FROM turnos t JOIN profesionales pr ON pr.id = t.profesional_id
       WHERE t.paciente_id = ? AND t.fecha = ? AND t.estado <> 'cancelado' AND t.id IS NOT ?
         AND t.desde < ? AND ? < t.hasta
       LIMIT 1`,
    )
    .get(h.pacienteId, h.fecha, excluirId, h.hasta, h.desde) as { desde: string; profesional: string } | undefined;
  if (otro) throw new ErrorDeUsuario(`${paciente.nombre} ya tiene un turno a esa hora (${otro.desde} con ${otro.profesional}).`);
}

/**
 * Si dos personas dan el mismo turno a la vez (o hay un error en el programa),
 * el trigger de la base salta con 'turno_superpuesto': lo traducimos a un mensaje.
 */
function conTrigger<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof Error && error.message.includes('turno_superpuesto')) {
      throw new ErrorDeUsuario('Ese horario se acaba de ocupar. Elegí otro.');
    }
    throw error;
  }
}

// ---------- Escribir ----------
/** `dadoPor`: el usuario que lo da (queda registrado). */
export function darTurno(db: BaseDeDatos, datos: z.output<typeof esquemaTurno>, ahora: Date = new Date(), dadoPor: number | null = null): number {
  const profesional = datosProfesional(db, datos.profesionalId);
  const hasta = sumarMinutos(datos.desde, datos.duracionMin ?? profesional.duracionTurnoMin);
  const horario = { profesionalId: datos.profesionalId, pacienteId: datos.pacienteId, fecha: datos.fecha, desde: datos.desde, hasta };
  validarHorario(db, horario, null, ahora);
  return conTrigger(() =>
    Number(
      db.$client
        .prepare('INSERT INTO turnos (profesional_id, paciente_id, fecha, desde, hasta, motivo, dado_por, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(horario.profesionalId, horario.pacienteId, horario.fecha, horario.desde, horario.hasta, datos.motivo, dadoPor, momentoLocal(ahora)).lastInsertRowid,
    ),
  );
}

/**
 * Cambia el día, la hora o el profesional. Mantiene la duración (o toma la del
 * nuevo profesional si cambia). Vuelve a "reservado": hay que confirmarlo de nuevo.
 */
export function moverTurno(db: BaseDeDatos, datos: z.output<typeof esquemaMoverTurno>, ahora: Date = new Date()): void {
  const turno = obtenerTurno(db, datos.id);
  if (!sePuedeReprogramar(turno.estado)) {
    throw new ErrorDeUsuario(
      turno.estado === 'cancelado'
        ? 'Ese turno está cancelado: volvé a reservarlo o dá uno nuevo.'
        : `Ese turno ya está ${NOMBRE_ESTADO[turno.estado].toLowerCase()}: solo se reprograman turnos pendientes.`,
    );
  }
  if (turno.fecha < fechaLocal(ahora)) throw new ErrorDeUsuario('Ese turno es de un día que ya pasó.');
  const minutos = datos.profesionalId === turno.profesionalId ? duracion(turno) : datosProfesional(db, datos.profesionalId).duracionTurnoMin;
  const horario = { profesionalId: datos.profesionalId, pacienteId: turno.pacienteId, fecha: datos.fecha, desde: datos.desde, hasta: sumarMinutos(datos.desde, minutos) };
  validarHorario(db, horario, turno.id, ahora);
  conTrigger(() =>
    db.$client
      .prepare(`UPDATE turnos SET profesional_id = ?, fecha = ?, desde = ?, hasta = ?, estado = 'reservado', actualizado_en = ? WHERE id = ?`)
      .run(horario.profesionalId, horario.fecha, horario.desde, horario.hasta, momentoLocal(ahora), turno.id),
  );
}

export function cambiarEstado(db: BaseDeDatos, id: number, estado: EstadoTurno, ahora: Date = new Date()): void {
  const turno = obtenerTurno(db, id);
  if (turno.estado === estado) return;
  const hoy = fechaLocal(ahora);
  if (!estadosPosibles(turno.estado, turno.fecha, hoy).includes(estado)) {
    if (turno.fecha > hoy && (estado === 'en_sala' || estado === 'atendido' || estado === 'ausente')) {
      throw new ErrorDeUsuario(`Ese turno es para más adelante: todavía no se puede marcar como ${NOMBRE_ESTADO[estado].toLowerCase()}.`);
    }
    if (turno.estado === 'cancelado') throw new ErrorDeUsuario('Ese turno cancelado es de un día que ya pasó: no se puede reactivar.');
    throw new ErrorDeUsuario(`Un turno ${NOMBRE_ESTADO[turno.estado].toLowerCase()} no puede pasar a ${NOMBRE_ESTADO[estado].toLowerCase()}.`);
  }
  // Lo que ya quedó registrado no se deshace cambiando el estado
  if (turno.estado === 'atendido' && turno.consultaId !== null) {
    throw new ErrorDeUsuario('Ese turno ya tiene las notas de la consulta: no puede volver atrás.');
  }
  if (turno.cobro && estado !== 'en_sala' && estado !== 'atendido') {
    throw new ErrorDeUsuario('Ese turno ya está cobrado: para cambiarlo, primero anulá el cobro.');
  }
  // Reactivar un cancelado es volver a ocupar el horario: mismas reglas que darlo
  if (turno.estado === 'cancelado') validarHorario(db, turno, turno.id, ahora);

  // Hora de llegada: se anota al pasar a "en sala" y se borra si se vuelve atrás
  const llegoEn =
    estado === 'en_sala' && turno.estado !== 'atendido' ? momentoLocal(ahora) : estado === 'en_sala' || estado === 'atendido' ? turno.llegoEn : null;
  conTrigger(() =>
    db.$client.prepare('UPDATE turnos SET estado = ?, llego_en = ?, actualizado_en = ? WHERE id = ?').run(estado, llegoEn, momentoLocal(ahora), id),
  );
}

// ---------- Horarios libres ----------
/** Horarios libres de un día (sin bloqueos, sin ocupados y, si es hoy, sin los que ya pasaron). */
export function horariosLibres(db: Lector, profesionalId: number, fecha: string, ahora: Date = new Date()): string[] {
  const profesional = datosProfesional(db, profesionalId);
  const hoy = fechaLocal(ahora);
  if (!profesional.activo || fecha < hoy || bloqueoDelDia(db, profesionalId, fecha)) return [];
  const desdeMinuto = fecha === hoy ? aMinutos(horaLocal(ahora)) : 0;
  return espaciosLibres(franjasDelDia(db, profesionalId, fecha), profesional.duracionTurnoMin, ocupadosDelDia(db, profesionalId, fecha, null), desdeMinuto);
}

/** Los primeros horarios libres desde ahora, buscando hasta 90 días adelante. */
export function proximosLibres(db: Lector, profesionalId: number, ahora: Date = new Date(), cantidad = 8): HorarioLibre[] {
  const encontrados: HorarioLibre[] = [];
  const dia = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 12);
  for (let i = 0; i < 90 && encontrados.length < cantidad; i++, dia.setDate(dia.getDate() + 1)) {
    const fecha = fechaLocal(dia);
    for (const desde of horariosLibres(db, profesionalId, fecha, ahora)) {
      encontrados.push({ fecha, desde });
      if (encontrados.length === cantidad) break;
    }
  }
  return encontrados;
}

// ---------- Ficha del paciente ----------
export function turnosDePaciente(db: Lector, pacienteId: number, ahora: Date = new Date()): TurnosDePaciente {
  const hoy = fechaLocal(ahora);
  const consulta = (where: string, orden: string, limite: number) =>
    (
      db.$client
        .prepare(
          `SELECT t.id, t.fecha, t.desde, t.estado, trim(pr.titulo || ' ' || pr.nombre || ' ' || pr.apellido) AS profesional, pr.color
           FROM turnos t JOIN profesionales pr ON pr.id = t.profesional_id
           WHERE t.paciente_id = ? AND ${where} ORDER BY ${orden} LIMIT ${limite}`,
        )
        .all(pacienteId, hoy) as (Omit<TurnoDePaciente, 'color'> & { color: string })[]
    ).map((t) => ({ ...t, color: t.color as ColorProfesional }));
  return {
    proximos: consulta(`t.fecha >= ? AND t.estado <> 'cancelado'`, 't.fecha, t.desde', 10),
    anteriores: consulta('t.fecha < ?', 't.fecha DESC, t.desde DESC', 5),
  };
}
