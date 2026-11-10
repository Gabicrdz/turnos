// Al tocar un turno: los datos del paciente y los botones para cambiar el
// estado (solo los que permite la máquina de estados para ese día).
import { useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { estadosPosibles, sePuedeReprogramar, type EstadoTurno } from '@compartido/agenda';
import type { Profesional, Turno } from '@compartido/tipos';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { fechaLarga } from '@/lib/fechas';
import { Confirmar } from '@/features/comun/confirmar';
import { dniConPuntos } from '@/features/comun/encabezado';
import { COLOR, nombreCompleto } from '@/features/profesionales/colores';
import { useCambiarEstado } from './consultas-agenda';
import { ChipEstado, esAvance, etiquetaAccion } from './estado';

interface Props {
  turno: Turno | null;
  profesional: Profesional | undefined;
  hoy: string;
  alCerrar: () => void;
  alReprogramar: (turno: Turno) => void;
}

export function DetalleTurno({ turno, profesional, hoy, alCerrar, alReprogramar }: Props) {
  const estado = useCambiarEstado();
  const [cancelar, setCancelar] = useState(false);
  if (!turno) return null;

  const posibles = estadosPosibles(turno.estado, turno.fecha, hoy);
  // Un solo botón principal: el paso más probable (que llegó, que lo atendieron, confirmar…)
  const principal = posibles.find((e) => e === 'en_sala' && turno.estado !== 'atendido') ?? posibles.find((e) => esAvance(turno.estado, e));
  const botones = [principal, ...posibles.filter((e) => e !== principal && e !== 'cancelado')].filter((e): e is EstadoTurno => Boolean(e));
  const cambiar = (e: EstadoTurno) => estado.cambiar(turno.id, e, { onSuccess: alCerrar });
  const color = profesional ? COLOR[profesional.color] : null;

  return (
    <Dialog open onOpenChange={(a) => !a && alCerrar()}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>{turno.paciente}</DialogTitle>
            <ChipEstado estado={turno.estado} />
          </div>
          <DialogDescription className="first-letter:uppercase">
            {fechaLarga(turno.fecha)} · <span className="numeros">{turno.desde} a {turno.hasta}</span>
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-5">
          {profesional && color && (
            <p className="flex items-center gap-2 text-[15px] font-medium">
              <span className="size-3 rounded-full" style={{ backgroundColor: color.fuerte }} aria-hidden="true" />
              {nombreCompleto(profesional)}
              {profesional.especialidad && <span className="font-normal text-tinta-suave">· {profesional.especialidad}</span>}
            </p>
          )}
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[15px]">
            <Dato nombre="DNI">{dniConPuntos(turno.dni)}</Dato>
            <Dato nombre="Teléfono">{turno.telefono || '—'}</Dato>
            <Dato nombre="Cobertura">
              {turno.obraSocial ?? 'Particular'}
              {turno.obraSocial && turno.numeroAfiliado && <span className="block text-[13px] text-tinta-suave">N.º {turno.numeroAfiliado}</span>}
            </Dato>
            <Dato nombre="Motivo">{turno.motivo || '—'}</Dato>
            {turno.llegoEn && (
              <Dato nombre="Llegó a las">
                <span className="numeros">{turno.llegoEn.slice(11, 16)}</span>
              </Dato>
            )}
          </dl>
          {!turno.pacienteActivo && <p className="rounded-md bg-ambar-suave px-3 py-2 text-[14px] text-ambar">Este paciente está dado de baja.</p>}

          {botones.length > 0 && (
            <div className="flex flex-col gap-2 border-t border-linea pt-4">
              <p className="text-[13px] font-semibold tracking-wide text-tinta-suave uppercase">Cambiar estado</p>
              <div className="flex flex-wrap gap-2">
                {botones.map((e) => (
                  <Button key={e} variant={e === principal ? 'default' : 'outline'} disabled={estado.isPending} onClick={() => cambiar(e)}>
                    {etiquetaAccion(turno.estado, e)}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </DialogBody>
        <DialogFooter className="sm:justify-between">
          <div>
            {posibles.includes('cancelado') && (
              <Button variant="ghost-destructive" disabled={estado.isPending} onClick={() => setCancelar(true)}>
                Cancelar turno
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {sePuedeReprogramar(turno.estado) && turno.fecha >= hoy && (
              <Button variant="outline" onClick={() => alReprogramar(turno)}>
                <CalendarClock aria-hidden="true" />
                Reprogramar
              </Button>
            )}
            <Button variant="secondary" onClick={alCerrar}>
              Cerrar
            </Button>
          </div>
        </DialogFooter>
        <Confirmar
          confirmacion={
            cancelar
              ? {
                  titulo: '¿Cancelar este turno?',
                  descripcion: `El horario de las ${turno.desde} queda libre para otro paciente. Si fue un error, lo podés volver a reservar.`,
                  boton: 'Cancelar turno',
                  volver: 'Volver',
                  alConfirmar: () => {
                    setCancelar(false);
                    cambiar('cancelado');
                  },
                }
              : null
          }
          alCerrar={() => setCancelar(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function Dato({ nombre, children }: { nombre: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[13px] text-tinta-suave">{nombre}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}
