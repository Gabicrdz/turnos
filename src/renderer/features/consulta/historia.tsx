// La historia clínica del paciente: sus consultas, de la más nueva a la más vieja.
// Se usa dentro del diálogo de la consulta y en un diálogo propio desde la ficha.
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Lock } from 'lucide-react';
import type { Consulta } from '@compartido/tipos';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useHistoria } from '@/features/agenda/consultas-agenda';

const fechaConDia = (f: string) => format(parseISO(f), "EEE d 'de' MMM yyyy", { locale: es });

export function ListaHistoria({ consultas, vacio = 'Todavía no tiene consultas cargadas.' }: { consultas: Consulta[]; vacio?: string }) {
  if (!consultas.length) return <p className="text-[14px] text-tinta-suave">{vacio}</p>;
  return (
    <ol className="flex flex-col gap-4">
      {consultas.map((c) => (
        <li key={c.id} className="border-l-2 border-linea-fuerte pl-4">
          <p className="flex items-center gap-2 text-[13px] text-tinta-suave">
            <span className="font-semibold text-tinta first-letter:uppercase">{fechaConDia(c.fecha)}</span>· {c.profesional}
            {!c.editable && <Lock className="size-3" aria-label="Cerrada" />}
          </p>
          {(c.diagnostico || c.motivo) && (
            <p className="mt-0.5 font-display text-[16px] font-semibold">
              {c.diagnostico || c.motivo}
              {c.diagnostico && c.motivo && <span className="font-sans text-[13px] font-normal text-tinta-suave"> · consultó por {c.motivo.toLowerCase()}</span>}
            </p>
          )}
          <p className="mt-1 text-[14px] whitespace-pre-line">{c.evolucion}</p>
          {c.indicaciones && (
            <p className="mt-1 text-[14px] whitespace-pre-line text-tinta-suave">
              <span className="font-semibold text-tinta">Indicaciones: </span>
              {c.indicaciones}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

/** Diálogo con toda la historia (desde la ficha del paciente). */
export function DialogoHistoria({ paciente, alCerrar }: { paciente: { id: number; nombre: string } | null; alCerrar: () => void }) {
  const historia = useHistoria(paciente?.id ?? null);
  return (
    <Dialog open={paciente !== null} onOpenChange={(a) => !a && alCerrar()}>
      <DialogContent className="max-w-[720px]">
        <DialogHeader>
          <DialogTitle>Historia clínica · {paciente?.nombre}</DialogTitle>
          <DialogDescription>
            {historia.data ? `${historia.data.length} ${historia.data.length === 1 ? 'consulta' : 'consultas'}. ` : ''}Las notas se pueden corregir solo el día en que se cargaron.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>{historia.data ? <ListaHistoria consultas={historia.data} /> : <p className="text-tinta-suave">Cargando…</p>}</DialogBody>
      </DialogContent>
    </Dialog>
  );
}
