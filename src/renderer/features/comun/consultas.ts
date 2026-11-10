// Consultas (leer) y acciones (escribir) con TanStack Query. Cada lista tiene
// una "clave"; después de guardar, se invalidan las claves que cambiaron y
// las pantallas se actualizan solas.
import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { DatosBuscarPacientes } from '@compartido/esquemas';
import { desenvolver, turnos } from '@/lib/api';

export const CLAVES = {
  pacientes: ['pacientes'],
  profesionales: ['profesionales'],
  bloqueos: ['bloqueos'],
  obras: ['obras-sociales'],
  consultorio: ['consultorio'],
  agenda: ['agenda'],
  libres: ['libres'],
  turnosPaciente: ['turnos-paciente'],
  historia: ['historia'],
  resumen: ['resumen'],
} as const;

export function usePacientes(filtro: DatosBuscarPacientes) {
  return useQuery({
    queryKey: [...CLAVES.pacientes, filtro],
    queryFn: () => desenvolver(turnos().pacientes.buscar(filtro)),
    placeholderData: keepPreviousData, // mientras busca, se sigue viendo la lista anterior
  });
}

export const useProfesionales = () =>
  useQuery({ queryKey: CLAVES.profesionales, queryFn: () => desenvolver(turnos().profesionales.listar()) });
export const useBloqueos = () => useQuery({ queryKey: CLAVES.bloqueos, queryFn: () => desenvolver(turnos().bloqueos.proximos()) });
export const useObrasSociales = () => useQuery({ queryKey: CLAVES.obras, queryFn: () => desenvolver(turnos().obrasSociales.listar()) });
export const useResumen = () => useQuery({ queryKey: CLAVES.resumen, queryFn: () => desenvolver(turnos().sistema.resumen()) });

/**
 * Una acción que escribe en la base: muestra el aviso de éxito y refresca las
 * listas afectadas. El error lo maneja cada pantalla (para mostrarlo donde corresponde).
 */
export function useAccion<A, R>(fn: (args: A) => Promise<R>, claves: readonly (readonly string[])[], exito?: string | ((r: R) => string)) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (r) => {
      await Promise.all([...claves, CLAVES.resumen].map((queryKey) => cliente.invalidateQueries({ queryKey })));
      if (exito) toast.success(typeof exito === 'string' ? exito : exito(r));
    },
  });
}

/** Carga los datos de ejemplo (todas las listas cambian). */
export function useCargarEjemplo() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: () => desenvolver(turnos().sistema.cargarEjemplo()),
    onSuccess: async (r) => {
      await cliente.invalidateQueries();
      toast.success(`Listo: ${r.pacientes} pacientes, ${r.profesionales} profesionales, ${r.obrasSociales} obras sociales y ${r.turnos} turnos de ejemplo`);
    },
    onError: (e) => toast.error(e.message),
  });
}

/** Espera a que dejen de escribir (250 ms) para buscar. */
export function useDemorado<T>(valor: T, ms = 250): T {
  const [demorado, setDemorado] = useState(valor);
  useEffect(() => {
    const t = window.setTimeout(() => setDemorado(valor), ms);
    return () => window.clearTimeout(t);
  }, [valor, ms]);
  return demorado;
}
