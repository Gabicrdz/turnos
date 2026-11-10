import type { z } from 'zod';
import type { BaseDeDatos } from '../db/conexion';
import type { esquemaConsultorio } from '@compartido/esquemas';
import type { Consultorio, Resumen } from '@compartido/tipos';

type Lector = Pick<BaseDeDatos, '$client'>;

export function obtenerConsultorio(db: Lector): Consultorio {
  const valores = new Map(
    (db.$client.prepare('SELECT clave, valor FROM configuracion').all() as { clave: string; valor: string }[]).map((f) => [f.clave, f.valor]),
  );
  return {
    nombreConsultorio: valores.get('nombre_consultorio') ?? 'Mi Consultorio',
    direccion: valores.get('direccion') ?? '',
    telefono: valores.get('telefono') ?? '',
  };
}

export function guardarConsultorio(db: BaseDeDatos, datos: z.output<typeof esquemaConsultorio>): void {
  const guardar = db.$client.prepare('INSERT INTO configuracion (clave, valor) VALUES (?, ?) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor');
  db.$client.transaction(() => {
    guardar.run('nombre_consultorio', datos.nombreConsultorio);
    guardar.run('direccion', datos.direccion);
    guardar.run('telefono', datos.telefono);
  })();
}

/** Cuántos hay de cada cosa (activos). */
export function resumen(db: Lector): Resumen {
  const n = (tabla: string) => (db.$client.prepare(`SELECT count(*) AS n FROM ${tabla} WHERE activo = 1`).get() as { n: number }).n;
  const turnos = (db.$client.prepare('SELECT count(*) AS n FROM turnos').get() as { n: number }).n;
  return { pacientes: n('pacientes'), profesionales: n('profesionales'), obrasSociales: n('obras_sociales'), turnos };
}
