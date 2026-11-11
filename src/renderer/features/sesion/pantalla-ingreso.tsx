// Lo primero que se ve: elegir quién usa el sistema y poner el PIN. La primera
// vez (sin usuarios) se crea el usuario de administración.
import { useState, type FormEvent } from 'react';
import { ArrowLeft } from 'lucide-react';
import { esquemaPin } from '@compartido/esquemas';
import { NOMBRE_ROL, type Usuario } from '@compartido/tipos';
import { Button } from '@/components/ui/button';
import { Campo } from '@/components/ui/campo';
import { Input } from '@/components/ui/input';
import { Marca } from '@/components/layout/marca';
import { useConsultorio } from '@/components/layout/barra-lateral';
import { useAhora } from '@/lib/ahora';
import { motivoDeCierre, useCrearPrimerUsuario, useIngresar, useUsuariosParaIngresar } from './consultas';
import { TecladoPin } from './teclado-pin';
import { Iniciales } from './iniciales';

export function PantallaIngreso() {
  const usuarios = useUsuariosParaIngresar();
  const consultorio = useConsultorio();
  const ahora = useAhora();

  return (
    <div className="grid h-full grid-cols-[minmax(340px,38%)_1fr]">
      <aside className="relative flex flex-col justify-between overflow-hidden bg-acento p-10 text-white">
        {/* Hojas de agenda de fondo, apenas visibles */}
        <svg aria-hidden="true" className="pointer-events-none absolute -right-24 -bottom-16 size-[420px] text-white/[0.07]" viewBox="0 0 40 40">
          <rect x="6" y="8" width="28" height="26" rx="4" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M6 15h28M13 5v6M27 5v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <rect x="12" y="20" width="7" height="6" rx="1.2" fill="currentColor" />
        </svg>
        <div className="flex items-center gap-3">
          <Marca className="size-12 [&>rect:first-child]:fill-white/15" />
          <p className="text-[15px] text-white/75">Turnos</p>
        </div>
        <div className="relative">
          <p className="font-display text-5xl leading-[1.05] font-semibold tracking-tight">{consultorio.data?.nombreConsultorio ?? ' '}</p>
          <p className="mt-6 text-lg text-white/75 first-letter:uppercase">{ahora.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <p className="numeros font-display text-7xl font-semibold">{ahora.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })}</p>
        </div>
        <p className="relative text-sm text-white/70">Cada uno entra con su PIN: así queda registrado quién dio cada turno y quién cobró.</p>
      </aside>
      <main className="flex items-center justify-center bg-background p-10">
        {usuarios.isPending ? (
          <p className="text-tinta-suave">Cargando…</p>
        ) : usuarios.isError ? (
          <p className="text-rojo">{usuarios.error.message}</p>
        ) : usuarios.data.length === 0 ? (
          <PrimerUsuario />
        ) : (
          <ElegirUsuario usuarios={usuarios.data} />
        )}
      </main>
    </div>
  );
}

function ElegirUsuario({ usuarios }: { usuarios: Usuario[] }) {
  const [elegido, setElegido] = useState<Usuario | null>(usuarios.length === 1 ? usuarios[0]! : null);
  const [pin, setPin] = useState('');
  const ingresar = useIngresar();

  function confirmar() {
    if (!elegido || ingresar.isPending) return;
    ingresar.mutate({ usuarioId: elegido.id, pin }, { onError: () => setPin('') });
  }

  if (!elegido) {
    return (
      <section className="flex w-full max-w-xl flex-col gap-6">
        {motivoDeCierre.texto && <p className="rounded-md bg-ambar-suave px-4 py-2.5 text-[15px] text-ambar">{motivoDeCierre.texto}</p>}
        <h1 className="font-display text-4xl font-semibold tracking-tight">¿Quién entra?</h1>
        <ul className="grid grid-cols-2 gap-3">
          {usuarios.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                onClick={() => {
                  setElegido(u);
                  setPin('');
                  ingresar.reset();
                }}
                className="flex w-full items-center gap-4 rounded-xl border border-linea bg-superficie p-4 text-left outline-none hover:border-linea-fuerte focus-visible:ring-[3px] focus-visible:ring-acento/30"
              >
                <Iniciales nombre={u.nombre} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-display text-lg font-semibold">{u.nombre}</span>
                  <span className="text-sm text-tinta-suave">{NOMBRE_ROL[u.rol]}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section className="flex flex-col items-center gap-4">
      {usuarios.length > 1 && (
        <Button variant="ghost" className="self-start" onClick={() => setElegido(null)}>
          <ArrowLeft aria-hidden="true" /> Cambiar usuario
        </Button>
      )}
      <Iniciales nombre={elegido.nombre} grande />
      <div className="text-center">
        <h1 className="font-display text-3xl font-semibold tracking-tight">{elegido.nombre}</h1>
        <p className="text-tinta-suave">Escribí tu PIN</p>
      </div>
      <TecladoPin
        valor={pin}
        alCambiar={(v) => {
          setPin(v);
          if (ingresar.isError) ingresar.reset();
        }}
        alConfirmar={confirmar}
        error={ingresar.error?.message}
        deshabilitado={ingresar.isPending}
      />
    </section>
  );
}

function PrimerUsuario() {
  const crear = useCrearPrimerUsuario();
  const [nombre, setNombre] = useState('');
  const [pin, setPin] = useState('');
  const [repetido, setRepetido] = useState('');
  const [error, setError] = useState('');

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return setError('Escribí tu nombre.');
    if (!esquemaPin.safeParse(pin).success) return setError('El PIN tiene que ser de 4 a 6 números.');
    if (pin !== repetido) return setError('Los dos PIN no coinciden.');
    setError('');
    crear.mutate({ nombre: nombre.trim(), pin }, { onError: (err) => setError(err.message) });
  }

  return (
    <form onSubmit={enviar} noValidate className="flex w-full max-w-md flex-col gap-5">
      <div>
        <h1 className="font-display text-4xl font-semibold tracking-tight">Bienvenido</h1>
        <p className="mt-2 text-tinta-suave">
          Creá el usuario de <strong>administración</strong>. Con ese usuario después cargás a los profesionales y a la recepción.
        </p>
      </div>
      <Campo etiqueta="Tu nombre" htmlFor="pu-nombre">
        <Input id="pu-nombre" autoFocus maxLength={30} value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="PIN (4 a 6 números)" htmlFor="pu-pin">
          <Input id="pu-pin" type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
        </Campo>
        <Campo etiqueta="Repetí el PIN" htmlFor="pu-pin2">
          <Input id="pu-pin2" type="password" inputMode="numeric" maxLength={6} value={repetido} onChange={(e) => setRepetido(e.target.value.replace(/\D/g, ''))} />
        </Campo>
      </div>
      {error && (
        <p role="alert" className="text-sm font-semibold text-rojo">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={crear.isPending}>
        Crear y entrar
      </Button>
      <p className="text-[13px] text-tinta-suave">Anotá el PIN en un lugar seguro: no se puede recuperar, solo cambiar desde otro usuario de administración.</p>
    </form>
  );
}
