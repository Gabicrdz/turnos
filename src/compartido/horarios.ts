// Cuentas con horas y franjas de atención. Funciones puras (sin base de
// datos): las usan el main, la ventana y, en la etapa 2, la agenda para
// saber en qué horarios se pueden dar turnos.

/** ¿Es una hora 'HH:MM' válida (00:00 a 23:59)? */
export function esHora(texto: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(texto);
}

/** '08:30' → 510 (minutos desde la medianoche). */
export function aMinutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number) as [number, number];
  return h * 60 + m;
}

/** 510 → '08:30'. */
export function aHora(minutos: number): string {
  return `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;
}

export interface Franja {
  diaSemana: number; // 1 = lunes … 7 = domingo
  desde: string;
  hasta: string;
}

/**
 * Los horarios de inicio de turno dentro de las franjas.
 * Ej.: 08:00–09:00 con turnos de 20 min → 08:00, 08:20, 08:40.
 * Un turno que no entra entero en la franja no se ofrece (08:40–09:00 sí; 08:50 no).
 */
export function horariosDeTurno(franjas: Pick<Franja, 'desde' | 'hasta'>[], duracionMin: number): string[] {
  const inicios: string[] = [];
  for (const f of [...franjas].sort((a, b) => aMinutos(a.desde) - aMinutos(b.desde))) {
    for (let m = aMinutos(f.desde); m + duracionMin <= aMinutos(f.hasta); m += duracionMin) inicios.push(aHora(m));
  }
  return inicios;
}

/** Día de la semana de una fecha 'AAAA-MM-DD' (1 = lunes … 7 = domingo). */
export function diaDeLaSemana(fecha: string): number {
  const d = new Date(`${fecha}T12:00:00`).getDay(); // 0 = domingo
  return d === 0 ? 7 : d;
}

const ABREVIATURA = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/**
 * Texto corto del horario semanal, agrupando días iguales:
 * "Lun a Vie 08:00–12:00 · 16:00–20:00 · Sáb 09:00–13:00".
 */
export function resumenDeHorario(franjas: Franja[]): string {
  if (!franjas.length) return 'Sin horario cargado';
  const porDia = new Map<number, string>();
  for (let dia = 1; dia <= 7; dia++) {
    const delDia = franjas
      .filter((f) => f.diaSemana === dia)
      .sort((a, b) => aMinutos(a.desde) - aMinutos(b.desde))
      .map((f) => `${f.desde}–${f.hasta}`)
      .join(' y ');
    if (delDia) porDia.set(dia, delDia);
  }
  // Agrupa días SEGUIDOS con el mismo horario
  const grupos: { desde: number; hasta: number; texto: string }[] = [];
  for (const [dia, textoDia] of porDia) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.texto === textoDia && ultimo.hasta === dia - 1) ultimo.hasta = dia;
    else grupos.push({ desde: dia, hasta: dia, texto: textoDia });
  }
  return grupos
    .map((g) => {
      const dias =
        g.desde === g.hasta ? ABREVIATURA[g.desde] : g.hasta === g.desde + 1 ? `${ABREVIATURA[g.desde]} y ${ABREVIATURA[g.hasta]}` : `${ABREVIATURA[g.desde]} a ${ABREVIATURA[g.hasta]}`;
      return `${dias} ${g.texto}`;
    })
    .join(' · ');
}

/** Cuántos turnos entran por semana con ese horario (para mostrar la capacidad). */
export function turnosPorSemana(franjas: Franja[], duracionMin: number): number {
  return franjas.reduce((total, f) => total + horariosDeTurno([f], duracionMin).length, 0);
}
