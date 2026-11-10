import { eq } from 'drizzle-orm';
import type { z } from 'zod';
import type { BaseDeDatos } from '../db/conexion';
import { horarios, profesionales } from '../db/esquema';
import type { esquemaProfesional } from '@compartido/esquemas';
import type { ColorProfesional, Profesional } from '@compartido/tipos';
import type { Franja } from '@compartido/horarios';
import { ErrorDeUsuario } from './errores';

type Lector = Pick<BaseDeDatos, '$client'>;

/** Activos primero, por apellido; cada uno con sus franjas de la semana. */
export function listarProfesionales(db: Lector): Profesional[] {
  const filas = db.$client
    .prepare(
      /* sql */ `SELECT id, titulo, nombre, apellido, especialidad, matricula, color,
                        duracion_turno_min AS duracionTurnoMin, precio_consulta_centavos AS precioConsultaCentavos, activo
                 FROM profesionales ORDER BY activo DESC, apellido COLLATE NOCASE, nombre COLLATE NOCASE`,
    )
    .all() as (Omit<Profesional, 'activo' | 'horarios' | 'color'> & { activo: number; color: string })[];
  const franjas = db.$client
    .prepare('SELECT profesional_id AS profesionalId, dia_semana AS diaSemana, desde, hasta FROM horarios ORDER BY dia_semana, desde')
    .all() as (Franja & { profesionalId: number })[];
  return filas.map((p) => ({
    ...p,
    color: p.color as ColorProfesional,
    activo: p.activo === 1,
    horarios: franjas.filter((f) => f.profesionalId === p.id).map(({ diaSemana, desde, hasta }) => ({ diaSemana, desde, hasta })),
  }));
}

/** Nombre para mostrar: "Dra. Laura Benítez". */
export function nombreProfesional(p: Pick<Profesional, 'titulo' | 'nombre' | 'apellido'>): string {
  return [p.titulo, p.nombre, p.apellido].filter(Boolean).join(' ');
}

/**
 * Crea o edita un profesional. Los horarios se REEMPLAZAN enteros (se borran
 * los viejos y se guardan los nuevos) dentro de la misma transacción: si algo
 * falla, queda el horario anterior intacto.
 */
export function guardarProfesional(db: BaseDeDatos, datos: z.output<typeof esquemaProfesional>): number {
  const { id, horarios: franjas, ...campos } = datos;
  return db.transaction((tx) => {
    let profesionalId: number;
    if (id) {
      const r = tx.update(profesionales).set(campos).where(eq(profesionales.id, id)).run();
      if (r.changes === 0) throw new ErrorDeUsuario('Ese profesional ya no existe.');
      profesionalId = id;
      tx.delete(horarios).where(eq(horarios.profesionalId, id)).run();
    } else {
      profesionalId = tx.insert(profesionales).values(campos).returning({ id: profesionales.id }).get().id;
    }
    if (franjas.length) tx.insert(horarios).values(franjas.map((f) => ({ ...f, profesionalId }))).run();
    return profesionalId;
  });
}

export function cambiarActivoProfesional(db: BaseDeDatos, id: number, activo: boolean): void {
  const r = db.update(profesionales).set({ activo }).where(eq(profesionales.id, id)).run();
  if (r.changes === 0) throw new ErrorDeUsuario('Ese profesional ya no existe.');
}
