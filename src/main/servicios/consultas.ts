// Notas de la consulta (historia clínica simple). Una por turno.
//
// Regla importante: una consulta se puede corregir SOLO el mismo día en que se
// cargó. Después queda cerrada: la historia clínica es un registro y no se
// "reescribe" (si hay algo para agregar, va en la consulta siguiente).
import type { z } from 'zod';
import type { BaseDeDatos } from '../db/conexion';
import type { esquemaConsulta } from '@compartido/esquemas';
import { NOMBRE_ESTADO } from '@compartido/agenda';
import type { Consulta, Usuario } from '@compartido/tipos';
import { ErrorDeUsuario } from './errores';
import { fechaLocal, momentoLocal } from './fechas';
import { obtenerTurno } from './turnos';

type Lector = Pick<BaseDeDatos, '$client'>;

const ddmmaaaa = (fecha: string) => `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}/${fecha.slice(0, 4)}`;

/** Todas las consultas del paciente, de la más nueva a la más vieja. */
export function historiaClinica(db: Lector, pacienteId: number, ahora: Date = new Date()): Consulta[] {
  const hoy = fechaLocal(ahora);
  const filas = db.$client
    .prepare(
      `SELECT c.id, c.turno_id AS turnoId, c.fecha, c.profesional_id AS profesionalId,
              trim(pr.titulo || ' ' || pr.nombre || ' ' || pr.apellido) AS profesional,
              c.motivo, c.evolucion, c.diagnostico, c.indicaciones, c.creado_en AS creadoEn
       FROM consultas c JOIN profesionales pr ON pr.id = c.profesional_id
       WHERE c.paciente_id = ?
       ORDER BY c.fecha DESC, c.id DESC`,
    )
    .all(pacienteId) as (Omit<Consulta, 'editable'> & { creadoEn: string })[];
  return filas.map(({ creadoEn, ...c }) => ({ ...c, editable: creadoEn.slice(0, 10) === hoy }));
}

/**
 * Guarda (o corrige, si es el mismo día) las notas de la consulta de un turno
 * y deja el turno como "atendido". Todo en una transacción.
 * Solo las carga el profesional del turno (el usuario vinculado a él).
 */
export function guardarConsulta(
  db: BaseDeDatos,
  datos: z.output<typeof esquemaConsulta>,
  usuario: Pick<Usuario, 'id' | 'profesionalId'>,
  ahora: Date = new Date(),
): number {
  const turno = obtenerTurno(db, datos.turnoId);
  const hoy = fechaLocal(ahora);
  if (usuario.profesionalId !== turno.profesionalId) {
    const { nombre } = db.$client
      .prepare(`SELECT trim(titulo || ' ' || nombre || ' ' || apellido) AS nombre FROM profesionales WHERE id = ?`)
      .get(turno.profesionalId) as { nombre: string };
    throw new ErrorDeUsuario(`Este turno es de ${nombre}: las notas de la consulta las carga ese profesional.`);
  }
  if (turno.estado === 'cancelado' || turno.estado === 'ausente') {
    throw new ErrorDeUsuario(`Ese turno está ${NOMBRE_ESTADO[turno.estado].toLowerCase()}: no se le puede cargar una consulta.`);
  }
  if (turno.fecha > hoy) throw new ErrorDeUsuario('Ese turno todavía no llegó: la consulta se carga el día del turno.');

  const existente = db.$client.prepare('SELECT id, creado_en AS creadoEn FROM consultas WHERE turno_id = ?').get(turno.id) as
    | { id: number; creadoEn: string }
    | undefined;
  if (existente && existente.creadoEn.slice(0, 10) !== hoy) {
    throw new ErrorDeUsuario(`La consulta se cargó el ${ddmmaaaa(existente.creadoEn)} y ya está cerrada: las notas de días anteriores no se modifican.`);
  }

  const momento = momentoLocal(ahora);
  return db.$client.transaction(() => {
    let id: number;
    if (existente) {
      db.$client
        .prepare('UPDATE consultas SET motivo = ?, evolucion = ?, diagnostico = ?, indicaciones = ?, actualizado_en = ? WHERE id = ?')
        .run(datos.motivo, datos.evolucion, datos.diagnostico, datos.indicaciones, momento, existente.id);
      id = existente.id;
    } else {
      id = Number(
        db.$client
          .prepare(
            `INSERT INTO consultas (turno_id, paciente_id, profesional_id, fecha, motivo, evolucion, diagnostico, indicaciones, usuario_id, creado_en, actualizado_en)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(turno.id, turno.pacienteId, turno.profesionalId, turno.fecha, datos.motivo, datos.evolucion, datos.diagnostico, datos.indicaciones, usuario.id, momento, momento)
          .lastInsertRowid,
      );
    }
    if (turno.estado !== 'atendido') {
      db.$client.prepare(`UPDATE turnos SET estado = 'atendido', actualizado_en = ? WHERE id = ?`).run(momento, turno.id);
    }
    return id;
  })();
}
