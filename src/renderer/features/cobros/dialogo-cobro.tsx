// Cobrar un turno: particular (paga el paciente) u obra social (número de
// orden o autorización, y un copago opcional). Si ya está cobrado, muestra el
// cobro y permite anularlo.
import { useEffect, useState, type FormEvent } from 'react';
import { esquemaCobro, METODOS, NOMBRE_METODO, type DatosCobro } from '@compartido/esquemas';
import { leerPesos, pesos, pesosParaCampo } from '@compartido/dinero';
import type { MetodoPago, Profesional, Turno } from '@compartido/tipos';
import { Button } from '@/components/ui/button';
import { Campo } from '@/components/ui/campo';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useObrasSociales } from '@/features/comun/consultas';
import { Confirmar } from '@/features/comun/confirmar';
import { nombreCompleto } from '@/features/profesionales/colores';
import { useAnularCobro, useRegistrarCobro } from '@/features/agenda/consultas-agenda';

type Tipo = 'particular' | 'obra_social';
type Errores = Partial<Record<'montoCentavos' | 'metodo' | 'obraSocialId' | 'general', string>>;

export function DialogoCobro({ turno, profesional, alCerrar }: { turno: Turno | null; profesional: Profesional | undefined; alCerrar: () => void }) {
  const [tipo, setTipo] = useState<Tipo>('particular');
  const [importe, setImporte] = useState('');
  const [metodo, setMetodo] = useState<MetodoPago | null>(null);
  const [obraSocialId, setObraSocialId] = useState('');
  const [autorizacion, setAutorizacion] = useState('');
  const [errores, setErrores] = useState<Errores>({});
  const [anular, setAnular] = useState(false);
  const obras = useObrasSociales();
  const registrar = useRegistrarCobro();
  const anularCobro = useAnularCobro();
  const abierto = turno?.id ?? null;

  useEffect(() => {
    if (!turno) return;
    const conObraSocial = turno.obraSocialId !== null;
    setTipo(conObraSocial ? 'obra_social' : 'particular');
    setImporte(conObraSocial || !profesional?.precioConsultaCentavos ? '' : pesosParaCampo(profesional.precioConsultaCentavos));
    setMetodo(null);
    setObraSocialId(conObraSocial ? String(turno.obraSocialId) : '');
    setAutorizacion('');
    setErrores({});
    // Solo al abrir otro turno
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  if (!turno) return null;
  const centavos = importe.trim() === '' ? 0 : leerPesos(importe);
  const opciones = (obras.data ?? []).filter((o) => o.activo || String(o.id) === obraSocialId);

  function cambiarTipo(t: Tipo) {
    setTipo(t);
    setErrores({});
    if (t === 'particular' && importe === '' && profesional?.precioConsultaCentavos) setImporte(pesosParaCampo(profesional.precioConsultaCentavos));
    if (t === 'obra_social') setImporte('');
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (centavos === null) return setErrores({ montoCentavos: 'El importe no es válido. Escribilo como 18.000 o 18000,50.' });
    const datos: DatosCobro = {
      turnoId: turno!.id,
      tipo,
      obraSocialId: tipo === 'obra_social' && obraSocialId ? Number(obraSocialId) : null,
      numeroAutorizacion: tipo === 'obra_social' ? autorizacion : '',
      montoCentavos: centavos,
      metodo,
    };
    const r = esquemaCobro.safeParse(datos);
    if (!r.success) {
      const nuevos: Errores = {};
      for (const issue of r.error.issues) nuevos[(issue.path[0] as keyof Errores) ?? 'general'] ??= issue.message;
      return setErrores(nuevos);
    }
    registrar.mutate(r.data, { onSuccess: alCerrar, onError: (err) => setErrores({ general: err.message }) });
  }

  const titulo = `Cobro · ${turno.paciente}`;
  const descripcion = `Turno de las ${turno.desde}${profesional ? ` con ${nombreCompleto(profesional)}` : ''}`;

  // Ya cobrado: se muestra y se puede anular
  if (turno.cobro) {
    const c = turno.cobro;
    return (
      <Dialog open onOpenChange={(a) => !a && alCerrar()}>
        <DialogContent className="max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
            <DialogDescription>{descripcion}</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-2 text-[15px]">
            <p className="font-display text-2xl font-semibold">{c.tipo === 'particular' ? 'Particular' : c.obraSocial}</p>
            {c.tipo === 'obra_social' && <p>Orden / autorización: {c.numeroAutorizacion || '—'}</p>}
            <p>
              Pagó el paciente: <strong className="numeros">{pesos(c.montoCentavos)}</strong>
              {c.metodo && ` · ${NOMBRE_METODO[c.metodo]}`}
            </p>
            {c.creadoEn && (
              <p className="text-[14px] text-tinta-suave">
                Cobró {c.usuario ?? 'alguien'} el {c.creadoEn.slice(8, 10)}/{c.creadoEn.slice(5, 7)} a las {c.creadoEn.slice(11, 16)}.
              </p>
            )}
          </DialogBody>
          <DialogFooter className="sm:justify-between">
            <Button variant="ghost-destructive" disabled={anularCobro.isPending} onClick={() => setAnular(true)}>
              Anular cobro
            </Button>
            <Button variant="secondary" onClick={alCerrar}>
              Cerrar
            </Button>
          </DialogFooter>
          <Confirmar
            confirmacion={
              anular
                ? {
                    titulo: '¿Anular este cobro?',
                    descripcion: 'Queda registrado como anulado y el turno vuelve a "sin cobrar", para cobrarlo de nuevo bien.',
                    boton: 'Anular cobro',
                    volver: 'Volver',
                    alConfirmar: () => {
                      setAnular(false);
                      anularCobro.mutate(c.id);
                    },
                  }
                : null
            }
            alCerrar={() => setAnular(false)}
          />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(a) => !a && alCerrar()}>
      <DialogContent className="max-w-[560px]">
        <form onSubmit={enviar} noValidate className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
            <DialogDescription>{descripcion}</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <div role="radiogroup" aria-label="Cómo se cobra" className="grid grid-cols-2 gap-2">
              {(['particular', 'obra_social'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={tipo === t}
                  onClick={() => cambiarTipo(t)}
                  className={cn(
                    'h-12 rounded-md border text-[15px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-acento/50',
                    tipo === t ? 'border-acento bg-acento-suave text-acento-fuerte' : 'border-linea-fuerte hover:bg-accent',
                  )}
                >
                  {t === 'particular' ? 'Particular' : turno.obraSocial ? `Obra social (${turno.obraSocial})` : 'Obra social'}
                </button>
              ))}
            </div>

            {tipo === 'obra_social' && (
              <div className="grid grid-cols-2 gap-4">
                <Campo etiqueta="Obra social" error={errores.obraSocialId}>
                  <Select value={obraSocialId} onValueChange={(v) => setObraSocialId(v)}>
                    <SelectTrigger aria-label="Obra social">
                      <SelectValue placeholder="Elegí" />
                    </SelectTrigger>
                    <SelectContent>
                      {opciones.map((o) => (
                        <SelectItem key={o.id} value={String(o.id)}>
                          {o.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Campo>
                <Campo etiqueta="N.º de orden o autorización" htmlFor="co-aut" ayuda="Opcional">
                  <Input id="co-aut" maxLength={40} value={autorizacion} onChange={(e) => setAutorizacion(e.target.value)} />
                </Campo>
              </div>
            )}

            <Campo
              etiqueta={tipo === 'particular' ? 'Importe de la consulta' : 'Copago o plus (opcional)'}
              htmlFor="co-importe"
              error={errores.montoCentavos}
              ayuda={tipo === 'particular' && !profesional?.precioConsultaCentavos ? 'Podés cargar el precio de la consulta en la ficha del profesional.' : undefined}
            >
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-tinta-suave">$</span>
                <Input
                  id="co-importe"
                  inputMode="decimal"
                  className="numeros pl-7 text-lg font-semibold"
                  placeholder={tipo === 'particular' ? '' : '0'}
                  value={importe}
                  onChange={(e) => {
                    setImporte(e.target.value);
                    setErrores({});
                  }}
                />
              </div>
            </Campo>

            {(tipo === 'particular' || (centavos ?? 0) > 0) && (
              <fieldset>
                <legend className="mb-2 text-sm font-medium">Cómo paga</legend>
                <div role="radiogroup" aria-label="Cómo paga" className="grid grid-cols-4 gap-2">
                  {METODOS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={metodo === m}
                      onClick={() => {
                        setMetodo(m);
                        setErrores({});
                      }}
                      className={cn(
                        'h-11 rounded-md border text-[14px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-acento/50',
                        metodo === m ? 'border-acento bg-acento text-white' : 'border-linea-fuerte hover:bg-accent',
                      )}
                    >
                      {NOMBRE_METODO[m]}
                    </button>
                  ))}
                </div>
                {errores.metodo && (
                  <p role="alert" className="mt-2 text-[13px] font-medium text-rojo">
                    {errores.metodo}
                  </p>
                )}
              </fieldset>
            )}
          </DialogBody>
          <DialogFooter className="sm:justify-between">
            <p role="alert" className="text-[14px] font-medium text-rojo">
              {errores.general}
            </p>
            <div className="flex items-center gap-3">
              <span className="numeros text-[15px] text-tinta-suave">
                Paga: <strong className="text-tinta">{pesos(centavos ?? 0)}</strong>
              </span>
              <Button type="submit" disabled={registrar.isPending}>
                Registrar cobro
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
