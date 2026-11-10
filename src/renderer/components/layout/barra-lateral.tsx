// Barra lateral clara: nombre del consultorio arriba, secciones al medio,
// Ajustes y la fecha de hoy abajo.
import { NavLink } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Settings, Stethoscope, UsersRound, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { desenvolver, turnos } from '@/lib/api';
import { fechaLarga } from '@/lib/fechas';
import { Marca } from './marca';

export function useConsultorio() {
  return useQuery({ queryKey: ['consultorio'], queryFn: () => desenvolver(turnos().consultorio.obtener()) });
}

const SECCIONES: { ruta: string; nombre: string; icono: LucideIcon }[] = [
  { ruta: '/', nombre: 'Agenda', icono: CalendarDays },
  { ruta: '/pacientes', nombre: 'Pacientes', icono: UsersRound },
  { ruta: '/profesionales', nombre: 'Profesionales', icono: Stethoscope },
];

function Enlace({ ruta, nombre, icono: Icono }: (typeof SECCIONES)[number]) {
  return (
    <NavLink
      to={ruta}
      end={ruta === '/'}
      className={({ isActive }) =>
        cn(
          'flex h-11 items-center gap-3 rounded-md px-3 text-[15px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-acento/40',
          isActive ? 'bg-superficie text-tinta shadow-[inset_3px_0_0_var(--acento)]' : 'text-tinta-suave hover:bg-superficie/60 hover:text-tinta',
        )
      }
    >
      <Icono className="size-[19px]" strokeWidth={1.8} aria-hidden="true" />
      {nombre}
    </NavLink>
  );
}

export function BarraLateral() {
  const consultorio = useConsultorio();
  return (
    <aside className="flex h-full w-[236px] shrink-0 flex-col border-r border-linea bg-lateral px-4 py-5">
      <div className="flex items-center gap-3 px-1">
        <Marca />
        <div className="min-w-0">
          <p className="line-clamp-2 font-display text-[17px] leading-tight font-semibold">{consultorio.data?.nombreConsultorio ?? ' '}</p>
          <p className="text-[13px] text-tinta-suave">Turnos</p>
        </div>
      </div>
      <nav aria-label="Secciones" className="mt-8 flex flex-col gap-1">
        {SECCIONES.map((s) => (
          <Enlace key={s.ruta} {...s} />
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-3">
        <Enlace ruta="/ajustes" nombre="Ajustes" icono={Settings} />
        <p className="border-t border-linea px-3 pt-3 text-[13px] text-tinta-suave first-letter:uppercase">{fechaLarga(new Date())}</p>
      </div>
    </aside>
  );
}
