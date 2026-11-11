/** Círculo con las iniciales del usuario. */
export function Iniciales({ nombre, grande = false }: { nombre: string; grande?: boolean }) {
  const letras = nombre
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <span
      aria-hidden="true"
      className={
        grande
          ? 'flex size-20 items-center justify-center rounded-full bg-acento font-display text-3xl font-semibold text-white'
          : 'flex size-11 shrink-0 items-center justify-center rounded-full bg-acento-suave font-display text-[16px] font-semibold text-acento-fuerte'
      }
    >
      {letras}
    </span>
  );
}
