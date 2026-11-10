// Profesionales: quién atiende, cuándo y con turnos de cuánto. Abajo, los
// días sin atención (feriados, vacaciones) que van a bloquear la agenda.
import { useState } from 'react';
import { CalendarOff, Plus, Trash2 } from 'lucide-react';
import { resumenDeHorario, turnosPorSemana } from '@compartido/horarios';
import type { Bloqueo, Profesional } from '@compartido/tipos';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { desenvolver, turnos } from '@/lib/api';
import { rangoCorto } from '@/lib/fechas';
import { CLAVES, useAccion, useBloqueos, useCargarEjemplo, useProfesionales } from '@/features/comun/consultas';
import { Encabezado, Vacio } from '@/features/comun/encabezado';
import { Confirmar, type Confirmacion } from '@/features/comun/confirmar';
import { COLOR, nombreCompleto } from './colores';
import { DialogoProfesional } from './dialogo-profesional';
import { DialogoBloqueo } from './dialogo-bloqueo';

const INICIALES = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const DIAS_LARGOS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

export function PaginaProfesionales() {
  const profesionales = useProfesionales();
  const bloqueos = useBloqueos();
  const ejemplo = useCargarEjemplo();
  const [abierto, setAbierto] = useState<Profesional | 'nuevo' | null>(null);
  const [nuevoBloqueo, setNuevoBloqueo] = useState(false);
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null);
  const borrar = useAccion((id: number) => desenvolver(turnos().bloqueos.borrar(id)), [CLAVES.bloqueos, CLAVES.agenda, CLAVES.libres], 'Día sin atención borrado');

  const lista = profesionales.data ?? [];
  const activos = lista.filter((p) => p.activo);
  const deBaja = lista.filter((p) => !p.activo);

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6 px-10 pt-9 pb-12">
      <Encabezado titulo="Profesionales" detalle="Quién atiende, qué días y con turnos de cuántos minutos.">
        <Button onClick={() => setAbierto('nuevo')}>
          <Plus /> Nuevo profesional
        </Button>
      </Encabezado>

      {profesionales.isSuccess && lista.length === 0 ? (
        <Vacio
          titulo="Todavía no hay profesionales"
          acciones={
            <>
              <Button onClick={() => setAbierto('nuevo')}>
                <Plus /> Agregar profesional
              </Button>
              <Button variant="outline" disabled={ejemplo.isPending} onClick={() => ejemplo.mutate()}>
                Cargar datos de ejemplo
              </Button>
            </>
          }
        >
          Cargá a cada profesional con su horario de atención. Con eso, en la etapa 2, la agenda sabe qué turnos ofrecer.
        </Vacio>
      ) : (
        <ul className="flex flex-col">
          {activos.map((p) => (
            <FilaProfesional key={p.id} p={p} alAbrir={() => setAbierto(p)} />
          ))}
          {deBaja.length > 0 && <li className="mt-6 mb-1 text-[13px] font-medium text-tinta-suave">Dados de baja</li>}
          {deBaja.map((p) => (
            <FilaProfesional key={p.id} p={p} alAbrir={() => setAbierto(p)} />
          ))}
        </ul>
      )}

      <section className="mt-4">
        <div className="flex items-end justify-between border-b border-linea pb-3">
          <div>
            <h2 className="font-display text-2xl font-semibold">Días sin atención</h2>
            <p className="text-tinta-suave">Feriados, vacaciones o congresos: esos días no se van a dar turnos.</p>
          </div>
          <Button variant="outline" disabled={!activos.length} onClick={() => setNuevoBloqueo(true)}>
            <CalendarOff /> Agregar
          </Button>
        </div>
        {bloqueos.data?.length ? (
          <ul>
            {bloqueos.data.map((b) => (
              <FilaBloqueo
                key={b.id}
                b={b}
                profesional={lista.find((p) => p.id === b.profesionalId)}
                alBorrar={() =>
                  setConfirmacion({
                    titulo: '¿Borrar este día sin atención?',
                    descripcion: `${b.quien}, ${rangoCorto(b.desde, b.hasta)}${b.motivo ? ` (${b.motivo})` : ''}. Esos días se van a poder volver a dar turnos.`,
                    boton: 'Borrar',
                    alConfirmar: () => borrar.mutate(b.id),
                  })
                }
              />
            ))}
          </ul>
        ) : (
          <p className="py-6 text-tinta-suave">No hay días sin atención cargados de acá en adelante.</p>
        )}
      </section>

      <DialogoProfesional profesional={abierto} alCerrar={() => setAbierto(null)} />
      <DialogoBloqueo abierto={nuevoBloqueo} profesionales={activos} alCerrar={() => setNuevoBloqueo(false)} />
      <Confirmar confirmacion={confirmacion} alCerrar={() => setConfirmacion(null)} />
    </div>
  );
}

