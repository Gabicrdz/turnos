import { eq } from 'drizzle-orm';
import type { z } from 'zod';
import type { BaseDeDatos } from '../db/conexion';
import { obrasSociales } from '../db/esquema';
import type { esquemaObraSocial } from '@compartido/esquemas';
import type { ObraSocial } from '@compartido/tipos';
import { ErrorDeUsuario } from './errores';

/** Todas (activas primero, por nombre), con cuántos pacientes activos tiene cada una. */
export function listarObrasSociales(db: BaseDeDatos): ObraSocial[] {
  const filas = db.$client
    .prepare(
      /* sql */ `SELECT o.id, o.nombre, o.activo,
                        (SELECT count(*) FROM pacientes p WHERE p.obra_social_id = o.id AND p.activo = 1) AS pacientes
                 FROM obras_sociales o
                 ORDER BY o.activo DESC, o.nombre COLLATE NOCASE`,
    )
    .all() as (Omit<ObraSocial, 'activo'> & { activo: number })[];
  return filas.map((f) => ({ ...f, activo: f.activo === 1 }));
}

export function guardarObraSocial(db: BaseDeDatos, datos: z.output<typeof esquemaObraSocial>): number {
  const repetida = db.$client
    .prepare('SELECT id, nombre FROM obras_sociales WHERE nombre = ? COLLATE NOCASE')
    .get(datos.nombre) as { id: number; nombre: string } | undefined;
  if (repetida && repetida.id !== datos.id) throw new ErrorDeUsuario(`Ya existe la obra social "${repetida.nombre}".`);
  if (datos.id) {
    const r = db.update(obrasSociales).set({ nombre: datos.nombre }).where(eq(obrasSociales.id, datos.id)).run();
    if (r.changes === 0) throw new ErrorDeUsuario('Esa obra social ya no existe.');
    return datos.id;
  }
  return db.insert(obrasSociales).values({ nombre: datos.nombre }).returning({ id: obrasSociales.id }).get().id;
}

/**
 * Dar de baja NO borra: los pacientes que la tienen la conservan (con historia),
 * pero ya no aparece para elegir en pacientes nuevos.
 */
export function cambiarActivoObraSocial(db: BaseDeDatos, id: number, activo: boolean): void {
  const r = db.update(obrasSociales).set({ activo }).where(eq(obrasSociales.id, id)).run();
  if (r.changes === 0) throw new ErrorDeUsuario('Esa obra social ya no existe.');
}
