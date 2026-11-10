// Días sin atención (feriados, vacaciones, congresos). En la etapa 2, la
// agenda no va a ofrecer turnos en esos días.
import { eq } from 'drizzle-orm';
import type { z } from 'zod';
import type { BaseDeDatos } from '../db/conexion';
import { bloqueos } from '../db/esquema';
import type { esquemaBloqueo } from '@compartido/esquemas';
import type { Bloqueo } from '@compartido/tipos';
import { ErrorDeUsuario } from './errores';
import { fechaLocal } from './fechas';

/** Los que terminan hoy o después, del más cercano al más lejano. */
export function bloqueosProximos(db: Pick<BaseDeDatos, '$client'>, ahora: Date = new Date()): Bloqueo[] {
  return db.$client
    .prepare(
      /* sql */ `SELECT b.id, b.profesional_id AS profesionalId, b.desde, b.hasta, b.motivo,
                        CASE WHEN p.id IS NULL THEN 'Todo el consultorio'
                             ELSE trim(p.titulo || ' ' || p.nombre || ' ' || p.apellido) END AS quien
                 FROM bloqueos b LEFT JOIN profesionales p ON p.id = b.profesional_id
                 WHERE b.hasta >= ?
                 ORDER BY b.desde, b.id`,
    )
    .all(fechaLocal(ahora)) as Bloqueo[];
}

export function crearBloqueo(db: BaseDeDatos, datos: z.output<typeof esquemaBloqueo>): number {
  if (datos.profesionalId !== null) {
    const existe = db.$client.prepare('SELECT 1 FROM profesionales WHERE id = ?').get(datos.profesionalId);
    if (!existe) throw new ErrorDeUsuario('Ese profesional ya no existe.');
  }
  return db.insert(bloqueos).values(datos).returning({ id: bloqueos.id }).get().id;
}

/** Un bloqueo es configuración (no historia): se puede borrar de verdad. */
export function borrarBloqueo(db: BaseDeDatos, id: number): void {
  const r = db.delete(bloqueos).where(eq(bloqueos.id, id)).run();
  if (r.changes === 0) throw new ErrorDeUsuario('Ese día sin atención ya no existe.');
}

/** ¿Ese día está bloqueado para ese profesional (o para todos)? La usará la agenda. */
export function estaBloqueado(db: Pick<BaseDeDatos, '$client'>, profesionalId: number, fecha: string): boolean {
  return Boolean(
    db.$client
      .prepare('SELECT 1 FROM bloqueos WHERE ? BETWEEN desde AND hasta AND (profesional_id IS NULL OR profesional_id = ?) LIMIT 1')
      .get(fecha, profesionalId),
  );
}
