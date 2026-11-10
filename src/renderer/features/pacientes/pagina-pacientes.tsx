// Lista de pacientes: buscar (por nombre, DNI o teléfono), filtrar por
// cobertura y abrir la ficha para editar.
import { useEffect, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { edad } from '@/lib/fechas';
import type { Paciente } from '@compartido/tipos';
import { useCargarEjemplo, useObrasSociales, usePacientes, useResumen } from '@/features/comun/consultas';
import { Encabezado, Vacio, dniConPuntos } from '@/features/comun/encabezado';
import { DialogoPaciente } from './dialogo-paciente';

/** Espera a que dejen de escribir (250 ms) para buscar. */
function useDemorado<T>(valor: T, ms = 250): T {
  const [demorado, setDemorado] = useState(valor);
  useEffect(() => {
    const t = window.setTimeout(() => setDemorado(valor), ms);
    return () => window.clearTimeout(t);
  }, [valor, ms]);
  return demorado;
}

export function PaginaPacientes() {
  const [texto, setTexto] = useState('');
  const [cobertura, setCobertura] = useState('todas');
  const [incluirBajas, setIncluirBajas] = useState(false);
  const [abierto, setAbierto] = useState<Paciente | 'nuevo' | null>(null);
  const buscado = useDemorado(texto);
  const filtro = {
    texto: buscado,
    obraSocialId: cobertura === 'todas' ? null : cobertura === 'particular' ? ('particular' as const) : Number(cobertura),
    incluirBajas,
  };
  const pacientes = usePacientes(filtro);
  const obras = useObrasSociales();
  const resumen = useResumen();
  const ejemplo = useCargarEjemplo();
  const lista = pacientes.data ?? [];
  const consultorioVacio = resumen.data?.pacientes === 0 && !incluirBajas;

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6 px-10 pt-9 pb-12">
      <Encabezado
        titulo="Pacientes"
        detalle={resumen.data ? `${resumen.data.pacientes.toLocaleString('es-AR')} ${resumen.data.pacientes === 1 ? 'paciente' : 'pacientes'} activos` : ' '}
      >
        <Button onClick={() => setAbierto('nuevo')}>
          <Plus /> Nuevo paciente
        </Button>
      </Encabezado>

      {consultorioVacio ? (
        <Vacio
          titulo="Todavía no hay pacientes"
          acciones={
            <>
              <Button onClick={() => setAbierto('nuevo')}>
                <Plus /> Cargar el primero
              </Button>
              <Button variant="outline" disabled={ejemplo.isPending} onClick={() => ejemplo.mutate()}>
                Cargar datos de ejemplo
              </Button>
            </>
          }
        >
          Cargá los pacientes a medida que vienen, o probá el sistema con 30 pacientes y 3 profesionales de ejemplo.
        </Vacio>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-[380px]">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-tinta-suave" />
              <Input
                autoFocus
                aria-label="Buscar paciente"
                placeholder="Apellido, nombre, DNI o teléfono"
                className="pl-10"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
              />
            </div>
            <Select value={cobertura} onValueChange={setCobertura}>
              <SelectTrigger aria-label="Cobertura" className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas las coberturas</SelectItem>
                <SelectItem value="particular">Particulares</SelectItem>
                {obras.data?.map((o) => (
                  <SelectItem key={o.id} value={String(o.id)}>
                    {o.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 text-[14px] text-tinta-suave">
              <Checkbox checked={incluirBajas} onCheckedChange={(v) => setIncluirBajas(v === true)} />
              Ver dados de baja
            </label>
          </div>

          {pacientes.isError && <p role="alert" className="font-semibold text-rojo">{pacientes.error.message}</p>}

          {pacientes.isSuccess && lista.length === 0 ? (
            <Vacio titulo="Ningún paciente coincide">Probá con otra parte del apellido, el DNI o el teléfono.</Vacio>
          ) : (
            <TablaPacientes pacientes={lista} atenuada={pacientes.isPlaceholderData} alAbrir={setAbierto} />
          )}
          {lista.length === 300 && <p className="text-[13px] text-tinta-suave">Se muestran los primeros 300. Escribí algo para encontrar al resto.</p>}
        </>
      )}

      <DialogoPaciente paciente={abierto} alCerrar={() => setAbierto(null)} />
    </div>
  );
}

function TablaPacientes({ pacientes, atenuada, alAbrir }: { pacientes: Paciente[]; atenuada: boolean; alAbrir: (p: Paciente) => void }) {
  return (
    <table className={cn('w-full text-[15px] transition-opacity', atenuada && 'opacity-60')}>
      <thead>
        <tr className="border-b border-linea text-left text-[13px] text-tinta-suave">
          <th scope="col" className="py-2.5 pl-3 font-medium">Paciente</th>
          <th scope="col" className="py-2.5 font-medium">DNI</th>
          <th scope="col" className="py-2.5 font-medium">Edad</th>
          <th scope="col" className="py-2.5 font-medium">Teléfono</th>
          <th scope="col" className="py-2.5 pr-3 font-medium">Cobertura</th>
        </tr>
      </thead>
      <tbody>
        {pacientes.map((p) => {
          const anios = edad(p.fechaNacimiento);
          return (
            <tr key={p.id} className={cn('relative border-b border-linea hover:bg-superficie', !p.activo && 'text-tinta-suave')}>
              <td className="py-3 pl-3">
                <button
                  type="button"
                  onClick={() => alAbrir(p)}
                  className="text-left outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline"
                >
                  <span className="font-semibold">{p.apellido}</span>, {p.nombre}
                </button>
                {!p.activo && <Badge className="ml-2" variant="contorno">De baja</Badge>}
              </td>
              <td className="numeros py-3">{dniConPuntos(p.dni)}</td>
              <td className="numeros py-3">{anios === null ? '—' : `${anios} ${anios === 1 ? 'año' : 'años'}`}</td>
              <td className="numeros py-3">{p.telefono || '—'}</td>
              <td className="py-3 pr-3">
                {p.obraSocial ?? <span className="text-tinta-suave">Particular</span>}
                {p.numeroAfiliado && <span className="numeros ml-2 text-[13px] text-tinta-suave">{p.numeroAfiliado}</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
