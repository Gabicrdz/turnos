// Fechas para mostrar en pantalla (con date-fns y el idioma español).
import { differenceInYears, format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

/** '1958-03-12' → 68 (años cumplidos hoy). */
export function edad(fechaNacimiento: string | null, hoy: Date = new Date()): number | null {
  return fechaNacimiento ? differenceInYears(hoy, parseISO(fechaNacimiento)) : null;
}

/** '2026-11-20' → '20/11/2026'. */
export function fechaCorta(fecha: string): string {
  return format(parseISO(fecha), 'dd/MM/yyyy');
}

/** '2026-11-20' → 'viernes 20 de noviembre'. */
export function fechaLarga(fecha: string | Date): string {
  return format(typeof fecha === 'string' ? parseISO(fecha) : fecha, "EEEE d 'de' MMMM", { locale: es });
}

/** Rango legible: "20/11/2026" o "del 10/11 al 14/11/2026". */
export function rangoCorto(desde: string, hasta: string): string {
  if (desde === hasta) return fechaCorta(desde);
  const mismoAnio = desde.slice(0, 4) === hasta.slice(0, 4);
  return `del ${format(parseISO(desde), mismoAnio ? 'dd/MM' : 'dd/MM/yyyy')} al ${fechaCorta(hasta)}`;
}

const dosCifras = (n: number) => String(n).padStart(2, '0');
/** Fecha local 'AAAA-MM-DD' (no usar toISOString: da la fecha en Londres). */
export function fechaISO(fecha: Date = new Date()): string {
  return `${fecha.getFullYear()}-${dosCifras(fecha.getMonth() + 1)}-${dosCifras(fecha.getDate())}`;
}
