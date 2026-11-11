// Ficha del paciente (nuevo o para editar). Valida con el mismo esquema Zod
// que el main y muestra cada error debajo de su campo.
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { CalendarPlus, NotebookText } from 'lucide-react';
import { toast } from 'sonner';
import { esquemaPaciente, type DatosPaciente } from '@compartido/esquemas';
import type { Paciente } from '@compartido/tipos';
import { Button } from '@/components/ui/button';
import { Campo } from '@/components/ui/campo';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { desenvolver, turnos } from '@/lib/api';
import { edad, fechaISO } from '@/lib/fechas';
import { CLAVES, useAccion, useObrasSociales } from '@/features/comun/consultas';
import { dniConPuntos } from '@/features/comun/encabezado';
import { TurnosDelPaciente } from '@/features/agenda/turnos-del-paciente';
import { DialogoHistoria } from '@/features/consulta/historia';
import { useUsuario } from '@/features/sesion/consultas';

type Errores = Partial<Record<keyof DatosPaciente, string>>;

const VACIO = { apellido: '', nombre: '', dni: '', fechaNacimiento: '', telefono: '', email: '', obraSocialId: 'particular', numeroAfiliado: '', notas: '' };

/**
 * Lo escrito en un buscador, como punto de partida para un paciente nuevo:
 * "30123456" → DNI; "pérez juan" → apellido "Pérez", nombre "Juan".
 */
function desdeSugerencia(texto: string): Partial<typeof VACIO> {
  const limpio = texto.trim();
  if (!limpio) return {};
  if (/^[\d.\s]+$/.test(limpio)) return { dni: limpio.replace(/\D/g, '') };
  const mayuscula = (p: string) => p.charAt(0).toLocaleUpperCase('es') + p.slice(1);
  const [apellido = '', ...resto] = limpio.split(/\s+/).map(mayuscula);
  return { apellido, nombre: resto.join(' ') };
}

interface Props {
  paciente: Paciente | 'nuevo' | null;
  alCerrar: () => void;
  /** Para uno nuevo: lo que se escribió en el buscador. */
  sugerencia?: string;
  /** Avisa el id y el nombre del paciente guardado (lo usa el diálogo de turnos). */
  alGuardar?: (id: number, nombre: string) => void;
}

