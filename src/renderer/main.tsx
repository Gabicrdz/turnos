// Punto de entrada de la VENTANA (proceso renderer): arma React con el router,
// TanStack Query (datos del main) y los avisos (toasts).
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createHashRouter, Navigate, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Estructura } from '@/components/layout/estructura';
import { PaginaAgenda } from '@/features/agenda/pagina-agenda';
import { PaginaPacientes } from '@/features/pacientes/pagina-pacientes';
import { PaginaRecepcion } from '@/features/recepcion/pagina-recepcion';
import { PaginaProfesionales } from '@/features/profesionales/pagina-profesionales';
import { PaginaAjustes } from '@/features/ajustes/pagina-ajustes';
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
      { path: 'profesionales', element: <PaginaProfesionales /> },
      { path: 'ajustes', element: <PaginaAjustes /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

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
        <RouterProvider router={router} />
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
