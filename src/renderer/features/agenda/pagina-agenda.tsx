// La agenda: vista del día (una columna por profesional) o de la semana (una
// columna por día, de un profesional). Lo que se está mirando queda en la
// dirección (?fecha=…&vista=…&prof=…): así "Atrás" vuelve a donde estabas.
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { addDays, format, parseISO, startOfWeek } from 'date-fns';
import { es } from 'date-fns/locale';
import { Ban, ChevronDown, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { NOMBRE_ESTADO, type EstadoTurno } from '@compartido/agenda';
import { NOMBRE_DIA } from '@compartido/esquemas';
import { diaDeLaSemana } from '@compartido/horarios';
import type { Profesional, Turno } from '@compartido/tipos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { fechaISO, fechaLarga } from '@/lib/fechas';
import { useAhora } from '@/lib/ahora';
import { cn } from '@/lib/utils';
import { useCargarEjemplo, useProfesionales, useResumen } from '@/features/comun/consultas';
import { Vacio } from '@/features/comun/encabezado';
import { COLOR, nombreCompleto } from '@/features/profesionales/colores';
import { useAgenda, useCargarTurnosEjemplo } from './consultas-agenda';
import { useDialogosTurno } from './dialogos-turno';
import { DialogoTurno, type ModoTurno } from './dialogo-turno';
import { ESTILO_ESTADO } from './estado';
import { Grilla, type ColumnaAgenda } from './grilla';

type Vista = 'dia' | 'semana';
const esFecha = (f: string | null): f is string => Boolean(f && /^\d{4}-\d{2}-\d{2}$/.test(f) && !Number.isNaN(Date.parse(f)));

/** "16 al 22 de noviembre" o "30 de noviembre al 6 de diciembre". */
function textoSemana(desde: Date, hasta: Date): string {
  return desde.getMonth() === hasta.getMonth()
    ? `${format(desde, 'd')} al ${format(hasta, "d 'de' MMMM", { locale: es })}`
    : `${format(desde, "d 'de' MMMM", { locale: es })} al ${format(hasta, "d 'de' MMMM", { locale: es })}`;
}

export function PaginaAgenda() {
  const [params, setParams] = useSearchParams();
  const ubicacion = useLocation();
  const navegar = useNavigate();
  const ahora = useAhora();
  const hoy = fechaISO(ahora);
  const minutoAhora = ahora.getHours() * 60 + ahora.getMinutes();

  const fecha = esFecha(params.get('fecha')) ? params.get('fecha')! : hoy;
  const vista: Vista = params.get('vista') === 'semana' ? 'semana' : 'dia';
  const profElegido = Number(params.get('prof')) || null;

  const profesionales = useProfesionales();
  const resumen = useResumen();
  const ejemplo = useCargarEjemplo();
  const ejemploTurnos = useCargarTurnosEjemplo();

  const lunes = startOfWeek(parseISO(fecha), { weekStartsOn: 1 });
  const rango = vista === 'dia' ? { desde: fecha, hasta: fecha } : { desde: fechaISO(lunes), hasta: fechaISO(addDays(lunes, 6)) };
  const agenda = useAgenda(rango.desde, rango.hasta);

  const [modo, setModo] = useState<ModoTurno | null>(null);

  const ir = (cambios: Record<string, string | null>) => {
    const nuevos = new URLSearchParams(params);
    for (const [clave, valor] of Object.entries(cambios)) {
      if (valor === null) nuevos.delete(clave);
      else nuevos.set(clave, valor);
    }
    setParams(nuevos);
  };

  // "Dar turno" desde la ficha del paciente: llega con el paciente ya elegido
  useEffect(() => {
    const para = (ubicacion.state as { nuevoTurnoPara?: { id: number; nombre: string } } | null)?.nuevoTurnoPara;
    if (!para) return;
    setModo({ tipo: 'nuevo', paciente: para });
    navegar({ search: ubicacion.search }, { replace: true, state: null });
  }, [ubicacion.state, ubicacion.search, navegar]);

  const todos = profesionales.data ?? [];
  const activos = todos.filter((p) => p.activo);
  // En la semana se mira un profesional: el elegido o el primero
  const profSemana = todos.find((p) => p.id === profElegido) ?? activos[0];

  const { columnas, visibles, cancelados } = useMemo(() => {
    const datos = agenda.data ?? { turnos: [], bloqueos: [] };
    const turnosDe = (p: Profesional, f: string) => datos.turnos.filter((t) => t.profesionalId === p.id && t.fecha === f);
    const armar = (p: Profesional, f: string, encabezado: ColumnaAgenda['encabezado']): ColumnaAgenda => ({
      clave: `${p.id}-${f}`,
      fecha: f,
      profesional: p,
      franjas: p.horarios.filter((h) => h.diaSemana === diaDeLaSemana(f)),
      bloqueo: datos.bloqueos.find((b) => b.desde <= f && f <= b.hasta && (b.profesionalId === null || b.profesionalId === p.id)),
      turnos: turnosDe(p, f).filter((t) => t.estado !== 'cancelado'),
      encabezado,
    });
    const tieneAlgo = (c: ColumnaAgenda) => (c.profesional.activo && c.franjas.length > 0) || c.turnos.length > 0;
    const cuenta = (c: ColumnaAgenda, libres: number) =>
      c.bloqueo ? (
        <span className="font-semibold text-ambar">
          No atiende{c.bloqueo.motivo ? `: ${c.bloqueo.motivo}` : ''}
          {c.turnos.length > 0 && ` · ${c.turnos.length} ${c.turnos.length === 1 ? 'turno' : 'turnos'} para reprogramar`}
        </span>
      ) : (
        `${c.turnos.length} ${c.turnos.length === 1 ? 'turno' : 'turnos'} · ${libres} ${libres === 1 ? 'libre' : 'libres'}`
      );

    let cols: ColumnaAgenda[] = [];
    if (vista === 'dia') {
      const candidatos = profElegido ? todos.filter((p) => p.id === profElegido) : todos;
      cols = candidatos
        .map((p) => {
          const c = armar(p, fecha, () => null);
          c.encabezado = ({ libres }) => (
            <>
              <p className="flex items-center gap-2 truncate font-display text-[17px] leading-tight font-semibold">
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: COLOR[p.color].fuerte }} aria-hidden="true" />
                {nombreCompleto(p)}
              </p>
              <p className="numeros mt-0.5 truncate text-[13px] text-tinta-suave">
                {p.especialidad ? `${p.especialidad} · ` : ''}
                {cuenta(c, libres)}
              </p>
            </>
          );
          return c;
        })
        .filter(tieneAlgo);
    } else if (profSemana) {
      cols = Array.from({ length: 7 }, (_, i) => fechaISO(addDays(lunes, i)))
        .map((f) => {
          const c = armar(profSemana, f, () => null);
          c.encabezado = ({ libres }) => (
            <button
              type="button"
              onClick={() => ir({ vista: null, fecha: f })}
              className="w-full rounded-md text-left outline-none hover:text-acento-fuerte focus-visible:ring-2 focus-visible:ring-acento/50"
              title="Ver este día"
            >
              <p className={cn('font-display text-[17px] leading-tight font-semibold first-letter:uppercase', f === hoy && 'text-acento')}>
                {format(parseISO(f), 'EEEE d', { locale: es })}
                {f === hoy && <span className="ml-2 rounded-full bg-acento px-2 py-0.5 align-middle font-sans text-[11px] font-bold text-white">HOY</span>}
              </p>
              <p className="numeros mt-0.5 text-[13px] text-tinta-suave">{cuenta(c, libres)}</p>
            </button>
          );
          return c;
        })
        .filter(tieneAlgo);
    }
    const enVista = new Set(cols.map((c) => c.clave));
    const deLaVista = datos.turnos.filter((t) => enVista.has(`${t.profesionalId}-${t.fecha}`));
    return { columnas: cols, visibles: deLaVista.filter((t) => t.estado !== 'cancelado'), cancelados: deLaVista.filter((t) => t.estado === 'cancelado') };
    // `ir` cambia en cada render pero solo usa params
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agenda.data, todos, vista, fecha, profElegido, profSemana, hoy]);

  const dialogos = useDialogosTurno({
    turnos: agenda.data?.turnos ?? [],
    profesionales: todos,
    hoy,
    alReprogramar: (t) => setModo({ tipo: 'mover', turno: t }),
  });
  const esHoy = vista === 'dia' ? fecha === hoy : rango.desde <= hoy && hoy <= rango.hasta;
  const paso = vista === 'dia' ? 1 : 7;
  const mover = (dias: number) => ir({ fecha: fechaISO(addDays(parseISO(fecha), dias)) });

  if (profesionales.isSuccess && activos.length === 0) {
    return (
      <div className="mx-auto max-w-[1180px] px-10 pt-9 pb-12">
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
          Con el horario de cada profesional, la agenda sabe qué turnos puede ofrecer cada día.
        </Vacio>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-col gap-4 px-8 pt-6 pb-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[13px] font-semibold tracking-wide text-tinta-suave uppercase">{vista === 'dia' ? 'Agenda del día' : `Semana de ${profSemana ? nombreCompleto(profSemana) : ''}`}</p>
            <h1 className="mt-1 font-display text-[32px] leading-none font-semibold tracking-[-0.01em] first-letter:uppercase">
              {vista === 'dia' ? fechaLarga(fecha) : textoSemana(lunes, addDays(lunes, 6))}
            </h1>
          </div>
          <Button onClick={() => setModo({ tipo: 'nuevo', fecha: fecha < hoy ? hoy : fecha, profesionalId: vista === 'semana' ? profSemana?.id : (profElegido ?? undefined) })}>
            <Plus aria-hidden="true" />
            Nuevo turno
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" disabled={esHoy} onClick={() => ir({ fecha: null })}>
            Hoy
          </Button>
          <Button variant="outline" size="icon" aria-label={vista === 'dia' ? 'Día anterior' : 'Semana anterior'} onClick={() => mover(-paso)}>
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button variant="outline" size="icon" aria-label={vista === 'dia' ? 'Día siguiente' : 'Semana siguiente'} onClick={() => mover(paso)}>
            <ChevronRight aria-hidden="true" />
          </Button>
          <Input type="date" aria-label="Ir a la fecha" className="w-[160px]" value={fecha} onChange={(e) => esFecha(e.target.value) && ir({ fecha: e.target.value })} />

          <div className="ml-auto flex items-center gap-2">
            <div role="group" aria-label="Vista" className="flex rounded-md border border-input bg-superficie p-0.5">
              {(['dia', 'semana'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={vista === v}
                  onClick={() => ir({ vista: v === 'dia' ? null : 'semana' })}
                  className={cn(
                    'h-[38px] rounded-[5px] px-4 text-[15px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-acento/50',
                    vista === v ? 'bg-tinta text-white' : 'text-tinta-suave hover:text-tinta',
                  )}
                >
                  {v === 'dia' ? 'Día' : 'Semana'}
                </button>
              ))}
            </div>
            <Select value={vista === 'semana' ? String(profSemana?.id ?? '') : profElegido ? String(profElegido) : 'todos'} onValueChange={(v) => ir({ prof: v === 'todos' ? null : v })}>
              <SelectTrigger aria-label="Profesional" className="w-[240px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {vista === 'dia' && <SelectItem value="todos">Todos los profesionales</SelectItem>}
                {todos
                  .filter((p) => p.activo || p.id === profElegido)
                  .map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      <span className="size-2.5 rounded-full" style={{ backgroundColor: COLOR[p.color].fuerte }} aria-hidden="true" />
                      {nombreCompleto(p)}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {columnas.length > 0 && <ResumenDeEstados turnos={visibles} cancelados={cancelados} alElegir={dialogos.abrirDetalle} />}

        {resumen.data && resumen.data.turnos === 0 && resumen.data.pacientes > 0 && (
          <p className="flex flex-wrap items-center gap-3 rounded-lg bg-acento-suave px-4 py-3 text-[15px] text-acento-fuerte">
            La agenda está vacía. Tocá un horario libre para dar el primer turno, o probala con turnos de ejemplo.
            <Button size="sm" variant="outline" className="ml-auto" disabled={ejemploTurnos.isPending} onClick={() => ejemploTurnos.mutate()}>
              Cargar turnos de ejemplo
            </Button>
          </p>
        )}
      </header>

      {agenda.isError ? (
        <p className="px-8 text-rojo">{agenda.error.message}</p>
      ) : columnas.length > 0 ? (
        <Grilla
          columnas={columnas}
          hoy={hoy}
          ahora={minutoAhora}
          claveVista={`${vista}-${rango.desde}-${profElegido}`}
          alElegirLibre={(c, desde) => setModo({ tipo: 'nuevo', profesionalId: c.profesional.id, fecha: c.fecha, desde })}
          alElegirTurno={dialogos.abrirDetalle}
        />
      ) : (
        agenda.isSuccess && (
          <div className="px-8">
            <Vacio titulo={vista === 'dia' ? 'No hay atención este día' : 'No atiende esta semana'}>
              {vista === 'dia'
                ? profElegido
                  ? `${nombreCompleto(todos.find((p) => p.id === profElegido) ?? profSemana!)} no atiende los ${NOMBRE_DIA[diaDeLaSemana(fecha)]}${diaDeLaSemana(fecha) >= 6 ? 's' : ''}.`
                  : `Según los horarios cargados, nadie atiende los ${NOMBRE_DIA[diaDeLaSemana(fecha)]}${diaDeLaSemana(fecha) >= 6 ? 's' : ''}.`
                : 'No tiene horario cargado ni turnos en esta semana.'}
            </Vacio>
          </div>
        )
      )}

      <DialogoTurno modo={modo} profesionales={todos} hoy={hoy} alCerrar={() => setModo(null)} alListo={(f) => f !== fecha && vista === 'dia' && ir({ fecha: f })} />
      {dialogos.elementos}
    </div>
  );
}

const ORDEN: EstadoTurno[] = ['reservado', 'confirmado', 'en_sala', 'atendido', 'ausente'];
const PLURAL: Record<EstadoTurno, string> = {
  reservado: 'reservados',
  confirmado: 'confirmados',
  en_sala: 'en sala',
  atendido: 'atendidos',
  ausente: 'ausentes',
  cancelado: 'cancelados',
};

/** Fila de conteos: "18 turnos · 6 confirmados · 2 en sala…" y los cancelados en un menú. */
function ResumenDeEstados({ turnos, cancelados, alElegir }: { turnos: Turno[]; cancelados: Turno[]; alElegir: (t: Turno) => void }) {
  const cuantos = (e: EstadoTurno) => turnos.filter((t) => t.estado === e).length;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[14px]">
      <span className="font-semibold">
        <span className="numeros">{turnos.length}</span> {turnos.length === 1 ? 'turno' : 'turnos'}
      </span>
      {ORDEN.filter((e) => cuantos(e) > 0).map((e) => {
        const { icono: Icono, clase } = ESTILO_ESTADO[e];
        return (
          <span key={e} className="flex items-center gap-1.5 text-tinta-suave">
            <span className={cn('inline-flex size-[18px] items-center justify-center rounded-full', clase)}>
              <Icono className="size-3" strokeWidth={2.6} aria-hidden="true" />
            </span>
            <span className="numeros font-semibold text-tinta">{cuantos(e)}</span> {cuantos(e) === 1 ? NOMBRE_ESTADO[e].toLowerCase() : PLURAL[e]}
          </span>
        );
      })}
      {cancelados.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-tinta-suave outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-acento/50">
            <Ban className="size-3.5" aria-hidden="true" />
            <span className="numeros font-semibold text-tinta">{cancelados.length}</span> {cancelados.length === 1 ? 'cancelado' : 'cancelados'}
            <ChevronDown className="size-3.5" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {cancelados.map((t) => (
              <DropdownMenuItem key={t.id} onSelect={() => alElegir(t)}>
                <span className="numeros text-tinta-suave">
                  {t.fecha.slice(8, 10)}/{t.fecha.slice(5, 7)} {t.desde}
                </span>
                {t.paciente}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