function FilaProfesional({ p, alAbrir }: { p: Profesional; alAbrir: () => void }) {
  const color = COLOR[p.color];
  const dias = new Set(p.horarios.map((h) => h.diaSemana));
  return (
    <li className={cn('relative grid grid-cols-[6px_minmax(0,1.2fr)_minmax(0,1.6fr)_auto] items-center gap-5 border-b border-linea py-4 pr-2 hover:bg-superficie', !p.activo && 'opacity-60')}>
      <span className="h-12 w-1.5 rounded-full" style={{ background: color.fuerte }} aria-hidden="true" />
      <div className="min-w-0">
        <button type="button" onClick={alAbrir} className="text-left font-display text-[21px] leading-tight font-semibold outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline">
          {nombreCompleto(p)}
        </button>
        <p className="truncate text-[14px] text-tinta-suave">
          {[p.especialidad, p.matricula].filter(Boolean).join(' · ') || 'Sin especialidad cargada'}
          {!p.activo && <Badge className="ml-2" variant="contorno">De baja</Badge>}
        </p>
      </div>
      <div className="min-w-0">
        <p className="line-clamp-2 text-[14px]" title={resumenDeHorario(p.horarios)}>
          {resumenDeHorario(p.horarios)}
        </p>
        <p className="text-[13px] text-tinta-suave">
          Turnos de {p.duracionTurnoMin} min · {turnosPorSemana(p.horarios, p.duracionTurnoMin)} por semana
        </p>
      </div>
      {/* Semana en miniatura: qué días atiende */}
      <ol className="flex gap-1" aria-label="Días que atiende">
        {INICIALES.map((inicial, i) => {
          const atiende = dias.has(i + 1);
          return (
            <li
              key={i}
              title={`${DIAS_LARGOS[i]}: ${atiende ? 'atiende' : 'no atiende'}`}
              aria-label={`${DIAS_LARGOS[i]}: ${atiende ? 'atiende' : 'no atiende'}`}
              className="grid size-8 place-items-center rounded-md text-[12px] font-semibold"
              style={atiende ? { background: color.suave, color: color.fuerte } : { color: 'var(--linea-fuerte)' }}
            >
              {inicial}
            </li>
          );
        })}
      </ol>
    </li>
  );
}

function FilaBloqueo({ b, profesional, alBorrar }: { b: Bloqueo; profesional?: Profesional; alBorrar: () => void }) {
  return (
    <li className="grid grid-cols-[220px_1fr_auto] items-center gap-4 border-b border-linea py-3">
      <span className="numeros font-medium">{rangoCorto(b.desde, b.hasta)}</span>
      <span>
        <span className="mr-2 inline-block size-2.5 rounded-full align-middle" style={{ background: profesional ? COLOR[profesional.color].fuerte : 'var(--tinta)' }} aria-hidden="true" />
        {b.quien}
        {b.motivo && <span className="text-tinta-suave"> · {b.motivo}</span>}
      </span>
      <Button variant="ghost" size="icon-sm" aria-label={`Borrar día sin atención del ${rangoCorto(b.desde, b.hasta)}`} onClick={alBorrar}>
        <Trash2 />
      </Button>
    </li>
  );
}
