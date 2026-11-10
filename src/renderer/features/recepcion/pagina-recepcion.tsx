// Recepción: la sala de espera de hoy y los recordatorios por WhatsApp.
// La pestaña elegida queda en la dirección (?pestaña=recordatorios).
import { useSearchParams } from 'react-router';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAhora } from '@/lib/ahora';
import { fechaISO, fechaLarga } from '@/lib/fechas';
import { useProfesionales } from '@/features/comun/consultas';
import { useAgenda } from '@/features/agenda/consultas-agenda';
import { useDialogosTurno } from '@/features/agenda/dialogos-turno';
import { SalaDeEspera } from './sala-de-espera';
import { Recordatorios } from './recordatorios';

export function PaginaRecepcion() {
  const [params, setParams] = useSearchParams();
  const pestana = params.get('pestana') === 'recordatorios' ? 'recordatorios' : 'sala';
  const ahora = useAhora();
  const hoy = fechaISO(ahora);
  const profesionales = useProfesionales();
  const agendaDeHoy = useAgenda(hoy, hoy);
  // Diálogos (detalle, consulta, cobro) para los turnos de HOY; Recordatorios tiene los suyos
  const todos = profesionales.data ?? [];
  const dialogosHoy = useDialogosTurno({ turnos: agendaDeHoy.data?.turnos ?? [], profesionales: todos, hoy });

  return (
    <div className="flex h-full flex-col gap-4 px-8 pt-6 pb-6">
      <header>
        <p className="text-[13px] font-semibold tracking-wide text-tinta-suave uppercase">Recepción</p>
        <h1 className="mt-1 font-display text-[32px] leading-none font-semibold tracking-[-0.01em] first-letter:uppercase">{fechaLarga(hoy)}</h1>
      </header>
      <Tabs value={pestana} onValueChange={(v) => setParams(v === 'sala' ? {} : { pestana: v })} className="min-h-0 flex-1 gap-4">
        <TabsList>
          <TabsTrigger value="sala">Sala de espera</TabsTrigger>
          <TabsTrigger value="recordatorios">Recordatorios por WhatsApp</TabsTrigger>
        </TabsList>
        <TabsContent value="sala" className="flex min-h-0 flex-1 flex-col">
          {agendaDeHoy.data && (
            <SalaDeEspera turnos={agendaDeHoy.data.turnos} profesionales={todos} ahora={ahora.getHours() * 60 + ahora.getMinutes()} acciones={dialogosHoy} />
          )}
        </TabsContent>
        <TabsContent value="recordatorios" className="flex min-h-0 flex-1 flex-col">
          <RecordatoriosConDetalle hoy={hoy} />
        </TabsContent>
      </Tabs>
      {dialogosHoy.elementos}
    </div>
  );
}

/** Recordatorios con su propio detalle de turno (los turnos son de otros días). */
function RecordatoriosConDetalle({ hoy }: { hoy: string }) {
  const profesionales = useProfesionales();
  const desde = fechaISO(new Date(Date.parse(`${hoy}T12:00:00`) + 86_400_000));
  const hasta = fechaISO(new Date(Date.parse(`${hoy}T12:00:00`) + 7 * 86_400_000));
  const proximos = useAgenda(desde, hasta);
  const dialogos = useDialogosTurno({ turnos: proximos.data?.turnos ?? [], profesionales: profesionales.data ?? [], hoy });
  return (
    <>
      <Recordatorios hoy={hoy} profesionales={profesionales.data ?? []} alAbrir={dialogos.abrirDetalle} />
      {dialogos.elementos}
    </>
  );
}
