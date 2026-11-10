// Cobro de cada turno: particular (paga el paciente) u obra social (orden o
// autorización, y a veces un copago). Un solo cobro vigente por turno; si hubo
// un error se ANULA (queda registrado) y se vuelve a cobrar.
import type { z } from 'zod';
import type { BaseDeDatos } from '../db/conexion';
import type { esquemaCobro } from '@compartido/esquemas';
import { ErrorDeUsuario } from './errores';
import { momentoLocal } from './fechas';
import { obtenerTurno } from './turnos';

export function registrarCobro(db: BaseDeDatos, datos: z.output<typeof esquemaCobro>, ahora: Date = new Date()): number {
  const turno = obtenerTurno(db, datos.turnoId);
  if (turno.estado !== 'en_sala' && turno.estado !== 'atendido') {
    throw new ErrorDeUsuario('Solo se cobran los turnos de pacientes que ya llegaron (en sala o atendidos).');
  }
  if (turno.cobro) throw new ErrorDeUsuario('Ese turno ya está cobrado. Si hubo un error, anulá el cobro y volvé a cobrarlo.');
  if (datos.obraSocialId !== null && !db.$client.prepare('SELECT 1 FROM obras_sociales WHERE id = ?').get(datos.obraSocialId)) {
    throw new ErrorDeUsuario('Esa obra social ya no existe.');
  }
  try {
    return Number(
      db.$client
        .prepare('INSERT INTO cobros (turno_id, tipo, obra_social_id, numero_autorizacion, monto_centavos, metodo, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(turno.id, datos.tipo, datos.obraSocialId, datos.numeroAutorizacion, datos.montoCentavos, datos.metodo, momentoLocal(ahora)).lastInsertRowid,
    );
  } catch (error) {
    // Dos cobros a la vez del mismo turno: el índice único parcial frena el segundo
    if (error instanceof Error && error.message.includes('UNIQUE')) throw new ErrorDeUsuario('Ese turno ya está cobrado.');
    throw error;
  }
}

export function anularCobro(db: BaseDeDatos, id: number, ahora: Date = new Date()): void {
  const r = db.$client.prepare('UPDATE cobros SET anulado = 1, anulado_en = ? WHERE id = ? AND anulado = 0').run(momentoLocal(ahora), id);
  if (r.changes === 0) throw new ErrorDeUsuario('Ese cobro ya estaba anulado o no existe.');
}
