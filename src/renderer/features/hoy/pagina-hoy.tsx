// "Hoy": quién atiende hoy y en qué horario. En la etapa 2 esta pantalla se
// convierte en la agenda del día con los turnos.
import { Link } from 'react-router';
import { CalendarClock } from 'lucide-react';
import { diaDeLaSemana, horariosDeTurno } from '@compartido/horarios';
import type { Bloqueo, Profesional } from '@compartido/tipos';
import { Button } from '@/components/ui/button';
import { fechaISO, fechaLarga } from '@/lib/fechas';
import { useBloqueos, useCargarEjemplo, useProfesionales, useResumen } from '@/features/comun/consultas';
import { Encabezado, Vacio } from '@/features/comun/encabezado';
import { COLOR, nombreCompleto } from '@/features/profesionales/colores';

export function PaginaHoy() {
  const hoy = fechaISO();
  const dia = diaDeLaSemana(hoy);
  const profesionales = useProfesionales();
  const bloqueos = useBloqueos();
  const resumen = useResumen();
  const ejemplo = useCargarEjemplo();

  const activos = (profesionales.data ?? []).filter((p) => p.activo);
  const bloqueoDe = (p: Profesional): Bloqueo | undefined =>
    bloqueos.data?.find((b) => b.desde <= hoy && hoy <= b.hasta && (b.profesionalId === null || b.profesionalId === p.id));
  const atiendenHoy = activos.filter((p) => p.horarios.some((h) => h.diaSemana === dia));
  const noAtienden = activos.filter((p) => !p.horarios.some((h) => h.diaSemana === dia));

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6 px-10 pt-9 pb-12">
      <Encabezado titulo="Hoy" detalle={<span className="first-letter:uppercase inline-block">{fechaLarga(hoy)}</span>} />

      <p className="flex items-center gap-3 rounded-lg bg-acento-suave px-4 py-3 text-[15px] text-acento-fuerte">
        <CalendarClock className="size-5 shrink-0" aria-hidden="true" />
        La agenda con los turnos llega en la etapa 2. Por ahora, acá ves quién atiende hoy y cuántos turnos se pueden dar.
      </p>

      {profesionales.isSuccess && activos.length === 0 ? (
        <Vacio
          titulo="Empezá por los profesionales"
          acciones={
            <>
              <Button asChild>
                <Link to="/profesionales">Cargar profesionales</Link>
              </Button>
              {resumen.data?.pacientes === 0 && (
                <Button variant="outline" disabled={ejemplo.isPending} onClick={() => ejemplo.mutate()}>
                  Cargar datos de ejemplo
                </Button>
              )}
            </>
          }
        >
          Con el horario de cada profesional, el sistema sabe qué turnos puede ofrecer cada día.
        </Vacio>
      ) : (
        <>
          <section aria-labelledby="t-atienden">
            <h2 id="t-atienden" className="mb-3 font-display text-xl font-semibold">
              Atienden hoy
            </h2>
            {atiendenHoy.length ? (
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
                {atiendenHoy.map((p) => {
                  const franjas = p.horarios.filter((h) => h.diaSemana === dia);
                  const bloqueo = bloqueoDe(p);
                  const color = COLOR[p.color];
                  return (
                    <li key={p.id} className="flex flex-col gap-3 rounded-lg border border-linea bg-superficie p-5" style={{ borderTop: `4px solid ${color.fuerte}` }}>
                      <div>
                        <p className="font-display text-xl font-semibold">{nombreCompleto(p)}</p>
                        <p className="text-[14px] text-tinta-suave">{p.especialidad || ' '}</p>
                      </div>
                      {bloqueo ? (
                        <p className="rounded-md bg-ambar-suave px-3 py-2 text-[14px] font-medium text-ambar">No atiende hoy{bloqueo.motivo ? `: ${bloqueo.motivo}` : ''}</p>
                      ) : (
                        <div className="flex items-end justify-between gap-3">
                          <ul className="flex flex-col gap-1">
                            {franjas.map((f) => (
                              <li key={f.desde} className="numeros text-[17px] font-medium">
                                {f.desde} a {f.hasta}
                              </li>
                            ))}
                          </ul>
                          <p className="text-right text-[13px] text-tinta-suave">
                            <span className="numeros block text-[22px] font-semibold text-tinta">{horariosDeTurno(franjas, p.duracionTurnoMin).length}</span>
                            turnos de {p.duracionTurnoMin} min
                          </p>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-tinta-suave">Hoy no atiende nadie según los horarios cargados.</p>
            )}
          </section>
          {noAtienden.length > 0 && (
            <p className="text-[14px] text-tinta-suave">
              No atienden hoy: {noAtienden.map(nombreCompleto).join(', ')}.
            </p>
          )}
        </>
      )}
    </div>
  );
}
