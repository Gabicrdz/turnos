// Reportes (solo administración): cómo le fue al consultorio en un período.
// Los números los calcula el main (servicios/reportes.ts, con pruebas); acá
// solo se muestran. Cada gráfico se puede ver como tabla.
import { useState, type ReactNode } from 'react';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { addDays, endOfMonth, format, parseISO, startOfMonth, startOfWeek, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { NOMBRE_METODO, type DatosPeriodo } from '@compartido/esquemas';
import { pesos } from '@compartido/dinero';
import type { Reporte } from '@compartido/tipos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BarrasHorizontales } from '@/components/graficos/barras';
import { GraficoColumnas } from '@/components/graficos/columnas';
import { TarjetaGrafico } from '@/components/graficos/tarjeta-grafico';
import { desenvolver, turnos } from '@/lib/api';
import { fechaISO } from '@/lib/fechas';
import { cn } from '@/lib/utils';
import { Encabezado, Vacio } from '@/features/comun/encabezado';
import { COLOR } from '@/features/profesionales/colores';

const porcentaje = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)} %`);
const pesosCortos = (c: number) => (c >= 100_000_000 ? `$ ${(c / 100_000_000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} M` : c >= 100_000 ? `$ ${Math.round(c / 100_000)} mil` : pesos(c));

function atajos(hoy: Date): { nombre: string; periodo: DatosPeriodo }[] {
  const mesPasado = subMonths(hoy, 1);
  return [
    { nombre: 'Este mes', periodo: { desde: fechaISO(startOfMonth(hoy)), hasta: fechaISO(endOfMonth(hoy)) } },
    { nombre: 'Mes anterior', periodo: { desde: fechaISO(startOfMonth(mesPasado)), hasta: fechaISO(endOfMonth(mesPasado)) } },
    { nombre: 'Esta semana', periodo: { desde: fechaISO(startOfWeek(hoy, { weekStartsOn: 1 })), hasta: fechaISO(addDays(startOfWeek(hoy, { weekStartsOn: 1 }), 6)) } },
    { nombre: 'Últimos 30 días', periodo: { desde: fechaISO(addDays(hoy, -29)), hasta: fechaISO(hoy) } },
  ];
}

export function PaginaReportes() {
  const opciones = atajos(new Date());
  const [periodo, setPeriodo] = useState<DatosPeriodo>(opciones[0]!.periodo);
  const valido = /^\d{4}-\d{2}-\d{2}$/.test(periodo.desde) && /^\d{4}-\d{2}-\d{2}$/.test(periodo.hasta) && periodo.desde <= periodo.hasta;
  const reporte = useQuery({
    queryKey: ['reporte', periodo.desde, periodo.hasta],
    queryFn: () => desenvolver(turnos().reportes.obtener(periodo)),
    enabled: valido,
    placeholderData: keepPreviousData,
    staleTime: 0,
  });

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6 px-10 pt-9 pb-12">
      <Encabezado titulo="Reportes" detalle="Atenciones, ausentismo, cobros y obras sociales del período.">
        <div className="flex flex-wrap items-center justify-end gap-2">
          {opciones.map((o) => {
            const activo = o.periodo.desde === periodo.desde && o.periodo.hasta === periodo.hasta;
            return (
              <button
                key={o.nombre}
                type="button"
                aria-pressed={activo}
                onClick={() => setPeriodo(o.periodo)}
                className={cn(
                  'h-9 rounded-full border px-3.5 text-[14px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-acento/50',
                  activo ? 'border-tinta bg-tinta text-white' : 'border-linea-fuerte bg-superficie text-tinta-suave hover:text-tinta',
                )}
              >
                {o.nombre}
              </button>
            );
          })}
          <Input type="date" aria-label="Desde" className="h-9 w-[150px]" value={periodo.desde} onChange={(e) => setPeriodo((p) => ({ ...p, desde: e.target.value }))} />
          <span className="text-tinta-suave">a</span>
          <Input type="date" aria-label="Hasta" className="h-9 w-[150px]" value={periodo.hasta} onChange={(e) => setPeriodo((p) => ({ ...p, hasta: e.target.value }))} />
        </div>
      </Encabezado>

      {!valido ? (
        <p className="text-rojo">Revisá las fechas: "desde" tiene que ser antes que "hasta".</p>
      ) : reporte.isError ? (
        <p className="text-rojo">{reporte.error.message}</p>
      ) : !reporte.data ? (
        <p className="text-tinta-suave">Calculando…</p>
      ) : reporte.data.totales.turnos === 0 ? (
        <Vacio titulo="No hay turnos en este período">Elegí otro período de arriba.</Vacio>
      ) : (
        <Contenido r={reporte.data} periodo={periodo} />
      )}
    </div>
  );
}

function Contenido({ r, periodo }: { r: Reporte; periodo: DatosPeriodo }) {
  const t = r.totales;
  const exportar = useMutation({
    mutationFn: (obraSocialId: number) => desenvolver(turnos().reportes.exportarOrdenes(periodo, obraSocialId)),
    onSuccess: (res) => res && toast.success(`${res.cantidad === 1 ? '1 orden guardada' : `${res.cantidad} órdenes guardadas`}`, { description: res.ruta }),
    onError: (e) => toast.error(e.message),
  });
  const conCobertura = r.porCobertura.filter((c) => c.tipo !== 'sin_cobrar');
  const sinCobrar = r.porCobertura.find((c) => c.tipo === 'sin_cobrar');

  return (
    <>
      {/* Números principales, separados por líneas (sin tarjetas) */}
      <dl className="grid grid-cols-5 divide-x divide-linea rounded-lg border border-linea bg-superficie">
        <Indicador nombre="Atendidos" valor={String(t.atendidos)} detalle={`${t.pacientesAtendidos} pacientes · ${t.pacientesNuevos} nuevos`} />
        <Indicador nombre="Ausentismo" valor={porcentaje(t.ausentismo)} detalle={`${t.ausentes} ${t.ausentes === 1 ? 'no vino' : 'no vinieron'} · ${t.cancelados} cancelados`} alerta={(t.ausentismo ?? 0) >= 0.15} />
        <Indicador nombre="Cobrado" valor={pesosCortos(t.ingresosCentavos)} detalle="consultas particulares y copagos" />
        <Indicador nombre="Órdenes de obra social" valor={String(t.ordenes)} detalle="para presentar" />
        <Indicador nombre="Atendidos sin cobrar" valor={String(t.atendidosSinCobrar)} detalle={t.atendidosSinCobrar ? 'revisalos en Recepción' : 'todo cobrado'} alerta={t.atendidosSinCobrar > 0} />
      </dl>

      <div className="grid grid-cols-[1.7fr_1fr] gap-5">
        <TarjetaGrafico
          titulo="Atenciones por día"
          descripcion="Pacientes atendidos cada día del período."
          tabla={{
            columnas: ['Día', 'Atendidos', 'No vinieron', 'Cobrado'],
            filas: r.porDia.map((d) => [format(parseISO(d.fecha), 'EEE d/M', { locale: es }), d.atendidos, d.ausentes, pesos(d.ingresosCentavos)]),
          }}
        >
          <GraficoColumnas
            nombre="Atenciones por día"
            columnas={r.porDia.map((d) => ({
              clave: d.fecha,
              etiqueta: r.porDia.length > 16 ? format(parseISO(d.fecha), 'd') : format(parseISO(d.fecha), 'EEE d', { locale: es }),
              titulo: format(parseISO(d.fecha), "EEEE d 'de' MMMM", { locale: es }),
              valor: d.atendidos,
              detalle: `${d.ausentes} no vinieron · ${pesos(d.ingresosCentavos)}`,
            }))}
            formatear={(v) => `${v} ${v === 1 ? 'atendido' : 'atendidos'}`}
            formatearEje={(v) => String(v)}
          />
        </TarjetaGrafico>
        <TarjetaGrafico
          titulo="Cobrado por forma de pago"
          descripcion="Lo que pagaron los pacientes."
          tabla={{ columnas: ['Forma de pago', 'Cobros', 'Total'], filas: t.porMetodo.map((m) => [NOMBRE_METODO[m.metodo], m.cantidad, pesos(m.centavos)]) }}
        >
          {t.porMetodo.length ? (
            <BarrasHorizontales
              barras={t.porMetodo.map((m) => ({ clave: m.metodo, etiqueta: NOMBRE_METODO[m.metodo], valor: m.centavos, detalle: `${m.cantidad} ${m.cantidad === 1 ? 'cobro' : 'cobros'}` }))}
              formatear={pesos}
              conPorcentaje
            />
          ) : (
            <p className="text-[14px] text-tinta-suave">Todavía no hay cobros con importe en el período.</p>
          )}
        </TarjetaGrafico>
      </div>

      <Seccion titulo="Por profesional" descripcion="Ocupación: turnos dados sobre los que entraban según su horario (sin los días sin atención).">
        <table className="w-full text-[15px]">
          <thead>
            <tr className="border-b border-linea text-left text-[13px] text-tinta-suave">
              <th className="py-2 font-medium">Profesional</th>
              <th className="py-2 text-right font-medium">Turnos</th>
              <th className="py-2 text-right font-medium">Atendidos</th>
              <th className="py-2 text-right font-medium">Ausentismo</th>
              <th className="w-[260px] py-2 pl-6 font-medium">Ocupación</th>
              <th className="py-2 text-right font-medium">Cobrado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-linea">
            {r.porProfesional.map((p) => (
              <tr key={p.profesionalId}>
                <td className="py-2.5">
                  <span className="flex items-center gap-2 font-semibold">
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: COLOR[p.color].fuerte }} aria-hidden="true" />
                    {p.nombre}
                  </span>
                </td>
                <td className="numeros py-2.5 text-right">{p.turnos}</td>
                <td className="numeros py-2.5 text-right">{p.atendidos}</td>
                <td className={cn('numeros py-2.5 text-right', (p.ausentismo ?? 0) >= 0.15 && 'font-semibold text-ambar')}>{porcentaje(p.ausentismo)}</td>
                <td className="py-2.5 pl-6">
                  <span className="flex items-center gap-3">
                    <span className="h-2.5 flex-1 rounded-r bg-secondary">
                      {p.ocupacion !== null && p.ocupacion > 0 && <span className="block h-full rounded-r bg-dato" style={{ width: `max(${p.ocupacion * 100}%, 3px)` }} />}
                    </span>
                    <span className="numeros w-32 text-right text-[13px] text-tinta-suave" title={`${p.turnos} turnos dados de ${p.disponibles} que entraban`}>
                      <strong className="text-tinta">{porcentaje(p.ocupacion)}</strong> · {p.turnos} de {p.disponibles}
                    </span>
                  </span>
                </td>
                <td className="numeros py-2.5 text-right">{pesos(p.ingresosCentavos)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Seccion>

      <div className="grid grid-cols-[1.5fr_1fr] gap-5">
        <Seccion titulo="Por cobertura" descripcion="Atenciones según cómo se cobraron. Exportá las órdenes de cada obra social para la liquidación.">
          <ul className="divide-y divide-linea">
            {conCobertura.map((c) => (
              <li key={`${c.tipo}-${c.obraSocialId}`} className="flex items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1 font-semibold">{c.nombre}</span>
                <span className="numeros w-28 text-right text-[14px] text-tinta-suave">
                  {c.atenciones} {c.atenciones === 1 ? 'atención' : 'atenciones'}
                </span>
                <span className="numeros w-28 text-right text-[14px]">{c.montoCentavos ? pesos(c.montoCentavos) : '—'}</span>
                <span className="w-[150px] text-right">
                  {c.tipo === 'obra_social' && c.obraSocialId !== null && (
                    <Button size="sm" variant="outline" disabled={exportar.isPending} onClick={() => exportar.mutate(c.obraSocialId!)}>
                      <FileSpreadsheet aria-hidden="true" />
                      {c.ordenes} {c.ordenes === 1 ? 'orden' : 'órdenes'}
                    </Button>
                  )}
                </span>
              </li>
            ))}
            {sinCobrar && (
              <li className="flex items-center gap-3 py-2.5 text-ambar">
                <span className="flex-1 font-semibold">Sin cobrar</span>
                <span className="numeros w-28 text-right text-[14px]">
                  {sinCobrar.atenciones} {sinCobrar.atenciones === 1 ? 'atención' : 'atenciones'}
                </span>
                <span className="w-[262px]" />
              </li>
            )}
          </ul>
        </Seccion>
        <Seccion titulo="Los que más faltan" descripcion="Dos o más ausencias en el período: conviene recordarles con tiempo.">
          {r.faltadores.length ? (
            <ul className="divide-y divide-linea">
              {r.faltadores.map((f) => (
                <li key={f.pacienteId} className="flex items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{f.paciente}</span>
                    <span className="block text-[13px] text-tinta-suave">{f.telefono || 'sin teléfono'}</span>
                  </span>
                  <span className="numeros text-[14px]">
                    <strong className="text-ambar">{f.ausentes}</strong> de {f.turnos}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[14px] text-tinta-suave">Nadie faltó dos veces o más en este período.</p>
          )}
        </Seccion>
      </div>
    </>
  );
}

function Indicador({ nombre, valor, detalle, alerta = false }: { nombre: string; valor: string; detalle: string; alerta?: boolean }) {
  return (
    <div className="px-5 py-4">
      <dt className="text-[13px] font-medium text-tinta-suave">{nombre}</dt>
      <dd className={cn('numeros mt-1 font-display text-[clamp(1.5rem,2.4vw,2.1rem)] leading-none font-semibold', alerta && 'text-ambar')}>{valor}</dd>
      <dd className="mt-1.5 text-[13px] text-tinta-suave">{detalle}</dd>
    </div>
  );
}

function Seccion({ titulo, descripcion, children }: { titulo: string; descripcion: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-linea bg-superficie p-5">
      <h2 className="font-display text-lg font-semibold">{titulo}</h2>
      <p className="mb-3 text-[13px] text-tinta-suave">{descripcion}</p>
      {children}
    </section>
  );
}
