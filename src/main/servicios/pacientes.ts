import { eq } from 'drizzle-orm';
import type { z } from 'zod';
import type { BaseDeDatos } from '../db/conexion';
import { pacientes } from '../db/esquema';
import type { esquemaBuscarPacientes, esquemaPaciente } from '@compartido/esquemas';
import type { Paciente } from '@compartido/tipos';
import { ErrorDeUsuario } from './errores';
import { momentoLocal } from './fechas';
import { escaparLike, normalizar } from './texto';

export const MAXIMO_RESULTADOS = 300;

/**
 * Texto para buscar: apellido, nombre, DNI y teléfono, sin tildes.
 * Así "perez 3704" encuentra a "Pérez" con teléfono 3704…
 */
export function textoDeBusqueda(p: { apellido: string; nombre: string; dni: string | null; telefono: string }): string {
  return normalizar(`${p.apellido} ${p.nombre} ${p.dni ?? ''} ${p.telefono.replace(/\D/g, '')}`);
}

const SELECT = /* sql */ `
  SELECT p.id, p.nombre, p.apellido, p.dni, p.fecha_nacimiento AS fechaNacimiento, p.telefono, p.email,
         p.obra_social_id AS obraSocialId, o.nombre AS obraSocial, p.numero_afiliado AS numeroAfiliado,
         p.notas, p.activo
  FROM pacientes p LEFT JOIN obras_sociales o ON o.id = p.obra_social_id`;

/**
 * Busca por cada palabra escrita (todas tienen que aparecer, en cualquier orden).
 * Ordena por apellido y nombre. Devuelve como máximo 300.
 */
export function buscarPacientes(db: Pick<BaseDeDatos, '$client'>, filtro: z.output<typeof esquemaBuscarPacientes>): Paciente[] {
  const condiciones: string[] = [];
  const parametros: (string | number)[] = [];
  if (!filtro.incluirBajas) condiciones.push('p.activo = 1');
  for (const palabra of normalizar(filtro.texto).split(/\s+/).filter(Boolean)) {
    // Si escriben "30.123.456", buscamos "30123456"
    const termino = /^[\d.\-\s]+$/.test(palabra) ? palabra.replace(/\D/g, '') : palabra;
    if (!termino) continue;
    condiciones.push(`p.busqueda LIKE ? ESCAPE '\\'`);
    parametros.push(`%${escaparLike(termino)}%`);
  }
  if (filtro.obraSocialId === 'particular') condiciones.push('p.obra_social_id IS NULL');
  else if (filtro.obraSocialId !== null) {
    condiciones.push('p.obra_social_id = ?');
    parametros.push(filtro.obraSocialId);
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const filas = db.$client
    .prepare(`${SELECT} ${where} ORDER BY p.activo DESC, p.apellido COLLATE NOCASE, p.nombre COLLATE NOCASE LIMIT ${MAXIMO_RESULTADOS}`)
    .all(...parametros) as (Omit<Paciente, 'activo'> & { activo: number })[];
  return filas.map((f) => ({ ...f, activo: f.activo === 1 }));
}

export function guardarPaciente(db: BaseDeDatos, datos: z.output<typeof esquemaPaciente>, ahora: Date = new Date()): number {
  const dni = datos.dni || null;
  if (dni) {
    const otro = db.$client.prepare('SELECT id, apellido, nombre FROM pacientes WHERE dni = ?').get(dni) as
      | { id: number; apellido: string; nombre: string }
      | undefined;
    if (otro && otro.id !== datos.id) throw new ErrorDeUsuario(`Ese DNI ya es de ${otro.apellido}, ${otro.nombre}.`);
  }
  if (datos.obraSocialId !== null) {
    const os = db.$client.prepare('SELECT activo FROM obras_sociales WHERE id = ?').get(datos.obraSocialId) as { activo: number } | undefined;
    if (!os) throw new ErrorDeUsuario('Esa obra social ya no existe.');
  }
  const valores = {
    nombre: datos.nombre,
    apellido: datos.apellido,
    dni,
    fechaNacimiento: datos.fechaNacimiento || null,
    telefono: datos.telefono,
    email: datos.email,
    obraSocialId: datos.obraSocialId,
    numeroAfiliado: datos.obraSocialId === null ? '' : datos.numeroAfiliado,
    notas: datos.notas,
    busqueda: textoDeBusqueda({ ...datos, dni }),
  };
  if (datos.fechaNacimiento && datos.fechaNacimiento > momentoLocal(ahora).slice(0, 10)) {
    throw new ErrorDeUsuario('La fecha de nacimiento no puede ser futura.');
  }
  if (datos.id) {
    const r = db
      .update(pacientes)
      .set({ ...valores, actualizadoEn: momentoLocal(ahora) })
      .where(eq(pacientes.id, datos.id))
      .run();
    if (r.changes === 0) throw new ErrorDeUsuario('Ese paciente ya no existe.');
    return datos.id;
  }
  return db.insert(pacientes).values(valores).returning({ id: pacientes.id }).get().id;
}

/** Baja lógica: el paciente deja de aparecer, pero sus datos (y en el futuro sus turnos) quedan. */
export function cambiarActivoPaciente(db: BaseDeDatos, id: number, activo: boolean): void {
  const r = db.update(pacientes).set({ activo }).where(eq(pacientes.id, id)).run();
  if (r.changes === 0) throw new ErrorDeUsuario('Ese paciente ya no existe.');
}
