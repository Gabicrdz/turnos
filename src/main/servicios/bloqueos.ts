// Días sin atención (feriados, vacaciones, congresos). La agenda no ofrece
// turnos en esos días y el main no deja darlos.
import { eq } from 'drizzle-orm';
import type { z } from 'zod';
import type { BaseDeDatos } from '../db/conexion';
import { bloqueos } from '../db/esquema';
import type { esquemaBloqueo } from '@compartido/esquemas';
import type { Bloqueo, BloqueoCreado } from '@compartido/tipos';
import { ErrorDeUsuario } from './errores';
import { fechaLocal } from './fechas';

const SELECT_BLOQUEO = /* sql */ `
  SELECT b.id, b.profesional_id AS profesionalId, b.desde, b.hasta, b.motivo,
         CASE WHEN p.id IS NULL THEN 'Todo el consultorio'
              ELSE trim(p.titulo || ' ' || p.nombre || ' ' || p.apellido) END AS quien
  FROM bloqueos b LEFT JOIN profesionales p ON p.id = b.profesional_id`;

/** Los que terminan hoy o después, del más cercano al más lejano. */
export function bloqueosProximos(db: Pick<BaseDeDatos, '$client'>, ahora: Date = new Date()): Bloqueo[] {
  return db.$client.prepare(`${SELECT_BLOQUEO} WHERE b.hasta >= ? ORDER BY b.desde, b.id`).all(fechaLocal(ahora)) as Bloqueo[];
}

/** Los que tocan algún día del rango (para la agenda). */
export function bloqueosEntre(db: Pick<BaseDeDatos, '$client'>, desde: string, hasta: string): Bloqueo[] {
  return db.$client.prepare(`${SELECT_BLOQUEO} WHERE b.desde <= ? AND b.hasta >= ? ORDER BY b.desde, b.id`).all(hasta, desde) as Bloqueo[];
}

/**
 * Crea el día sin atención. Los turnos que ya estaban dados esos días NO se
 * borran solos (hay que avisarle a cada paciente): se devuelve cuántos son.
 */
export function crearBloqueo(db: BaseDeDatos, datos: z.output<typeof esquemaBloqueo>): BloqueoCreado {
  if (datos.profesionalId !== null) {
    const existe = db.$client.prepare('SELECT 1 FROM profesionales WHERE id = ?').get(datos.profesionalId);
    if (!existe) throw new ErrorDeUsuario('Ese profesional ya no existe.');
  }
  const id = db.insert(bloqueos).values(datos).returning({ id: bloqueos.id }).get().id;
  const { n } = db.$client
    .prepare(
      `SELECT count(*) AS n FROM turnos WHERE fecha BETWEEN ? AND ? AND estado <> 'cancelado' AND (? IS NULL OR profesional_id = ?)`,
    )
    .get(datos.desde, datos.hasta, datos.profesionalId, datos.profesionalId) as { n: number };
  return { id, turnosAfectados: n };
}

/** Un bloqueo es configuración (no historia): se puede borrar de verdad. */
export function borrarBloqueo(db: BaseDeDatos, id: number): void {
  const r = db.delete(bloqueos).where(eq(bloqueos.id, id)).run();
  if (r.changes === 0) throw new ErrorDeUsuario('Ese día sin atención ya no existe.');
}

/** El bloqueo de ese día para ese profesional (o para todos), si hay. */
export function bloqueoDelDia(db: Pick<BaseDeDatos, '$client'>, profesionalId: number, fecha: string): { motivo: string } | undefined {
  return db.$client
    .prepare('SELECT motivo FROM bloqueos WHERE ? BETWEEN desde AND hasta AND (profesional_id IS NULL OR profesional_id = ?) ORDER BY profesional_id IS NULL LIMIT 1')
    .get(fecha, profesionalId) as { motivo: string } | undefined;
}

/** ¿Ese día está bloqueado para ese profesional (o para todos)? */
export function estaBloqueado(db: Pick<BaseDeDatos, '$client'>, profesionalId: number, fecha: string): boolean {
  return Boolean(
    db.$client
      .prepare('SELECT 1 FROM bloqueos WHERE ? BETWEEN desde AND hasta AND (profesional_id IS NULL OR profesional_id = ?) LIMIT 1')
      .get(fecha, profesionalId),
  );
}
