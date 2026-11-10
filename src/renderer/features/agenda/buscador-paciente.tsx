// Buscador de pacientes para dar un turno: se escribe apellido, nombre o DNI y
// aparecen los resultados. Con las flechas se elige y con Enter se confirma.
// Si no existe, se crea ahí mismo (y queda elegido).
import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Search, UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { desenvolver, turnos } from '@/lib/api';
import { edad } from '@/lib/fechas';
import { cn } from '@/lib/utils';
import { CLAVES, useDemorado } from '@/features/comun/consultas';
import { dniConPuntos } from '@/features/comun/encabezado';
import { DialogoPaciente } from '@/features/pacientes/dialogo-paciente';

export interface PacienteElegido {
  id: number;
  nombre: string;
}

const MAXIMO = 6;

export function BuscadorPaciente({
  valor,
  alElegir,
  bloqueado = false,
}: {
  valor: PacienteElegido | null;
  alElegir: (p: PacienteElegido | null) => void;
  /** Al reprogramar, el paciente no se cambia. */
  bloqueado?: boolean;
}) {
  const [texto, setTexto] = useState('');
  const [activo, setActivo] = useState(0);
  const [nuevo, setNuevo] = useState(false);
  const idLista = useId();
  const demorado = useDemorado(texto.trim(), 200);
  const buscando = demorado.length >= 2;

  const resultados = useQuery({
    queryKey: [...CLAVES.pacientes, 'buscador', demorado],
    queryFn: () => desenvolver(turnos().pacientes.buscar({ texto: demorado })),
    enabled: buscando,
    placeholderData: keepPreviousData,
  });
  const lista = buscando ? (resultados.data ?? []).slice(0, MAXIMO) : [];
  // La última opción es siempre "Nuevo paciente"
  const opciones = lista.length + 1;

  useEffect(() => setActivo(0), [demorado]);

  if (valor) {
    return (
      <div className="flex h-11 items-center gap-3 rounded-md border border-input bg-acento-suave/60 pr-1 pl-3">
        <span className="min-w-0 flex-1 truncate font-display text-[17px] font-semibold">{valor.nombre}</span>
        {!bloqueado && (
          <Button size="icon-sm" variant="ghost" aria-label="Elegir otro paciente" onClick={() => alElegir(null)}>
            <X aria-hidden="true" />
          </Button>
        )}
      </div>
    );
  }

  function teclas(e: KeyboardEvent<HTMLInputElement>) {
    if (!buscando) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActivo((a) => (a + 1) % opciones);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActivo((a) => (a - 1 + opciones) % opciones);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const p = lista[activo];
      if (p) alElegir({ id: p.id, nombre: `${p.apellido}, ${p.nombre}` });
      else setNuevo(true);
    }
  }

  const idOpcion = (i: number) => `${idLista}-${i}`;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-[18px] -translate-y-1/2 text-tinta-suave" aria-hidden="true" />
        <Input
          role="combobox"
          aria-label="Buscar paciente"
          aria-expanded={buscando}
          aria-controls={idLista}
          aria-activedescendant={buscando ? idOpcion(activo) : undefined}
          aria-autocomplete="list"
          placeholder="Apellido, nombre o DNI"
          className="pl-10"
          autoFocus
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={teclas}
        />
      </div>
      {buscando && (
        <ul id={idLista} role="listbox" aria-label="Pacientes encontrados" className="flex flex-col overflow-hidden rounded-md border border-linea">
          {lista.map((p, i) => {
            const anios = edad(p.fechaNacimiento);
            return (
              <li
                key={p.id}
                id={idOpcion(i)}
                role="option"
                aria-selected={i === activo}
                onMouseEnter={() => setActivo(i)}
                onClick={() => alElegir({ id: p.id, nombre: `${p.apellido}, ${p.nombre}` })}
                className={cn('flex cursor-pointer items-baseline gap-3 border-b border-linea px-3 py-2', i === activo && 'bg-acento-suave')}
              >
                <span className="font-semibold">
                  {p.apellido}, {p.nombre}
                </span>
                <span className="numeros truncate text-[13px] text-tinta-suave">
                  DNI {dniConPuntos(p.dni)} · {p.obraSocial ?? 'Particular'}
                  {anios !== null && ` · ${anios} años`}
                </span>
              </li>
            );
          })}
          {resultados.isSuccess && lista.length === 0 && <li className="border-b border-linea px-3 py-2 text-[14px] text-tinta-suave">No hay pacientes con «{demorado}».</li>}
          <li
            id={idOpcion(lista.length)}
            role="option"
            aria-selected={activo === lista.length}
            onMouseEnter={() => setActivo(lista.length)}
            onClick={() => setNuevo(true)}
            className={cn('flex cursor-pointer items-center gap-2 px-3 py-2 font-semibold text-acento-fuerte', activo === lista.length && 'bg-acento-suave')}
          >
            <UserPlus className="size-4" aria-hidden="true" />
            Nuevo paciente
          </li>
        </ul>
      )}
      {!buscando && (
        <p className="text-[13px] text-tinta-suave">
          Escribí al menos 2 letras o números.{' '}
          <button type="button" className="font-semibold text-acento-fuerte underline-offset-2 hover:underline" onClick={() => setNuevo(true)}>
            O cargá un paciente nuevo
          </button>
        </p>
      )}
      <DialogoPaciente paciente={nuevo ? 'nuevo' : null} sugerencia={texto} alCerrar={() => setNuevo(false)} alGuardar={(id, nombre) => alElegir({ id, nombre })} />
    </div>
  );
}
