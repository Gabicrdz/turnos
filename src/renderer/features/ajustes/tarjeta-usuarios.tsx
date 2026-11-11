// Usuarios (solo administración): quién entra al sistema, con qué rol y,
// si es profesional, a qué ficha está vinculado (eso le da la historia clínica).
import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Pencil, Plus } from 'lucide-react';
import { esquemaUsuario, ROLES } from '@compartido/esquemas';
import { NOMBRE_ROL, type Rol, type Usuario } from '@compartido/tipos';
import { Button } from '@/components/ui/button';
import { Campo } from '@/components/ui/campo';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { desenvolver, turnos } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useProfesionales } from '@/features/comun/consultas';
import { Confirmar } from '@/features/comun/confirmar';
import { COLOR, nombreCompleto } from '@/features/profesionales/colores';
import { CLAVE_SESION, useUsuario } from '@/features/sesion/consultas';
import { Iniciales } from '@/features/sesion/iniciales';

const QUE_PUEDE: Record<Rol, string> = {
  admin: 'Todo: usuarios, profesionales, horarios, obras sociales y ajustes. Si además atiende, vinculalo a su ficha.',
  profesional: 'Su agenda, la recepción y la historia clínica. Carga las notas de sus propios turnos.',
  recepcion: 'Agenda, recepción, pacientes, cobros y recordatorios. No ve la historia clínica.',
};

const CLAVE = ['usuarios'] as const;

