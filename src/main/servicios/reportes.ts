// Reportes del consultorio para un período: cuánto se atendió, cuánto se
// faltó, cuánto se cobró, cómo se repartió entre obras sociales y qué tan
// llena estuvo la agenda de cada profesional.
//
// Criterios (para que los números se puedan explicar):
// - Ausentismo = ausentes / (atendidos + ausentes). Los cancelados NO cuentan
//   (avisaron) y los pendientes tampoco (todavía no se sabe).
// - Ingresos = lo que pagó el paciente (consulta particular + copagos), según
//   el día del TURNO, con cobros no anulados.
// - Ocupación = turnos dados (no cancelados) / turnos que entraban según el
//   horario de cada día, sin contar los días sin atención.
import type { z } from 'zod';
import type { BaseDeDatos } from '../db/conexion';
import type { esquemaPeriodo } from '@compartido/esquemas';
import { METODOS } from '@compartido/esquemas';
import { diaDeLaSemana, horariosDeTurno } from '@compartido/horarios';
import type { ColorProfesional, MetodoPago, Reporte } from '@compartido/tipos';
import { fechaLocal } from './fechas';
import { estaBloqueado } from './bloqueos';
import { listarProfesionales } from './profesionales';

type Lector = Pick<BaseDeDatos, '$client'>;
type Periodo = z.output<typeof esquemaPeriodo>;

const proporcion = (parte: number, total: number) => (total > 0 ? parte / total : null);

/** Cada día del período, como 'AAAA-MM-DD'. */
export function diasDelPeriodo(desde: string, hasta: string): string[] {
  const dias: string[] = [];
  const d = new Date(`${desde}T12:00:00`);
  for (let f = fechaLocal(d); f <= hasta; d.setDate(d.getDate() + 1), f = fechaLocal(d)) dias.push(f);
  return dias;
}

