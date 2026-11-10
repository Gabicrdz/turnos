// Los diálogos de un turno (detalle, consulta y cobro) en un solo lugar, para
// usarlos igual desde la agenda y desde recepción. Se guarda el ID del turno
// (no el objeto): así, cuando la lista se refresca, el diálogo muestra el dato nuevo.
import { useState } from 'react';
import type { Profesional, Turno } from '@compartido/tipos';
import { DialogoCobro } from '@/features/cobros/dialogo-cobro';
import { DialogoConsulta } from '@/features/consulta/dialogo-consulta';
import { DetalleTurno } from './detalle-turno';

interface Opciones {
  turnos: Turno[];
  profesionales: Profesional[];
  hoy: string;
  /** Solo en la agenda (en recepción no se reprograma). */
  alReprogramar?: (turno: Turno) => void;
}

export function useDialogosTurno({ turnos, profesionales, hoy, alReprogramar }: Opciones) {
  const [detalle, setDetalle] = useState<number | null>(null);
  const [consulta, setConsulta] = useState<number | null>(null);
  const [cobro, setCobro] = useState<number | null>(null);
  const buscar = (id: number | null) => (id === null ? null : (turnos.find((t) => t.id === id) ?? null));
  const profesionalDe = (t: Turno | null) => profesionales.find((p) => p.id === t?.profesionalId);

  const turnoDetalle = buscar(detalle);
  const turnoConsulta = buscar(consulta);
  const turnoCobro = buscar(cobro);

  const elementos = (
    <>
      <DetalleTurno
        turno={turnoDetalle}
        profesional={profesionalDe(turnoDetalle)}
        hoy={hoy}
        alCerrar={() => setDetalle(null)}
        alConsulta={(t) => {
          setDetalle(null);
          setConsulta(t.id);
        }}
        alCobrar={(t) => {
          setDetalle(null);
          setCobro(t.id);
        }}
        alReprogramar={
          alReprogramar &&
          ((t) => {
            setDetalle(null);
            alReprogramar(t);
          })
        }
      />
      {turnoConsulta && (
        <DialogoConsulta turno={turnoConsulta} profesional={profesionalDe(turnoConsulta)} alCerrar={() => setConsulta(null)} alCobrar={(t) => setCobro(t.id)} />
      )}
      {turnoCobro && <DialogoCobro turno={turnoCobro} profesional={profesionalDe(turnoCobro)} alCerrar={() => setCobro(null)} />}
    </>
  );

  return {
    abrirDetalle: (t: Turno) => setDetalle(t.id),
    abrirConsulta: (t: Turno) => setConsulta(t.id),
    abrirCobro: (t: Turno) => setCobro(t.id),
    elementos,
  };
}
