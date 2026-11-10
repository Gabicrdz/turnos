// En la ficha del paciente: sus próximos turnos y los últimos que tuvo.
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { TurnoDePaciente } from '@compartido/tipos';
import { COLOR } from '@/features/profesionales/colores';
import { useTurnosDePaciente } from './consultas-agenda';
import { ChipEstado } from './estado';

/** '2026-11-19' → 'jue 19/11/2026' */
const fechaConDia = (fecha: string) => format(parseISO(fecha), 'EEE dd/MM/yyyy', { locale: es });

export function TurnosDelPaciente({ pacienteId }: { pacienteId: number }) {
  const { data } = useTurnosDePaciente(pacienteId);
  if (!data) return <p className="text-[14px] text-tinta-suave">Cargando…</p>;
  if (!data.proximos.length && !data.anteriores.length) return <p className="text-[14px] text-tinta-suave">Todavía no tiene turnos.</p>;
  return (
    <div className="grid grid-cols-2 gap-5">
      <Lista titulo="Próximos" turnos={data.proximos} vacio="Ninguno." />
      <Lista titulo="Últimos" turnos={data.anteriores} vacio="Ninguno." />
    </div>
  );
}

function Lista({ titulo, turnos, vacio }: { titulo: string; turnos: TurnoDePaciente[]; vacio: string }) {
  return (
    <div>
      <p className="mb-1.5 text-[13px] font-semibold tracking-wide text-tinta-suave uppercase">{titulo}</p>
      {turnos.length ? (
        <ul className="flex flex-col divide-y divide-linea">
          {turnos.map((t) => (
            <li key={t.id} className="flex items-center gap-2 py-1.5 text-[14px]">
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: COLOR[t.color].fuerte }} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="numeros block font-medium first-letter:uppercase">
                  {fechaConDia(t.fecha)} · {t.desde}
                </span>
                <span className="block truncate text-[13px] text-tinta-suave">{t.profesional}</span>
              </span>
              <ChipEstado estado={t.estado} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[14px] text-tinta-suave">{vacio}</p>
      )}
    </div>
  );
}
