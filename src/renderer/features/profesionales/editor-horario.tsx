// Editor del horario semanal: una fila por día, cada día con una o más
// franjas (por ejemplo, 08:00–12:00 y 16:00–20:00).
import { Copy, Plus, X } from 'lucide-react';
import { NOMBRE_DIA } from '@compartido/esquemas';
import type { Franja } from '@compartido/horarios';
import { horariosDeTurno } from '@compartido/horarios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

interface Props {
  franjas: Franja[];
  duracionMin: number;
  alCambiar: (franjas: Franja[]) => void;
}

const DIAS = [1, 2, 3, 4, 5, 6, 7];
const mayuscula = (t: string) => t[0]!.toUpperCase() + t.slice(1);

export function EditorHorario({ franjas, duracionMin, alCambiar }: Props) {
  const delDia = (dia: number) => franjas.filter((f) => f.diaSemana === dia);
  const reemplazarDia = (dia: number, nuevas: Franja[]) => alCambiar([...franjas.filter((f) => f.diaSemana !== dia), ...nuevas].sort((a, b) => a.diaSemana - b.diaSemana || a.desde.localeCompare(b.desde)));

  // "Copiar a los días hábiles": lo del lunes, de martes a viernes
  const lunes = delDia(1);
  const copiarLunes = () => alCambiar([...franjas.filter((f) => f.diaSemana === 1 || f.diaSemana > 5), ...[2, 3, 4, 5].flatMap((d) => lunes.map((f) => ({ ...f, diaSemana: d })))]);

  return (
    <div className="flex flex-col">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium">Horario de atención</p>
        <Button variant="ghost" size="sm" disabled={!lunes.length} onClick={copiarLunes}>
          <Copy /> Copiar el lunes de martes a viernes
        </Button>
      </div>
      <ul className="divide-y divide-linea rounded-lg border border-linea">
        {DIAS.map((dia) => {
          const lista = delDia(dia);
          const atiende = lista.length > 0;
          const turnos = horariosDeTurno(lista, duracionMin).length;
          return (
            <li key={dia} className={cn('grid grid-cols-[150px_1fr_auto] items-start gap-3 px-3 py-2.5', !atiende && 'bg-muted/50')}>
              <label className="flex h-10 items-center gap-3 text-[15px]">
                <Switch
                  checked={atiende}
                  aria-label={`Atiende los ${NOMBRE_DIA[dia]}`}
                  onCheckedChange={(si) => reemplazarDia(dia, si ? [{ diaSemana: dia, desde: '09:00', hasta: '13:00' }] : [])}
                />
                <span className={cn(atiende ? 'font-medium' : 'text-tinta-suave')}>{mayuscula(NOMBRE_DIA[dia]!)}</span>
              </label>
              <div className="flex flex-col gap-2">
                {atiende ? (
                  lista.map((f, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        type="time"
                        aria-label={`${NOMBRE_DIA[dia]}, franja ${i + 1}, desde`}
                        className="h-10 w-[120px]"
                        value={f.desde}
                        onChange={(e) => reemplazarDia(dia, lista.map((x, j) => (j === i ? { ...x, desde: e.target.value } : x)))}
                      />
                      <span className="text-tinta-suave">a</span>
                      <Input
                        type="time"
                        aria-label={`${NOMBRE_DIA[dia]}, franja ${i + 1}, hasta`}
                        className="h-10 w-[120px]"
                        value={f.hasta}
                        onChange={(e) => reemplazarDia(dia, lista.map((x, j) => (j === i ? { ...x, hasta: e.target.value } : x)))}
                      />
                      {lista.length > 1 && (
                        <Button variant="ghost" size="icon-sm" aria-label={`Quitar la franja ${i + 1} del ${NOMBRE_DIA[dia]}`} onClick={() => reemplazarDia(dia, lista.filter((_, j) => j !== i))}>
                          <X />
                        </Button>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="flex h-10 items-center text-tinta-suave">No atiende</p>
                )}
              </div>
              <div className="flex h-10 items-center gap-2">
                {atiende && (
                  <>
                    <span className="numeros w-[78px] text-right text-[13px] text-tinta-suave">{turnos === 1 ? '1 turno' : `${turnos} turnos`}</span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Agregar franja el ${NOMBRE_DIA[dia]}`}
                      disabled={lista.length >= 4}
                      onClick={() => {
                        const ultima = lista[lista.length - 1]!;
                        reemplazarDia(dia, [...lista, { diaSemana: dia, desde: ultima.hasta < '16:00' ? '16:00' : ultima.hasta, hasta: ultima.hasta < '16:00' ? '20:00' : '23:00' }]);
                      }}
                    >
                      <Plus />
                    </Button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
