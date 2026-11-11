// Punto de entrada de la VENTANA (proceso renderer): arma React con el router,
// TanStack Query (datos del main) y los avisos (toasts).
import { StrictMode, useEffect, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { createHashRouter, Navigate, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Estructura } from '@/components/layout/estructura';
import { PaginaAgenda } from '@/features/agenda/pagina-agenda';
import { PaginaPacientes } from '@/features/pacientes/pagina-pacientes';
import { PaginaRecepcion } from '@/features/recepcion/pagina-recepcion';
import { PaginaReportes } from '@/features/reportes/pagina-reportes';
import { PaginaProfesionales } from '@/features/profesionales/pagina-profesionales';
import { PaginaAjustes } from '@/features/ajustes/pagina-ajustes';
import { PantallaIngreso } from '@/features/sesion/pantalla-ingreso';
import { CLAVE_SESION, useBloqueoPorInactividad, useSesion, useUsuario } from '@/features/sesion/consultas';
import './index.css';

// La app instalada se abre desde un archivo (file://), por eso el router usa "#": /#/pacientes…
const router = createHashRouter([
  {
    path: '/',
    element: <Estructura />,
    children: [
      { index: true, element: <PaginaAgenda /> },
      { path: 'recepcion', element: <PaginaRecepcion /> },
      { path: 'pacientes', element: <PaginaPacientes /> },
      { path: 'profesionales', element: <SoloAdmin><PaginaProfesionales /></SoloAdmin> },
      { path: 'reportes', element: <SoloAdmin><PaginaReportes /></SoloAdmin> },
      { path: 'ajustes', element: <SoloAdmin><PaginaAjustes /></SoloAdmin> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

/** Si alguien que no es de administración llega a una sección de configuración, vuelve a la agenda. */
function SoloAdmin({ children }: { children: ReactNode }) {
  const { esAdmin } = useUsuario();
  return esAdmin ? children : <Navigate to="/" replace />;
}

/** Con sesión se ve el sistema (y corre el bloqueo por inactividad). */
function Sistema() {
  useBloqueoPorInactividad(15);
  return <RouterProvider router={router} />;
}

/** Sin sesión se ve la pantalla de ingreso; con sesión, el sistema. */
function Raiz() {
  const sesion = useSesion();
  const cliente = useQueryClient();
  useEffect(() => {
    const revisar = () => void cliente.invalidateQueries({ queryKey: CLAVE_SESION });
    window.addEventListener('sesion-cerrada', revisar);
    return () => window.removeEventListener('sesion-cerrada', revisar);
  }, [cliente]);
  if (sesion.isPending) return null;
  if (!sesion.data) return <PantallaIngreso />;
  return <Sistema />;
}

const consultas = new QueryClient({
  defaultOptions: {
    // Los datos vienen de la base local: no hace falta reintentar ni pedirlos
    // de nuevo cada vez que la ventana toma el foco.
    queries: { retry: false, refetchOnWindowFocus: false, staleTime: Infinity },
    mutations: { retry: false },
  },
});

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <QueryClientProvider client={consultas}>
      <TooltipProvider delayDuration={300}>
        <Raiz />
        <Toaster
          position="bottom-right"
          toastOptions={{
            classNames: {
              toast: '!rounded-lg !border-0 !bg-tinta !text-white !font-sans !text-[15px] !shadow-xl',
              description: '!text-white/70',
              error: '!bg-rojo',
            },
          }}
        />
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
);
