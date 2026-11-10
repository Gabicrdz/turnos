import { Outlet } from 'react-router';
import { BarraLateral } from './barra-lateral';

/** Barra lateral a la izquierda y la sección actual a la derecha. */
export function Estructura() {
  return (
    <div className="flex h-full">
      <BarraLateral />
      <main className="h-full min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
