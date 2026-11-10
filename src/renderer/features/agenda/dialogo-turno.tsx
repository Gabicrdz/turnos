// Dar un turno nuevo o reprogramar uno. A la izquierda: paciente, profesional,
// día y motivo. A la derecha: los horarios libres de ese día (los calcula el
// main con las mismas reglas con las que después controla).
import { useEffect, useState, type FormEvent } from 'react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { duracion, sumarMinutos } from '@compartido/agenda';
import { NOMBRE_DIA } from '@compartido/esquemas';
import { diaDeLaSemana } from '@compartido/horarios';
import type { Profesional, Turno } from '@compartido/tipos';
import { Button } from '@/components/ui/button';
import { Campo } from '@/components/ui/campo';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fechaLarga } from '@/lib/fechas';
import { cn } from '@/lib/utils';
import { useBloqueos } from '@/features/comun/consultas';
import { COLOR, nombreCompleto } from '@/features/profesionales/colores';
import { BuscadorPaciente, type PacienteElegido } from './buscador-paciente';
import { useDarTurno, useLibres, useMoverTurno, useProximosLibres, useTurnosDePaciente } from './consultas-agenda';

export type ModoTurno =
  | { tipo: 'nuevo'; profesionalId?: number; fecha?: string; desde?: string; paciente?: PacienteElegido }
  | { tipo: 'mover'; turno: Turno };

const MOTIVOS = ['Control', 'Primera vez', 'Resultados de estudios', 'Certificado'];

/** '2026-11-24' → 'mar 24/11' */
const diaCorto = (fecha: string) => format(parseISO(fecha), 'EEE dd/MM', { locale: es });

interface Props {
  modo: ModoTurno | null;
  profesionales: Profesional[];
  hoy: string;
  alCerrar: () => void;
  /** Después de guardar: para que la agenda vaya a ese día. */
  alListo: (fecha: string) => void;
}

