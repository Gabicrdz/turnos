import type { ReactNode } from 'react';

/** Título de cada pantalla (en Fraunces), una línea de ayuda y las acciones a la derecha. */
export function Encabezado({ titulo, detalle, children }: { titulo: string; detalle?: ReactNode; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-linea pb-5">
      <div>
        <h1 className="font-display text-[34px] leading-none font-semibold tracking-[-0.01em]">{titulo}</h1>
        {detalle && <p className="mt-2 text-tinta-suave">{detalle}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </header>
  );
}

/** Mensaje grande para cuando no hay nada que mostrar. */
export function Vacio({ titulo, children, acciones }: { titulo: string; children?: ReactNode; acciones?: ReactNode }) {
  return (
    <section className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-linea-fuerte px-8 py-14 text-center">
      <h2 className="font-display text-2xl font-semibold">{titulo}</h2>
      {children && <p className="max-w-md text-tinta-suave">{children}</p>}
      {acciones && <div className="mt-3 flex flex-wrap justify-center gap-2">{acciones}</div>}
    </section>
  );
}

/** "30.123.456" para mostrar un DNI guardado como "30123456". */
export function dniConPuntos(dni: string | null): string {
  return dni ? Number(dni).toLocaleString('es-AR') : '—';
}
