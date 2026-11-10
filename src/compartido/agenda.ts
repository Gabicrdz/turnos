// Reglas de la agenda que comparten el main y la ventana. Son funciones puras
// (sin base de datos): reciben datos y devuelven un resultado, así se pueden
// probar fácil y la ventana muestra exactamente lo mismo que después controla el main.
import { aHora, aMinutos, horariosDeTurno, type Franja } from './horarios';

// ---------- Estados de un turno ----------
export const ESTADOS = ['reservado', 'confirmado', 'en_sala', 'atendido', 'ausente', 'cancelado'] as const;
export type EstadoTurno = (typeof ESTADOS)[number];

export const NOMBRE_ESTADO: Record<EstadoTurno, string> = {
  reservado: 'Reservado',
  confirmado: 'Confirmado',
  en_sala: 'En sala',
  atendido: 'Atendido',
  ausente: 'Ausente',
  cancelado: 'Cancelado',
};

/** Estados que "pasan el día del turno": no tiene sentido marcarlos antes. */
const DEL_DIA: EstadoTurno[] = ['en_sala', 'atendido', 'ausente'];

/**
 * A qué estados puede pasar un turno (una "máquina de estados"). Ejemplos:
 * - Un turno de la semana que viene se puede confirmar o cancelar, pero no marcar "atendido".
 * - Un cancelado se puede volver a reservar solo si todavía no pasó el día.
 * - Los "volver atrás" (atendido → en sala, ausente → reservado) están para corregir un error.
 */
export function estadosPosibles(estado: EstadoTurno, fecha: string, hoy: string): EstadoTurno[] {
  const yaLlegoElDia = fecha <= hoy;
  const delDia = yaLlegoElDia ? DEL_DIA : [];
  switch (estado) {
    case 'reservado':
      return ['confirmado', ...delDia, 'cancelado'];
    case 'confirmado':
      return ['reservado', ...delDia, 'cancelado'];
    case 'en_sala':
      return ['atendido', 'confirmado'];
    case 'atendido':
      return ['en_sala'];
    case 'ausente':
      return ['reservado'];
    case 'cancelado':
      return fecha >= hoy ? ['reservado'] : [];
  }
}

/** ¿Se puede cambiar el día u horario? Solo los turnos pendientes. */
export const sePuedeReprogramar = (estado: EstadoTurno) => estado === 'reservado' || estado === 'confirmado';

/** ¿Ocupa el horario? Todos menos los cancelados. */
export const ocupaHorario = (estado: EstadoTurno) => estado !== 'cancelado';

// ---------- Horarios ----------
interface Intervalo {
  desde: string;
  hasta: string;
}

/**
 * Dos turnos se pisan si cada uno empieza antes de que termine el otro.
 * 08:00–08:20 y 08:20–08:40 NO se pisan (uno termina justo cuando empieza el otro).
 */
export function seSuperponen(a: Intervalo, b: Intervalo): boolean {
  return a.desde < b.hasta && b.desde < a.hasta;
}

/** '08:40' + 20 → '09:00'. */
export function sumarMinutos(hora: string, minutos: number): string {
  return aHora(aMinutos(hora) + minutos);
}

/** Duración en minutos de un intervalo. */
export const duracion = (i: Intervalo) => aMinutos(i.hasta) - aMinutos(i.desde);

/**
 * Los horarios libres de un día: los inicios de turno de las franjas que no se
 * pisan con ningún turno ocupado. `desdeMinuto` sirve para hoy: no ofrecer
 * horarios que ya pasaron.
 */
export function espaciosLibres(
  franjas: Pick<Franja, 'desde' | 'hasta'>[],
  duracionMin: number,
  ocupados: Intervalo[],
  desdeMinuto = 0,
): string[] {
  return horariosDeTurno(franjas, duracionMin).filter((inicio) => {
    if (aMinutos(inicio) < desdeMinuto) return false;
    const espacio = { desde: inicio, hasta: sumarMinutos(inicio, duracionMin) };
    return !ocupados.some((o) => seSuperponen(o, espacio));
  });
}

/** ¿El turno entra entero dentro de alguna franja de atención? */
export function dentroDeLasFranjas(franjas: Pick<Franja, 'desde' | 'hasta'>[], turno: Intervalo): boolean {
  return franjas.some((f) => aMinutos(f.desde) <= aMinutos(turno.desde) && aMinutos(turno.hasta) <= aMinutos(f.hasta));
}

/**
 * Qué horas mostrar en la grilla de la agenda: desde la hora en punto anterior
 * al primer horario hasta la hora en punto siguiente al último (con turnos fuera
 * de horario incluidos). Si no hay nada, de 8 a 20.
 */
export function rangoVisible(intervalos: Intervalo[]): { desde: number; hasta: number } {
  if (!intervalos.length) return { desde: 8 * 60, hasta: 20 * 60 };
  const desde = Math.min(...intervalos.map((i) => aMinutos(i.desde)));
  const hasta = Math.max(...intervalos.map((i) => aMinutos(i.hasta)));
  return { desde: Math.floor(desde / 60) * 60, hasta: Math.min(24 * 60, Math.ceil(hasta / 60) * 60) };
}
