// Consultas y acciones de la agenda. Cualquier cambio en un turno refresca la
// agenda, los horarios libres y los turnos de la ficha del paciente.
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { EstadoTurno } from '@compartido/agenda';
import type { DatosMoverTurno, DatosTurno } from '@compartido/esquemas';
import { desenvolver, turnos } from '@/lib/api';
import { CLAVES, useAccion } from '@/features/comun/consultas';

const AFECTADAS = [CLAVES.agenda, CLAVES.libres, CLAVES.turnosPaciente];

export function useAgenda(desde: string, hasta: string) {
  return useQuery({
    queryKey: [...CLAVES.agenda, desde, hasta],
    queryFn: () => desenvolver(turnos().turnos.agenda({ desde, hasta })),
    // Los turnos los pueden cambiar desde otra pantalla: se piden de nuevo cada minuto
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}

export function useLibres(profesionalId: number | null, fecha: string) {
  return useQuery({
    queryKey: [...CLAVES.libres, profesionalId, fecha],
    queryFn: () => desenvolver(turnos().turnos.libres(profesionalId!, fecha)),
    enabled: profesionalId !== null && /^\d{4}-\d{2}-\d{2}$/.test(fecha),
    staleTime: 0,
  });
}

export function useProximosLibres(profesionalId: number | null, activo: boolean) {
  return useQuery({
    queryKey: [...CLAVES.libres, 'proximos', profesionalId],
    queryFn: () => desenvolver(turnos().turnos.proximosLibres(profesionalId!)),
    enabled: profesionalId !== null && activo,
    staleTime: 0,
  });
}

export function useTurnosDePaciente(pacienteId: number | null) {
  return useQuery({
    queryKey: [...CLAVES.turnosPaciente, pacienteId],
    queryFn: () => desenvolver(turnos().turnos.dePaciente(pacienteId!)),
    enabled: pacienteId !== null,
    staleTime: 0,
  });
}

export const useDarTurno = () => useAccion((d: DatosTurno) => desenvolver(turnos().turnos.dar(d)), AFECTADAS);
export const useMoverTurno = () => useAccion((d: DatosMoverTurno) => desenvolver(turnos().turnos.mover(d)), AFECTADAS, 'Turno reprogramado');

export function useCambiarEstado() {
  const accion = useAccion(
    ({ id, estado }: { id: number; estado: EstadoTurno }) => desenvolver(turnos().turnos.cambiarEstado(id, estado)),
    AFECTADAS,
  );
  return {
    ...accion,
    cambiar: (id: number, estado: EstadoTurno, opciones?: { onSuccess?: () => void }) =>
      accion.mutate({ id, estado }, { onSuccess: opciones?.onSuccess, onError: (e) => toast.error(e.message) }),
  };
}

export const useCargarTurnosEjemplo = () =>
  useAccion((_: void) => desenvolver(turnos().sistema.cargarTurnosEjemplo()), AFECTADAS, (n) => `Listo: ${n} turnos de ejemplo cargados`);
