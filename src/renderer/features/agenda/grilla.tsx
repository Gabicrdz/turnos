// La grilla de la agenda: la hora a la izquierda y una columna por profesional
// (vista día) o por día (vista semana). Cada minuto ocupa PX píxeles: un turno
// de 20 minutos mide 48 px. Los turnos se ubican con position: absolute según su hora.
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { NOMBRE_ESTADO, espaciosLibres, rangoVisible } from '@compartido/agenda';
import { aHora, aMinutos } from '@compartido/horarios';
import type { Bloqueo, Profesional, Turno } from '@compartido/tipos';
import { cn } from '@/lib/utils';
import { COLOR, nombreCompleto } from '@/features/profesionales/colores';
import { ESTILO_ESTADO } from './estado';

/** Píxeles por minuto. */
const PX = 2.4;
/** Una línea cada hora y otra más suave cada media hora. */
const LINEAS = `repeating-linear-gradient(to bottom, var(--linea) 0 1px, transparent 1px ${60 * PX}px), repeating-linear-gradient(to bottom, #e8eeeb 0 1px, transparent 1px ${30 * PX}px)`;

export interface ColumnaAgenda {
  clave: string;
  fecha: string;
  profesional: Profesional;
  franjas: { desde: string; hasta: string }[];
  bloqueo: Bloqueo | undefined;
  /** Sin los cancelados (esos liberan el horario y no se dibujan). */
  turnos: Turno[];
  encabezado: (info: { libres: number }) => ReactNode;
}

interface Props {
  columnas: ColumnaAgenda[];
  hoy: string;
  /** Minutos desde la medianoche, para la línea de "ahora". */
  ahora: number;
  /** Cambia cuando cambia lo que se mira (para volver a ubicar el scroll). */
  claveVista: string;
  alElegirLibre: (columna: ColumnaAgenda, desde: string) => void;
  alElegirTurno: (turno: Turno) => void;
}

