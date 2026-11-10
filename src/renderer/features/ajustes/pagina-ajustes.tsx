// Ajustes: datos del consultorio y lista de obras sociales.
import { useEffect, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Pencil, Plus } from 'lucide-react';
import { esquemaConsultorio, esquemaObraSocial, type DatosConsultorio, type DatosObraSocial } from '@compartido/esquemas';
import type { ObraSocial } from '@compartido/tipos';
import { Button } from '@/components/ui/button';
import { Campo } from '@/components/ui/campo';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { desenvolver, turnos } from '@/lib/api';
import { CLAVES, useAccion, useObrasSociales } from '@/features/comun/consultas';
import { Encabezado } from '@/features/comun/encabezado';
import { useConsultorio } from '@/components/layout/barra-lateral';

export function PaginaAjustes() {
  const info = useQuery({ queryKey: ['sistema'], queryFn: () => desenvolver(turnos().sistema.info()) });
  return (
    <div className="mx-auto flex max-w-[980px] flex-col gap-8 px-10 pt-9 pb-12">
      <Encabezado titulo="Ajustes" detalle="Datos del consultorio y obras sociales con las que se trabaja." />
      <TarjetaConsultorio />
      <TarjetaObrasSociales />
      {info.data && (
        <p className="text-center text-[13px] text-tinta-suave">
          Turnos versión {info.data.version} · Base de datos: <span className="break-all">{info.data.baseDeDatos}</span>
        </p>
      )}
    </div>
  );
}

function TarjetaConsultorio() {
  const consultorio = useConsultorio();
  const [f, setF] = useState<DatosConsultorio>({ nombreConsultorio: '', direccion: '', telefono: '' });
  const [error, setError] = useState('');
  const guardar = useAccion((d: DatosConsultorio) => desenvolver(turnos().consultorio.guardar(d)), [CLAVES.consultorio], 'Datos del consultorio guardados');
  useEffect(() => {
    if (consultorio.data) setF(consultorio.data);
  }, [consultorio.data]);
  const c = consultorio.data;
  const cambio = !!c && (f.nombreConsultorio !== c.nombreConsultorio || f.direccion !== c.direccion || f.telefono !== c.telefono);

  function enviar(e: FormEvent) {
    e.preventDefault();
    const r = esquemaConsultorio.safeParse(f);
    if (!r.success) return setError(r.error.issues[0]?.message ?? 'Revisá los datos.');
    setError('');
    guardar.mutate(r.data, { onError: (e) => setError(e.message) });
  }

  return (
    <section className="rounded-lg border border-linea bg-superficie p-6">
      <h2 className="font-display text-xl font-semibold">Consultorio</h2>
      <p className="text-[14px] text-tinta-suave">El nombre aparece arriba a la izquierda (y, más adelante, en los recordatorios por WhatsApp).</p>
      <form onSubmit={enviar} noValidate className="mt-4 grid grid-cols-2 gap-4">
        <Campo etiqueta="Nombre del consultorio" htmlFor="c-nombre" className="col-span-2">
          <Input id="c-nombre" maxLength={50} value={f.nombreConsultorio} onChange={(e) => setF({ ...f, nombreConsultorio: e.target.value })} />
        </Campo>
        <Campo etiqueta="Dirección (opcional)" htmlFor="c-direccion">
          <Input id="c-direccion" maxLength={80} value={f.direccion} onChange={(e) => setF({ ...f, direccion: e.target.value })} />
        </Campo>
        <Campo etiqueta="Teléfono (opcional)" htmlFor="c-telefono">
          <Input id="c-telefono" inputMode="tel" maxLength={40} value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} />
        </Campo>
        <div className="col-span-2 flex items-center gap-3">
          <Button type="submit" disabled={!cambio || guardar.isPending}>
            Guardar cambios
          </Button>
          {error && (
            <p role="alert" className="text-sm font-semibold text-rojo">
              {error}
            </p>
          )}
        </div>
      </form>
    </section>
  );
}

