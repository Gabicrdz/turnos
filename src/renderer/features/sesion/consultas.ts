// La sesión del lado de la ventana: quién está adentro y las acciones para
// entrar, salir y crear el primer usuario. La sesión DE VERDAD vive en el main.
import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { Turno } from '@compartido/tipos';
import { desenvolver, turnos } from '@/lib/api';

export const CLAVE_SESION = ['sesion'] as const;

/** Quién está usando el sistema (null = nadie: pantalla de ingreso). */
export function useSesion() {
  return useQuery({ queryKey: CLAVE_SESION, queryFn: () => desenvolver(turnos().sesion.actual()), staleTime: Infinity });
}

/** El usuario y lo que puede hacer (para mostrar u ocultar; el main controla igual). */
export function useUsuario() {
  const { data } = useSesion();
  const usuario = data ?? null;
  return {
    usuario,
    esAdmin: usuario?.rol === 'admin',
    /** Vinculado a un profesional: ve la historia clínica. */
    veClinica: usuario?.profesionalId != null,
    /** ¿Puede cargar las notas de ESTE turno? Solo el profesional del turno. */
    atiende: (t: Pick<Turno, 'profesionalId'>) => usuario?.profesionalId != null && usuario.profesionalId === t.profesionalId,
  };
}

export function useUsuariosParaIngresar() {
  return useQuery({ queryKey: ['usuarios-ingreso'], queryFn: () => desenvolver(turnos().usuarios.paraIngresar()) });
}

/** Por qué se cerró la sesión (lo muestra la pantalla de ingreso). */
export const motivoDeCierre = { texto: '' };

/** Al entrar o salir se borra todo lo guardado en memoria: cada usuario ve solo lo suyo. */
function useCambioDeUsuario() {
  const cliente = useQueryClient();
  return async () => {
    toast.dismiss();
    cliente.removeQueries({ predicate: (q) => q.queryKey[0] !== 'sesion' });
    await cliente.invalidateQueries({ queryKey: CLAVE_SESION });
  };
}

export function useIngresar() {
  const cambio = useCambioDeUsuario();
  return useMutation({
    mutationFn: ({ usuarioId, pin }: { usuarioId: number; pin: string }) => desenvolver(turnos().sesion.iniciar(usuarioId, pin)),
    onSuccess: () => {
      motivoDeCierre.texto = '';
      return cambio();
    },
  });
}

export function useCrearPrimerUsuario() {
  const cambio = useCambioDeUsuario();
  return useMutation({
    mutationFn: ({ nombre, pin }: { nombre: string; pin: string }) => desenvolver(turnos().usuarios.crearPrimero(nombre, pin)),
    onSuccess: cambio,
  });
}

export function useBloquear() {
  const cambio = useCambioDeUsuario();
  return useMutation({ mutationFn: () => desenvolver(turnos().sesion.cerrar()), onSuccess: cambio });
}

/**
 * Bloqueo por inactividad: si nadie toca el mouse ni el teclado durante
 * `minutos`, la sesión se cierra (hay historias clínicas: la compu de la
 * recepción no puede quedar abierta).
 */
export function useBloqueoPorInactividad(minutos = 15) {
  const bloquear = useBloquear();
  const ultimo = useRef(Date.now());
  useEffect(() => {
    const actividad = () => {
      ultimo.current = Date.now();
    };
    const eventos = ['pointerdown', 'pointermove', 'keydown', 'wheel'] as const;
    for (const e of eventos) window.addEventListener(e, actividad, { passive: true });
    const revisar = window.setInterval(() => {
      if (Date.now() - ultimo.current >= minutos * 60_000) {
        motivoDeCierre.texto = `Se bloqueó después de ${minutos} minutos sin uso.`;
        bloquear.mutate();
      }
    }, 15_000);
    return () => {
      for (const e of eventos) window.removeEventListener(e, actividad);
      window.clearInterval(revisar);
    };
    // bloquear.mutate es estable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minutos]);
}
