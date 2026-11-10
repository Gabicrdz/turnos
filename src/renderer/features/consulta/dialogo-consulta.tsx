// La consulta: a la izquierda, el paciente y sus consultas anteriores; a la
// derecha, las notas de hoy. Guardar deja el turno como "atendido".
import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Lock } from 'lucide-react';
import { esquemaConsulta } from '@compartido/esquemas';
import type { Profesional, Turno } from '@compartido/tipos';
import { Button } from '@/components/ui/button';
import { Campo } from '@/components/ui/campo';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { edad } from '@/lib/fechas';
import { dniConPuntos } from '@/features/comun/encabezado';
import { nombreCompleto } from '@/features/profesionales/colores';
import { useGuardarConsulta, useHistoria } from '@/features/agenda/consultas-agenda';
import { ListaHistoria } from './historia';

interface Props {
  turno: Turno | null;
  profesional: Profesional | undefined;
  alCerrar: () => void;
  /** Después de guardar, si el turno no está cobrado: ofrece cobrar. */
  alCobrar?: (turno: Turno) => void;
}

const VACIO = { motivo: '', evolucion: '', diagnostico: '', indicaciones: '' };

export function DialogoConsulta({ turno, profesional, alCerrar, alCobrar }: Props) {
  const historia = useHistoria(turno?.pacienteId ?? null);
  const guardar = useGuardarConsulta();
  const [f, setF] = useState(VACIO);
  const [error, setError] = useState('');
  const existente = historia.data?.find((c) => c.turnoId === turno?.id);
  const anteriores = (historia.data ?? []).filter((c) => c.turnoId !== turno?.id);
  const soloLectura = Boolean(existente && !existente.editable);

  // Al abrir (y cuando llega la historia): las notas ya cargadas o el motivo del turno
  useEffect(() => {
    if (!turno || !historia.data) return;
    setError('');
    setF(existente ? { motivo: existente.motivo, evolucion: existente.evolucion, diagnostico: existente.diagnostico, indicaciones: existente.indicaciones } : { ...VACIO, motivo: turno.motivo });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turno?.id, historia.isSuccess]);

  if (!turno) return null;
  const anios = edad(turno.fechaNacimiento);
  const poner = (campo: keyof typeof VACIO) => (valor: string) => {
    setF((v) => ({ ...v, [campo]: valor }));
    setError('');
  };

  function enviar(e: FormEvent) {
    e.preventDefault();
    const r = esquemaConsulta.safeParse({ turnoId: turno!.id, ...f });
    if (!r.success) return setError(r.error.issues[0]?.message ?? 'Revisá los datos.');
    const t = turno!;
    guardar.mutate(r.data, {
      onSuccess: () => {
        alCerrar();
        if (!t.cobro && alCobrar) {
          toast.success(`Consulta guardada: ${t.paciente}`, {
            description: 'El turno quedó atendido. Falta cobrarlo.',
            action: { label: 'Cobrar', onClick: () => alCobrar(t) },
          });
        } else toast.success(`Consulta guardada: ${t.paciente}`);
      },
      onError: (err) => setError(err.message),
    });
  }

  return (
    <Dialog open onOpenChange={(a) => !a && alCerrar()}>
      <DialogContent className="max-w-[1040px]">
        <form onSubmit={enviar} noValidate className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle>{turno.paciente}</DialogTitle>
            <DialogDescription>
              {[
                anios !== null ? `${anios} años` : null,
                `DNI ${dniConPuntos(turno.dni)}`,
                turno.obraSocial ?? 'Particular',
                `turno ${turno.desde}${profesional ? ` con ${nombreCompleto(profesional)}` : ''}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="grid min-h-[420px] grid-cols-[1fr_1.25fr] gap-8">
            <section aria-labelledby="t-anteriores" className="flex min-h-0 flex-col gap-3 overflow-y-auto rounded-lg bg-background p-4">
              {turno.notasPaciente && <p className="rounded-md bg-ambar-suave px-3 py-2 text-[14px] text-ambar">Nota de recepción: {turno.notasPaciente}</p>}
              <h3 id="t-anteriores" className="font-display text-lg font-semibold">
                Consultas anteriores
              </h3>
              {historia.data ? <ListaHistoria consultas={anteriores} vacio="Es su primera consulta." /> : <p className="text-tinta-suave">Cargando…</p>}
            </section>

            <div className="flex flex-col gap-4">
              {soloLectura && (
                <p className="flex items-center gap-2 rounded-md bg-secondary px-3 py-2 text-[14px] text-tinta-suave">
                  <Lock className="size-4" aria-hidden="true" />
                  Esta consulta ya está cerrada: las notas de días anteriores no se modifican.
                </p>
              )}
              <Campo etiqueta="Motivo de consulta" htmlFor="cn-motivo">
                <Input id="cn-motivo" maxLength={120} readOnly={soloLectura} value={f.motivo} onChange={(e) => poner('motivo')(e.target.value)} />
              </Campo>
              <Campo etiqueta="Evolución" htmlFor="cn-evolucion" ayuda="Qué refiere el paciente, qué se encontró y qué se hizo.">
                <Textarea id="cn-evolucion" rows={7} autoFocus={!soloLectura} maxLength={4000} readOnly={soloLectura} value={f.evolucion} onChange={(e) => poner('evolucion')(e.target.value)} />
              </Campo>
              <Campo etiqueta="Diagnóstico" htmlFor="cn-diagnostico">
                <Input id="cn-diagnostico" maxLength={200} readOnly={soloLectura} value={f.diagnostico} onChange={(e) => poner('diagnostico')(e.target.value)} />
              </Campo>
              <Campo etiqueta="Indicaciones" htmlFor="cn-indicaciones">
                <Textarea id="cn-indicaciones" rows={3} maxLength={2000} readOnly={soloLectura} value={f.indicaciones} onChange={(e) => poner('indicaciones')(e.target.value)} />
              </Campo>
            </div>
          </DialogBody>
          <DialogFooter className="sm:justify-between">
            <p role="alert" className="text-[14px] font-medium text-rojo">
              {error}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={alCerrar}>
                {soloLectura ? 'Cerrar' : 'Cancelar'}
              </Button>
              {!soloLectura && (
                <Button type="submit" disabled={guardar.isPending || !historia.data}>
                  {turno.estado === 'atendido' ? 'Guardar cambios' : 'Guardar y terminar consulta'}
                </Button>
              )}
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
