// Sala de espera: los turnos de HOY en tres columnas, como los ve la recepción.
//   Por llegar → (Llegó) → En sala → (Atender) → Atendidos
// Arriba, la caja del día (lo cobrado, separado por forma de pago).
import { useState, type ReactNode } from 'react';
import { DoorOpen, NotebookPen, Wallet } from 'lucide-react';
import { aMinutos } from '@compartido/horarios';
import { NOMBRE_METODO, METODOS } from '@compartido/esquemas';
import { pesos } from '@compartido/dinero';
import type { Profesional, Turno } from '@compartido/tipos';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { COLOR, nombreCompleto } from '@/features/profesionales/colores';
import { useCambiarEstado } from '@/features/agenda/consultas-agenda';
import { ChipEstado } from '@/features/agenda/estado';
import { Vacio } from '@/features/comun/encabezado';
import { useUsuario } from '@/features/sesion/consultas';

interface Acciones {
  abrirDetalle: (t: Turno) => void;
  abrirConsulta: (t: Turno) => void;
  abrirCobro: (t: Turno) => void;
}

/** Minutos entre dos horas del día ('10:32' y 645 → 13). */
const minutosDesde = (hora: string, ahora: number) => ahora - aMinutos(hora);
const duracionTexto = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`);

export function SalaDeEspera({ turnos, profesionales, ahora, acciones }: { turnos: Turno[]; profesionales: Profesional[]; ahora: number; acciones: Acciones }) {
  const { usuario, atiende } = useUsuario();
  // Un profesional arranca viendo solo a sus pacientes
  const [filtro, setFiltro] = useState<number | null>(usuario?.rol === 'profesional' ? usuario.profesionalId : null);
  const estado = useCambiarEstado();
  const deHoy = turnos.filter((t) => filtro === null || t.profesionalId === filtro);
  const porLlegar = deHoy.filter((t) => t.estado === 'reservado' || t.estado === 'confirmado').sort((a, b) => a.desde.localeCompare(b.desde));
  const enSala = deHoy.filter((t) => t.estado === 'en_sala').sort((a, b) => (a.llegoEn ?? '').localeCompare(b.llegoEn ?? ''));
  const atendidos = deHoy.filter((t) => t.estado === 'atendido').sort((a, b) => b.desde.localeCompare(a.desde));
  const ausentes = deHoy.filter((t) => t.estado === 'ausente').length;
  const conTurnoHoy = profesionales.filter((p) => turnos.some((t) => t.profesionalId === p.id));
  const profesionalDe = (t: Turno) => profesionales.find((p) => p.id === t.profesionalId);

  if (!turnos.some((t) => t.estado !== 'cancelado')) {
    return <Vacio titulo="Hoy no hay turnos">Cuando haya turnos para hoy, acá vas a ver quién está por llegar, quién espera y a quién ya atendieron.</Vacio>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Filtro activo={filtro === null} onClick={() => setFiltro(null)}>
          Todos
        </Filtro>
        {conTurnoHoy.map((p) => (
          <Filtro key={p.id} activo={filtro === p.id} onClick={() => setFiltro(p.id)}>
            <span className="size-2.5 rounded-full" style={{ backgroundColor: COLOR[p.color].fuerte }} aria-hidden="true" />
            {nombreCompleto(p)}
          </Filtro>
        ))}
        <CajaDelDia turnos={turnos} />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-3 gap-4">
        <Columna titulo="Por llegar" cantidad={porLlegar.length} pie={ausentes ? `${ausentes} ${ausentes === 1 ? 'ausente' : 'ausentes'} hoy` : undefined}>
          {porLlegar.map((t) => {
            const atraso = minutosDesde(t.desde, ahora);
            return (
              <Tarjeta key={t.id} turno={t} profesional={profesionalDe(t)} alAbrir={() => acciones.abrirDetalle(t)}>
                <div className="flex items-center gap-2">
                  {t.estado === 'confirmado' && <ChipEstado estado="confirmado" />}
                  {atraso > 5 && <span className="text-[13px] font-semibold text-ambar">Atrasado {duracionTexto(atraso)}</span>}
                </div>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" disabled={estado.isPending} onClick={() => estado.cambiar(t.id, 'en_sala')}>
                    <DoorOpen aria-hidden="true" />
                    Llegó
                  </Button>
                  {atraso > 15 && (
                    <Button size="sm" variant="ghost" disabled={estado.isPending} onClick={() => estado.cambiar(t.id, 'ausente')}>
                      No vino
                    </Button>
                  )}
                </div>
              </Tarjeta>
            );
          })}
        </Columna>

        <Columna titulo="En sala" cantidad={enSala.length} destacada>
          {enSala.map((t) => {
            const espera = t.llegoEn ? minutosDesde(t.llegoEn.slice(11, 16), ahora) : null;
            return (
              <Tarjeta key={t.id} turno={t} profesional={profesionalDe(t)} alAbrir={() => acciones.abrirDetalle(t)}>
                {espera !== null && (
                  <p className="text-[13px] text-tinta-suave">
                    Llegó {t.llegoEn!.slice(11, 16)} ·{' '}
                    <span className={cn('font-semibold', espera >= 40 ? 'text-rojo' : espera >= 20 ? 'text-ambar' : 'text-tinta')}>espera {duracionTexto(Math.max(0, espera))}</span>
                  </p>
                )}
                <div className="mt-2 flex gap-2">
                  {atiende(t) && (
                    <Button size="sm" onClick={() => acciones.abrirConsulta(t)}>
                      <NotebookPen aria-hidden="true" />
                      Atender
                    </Button>
                  )}
                  <BotonCobro turno={t} alCobrar={() => acciones.abrirCobro(t)} />
                </div>
              </Tarjeta>
            );
          })}
        </Columna>

        <Columna titulo="Atendidos" cantidad={atendidos.length}>
          {atendidos.map((t) => (
            <Tarjeta key={t.id} turno={t} profesional={profesionalDe(t)} alAbrir={() => acciones.abrirDetalle(t)}>
              <div className="mt-1 flex flex-wrap gap-2">
                <BotonCobro turno={t} alCobrar={() => acciones.abrirCobro(t)} />
                {atiende(t) && (
                  <Button size="sm" variant="ghost" onClick={() => acciones.abrirConsulta(t)}>
                    <NotebookPen aria-hidden="true" />
                    {t.consultaId ? 'Notas' : 'Cargar notas'}
                  </Button>
                )}
              </div>
            </Tarjeta>
          ))}
        </Columna>
      </div>
    </div>
  );
}

function Filtro({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={cn(
        'flex h-9 items-center gap-2 rounded-full border px-3.5 text-[14px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-acento/50',
        activo ? 'border-tinta bg-tinta text-white' : 'border-linea-fuerte bg-superficie text-tinta-suave hover:text-tinta',
      )}
    >
      {children}
    </button>
  );
}

function Columna({ titulo, cantidad, destacada, pie, children }: { titulo: string; cantidad: number; destacada?: boolean; pie?: string; children: ReactNode }) {
  return (
    <section aria-label={titulo} className={cn('flex min-h-0 flex-col rounded-lg border', destacada ? 'border-ambar/40 bg-ambar-suave/50' : 'border-linea bg-superficie/60')}>
      <h2 className="flex items-baseline justify-between border-b border-linea px-4 py-3 font-display text-lg font-semibold">
        {titulo}
        <span className="numeros font-sans text-[15px] text-tinta-suave">{cantidad}</span>
      </h2>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
        {cantidad === 0 ? <p className="px-1 py-4 text-center text-[14px] text-tinta-suave">Nadie por ahora.</p> : children}
      </div>
      {pie && <p className="border-t border-linea px-4 py-2 text-[13px] text-tinta-suave">{pie}</p>}
    </section>
  );
}

function Tarjeta({ turno: t, profesional, alAbrir, children }: { turno: Turno; profesional: Profesional | undefined; alAbrir: () => void; children: ReactNode }) {
  const color = profesional ? COLOR[profesional.color] : null;
  return (
    <article className="rounded-md border border-linea bg-superficie p-3" style={color ? { borderLeft: `3px solid ${color.fuerte}` } : undefined}>
      <button type="button" onClick={alAbrir} className="w-full rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-acento/50">
        <p className="flex items-baseline gap-2">
          <span className="numeros text-[15px] font-bold">{t.desde}</span>
          <span className="truncate font-display text-[16px] font-semibold hover:underline">{t.paciente}</span>
        </p>
        <p className="truncate text-[13px] text-tinta-suave">
          {profesional ? nombreCompleto(profesional) : ''} · {t.obraSocial ?? 'Particular'}
          {t.motivo && ` · ${t.motivo}`}
        </p>
      </button>
      {children}
    </article>
  );
}

function BotonCobro({ turno: t, alCobrar }: { turno: Turno; alCobrar: () => void }) {
  if (t.cobro) {
    return (
      <button
        type="button"
        onClick={alCobrar}
        className="numeros inline-flex h-9 items-center gap-1.5 rounded-md bg-verde-suave px-3 text-[13px] font-semibold text-verde outline-none focus-visible:ring-2 focus-visible:ring-acento/50"
      >
        <Wallet className="size-4" aria-hidden="true" />
        {t.cobro.tipo === 'obra_social' ? t.cobro.obraSocial : pesos(t.cobro.montoCentavos)}
        {t.cobro.tipo === 'obra_social' && t.cobro.montoCentavos > 0 && ` + ${pesos(t.cobro.montoCentavos)}`}
      </button>
    );
  }
  return (
    <Button size="sm" variant="outline" onClick={alCobrar}>
      <Wallet aria-hidden="true" />
      Cobrar
    </Button>
  );
}

/** Lo cobrado hoy (de todos los profesionales), por forma de pago, y lo que falta cobrar. */
function CajaDelDia({ turnos }: { turnos: Turno[] }) {
  const cobrados = turnos.filter((t) => t.cobro);
  const total = cobrados.reduce((s, t) => s + t.cobro!.montoCentavos, 0);
  const porMetodo = METODOS.map((m) => ({ m, total: cobrados.filter((t) => t.cobro!.metodo === m).reduce((s, t) => s + t.cobro!.montoCentavos, 0) })).filter((x) => x.total > 0);
  const ordenes = cobrados.filter((t) => t.cobro!.tipo === 'obra_social').length;
  const sinCobrar = turnos.filter((t) => t.estado === 'atendido' && !t.cobro).length;
  return (
    <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-linea bg-superficie px-4 py-2 text-[14px]" aria-label="Caja de hoy">
      <span>
        Caja de hoy <strong className="numeros text-[17px]">{pesos(total)}</strong>
      </span>
      {porMetodo.map((x) => (
        <span key={x.m} className="numeros text-tinta-suave">
          {NOMBRE_METODO[x.m]} {pesos(x.total)}
        </span>
      ))}
      {ordenes > 0 && <span className="text-tinta-suave">{ordenes === 1 ? '1 orden' : `${ordenes} órdenes`} de obra social</span>}
      {sinCobrar > 0 && <span className="font-semibold text-ambar">{sinCobrar === 1 ? '1 atendido sin cobrar' : `${sinCobrar} atendidos sin cobrar`}</span>}
    </div>
  );
}
