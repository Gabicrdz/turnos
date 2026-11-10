import { useEffect, useState, type FormEvent } from 'react';
import { esquemaBloqueo, type DatosBloqueo } from '@compartido/esquemas';
import type { Profesional } from '@compartido/tipos';
import { Button } from '@/components/ui/button';
import { Campo } from '@/components/ui/campo';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { desenvolver, turnos } from '@/lib/api';
import { fechaISO } from '@/lib/fechas';
import { CLAVES, useAccion } from '@/features/comun/consultas';
import { nombreCompleto } from './colores';

export function DialogoBloqueo({ abierto, profesionales, alCerrar }: { abierto: boolean; profesionales: Profesional[]; alCerrar: () => void }) {
  const [quien, setQuien] = useState('todos');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const crear = useAccion((d: DatosBloqueo) => desenvolver(turnos().bloqueos.crear(d)), [CLAVES.bloqueos], 'Día sin atención agregado');

  useEffect(() => {
    if (!abierto) return;
    const hoy = fechaISO();
    setQuien('todos');
    setDesde(hoy);
    setHasta(hoy);
    setMotivo('');
    setError('');
  }, [abierto]);

  function enviar(e: FormEvent) {
    e.preventDefault();
    const r = esquemaBloqueo.safeParse({ profesionalId: quien === 'todos' ? null : Number(quien), desde, hasta, motivo });
    if (!r.success) return setError(r.error.issues[0]?.message ?? 'Revisá los datos.');
    crear.mutate(r.data, { onSuccess: alCerrar, onError: (e) => setError(e.message) });
  }

  return (
    <Dialog open={abierto} onOpenChange={(a) => !a && alCerrar()}>
      <DialogContent className="max-w-[520px]">
        <form onSubmit={enviar} noValidate>
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Día sin atención</DialogTitle>
            <DialogDescription>Para un solo día, poné la misma fecha en "desde" y "hasta".</DialogDescription>
          </DialogHeader>
          <DialogBody className="grid grid-cols-2 gap-4">
            <Campo etiqueta="¿Quién no atiende?" className="col-span-2">
              <Select value={quien} onValueChange={setQuien}>
                <SelectTrigger aria-label="Quién no atiende">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todo el consultorio (feriado)</SelectItem>
                  {profesionales.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {nombreCompleto(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Campo>
            <Campo etiqueta="Desde" htmlFor="b-desde">
              <Input id="b-desde" type="date" value={desde} onChange={(e) => { setDesde(e.target.value); if (!hasta || e.target.value > hasta) setHasta(e.target.value); setError(''); }} />
            </Campo>
            <Campo etiqueta="Hasta" htmlFor="b-hasta">
              <Input id="b-hasta" type="date" min={desde} value={hasta} onChange={(e) => { setHasta(e.target.value); setError(''); }} />
            </Campo>
            <Campo etiqueta="Motivo (opcional)" htmlFor="b-motivo" className="col-span-2">
              <Input id="b-motivo" maxLength={80} placeholder="Ej.: Feriado, vacaciones, congreso" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </Campo>
            {error && (
              <p role="alert" className="col-span-2 text-sm font-semibold text-rojo">
                {error}
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={alCerrar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={crear.isPending}>
              Agregar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