export function reporte(db: Lector, periodo: Periodo): Reporte {
  const { desde, hasta } = periodo;
  const c = db.$client;
  const p = [desde, hasta];

  // ---- Totales ----
  const t = c
    .prepare(
      `SELECT count(*) FILTER (WHERE estado <> 'cancelado') AS turnos,
              count(*) FILTER (WHERE estado = 'atendido') AS atendidos,
              count(*) FILTER (WHERE estado = 'ausente') AS ausentes,
              count(*) FILTER (WHERE estado = 'cancelado') AS cancelados,
              count(DISTINCT paciente_id) FILTER (WHERE estado = 'atendido') AS pacientesAtendidos
       FROM turnos WHERE fecha BETWEEN ? AND ?`,
    )
    .get(...p) as { turnos: number; atendidos: number; ausentes: number; cancelados: number; pacientesAtendidos: number };

  const cobros = c
    .prepare(
      `SELECT co.tipo, co.metodo, co.monto_centavos AS monto, co.obra_social_id AS os
       FROM cobros co JOIN turnos t ON t.id = co.turno_id
       WHERE co.anulado = 0 AND t.fecha BETWEEN ? AND ?`,
    )
    .all(...p) as { tipo: string; metodo: MetodoPago | null; monto: number; os: number | null }[];

  const porMetodo = METODOS.map((m) => {
    const delMetodo = cobros.filter((x) => x.metodo === m);
    return { metodo: m, centavos: delMetodo.reduce((s, x) => s + x.monto, 0), cantidad: delMetodo.length };
  }).filter((x) => x.cantidad > 0);

  const { sinCobrar } = c
    .prepare(
      `SELECT count(*) AS sinCobrar FROM turnos t
       WHERE t.estado = 'atendido' AND t.fecha BETWEEN ? AND ?
         AND NOT EXISTS (SELECT 1 FROM cobros co WHERE co.turno_id = t.id AND co.anulado = 0)`,
    )
    .get(...p) as { sinCobrar: number };

  // Nuevos: su primera atención (de toda la historia) cae en el período
  const { nuevos } = c
    .prepare(
      `SELECT count(*) AS nuevos FROM (
         SELECT paciente_id, min(fecha) AS primera FROM turnos WHERE estado = 'atendido' GROUP BY paciente_id
       ) WHERE primera BETWEEN ? AND ?`,
    )
    .get(...p) as { nuevos: number };

  // ---- Por profesional ----
  const filasProf = c
    .prepare(
      `SELECT t.profesional_id AS id,
              count(*) FILTER (WHERE t.estado <> 'cancelado') AS turnos,
              count(*) FILTER (WHERE t.estado = 'atendido') AS atendidos,
              count(*) FILTER (WHERE t.estado = 'ausente') AS ausentes,
              coalesce(sum(co.monto_centavos), 0) AS ingresos
       FROM turnos t LEFT JOIN cobros co ON co.turno_id = t.id AND co.anulado = 0
       WHERE t.fecha BETWEEN ? AND ?
       GROUP BY t.profesional_id`,
    )
    .all(...p) as { id: number; turnos: number; atendidos: number; ausentes: number; ingresos: number }[];
  const dias = diasDelPeriodo(desde, hasta);
  const porProfesional = listarProfesionales(db)
    .map((prof) => {
      const f = filasProf.find((x) => x.id === prof.id) ?? { turnos: 0, atendidos: 0, ausentes: 0, ingresos: 0 };
      // Cuántos turnos entraban: día por día, según su horario y sin días sin atención
      const disponibles = prof.activo
        ? dias.reduce((suma, dia) => {
            const franjas = prof.horarios.filter((h) => h.diaSemana === diaDeLaSemana(dia));
            if (!franjas.length || estaBloqueado(db, prof.id, dia)) return suma;
            return suma + horariosDeTurno(franjas, prof.duracionTurnoMin).length;
          }, 0)
        : 0;
      return {
        profesionalId: prof.id,
        nombre: `${prof.titulo} ${prof.nombre} ${prof.apellido}`.trim(),
        color: prof.color as ColorProfesional,
        turnos: f.turnos,
        atendidos: f.atendidos,
        ausentes: f.ausentes,
        ausentismo: proporcion(f.ausentes, f.atendidos + f.ausentes),
        disponibles,
        ocupacion: disponibles > 0 ? Math.min(1, f.turnos / disponibles) : null,
        ingresosCentavos: f.ingresos,
      };
    })
    // Sin turnos ni horario en el período, no aporta nada
    .filter((x) => x.turnos > 0 || x.disponibles > 0);

  // ---- Por cobertura (de lo atendido) ----
  const porCobertura = (
    c
      .prepare(
        `SELECT CASE WHEN co.id IS NULL THEN 'sin_cobrar' ELSE co.tipo END AS tipo,
                co.obra_social_id AS obraSocialId, o.nombre AS nombreOs,
                count(*) AS atenciones,
                count(*) FILTER (WHERE co.tipo = 'obra_social') AS ordenes,
                coalesce(sum(co.monto_centavos), 0) AS montoCentavos
         FROM turnos t
         LEFT JOIN cobros co ON co.turno_id = t.id AND co.anulado = 0
         LEFT JOIN obras_sociales o ON o.id = co.obra_social_id
         WHERE t.estado = 'atendido' AND t.fecha BETWEEN ? AND ?
         GROUP BY 1, 2
         ORDER BY atenciones DESC`,
      )
      .all(...p) as { tipo: 'obra_social' | 'particular' | 'sin_cobrar'; obraSocialId: number | null; nombreOs: string | null; atenciones: number; ordenes: number; montoCentavos: number }[]
  ).map(({ nombreOs, ...x }) => ({ ...x, nombre: x.tipo === 'particular' ? 'Particular' : x.tipo === 'sin_cobrar' ? 'Sin cobrar' : (nombreOs ?? '—') }));

  // ---- Por día ----
  const filasDia = c
    .prepare(
      `SELECT t.fecha,
              count(*) FILTER (WHERE t.estado = 'atendido') AS atendidos,
              count(*) FILTER (WHERE t.estado = 'ausente') AS ausentes,
              coalesce(sum(co.monto_centavos), 0) AS ingresosCentavos
       FROM turnos t LEFT JOIN cobros co ON co.turno_id = t.id AND co.anulado = 0
       WHERE t.fecha BETWEEN ? AND ?
       GROUP BY t.fecha`,
    )
    .all(...p) as Reporte['porDia'];
  const porDia = dias.map((fecha) => filasDia.find((d) => d.fecha === fecha) ?? { fecha, atendidos: 0, ausentes: 0, ingresosCentavos: 0 });

  // ---- Los que más faltan (para llamarlos o recordarles con tiempo) ----
  const faltadores = c
    .prepare(
      `SELECT pa.id AS pacienteId, pa.apellido || ', ' || pa.nombre AS paciente, pa.telefono,
              count(*) FILTER (WHERE t.estado = 'ausente') AS ausentes,
              count(*) FILTER (WHERE t.estado <> 'cancelado') AS turnos
       FROM turnos t JOIN pacientes pa ON pa.id = t.paciente_id
       WHERE t.fecha BETWEEN ? AND ?
       GROUP BY pa.id
       HAVING ausentes >= 2
       ORDER BY ausentes DESC, paciente
       LIMIT 8`,
    )
    .all(...p) as Reporte['faltadores'];

  return {
    desde,
    hasta,
    totales: {
      turnos: t.turnos,
      atendidos: t.atendidos,
      ausentes: t.ausentes,
      cancelados: t.cancelados,
      ausentismo: proporcion(t.ausentes, t.atendidos + t.ausentes),
      ingresosCentavos: cobros.reduce((s, x) => s + x.monto, 0),
      porMetodo,
      ordenes: cobros.filter((x) => x.tipo === 'obra_social').length,
      atendidosSinCobrar: sinCobrar,
      pacientesAtendidos: t.pacientesAtendidos,
      pacientesNuevos: nuevos,
    },
    porProfesional,
    porCobertura,
    porDia,
    faltadores,
  };
}

