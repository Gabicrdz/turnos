// Recordatorios: los turnos pendientes de los próximos días, para mandar el
// WhatsApp uno por uno. El botón abre WhatsApp con el mensaje ya escrito; la
// recepción lo envía y, cuando el paciente responde, toca "Confirmar".
import { useState } from 'react';
import { addDays, format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Check, MessageCircle } from 'lucide-react';
import { numeroWhatsApp } from '@compartido/whatsapp';
import type { Profesional, Turno } from '@compartido/tipos';
import { Button } from '@/components/ui/button';
import { fechaISO } from '@/lib/fechas';
import { cn } from '@/lib/utils';
import { COLOR, nombreCompleto } from '@/features/profesionales/colores';
import { useAgenda, useCambiarEstado, useRecordar } from '@/features/agenda/consultas-agenda';
import { ChipEstado } from '@/features/agenda/estado';
import { Vacio } from '@/features/comun/encabezado';

const DIAS = 7;

export function Recordatorios({ hoy, profesionales, alAbrir }: { hoy: string; profesionales: Profesional[]; alAbrir: (t: Turno) => void }) {
  const desde = fechaISO(addDays(parseISO(hoy), 1));
  const hasta = fechaISO(addDays(parseISO(hoy), DIAS));
  const agenda = useAgenda(desde, hasta);
  const [elegido, setElegido] = useState<string | null>(null);
  const whatsapp = useRecordar();
  const estado = useCambiarEstado();

  const pendientes = (agenda.data?.turnos ?? []).filter((t) => t.estado === 'reservado' || t.estado === 'confirmado');
  const dias = Array.from({ length: DIAS }, (_, i) => fechaISO(addDays(parseISO(hoy), i + 1))).map((f) => ({ fecha: f, turnos: pendientes.filter((t) => t.fecha === f) }));
  // Por defecto, el primer día con turnos (mañana, o el lunes si hoy es viernes)
  const fecha = elegido ?? dias.find((d) => d.turnos.length)?.fecha ?? desde;
  const delDia = dias.find((d) => d.fecha === fecha)?.turnos ?? [];
  const enviados = delDia.filter((t) => t.recordadoEn).length;
  const confirmados = delDia.filter((t) => t.estado === 'confirmado').length;
  const profesionalDe = (t: Turno) => profesionales.find((p) => p.id === t.profesionalId);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div role="tablist" aria-label="Día" className="flex flex-wrap gap-2">
        {dias.map((d) => (
          <button
            key={d.fecha}
            type="button"
            role="tab"
            aria-selected={d.fecha === fecha}
            onClick={() => setElegido(d.fecha)}
            className={cn(
              'flex min-w-[92px] flex-col items-start rounded-md border px-3 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-acento/50',
              d.fecha === fecha ? 'border-tinta bg-tinta text-white' : 'border-linea-fuerte bg-superficie hover:bg-accent',
              !d.turnos.length && d.fecha !== fecha && 'opacity-55',
            )}
          >
            <span className="text-[14px] font-semibold first-letter:uppercase">{format(parseISO(d.fecha), 'EEE d', { locale: es })}</span>
            <span className={cn('numeros text-[12px]', d.fecha === fecha ? 'text-white/75' : 'text-tinta-suave')}>
              {d.turnos.length ? `${d.turnos.length} ${d.turnos.length === 1 ? 'turno' : 'turnos'}` : 'sin turnos'}
            </span>
          </button>
        ))}
      </div>

      {agenda.isSuccess && delDia.length === 0 ? (
        <Vacio titulo="No hay turnos pendientes ese día">Elegí otro día de arriba.</Vacio>
      ) : (
        <section className="flex min-h-0 flex-1 flex-col rounded-lg border border-linea bg-superficie">
          <p className="border-b border-linea px-4 py-3 text-[14px] text-tinta-suave">
            <span className="font-semibold text-tinta first-letter:uppercase inline-block">{format(parseISO(fecha), "EEEE d 'de' MMMM", { locale: es })}</span> ·{' '}
            {delDia.length} {delDia.length === 1 ? 'turno' : 'turnos'} · {enviados} con recordatorio · {confirmados} {confirmados === 1 ? 'confirmado' : 'confirmados'}
          </p>
          <ul className="min-h-0 flex-1 divide-y divide-linea overflow-y-auto">
            {delDia.map((t) => {
              const p = profesionalDe(t);
              const celular = numeroWhatsApp(t.telefono);
              return (
                <li key={t.id} className="grid grid-cols-[56px_1fr_auto] items-center gap-4 px-4 py-2.5">
                  <span className="numeros text-[16px] font-bold">{t.desde}</span>
                  <button type="button" onClick={() => alAbrir(t)} className="min-w-0 rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-acento/50">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-semibold hover:underline">{t.paciente}</span>
                      {t.estado === 'confirmado' && <ChipEstado estado="confirmado" />}
                    </span>
                    <span className="flex items-center gap-1.5 truncate text-[13px] text-tinta-suave">
                      {p && <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: COLOR[p.color].fuerte }} aria-hidden="true" />}
                      {p ? nombreCompleto(p) : ''} · {t.telefono || 'sin teléfono'}
                    </span>
                  </button>
                  <div className="flex items-center gap-2">
                    {t.recordadoEn && (
                      <span className="flex items-center gap-1 text-[13px] font-medium text-verde">
                        <Check className="size-4" aria-hidden="true" />
                        Enviado {t.recordadoEn.slice(11, 16)}
                      </span>
                    )}
                    {celular ? (
                      <Button size="sm" variant={t.recordadoEn ? 'ghost' : 'outline'} disabled={whatsapp.isPending} onClick={() => whatsapp.recordar(t.id)}>
                        <MessageCircle aria-hidden="true" />
                        {t.recordadoEn ? 'Otra vez' : 'WhatsApp'}
                      </Button>
                    ) : (
                      <span className="text-[13px] font-medium text-ambar" title="Revisá el teléfono en la ficha del paciente">
                        Sin celular
                      </span>
                    )}
                    {t.estado === 'reservado' && (
                      <Button size="sm" variant="ghost" disabled={estado.isPending} onClick={() => estado.cambiar(t.id, 'confirmado')}>
                        Confirmar
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
