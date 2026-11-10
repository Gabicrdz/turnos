// Cómo se ve cada estado de un turno, y cómo se llama cada botón para cambiarlo.
import { Ban, Check, CheckCheck, Circle, DoorOpen, UserX, type LucideIcon } from 'lucide-react';
import { NOMBRE_ESTADO, type EstadoTurno } from '@compartido/agenda';
import { cn } from '@/lib/utils';

export const ESTILO_ESTADO: Record<EstadoTurno, { icono: LucideIcon; clase: string }> = {
  reservado: { icono: Circle, clase: 'border border-linea-fuerte text-tinta-suave' },
  confirmado: { icono: Check, clase: 'bg-acento-suave text-acento-fuerte' },
  en_sala: { icono: DoorOpen, clase: 'bg-ambar text-white' },
  atendido: { icono: CheckCheck, clase: 'bg-verde-suave text-verde' },
  ausente: { icono: UserX, clase: 'bg-rojo-suave text-rojo' },
  cancelado: { icono: Ban, clase: 'bg-secondary text-tinta-suave' },
};

export function ChipEstado({ estado, className }: { estado: EstadoTurno; className?: string }) {
  const { icono: Icono, clase } = ESTILO_ESTADO[estado];
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap', clase, className)}>
      <Icono className="size-3" strokeWidth={2.4} aria-hidden="true" />
      {NOMBRE_ESTADO[estado]}
    </span>
  );
}

/** El texto del botón depende de dónde viene el turno ("Deshacer…" cuando es volver atrás). */
export function etiquetaAccion(desde: EstadoTurno, hacia: EstadoTurno): string {
  if (hacia === 'reservado') return desde === 'cancelado' ? 'Volver a reservar' : desde === 'ausente' ? 'No fue ausente' : 'Quitar confirmación';
  if (hacia === 'confirmado') return desde === 'en_sala' ? 'Todavía no llegó' : 'Confirmar';
  if (hacia === 'en_sala') return desde === 'atendido' ? 'Todavía no lo atendieron' : 'Llegó: pasa a sala';
  if (hacia === 'atendido') return 'Atendido';
  if (hacia === 'ausente') return 'No vino';
  return 'Cancelar turno';
}

/** Los "volver atrás" van como botones secundarios; los que avanzan, como principales. */
export function esAvance(desde: EstadoTurno, hacia: EstadoTurno): boolean {
  const orden: EstadoTurno[] = ['reservado', 'confirmado', 'en_sala', 'atendido'];
  if (hacia === 'cancelado' || hacia === 'ausente') return false;
  if (desde === 'ausente') return false; // "No fue ausente" corrige un error
  if (desde === 'cancelado') return true;
  return orden.indexOf(hacia) > orden.indexOf(desde);
}