function TarjetaObrasSociales() {
  const obras = useObrasSociales();
  const [nueva, setNueva] = useState('');
  const [editando, setEditando] = useState<{ id: number; nombre: string } | null>(null);
  const [error, setError] = useState('');
  const guardar = useAccion((d: DatosObraSocial) => desenvolver(turnos().obrasSociales.guardar(d)), [CLAVES.obras, CLAVES.pacientes], 'Obra social guardada');
  const activo = useAccion(
    ({ id, a }: { id: number; a: boolean }) => desenvolver(turnos().obrasSociales.cambiarActivo(id, a)),
    [CLAVES.obras],
    () => 'Listo',
  );

  function agregar(e: FormEvent) {
    e.preventDefault();
    const r = esquemaObraSocial.safeParse({ nombre: nueva });
    if (!r.success) return setError(r.error.issues[0]?.message ?? 'Revisá el nombre.');
    guardar.mutate(r.data, { onSuccess: () => setNueva(''), onError: (e) => setError(e.message) });
  }

  function renombrar(e: FormEvent) {
    e.preventDefault();
    if (!editando) return;
    const r = esquemaObraSocial.safeParse(editando);
    if (!r.success) return toast.error(r.error.issues[0]?.message ?? 'Revisá el nombre.');
    guardar.mutate(r.data, { onSuccess: () => setEditando(null), onError: (e) => toast.error(e.message) });
  }

  return (
    <section className="rounded-lg border border-linea bg-superficie p-6">
      <h2 className="font-display text-xl font-semibold">Obras sociales</h2>
      <p className="text-[14px] text-tinta-suave">Las que se eligen en la ficha de cada paciente. Dar de baja no borra nada: los pacientes la conservan.</p>
      <form onSubmit={agregar} noValidate className="mt-4 flex items-start gap-2">
        <div className="flex-1">
          <Input aria-label="Nueva obra social" placeholder="Ej.: IASEP" maxLength={60} value={nueva} onChange={(e) => { setNueva(e.target.value); setError(''); }} />
          {error && (
            <p role="alert" className="mt-1 text-sm font-semibold text-rojo">
              {error}
            </p>
          )}
        </div>
        <Button type="submit" variant="outline" disabled={guardar.isPending}>
          <Plus /> Agregar
        </Button>
      </form>
      <ul className="mt-4 divide-y divide-linea border-y border-linea">
        {obras.data?.map((o: ObraSocial) => (
          <li key={o.id} className={cn('flex min-h-14 items-center gap-3 py-2', !o.activo && 'text-tinta-suave')}>
            {editando?.id === o.id ? (
              <form onSubmit={renombrar} className="flex flex-1 items-center gap-2">
                <Input autoFocus aria-label={`Nuevo nombre de ${o.nombre}`} maxLength={60} value={editando.nombre} onChange={(e) => setEditando({ id: o.id, nombre: e.target.value })} />
                <Button type="submit" size="sm">Guardar</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditando(null)}>Cancelar</Button>
              </form>
            ) : (
              <>
                <span className="flex-1 font-medium">
                  {o.nombre}
                  {!o.activo && <Badge className="ml-2" variant="contorno">De baja</Badge>}
                </span>
                <span className="numeros w-28 text-right text-[13px] text-tinta-suave">{o.pacientes === 1 ? '1 paciente' : `${o.pacientes} pacientes`}</span>
                <Button variant="ghost" size="icon-sm" aria-label={`Cambiar el nombre de ${o.nombre}`} onClick={() => setEditando({ id: o.id, nombre: o.nombre })}>
                  <Pencil />
                </Button>
                <Button variant="ghost" size="sm" className="w-28" onClick={() => activo.mutate({ id: o.id, a: !o.activo })}>
                  {o.activo ? 'Dar de baja' : 'Reactivar'}
                </Button>
              </>
            )}
          </li>
        ))}
        {obras.data?.length === 0 && <li className="py-4 text-tinta-suave">Todavía no hay obras sociales cargadas.</li>}
      </ul>
    </section>
  );
}