export function Grilla({ columnas, hoy, ahora, claveVista, alElegirLibre, alElegirTurno }: Props) {
  const contenedor = useRef<HTMLDivElement>(null);
  const rango = useMemo(() => rangoVisible(columnas.flatMap((c) => [...c.franjas, ...c.turnos])), [columnas]);
  const alto = (rango.hasta - rango.desde) * PX;
  const arriba = (hora: string) => (aMinutos(hora) - rango.desde) * PX;

  // Libres de cada columna (las mismas reglas que controla el main)
  const libres = useMemo(
    () =>
      columnas.map((c) => {
        if (c.bloqueo || !c.profesional.activo || c.fecha < hoy) return [];
        return espaciosLibres(c.franjas, c.profesional.duracionTurnoMin, c.turnos, c.fecha === hoy ? ahora : 0);
      }),
    [columnas, hoy, ahora],
  );

  // Al cambiar de día o de vista: mostrar desde una hora antes de "ahora" (si es hoy) o desde el principio
  const hayHoy = columnas.some((c) => c.fecha === hoy);
  useEffect(() => {
    const el = contenedor.current;
    if (!el) return;
    el.scrollTop = hayHoy ? Math.max(0, (ahora - rango.desde - 60) * PX) : 0;
    // Solo cuando cambia lo que se mira (no cada minuto)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveVista]);

  const horas: number[] = [];
  for (let m = rango.desde; m <= rango.hasta; m += 60) horas.push(m);

  return (
    <div ref={contenedor} className="min-h-0 flex-1 overflow-auto border-t border-linea bg-superficie" tabIndex={-1}>
      <div className="grid min-w-full" style={{ gridTemplateColumns: `64px repeat(${columnas.length}, minmax(210px, 1fr))` }}>
        {/* Fila de encabezados (queda fija arriba al bajar) */}
        <div className="sticky top-0 left-0 z-30 border-b border-linea bg-superficie" />
        {columnas.map((c, i) => (
          <div key={c.clave} className="sticky top-0 z-20 border-b border-l border-linea bg-superficie px-3 py-2.5">
            {c.encabezado({ libres: libres[i]!.length })}
          </div>
        ))}

        {/* Columna de horas (queda fija a la izquierda) */}
        <div className="sticky left-0 z-10 bg-superficie" style={{ height: alto + 16 }}>
          {horas.map((m) => (
            <span
              key={m}
              className="numeros absolute right-2 text-[12px] font-medium text-tinta-suave"
              style={{ top: (m - rango.desde) * PX + 8, transform: 'translateY(-50%)' }}
            >
              {aHora(m)}
            </span>
          ))}
        </div>

        {columnas.map((c, i) => {
          const color = COLOR[c.profesional.color];
          const linea = c.fecha === hoy && ahora >= rango.desde && ahora <= rango.hasta;
          return (
            <div key={c.clave} className="relative border-l border-linea" style={{ height: alto + 16 }}>
              <div
                className="absolute inset-x-0 top-2 bg-[#eef2f0]"
                style={{
                  height: alto,
                  // Líneas de cada hora (y más suaves cada media hora)
                  backgroundImage: LINEAS,
                }}
              >
                {/* Horario de atención: en blanco */}
                {c.franjas.map((f) => (
                  <div
                    key={f.desde}
                    className="absolute inset-x-0 bg-superficie"
                    style={{
                      top: arriba(f.desde),
                      height: (aMinutos(f.hasta) - aMinutos(f.desde)) * PX,
                      backgroundImage: LINEAS,
                      backgroundPosition: `0 ${-(aMinutos(f.desde) - rango.desde) * PX}px`,
                    }}
                  />
                ))}

                {c.bloqueo && (
                  <div
                    className="absolute inset-0"
                    style={{ backgroundImage: 'repeating-linear-gradient(135deg, var(--ambar-suave) 0 10px, transparent 10px 20px)' }}
                    aria-hidden="true"
                  />
                )}

                {/* Horarios libres: se pueden tocar para dar un turno */}
                {libres[i]!.map((desde) => (
                  <button
                    key={desde}
                    type="button"
                    onClick={() => alElegirLibre(c, desde)}
                    aria-label={`Dar turno a las ${desde} con ${nombreCompleto(c.profesional)}`}
                    className="group absolute inset-x-1 flex items-start gap-1.5 rounded-md px-2 pt-1 text-left text-[12px] text-tinta-suave/70 outline-none hover:bg-acento-suave hover:text-acento-fuerte focus-visible:bg-acento-suave focus-visible:text-acento-fuerte focus-visible:ring-2 focus-visible:ring-acento/50"
                    style={{ top: arriba(desde) + 1, height: c.profesional.duracionTurnoMin * PX - 2 }}
                  >
                    <span className="numeros">{desde}</span>
                    <span className="hidden items-center gap-0.5 font-semibold group-hover:inline-flex group-focus-visible:inline-flex">
                      <Plus className="size-3.5" strokeWidth={2.5} aria-hidden="true" />
                      Dar turno
                    </span>
                  </button>
                ))}

                {/* Turnos */}
                {c.turnos.map((t) => (
                  <TarjetaTurno
                    key={t.id}
                    turno={t}
                    top={arriba(t.desde)}
                    alto={(aMinutos(t.hasta) - aMinutos(t.desde)) * PX}
                    fuerte={color.fuerte}
                    suave={color.suave}
                    alTocar={() => alElegirTurno(t)}
                  />
                ))}

                {linea && (
                  <div className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-rojo" style={{ top: (ahora - rango.desde) * PX }} aria-hidden="true">
                    <span className="absolute -top-[4px] -left-[5px] size-2.5 rounded-full bg-rojo" />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TarjetaTurno({ turno: t, top, alto, fuerte, suave, alTocar }: { turno: Turno; top: number; alto: number; fuerte: string; suave: string; alTocar: () => void }) {
  const { icono: Icono } = ESTILO_ESTADO[t.estado];
  const compacta = alto < 44;
  const terminado = t.estado === 'atendido' || t.estado === 'ausente';
  const detalle = [t.obraSocial ?? 'Particular', t.motivo].filter(Boolean).join(' · ');
  return (
    <button
      type="button"
      onClick={alTocar}
      className={cn(
        'absolute inset-x-1 z-[5] flex overflow-hidden rounded-md text-left outline-none transition-shadow hover:shadow-[0_2px_8px_-2px_rgb(0_0_0/0.25)] focus-visible:ring-2 focus-visible:ring-tinta/60',
        compacta ? 'items-center gap-2 px-2' : 'flex-col px-2 py-1',
        t.estado === 'en_sala' && 'ring-2 ring-ambar',
        terminado && 'opacity-60',
      )}
      style={{ top: top + 1, height: alto - 2, backgroundColor: suave, borderLeft: `3px solid ${fuerte}` }}
      aria-label={`${t.desde} ${t.paciente}, ${NOMBRE_ESTADO[t.estado].toLowerCase()}`}
    >
      <span className={cn('flex items-center gap-1.5', !compacta && 'w-full')}>
        <span className="numeros text-[12px] font-semibold" style={{ color: fuerte }}>
          {t.desde}
        </span>
        {compacta && <Nombre turno={t} />}
        <span
          className={cn('ml-auto inline-flex size-[18px] shrink-0 items-center justify-center rounded-full', ESTILO_ESTADO[t.estado].clase)}
          title={NOMBRE_ESTADO[t.estado]}
        >
          <Icono className="size-3" strokeWidth={2.6} aria-hidden="true" />
        </span>
      </span>
      {!compacta && <Nombre turno={t} />}
      {alto >= 64 && <span className="w-full truncate text-[12px] text-tinta-suave">{detalle}</span>}
    </button>
  );
}

function Nombre({ turno }: { turno: Turno }) {
  return (
    <span className={cn('min-w-0 truncate text-[13.5px] leading-tight font-semibold text-tinta', turno.estado === 'ausente' && 'line-through')}>
      {turno.paciente}
    </span>
  );
}
