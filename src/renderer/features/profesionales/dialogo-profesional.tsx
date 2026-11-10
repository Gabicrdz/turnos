import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { DURACIONES, COLORES_PROFESIONAL, esquemaProfesional, type DatosProfesional } from '@compartido/esquemas';
import { resumenDeHorario, turnosPorSemana, type Franja } from '@compartido/horarios';
import type { ColorProfesional, Profesional } from '@compartido/tipos';
import { Button } from '@/components/ui/button';
import { Campo } from '@/components/ui/campo';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { desenvolver, turnos } from '@/lib/api';
import { CLAVES, useAccion } from '@/features/comun/consultas';
import { COLOR, nombreCompleto } from './colores';
import { EditorHorario } from './editor-horario';

type Formulario = Omit<DatosProfesional, 'id' | 'horarios' | 'duracionTurnoMin' | 'color'> & { color: ColorProfesional; duracionTurnoMin: number; horarios: Franja[] };

const VACIO: Formulario = { titulo: '', nombre: '', apellido: '', especialidad: '', matricula: '', color: 'eucalipto', duracionTurnoMin: 30, horarios: [] };

export function DialogoProfesional({ profesional, alCerrar }: { profesional: Profesional | 'nuevo' | null; alCerrar: () => void }) {
  const [f, setF] = useState<Formulario>(VACIO);
  const [error, setError] = useState('');
  const existente = profesional && profesional !== 'nuevo' ? profesional : null;

  useEffect(() => {
    if (!profesional) return;
    setError('');
    setF(existente ? { ...existente } : VACIO);
  }, [profesional, existente]);

  const guardar = useAccion((d: DatosProfesional) => desenvolver(turnos().profesionales.guardar(d)), [CLAVES.profesionales, CLAVES.bloqueos, CLAVES.libres], existente ? 'Cambios guardados' : 'Profesional agregado');
  const activo = useAccion(
    (a: boolean) => desenvolver(turnos().profesionales.cambiarActivo(existente!.id, a)),
    [CLAVES.profesionales, CLAVES.libres],
    () => (existente?.activo ? 'Profesional dado de baja' : 'Profesional reactivado'),
  );

  const poner = <K extends keyof Formulario>(campo: K, valor: Formulario[K]) => {
    setF((v) => ({ ...v, [campo]: valor }));
    setError('');
  };

  function enviar(e: FormEvent) {
    e.preventDefault();
    const r = esquemaProfesional.safeParse({ ...(existente ? { id: existente.id } : {}), ...f });
    if (!r.success) return setError(r.error.issues[0]?.message ?? 'Revisá los datos.');
    guardar.mutate(r.data, { onSuccess: alCerrar, onError: (e) => toast.error(e.message) });
  }

  const porSemana = turnosPorSemana(f.horarios, f.duracionTurnoMin);

  return (
    <Dialog open={profesional !== null} onOpenChange={(a) => !a && alCerrar()}>
      <DialogContent className="max-w-[860px]">
        <form onSubmit={enviar} noValidate className="flex max-h-[88vh] flex-col">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">{existente ? nombreCompleto(existente) : 'Nuevo profesional'}</DialogTitle>
            <DialogDescription>Los turnos se van a ofrecer solo dentro de este horario.</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex min-h-0 flex-col gap-5 overflow-y-auto">
            <div className="grid grid-cols-[110px_1fr_1fr] gap-4">
              <Campo etiqueta="Título" htmlFor="pr-titulo" ayuda="Dra., Dr., Lic.">
                <Input id="pr-titulo" maxLength={10} value={f.titulo} onChange={(e) => poner('titulo', e.target.value)} />
              </Campo>
              <Campo etiqueta="Nombre" htmlFor="pr-nombre">
                <Input id="pr-nombre" autoFocus maxLength={40} value={f.nombre} onChange={(e) => poner('nombre', e.target.value)} />
              </Campo>
              <Campo etiqueta="Apellido" htmlFor="pr-apellido">
                <Input id="pr-apellido" maxLength={40} value={f.apellido} onChange={(e) => poner('apellido', e.target.value)} />
              </Campo>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Campo etiqueta="Especialidad" htmlFor="pr-especialidad">
                <Input id="pr-especialidad" maxLength={60} placeholder="Ej.: Clínica médica" value={f.especialidad} onChange={(e) => poner('especialidad', e.target.value)} />
              </Campo>
              <Campo etiqueta="Matrícula" htmlFor="pr-matricula">
                <Input id="pr-matricula" maxLength={30} placeholder="Ej.: MP 4521" value={f.matricula} onChange={(e) => poner('matricula', e.target.value)} />
              </Campo>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-6">
              <fieldset>
                <legend className="mb-2 text-sm font-medium">Duración de cada turno</legend>
                <div role="radiogroup" aria-label="Duración de cada turno" className="flex flex-wrap gap-1.5">
                  {DURACIONES.map((d) => (
                    <button
                      key={d}
                      type="button"
                      role="radio"
                      aria-checked={f.duracionTurnoMin === d}
                      onClick={() => poner('duracionTurnoMin', d)}
                      className={cn(
                        'numeros h-10 min-w-[58px] rounded-md border px-3 text-[14px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-acento/40',
                        f.duracionTurnoMin === d ? 'border-acento bg-acento-suave text-acento-fuerte' : 'border-linea-fuerte hover:bg-accent',
                      )}
                    >
                      {d} min
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="mb-2 text-sm font-medium">Color en la agenda</legend>
                <div role="radiogroup" aria-label="Color en la agenda" className="flex gap-1.5">
                  {COLORES_PROFESIONAL.map((c) => (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={f.color === c}
                      aria-label={COLOR[c].nombre}
                      title={COLOR[c].nombre}
                      onClick={() => poner('color', c)}
                      className={cn('grid size-10 place-items-center rounded-md border-2 outline-none focus-visible:ring-2 focus-visible:ring-acento/40', f.color === c ? 'border-tinta' : 'border-transparent')}
                      style={{ background: COLOR[c].suave }}
                    >
                      <span className="size-4 rounded-full" style={{ background: COLOR[c].fuerte }} />
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
            <EditorHorario franjas={f.horarios} duracionMin={f.duracionTurnoMin} alCambiar={(h) => poner('horarios', h)} />
          </DialogBody>
          <div className="border-t border-linea px-6 py-3 text-[14px]">
            <span className="text-tinta-suave">Resumen: </span>
            {resumenDeHorario(f.horarios)}
            {porSemana > 0 && <span className="text-tinta-suave"> · {porSemana} turnos por semana</span>}
          </div>
          {error && (
            <p role="alert" className="px-6 pb-1 text-sm font-semibold text-rojo">
              {error}
            </p>
          )}
          <DialogFooter className="sm:justify-between">
            <div>
              {existente && (
                <Button variant={existente.activo ? 'ghost-destructive' : 'ghost'} disabled={activo.isPending} onClick={() => activo.mutate(!existente.activo, { onSuccess: alCerrar })}>
                  {existente.activo ? 'Dar de baja' : 'Reactivar'}
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={alCerrar}>
                Cancelar
              </Button>
              <Button type="submit" disabled={guardar.isPending}>
                {existente ? 'Guardar cambios' : 'Agregar profesional'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