export function DialogoPaciente({ paciente, alCerrar, sugerencia = '', alGuardar }: Props) {
  const navegar = useNavigate();
  const { veClinica } = useUsuario();
  const [historia, setHistoria] = useState(false);
  const [f, setF] = useState(VACIO);
  const [errores, setErrores] = useState<Errores>({});
  const obras = useObrasSociales();
  const existente = paciente && paciente !== 'nuevo' ? paciente : null;

  useEffect(() => {
    if (!paciente) return;
    setErrores({});
    setF(
      existente
        ? {
            apellido: existente.apellido,
            nombre: existente.nombre,
            dni: existente.dni ?? '',
            fechaNacimiento: existente.fechaNacimiento ?? '',
            telefono: existente.telefono,
            email: existente.email,
            obraSocialId: existente.obraSocialId === null ? 'particular' : String(existente.obraSocialId),
            numeroAfiliado: existente.numeroAfiliado,
            notas: existente.notas,
          }
        : { ...VACIO, ...desdeSugerencia(sugerencia) },
    );
    // La sugerencia solo se usa al abrir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paciente, existente]);

  const guardar = useAccion((d: DatosPaciente) => desenvolver(turnos().pacientes.guardar(d)), [CLAVES.pacientes, CLAVES.obras, CLAVES.agenda], existente ? 'Cambios guardados' : 'Paciente agregado');
  const activo = useAccion(
    (a: boolean) => desenvolver(turnos().pacientes.cambiarActivo(existente!.id, a)),
    [CLAVES.pacientes, CLAVES.obras, CLAVES.agenda],
    (_) => (existente?.activo ? 'Paciente dado de baja' : 'Paciente reactivado'),
  );

  const cambiar = (campo: keyof typeof VACIO) => (valor: string) => {
    setF((v) => ({ ...v, [campo]: valor }));
    setErrores((e) => ({ ...e, [campo]: undefined }));
  };

  function enviar(e: FormEvent) {
    e.preventDefault();
    const datos: DatosPaciente = {
      ...(existente ? { id: existente.id } : {}),
      ...f,
      obraSocialId: f.obraSocialId === 'particular' ? null : Number(f.obraSocialId),
    };
    const r = esquemaPaciente.safeParse(datos);
    if (!r.success) {
      const nuevos: Errores = {};
      for (const issue of r.error.issues) {
        const campo = issue.path[0] as keyof DatosPaciente;
        nuevos[campo] ??= issue.message;
      }
      return setErrores(nuevos);
    }
    guardar.mutate(r.data, {
      onSuccess: (id) => {
        alGuardar?.(id, `${r.data.apellido}, ${r.data.nombre}`);
        alCerrar();
      },
      // Errores del main (DNI repetido, fecha futura…): al campo que corresponde
      onError: (error) => {
        if (error.message.includes('DNI')) setErrores({ dni: error.message });
        else if (error.message.includes('nacimiento')) setErrores({ fechaNacimiento: error.message });
        else toast.error(error.message);
      },
    });
  }

  const anios = f.fechaNacimiento ? edad(f.fechaNacimiento) : null;
  // Se muestran las activas + la que ya tenía el paciente (aunque esté de baja)
  const opciones = (obras.data ?? []).filter((o) => o.activo || String(o.id) === f.obraSocialId);

  return (
    <Dialog open={paciente !== null} onOpenChange={(a) => !a && alCerrar()}>
      <DialogContent className="max-w-[720px]">
        <form onSubmit={enviar} noValidate className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">{existente ? `${existente.apellido}, ${existente.nombre}` : 'Nuevo paciente'}</DialogTitle>
            <DialogDescription>
              {existente ? `DNI ${dniConPuntos(existente.dni)}${existente.activo ? '' : ' · dado de baja'}` : 'Solo el nombre y el apellido son obligatorios.'}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="grid grid-cols-2 gap-x-5 gap-y-4">
            <Campo etiqueta="Apellido" htmlFor="p-apellido" error={errores.apellido}>
              <Input id="p-apellido" autoFocus maxLength={40} value={f.apellido} onChange={(e) => cambiar('apellido')(e.target.value)} />
            </Campo>
            <Campo etiqueta="Nombre" htmlFor="p-nombre" error={errores.nombre}>
              <Input id="p-nombre" maxLength={40} value={f.nombre} onChange={(e) => cambiar('nombre')(e.target.value)} />
            </Campo>
            <Campo etiqueta="DNI" htmlFor="p-dni" error={errores.dni} ayuda="Con o sin puntos.">
              <Input id="p-dni" inputMode="numeric" maxLength={12} value={f.dni} onChange={(e) => cambiar('dni')(e.target.value)} />
            </Campo>
            <Campo etiqueta="Fecha de nacimiento" htmlFor="p-nacimiento" error={errores.fechaNacimiento} ayuda={anios !== null && anios >= 0 ? `${anios} ${anios === 1 ? 'año' : 'años'}` : undefined}>
              <Input id="p-nacimiento" type="date" max={fechaISO()} value={f.fechaNacimiento} onChange={(e) => cambiar('fechaNacimiento')(e.target.value)} />
            </Campo>
            <Campo etiqueta="Teléfono" htmlFor="p-telefono" error={errores.telefono} ayuda="Para avisarle por WhatsApp (etapa 3).">
              <Input id="p-telefono" inputMode="tel" maxLength={30} value={f.telefono} onChange={(e) => cambiar('telefono')(e.target.value)} />
            </Campo>
            <Campo etiqueta="Email (opcional)" htmlFor="p-email" error={errores.email}>
              <Input id="p-email" type="email" maxLength={80} value={f.email} onChange={(e) => cambiar('email')(e.target.value)} />
            </Campo>
            <Campo etiqueta="Cobertura" error={errores.obraSocialId}>
              <Select value={f.obraSocialId} onValueChange={cambiar('obraSocialId')}>
                <SelectTrigger aria-label="Cobertura">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="particular">Particular</SelectItem>
                  {opciones.map((o) => (
                    <SelectItem key={o.id} value={String(o.id)}>
                      {o.nombre}
                      {!o.activo && ' (de baja)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Campo>
            <Campo etiqueta="Número de afiliado" htmlFor="p-afiliado" error={errores.numeroAfiliado}>
              <Input
                id="p-afiliado"
                maxLength={30}
                disabled={f.obraSocialId === 'particular'}
                placeholder={f.obraSocialId === 'particular' ? 'Solo con obra social' : ''}
                value={f.obraSocialId === 'particular' ? '' : f.numeroAfiliado}
                onChange={(e) => cambiar('numeroAfiliado')(e.target.value)}
              />
            </Campo>
            <Campo
              etiqueta="Notas administrativas"
              htmlFor="p-notas"
              error={errores.notas}
              ayuda="Por ejemplo: prefiere turnos a la tarde. Las notas de la consulta van aparte (etapa 3)."
              className="col-span-2"
            >
              <Textarea id="p-notas" rows={2} maxLength={300} value={f.notas} onChange={(e) => cambiar('notas')(e.target.value)} />
            </Campo>
            {existente && (
              <section aria-labelledby="t-turnos-paciente" className="col-span-2 flex flex-col gap-3 border-t border-linea pt-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 id="t-turnos-paciente" className="font-display text-lg font-semibold">
                    Turnos
                  </h3>
                  <div className="flex gap-2">
                  {veClinica && (
                    <Button size="sm" variant="outline" onClick={() => setHistoria(true)}>
                      <NotebookText aria-hidden="true" />
                      Historia clínica
                    </Button>
                  )}
                  {existente.activo && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        alCerrar();
                        navegar('/', { state: { nuevoTurnoPara: { id: existente.id, nombre: `${existente.apellido}, ${existente.nombre}` } } });
                      }}
                    >
                      <CalendarPlus aria-hidden="true" />
                      Dar turno
                    </Button>
                  )}
                  </div>
                </div>
                <TurnosDelPaciente pacienteId={existente.id} />
                <DialogoHistoria paciente={historia ? { id: existente.id, nombre: `${existente.apellido}, ${existente.nombre}` } : null} alCerrar={() => setHistoria(false)} />
              </section>
            )}
          </DialogBody>
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
                {existente ? 'Guardar cambios' : 'Agregar paciente'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