export function DialogoTurno({ modo, profesionales, hoy, alCerrar, alListo }: Props) {
  const [paciente, setPaciente] = useState<PacienteElegido | null>(null);
  const [profesionalId, setProfesionalId] = useState<number | null>(null);
  const [fecha, setFecha] = useState(hoy);
  const [desde, setDesde] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const mover = modo?.tipo === 'mover' ? modo.turno : null;

  useEffect(() => {
    if (!modo) return;
    setError('');
    if (modo.tipo === 'mover') {
      setPaciente({ id: modo.turno.pacienteId, nombre: modo.turno.paciente });
      setProfesionalId(modo.turno.profesionalId);
      setFecha(modo.turno.fecha);
      setDesde(null);
      setMotivo(modo.turno.motivo);
    } else {
      setPaciente(modo.paciente ?? null);
      setProfesionalId(modo.profesionalId ?? profesionales.find((p) => p.activo)?.id ?? null);
      setFecha(modo.fecha ?? hoy);
      setDesde(modo.desde ?? null);
      setMotivo('');
    }
    // Solo al abrir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo]);

  // Si se abrió antes de que llegara la lista de profesionales, se elige el primero cuando llega
  useEffect(() => {
    // (solo si no vino uno elegido: si no, este efecto pisaría al de arriba, que corre en el mismo momento)
    if (modo?.tipo === 'nuevo' && modo.profesionalId === undefined && profesionalId === null) {
      setProfesionalId(profesionales.find((p) => p.activo)?.id ?? null);
    }
  }, [modo, profesionales, profesionalId]);

  const profesional = profesionales.find((p) => p.id === profesionalId);
  const libres = useLibres(profesionalId, fecha);
  const sinLibres = libres.isSuccess && libres.data.length === 0;
  const proximos = useProximosLibres(profesionalId, Boolean(modo) && sinLibres);
  const bloqueos = useBloqueos();
  const delPaciente = useTurnosDePaciente(modo && paciente ? paciente.id : null);
  const dar = useDarTurno();
  const reprogramar = useMoverTurno();
  const guardando = dar.isPending || reprogramar.isPending;

  // Si el horario elegido ya no está libre (cambió el día o el profesional), se borra
  useEffect(() => {
    if (libres.data && desde && !libres.data.includes(desde)) setDesde(null);
  }, [libres.data, desde]);

  // Por qué no hay horarios ese día
  function motivoSinLibres(): string {
    if (!profesional) return '';
    if (fecha < hoy) return 'Ese día ya pasó.';
    const bloqueo = bloqueos.data?.find((b) => b.desde <= fecha && fecha <= b.hasta && (b.profesionalId === null || b.profesionalId === profesional.id));
    if (bloqueo) return `No atiende ese día${bloqueo.motivo ? ` (${bloqueo.motivo})` : ''}.`;
    const dia = diaDeLaSemana(fecha);
    if (!profesional.horarios.some((h) => h.diaSemana === dia)) return `No atiende los ${NOMBRE_DIA[dia]}${dia >= 6 ? 's' : ''}.`;
    return 'No quedan horarios libres ese día.';
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (!paciente) return setError('Elegí el paciente.');
    if (!profesionalId) return setError('Elegí el profesional.');
    if (!desde) return setError('Elegí un horario libre.');
    const listo = () => {
      alListo(fecha);
      alCerrar();
    };
    const fallo = (err: Error) => setError(err.message);
    if (mover) {
      reprogramar.mutate({ id: mover.id, profesionalId, fecha, desde }, { onSuccess: listo, onError: fallo });
    } else {
      dar.mutate(
        { pacienteId: paciente.id, profesionalId, fecha, desde, motivo },
        {
          onSuccess: () => {
            toast.success(`Turno dado: ${paciente.nombre}`, {
              description: `${diaCorto(fecha)} a las ${desde} con ${profesional ? nombreCompleto(profesional) : ''}`,
            });
            listo();
          },
          onError: fallo,
        },
      );
    }
  }

  const otrosTurnos = (delPaciente.data?.proximos ?? []).filter((t) => t.id !== mover?.id);
  const opciones = profesionales.filter((p) => p.activo || p.id === profesionalId);

  return (
    <Dialog open={modo !== null} onOpenChange={(a) => !a && alCerrar()}>
      <DialogContent className="max-w-[860px]">
        <form onSubmit={enviar} noValidate className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle>{mover ? 'Reprogramar turno' : 'Nuevo turno'}</DialogTitle>
            <DialogDescription>
              {mover ? (
                <>
                  Ahora: <span className="first-letter:uppercase">{diaCorto(mover.fecha)}</span> a las {mover.desde}. Elegí el nuevo día y horario.
                </>
              ) : (
                'Elegí el paciente, el profesional y un horario libre.'
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="grid grid-cols-[1fr_1.1fr] gap-x-8 gap-y-4">
            <div className="flex flex-col gap-4">
              <Campo etiqueta="Paciente">
                <BuscadorPaciente
                  valor={paciente}
                  bloqueado={Boolean(mover)}
                  alElegir={(p) => {
                    setPaciente(p);
                    setError('');
                  }}
                />
                {otrosTurnos.length > 0 && (
                  <p className="rounded-md bg-ambar-suave px-3 py-2 text-[13px] text-ambar">
                    Ya tiene {otrosTurnos.length === 1 ? 'un turno' : `${otrosTurnos.length} turnos`}:{' '}
                    {otrosTurnos
                      .slice(0, 2)
                      .map((t) => `${diaCorto(t.fecha)} ${t.desde} con ${t.profesional}`)
                      .join('; ')}
                    {otrosTurnos.length > 2 && '…'}
                  </p>
                )}
              </Campo>
              <Campo etiqueta="Profesional">
                <Select value={profesionalId ? String(profesionalId) : ''} onValueChange={(v) => setProfesionalId(Number(v))}>
                  <SelectTrigger aria-label="Profesional">
                    <SelectValue placeholder="Elegí el profesional" />
                  </SelectTrigger>
                  <SelectContent>
                    {opciones.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        <span className="size-2.5 rounded-full" style={{ backgroundColor: COLOR[p.color].fuerte }} aria-hidden="true" />
                        {nombreCompleto(p)}
                        {p.especialidad && <span className="text-tinta-suave">&nbsp;· {p.especialidad}</span>}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Campo>
              <Campo etiqueta="Día" htmlFor="t-fecha" ayuda={/^\d{4}-\d{2}-\d{2}$/.test(fecha) ? <span className="first-letter:uppercase inline-block">{fechaLarga(fecha)}</span> : undefined}>
                <Input id="t-fecha" type="date" min={hoy} value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </Campo>
              {!mover && (
                <Campo etiqueta="Motivo (opcional)" htmlFor="t-motivo">
                  <Input id="t-motivo" maxLength={80} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                  <div className="flex flex-wrap gap-1.5">
                    {MOTIVOS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMotivo(m)}
                        className={cn(
                          'rounded-full border px-2.5 py-1 text-[13px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-acento/50',
                          motivo === m ? 'border-acento bg-acento-suave text-acento-fuerte' : 'border-linea-fuerte text-tinta-suave hover:bg-accent',
                        )}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </Campo>
              )}
            </div>

            <section aria-labelledby="t-horarios" className="flex min-h-[320px] flex-col gap-3 rounded-lg bg-background p-4">
              <div className="flex items-baseline justify-between gap-3">
                <h3 id="t-horarios" className="font-display text-lg font-semibold">
                  Horarios libres
                </h3>
                {profesional && <span className="text-[13px] text-tinta-suave">Turnos de {profesional.duracionTurnoMin} min</span>}
              </div>
              {!profesional ? (
                <p className="text-tinta-suave">Elegí un profesional.</p>
              ) : libres.isPending ? (
                <p className="text-tinta-suave">Buscando…</p>
              ) : sinLibres ? (
                <div className="flex flex-col gap-3">
                  <p className="font-medium text-ambar">{motivoSinLibres()}</p>
                  {proximos.data && proximos.data.length > 0 && (
                    <>
                      <p className="text-[14px] text-tinta-suave">Los próximos libres de {nombreCompleto(profesional)}:</p>
                      <div className="flex flex-wrap gap-2">
                        {proximos.data.map((l) => (
                          <button
                            key={`${l.fecha}-${l.desde}`}
                            type="button"
                            onClick={() => {
                              setFecha(l.fecha);
                              setDesde(l.desde);
                            }}
                            className="numeros rounded-md border border-linea-fuerte bg-superficie px-3 py-2 text-[14px] font-semibold outline-none hover:border-acento hover:text-acento-fuerte focus-visible:ring-2 focus-visible:ring-acento/50"
                          >
                            <span className="first-letter:uppercase inline-block">{diaCorto(l.fecha)}</span> · {l.desde}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  {proximos.data?.length === 0 && <p className="text-[14px] text-tinta-suave">No tiene horarios libres en los próximos 90 días.</p>}
                </div>
              ) : (
                <div role="radiogroup" aria-label="Horarios libres" className="grid grid-cols-[repeat(auto-fill,minmax(76px,1fr))] gap-2">
                  {libres.data?.map((h) => (
                    <button
                      key={h}
                      type="button"
                      role="radio"
                      aria-checked={desde === h}
                      onClick={() => {
                        setDesde(h);
                        setError('');
                      }}
                      className={cn(
                        'numeros h-10 rounded-md border text-[15px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-acento/50',
                        desde === h ? 'border-acento bg-acento text-white' : 'border-linea-fuerte bg-superficie hover:border-acento hover:text-acento-fuerte',
                      )}
                    >
                      {h}
                    </button>
                  ))}
                </div>
              )}
              {profesional && desde && (
                <p className="mt-auto border-t border-linea pt-3 text-[15px]">
                  <span className="first-letter:uppercase inline-block">{diaCorto(fecha)}</span>,{' '}
                  <strong className="numeros">
                    {desde} a {sumarMinutos(desde, mover && mover.profesionalId === profesional.id ? duracion(mover) : profesional.duracionTurnoMin)}
                  </strong>{' '}
                  con {nombreCompleto(profesional)}
                </p>
              )}
            </section>
          </DialogBody>
          <DialogFooter className="sm:justify-between">
            <p role="alert" className="text-[14px] font-medium text-rojo">
              {error}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={alCerrar}>
                Cancelar
              </Button>
              <Button type="submit" disabled={guardando}>
                {mover ? 'Reprogramar' : 'Dar turno'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