export function TarjetaUsuarios() {
  const { usuario: yo } = useUsuario();
  const cliente = useQueryClient();
  const usuarios = useQuery({ queryKey: CLAVE, queryFn: () => desenvolver(turnos().usuarios.listar()) });
  const profesionales = useProfesionales();
  const [editando, setEditando] = useState<{ usuario: Usuario | null } | null>(null);
  const [baja, setBaja] = useState<Usuario | null>(null);
  const darDeBaja = useMutation({
    mutationFn: (id: number) => desenvolver(turnos().usuarios.darDeBaja(id)),
    onSuccess: async () => {
      await cliente.invalidateQueries({ queryKey: CLAVE });
      await cliente.invalidateQueries({ queryKey: ['usuarios-ingreso'] });
      toast.success('Usuario dado de baja');
    },
    onError: (e) => toast.error(e.message),
  });
  const profesionalDe = (u: Usuario) => profesionales.data?.find((p) => p.id === u.profesionalId);

  return (
    <section className="rounded-lg border border-linea bg-superficie p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold">Usuarios</h2>
          <p className="text-[14px] text-tinta-suave">Cada uno entra con su PIN. La historia clínica la ven solo los usuarios vinculados a un profesional.</p>
        </div>
        <Button onClick={() => setEditando({ usuario: null })}>
          <Plus aria-hidden="true" /> Nuevo usuario
        </Button>
      </div>
      <ul className="mt-4 divide-y divide-linea">
        {usuarios.data?.map((u) => {
          const p = profesionalDe(u);
          return (
            <li key={u.id} className="flex items-center gap-3 py-3">
              <Iniciales nombre={u.nombre} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {u.nombre}
                  {u.id === yo?.id && <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-[12px] font-semibold text-tinta-suave">vos</span>}
                </p>
                <p className="flex items-center gap-1.5 text-[13px] text-tinta-suave">
                  {NOMBRE_ROL[u.rol]}
                  {p && (
                    <>
                      {' · '}
                      <span className="size-2 rounded-full" style={{ backgroundColor: COLOR[p.color].fuerte }} aria-hidden="true" />
                      {nombreCompleto(p)}
                    </>
                  )}
                </p>
              </div>
              <Button variant="ghost" size="icon-sm" aria-label={`Editar a ${u.nombre}`} onClick={() => setEditando({ usuario: u })}>
                <Pencil aria-hidden="true" />
              </Button>
              {u.id !== yo?.id && (
                <Button variant="ghost-destructive" size="sm" onClick={() => setBaja(u)}>
                  Dar de baja
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      <DialogoUsuario abierto={editando !== null} usuario={editando?.usuario ?? null} alCerrar={() => setEditando(null)} />
      <Confirmar
        confirmacion={
          baja
            ? {
                titulo: `¿Dar de baja a ${baja.nombre}?`,
                descripcion: 'No va a poder entrar más. Lo que hizo (turnos, cobros, notas) queda registrado con su nombre.',
                boton: 'Dar de baja',
                alConfirmar: () => {
                  darDeBaja.mutate(baja.id);
                  setBaja(null);
                },
              }
            : null
        }
        alCerrar={() => setBaja(null)}
      />
    </section>
  );
}

function DialogoUsuario({ abierto, usuario, alCerrar }: { abierto: boolean; usuario: Usuario | null; alCerrar: () => void }) {
  const cliente = useQueryClient();
  const profesionales = useProfesionales();
  const [nombre, setNombre] = useState('');
  const [rol, setRol] = useState<Rol>('recepcion');
  const [profesionalId, setProfesionalId] = useState('');
  const [pin, setPin] = useState('');
  const [repetido, setRepetido] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!abierto) return;
    setNombre(usuario?.nombre ?? '');
    setRol(usuario?.rol ?? 'recepcion');
    setProfesionalId(usuario?.profesionalId ? String(usuario.profesionalId) : '');
    setPin('');
    setRepetido('');
    setError('');
  }, [abierto, usuario]);

  const guardar = useMutation({
    mutationFn: () =>
      desenvolver(turnos().usuarios.guardar({ id: usuario?.id, nombre, rol, profesionalId: profesionalId ? Number(profesionalId) : null, pin })),
    onSuccess: async () => {
      // Si me edité a mí mismo, la sesión cambia (nombre, rol o vínculo)
      await Promise.all([CLAVE, ['usuarios-ingreso'], CLAVE_SESION].map((k) => cliente.invalidateQueries({ queryKey: k })));
      toast.success(usuario ? 'Usuario actualizado' : 'Usuario creado');
      alCerrar();
    },
    onError: (e) => setError(e.message),
  });

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (pin !== repetido) return setError('Los dos PIN no coinciden.');
    const r = esquemaUsuario.safeParse({ id: usuario?.id, nombre, rol, profesionalId: profesionalId ? Number(profesionalId) : null, pin });
    if (!r.success) return setError(r.error.issues[0]?.message ?? 'Revisá los datos.');
    if (!usuario && !pin) return setError('Elegí un PIN de 4 a 6 números.');
    setError('');
    guardar.mutate();
  }

  const opciones = (profesionales.data ?? []).filter((p) => p.activo || String(p.id) === profesionalId);

  return (
    <Dialog open={abierto} onOpenChange={(a) => !a && alCerrar()}>
      <DialogContent className="max-w-[560px]">
        <form onSubmit={enviar} noValidate className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle>{usuario ? `Editar a ${usuario.nombre}` : 'Nuevo usuario'}</DialogTitle>
            <DialogDescription>El nombre es el que se ve en la pantalla de ingreso.</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <Campo etiqueta="Nombre" htmlFor="u-nombre">
              <Input id="u-nombre" autoFocus maxLength={30} value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </Campo>
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Rol</legend>
              <div role="radiogroup" aria-label="Rol" className="flex flex-col gap-2">
                {ROLES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    aria-checked={rol === r}
                    onClick={() => {
                      setRol(r);
                      setError('');
                    }}
                    className={cn(
                      'rounded-md border px-3.5 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-acento/50',
                      rol === r ? 'border-acento bg-acento-suave' : 'border-linea-fuerte hover:bg-accent',
                    )}
                  >
                    <span className="block font-semibold">{NOMBRE_ROL[r]}</span>
                    <span className="block text-[13px] text-tinta-suave">{QUE_PUEDE[r]}</span>
                  </button>
                ))}
              </div>
            </fieldset>
            {rol !== 'recepcion' && (
              <Campo etiqueta={rol === 'profesional' ? 'Es la ficha de' : 'Si además atiende, su ficha (opcional)'}>
                <Select value={profesionalId || 'ninguno'} onValueChange={(v) => setProfesionalId(v === 'ninguno' ? '' : v)}>
                  <SelectTrigger aria-label="Profesional vinculado">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ninguno">{rol === 'profesional' ? 'Elegí el profesional' : 'No atiende pacientes'}</SelectItem>
                    {opciones.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        <span className="size-2.5 rounded-full" style={{ backgroundColor: COLOR[p.color].fuerte }} aria-hidden="true" />
                        {nombreCompleto(p)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Campo>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta={usuario ? 'PIN nuevo (opcional)' : 'PIN (4 a 6 números)'} htmlFor="u-pin" ayuda={usuario ? 'Vacío = no se cambia.' : undefined}>
                <Input id="u-pin" type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
              </Campo>
              <Campo etiqueta="Repetí el PIN" htmlFor="u-pin2">
                <Input id="u-pin2" type="password" inputMode="numeric" maxLength={6} value={repetido} onChange={(e) => setRepetido(e.target.value.replace(/\D/g, ''))} />
              </Campo>
            </div>
          </DialogBody>
          <DialogFooter className="sm:justify-between">
            <p role="alert" className="text-[14px] font-medium text-rojo">
              {error}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={alCerrar}>
                Cancelar
              </Button>
              <Button type="submit" disabled={guardar.isPending}>
                {usuario ? 'Guardar' : 'Crear usuario'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