// ---------- Órdenes para presentar a una obra social ----------
export interface FilaOrden {
  fecha: string;
  paciente: string;
  dni: string | null;
  numeroAfiliado: string;
  numeroAutorizacion: string;
  profesional: string;
  matricula: string;
  copagoCentavos: number;
}

/** Las atenciones cobradas a una obra social en el período (para la liquidación del mes). */
export function ordenesDeObraSocial(db: Lector, periodo: Periodo, obraSocialId: number): { obraSocial: string; filas: FilaOrden[] } {
  const os = db.$client.prepare('SELECT nombre FROM obras_sociales WHERE id = ?').get(obraSocialId) as { nombre: string } | undefined;
  const filas = db.$client
    .prepare(
      `SELECT t.fecha, pa.apellido || ', ' || pa.nombre AS paciente, pa.dni, pa.numero_afiliado AS numeroAfiliado,
              co.numero_autorizacion AS numeroAutorizacion,
              trim(pr.titulo || ' ' || pr.nombre || ' ' || pr.apellido) AS profesional, pr.matricula,
              co.monto_centavos AS copagoCentavos
       FROM cobros co
       JOIN turnos t ON t.id = co.turno_id
       JOIN pacientes pa ON pa.id = t.paciente_id
       JOIN profesionales pr ON pr.id = t.profesional_id
       WHERE co.anulado = 0 AND co.tipo = 'obra_social' AND co.obra_social_id = ? AND t.fecha BETWEEN ? AND ?
       ORDER BY t.fecha, t.desde`,
    )
    .all(obraSocialId, periodo.desde, periodo.hasta) as FilaOrden[];
  return { obraSocial: os?.nombre ?? 'Obra social', filas };
}

/**
 * CSV para Excel en español: separado por ";" (la coma es el decimal), con
 * BOM al principio (para que Excel lea bien las tildes) y comillas donde haga falta.
 */
export function csvDeOrdenes(filas: FilaOrden[]): string {
  const celda = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const encabezado = ['Fecha', 'Paciente', 'DNI', 'N.º de afiliado', 'N.º de orden', 'Profesional', 'Matrícula', 'Copago'];
  const lineas = filas.map((f) =>
    [
      `${f.fecha.slice(8, 10)}/${f.fecha.slice(5, 7)}/${f.fecha.slice(0, 4)}`,
      f.paciente,
      f.dni ?? '',
      f.numeroAfiliado,
      f.numeroAutorizacion,
      f.profesional,
      f.matricula,
      (f.copagoCentavos / 100).toFixed(2).replace('.', ','),
    ]
      .map(celda)
      .join(';'),
  );
  return '﻿' + [encabezado.join(';'), ...lineas].join('\r\n') + '\r\n';
}
