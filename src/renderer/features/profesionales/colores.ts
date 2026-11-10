import type { ColorProfesional } from '@compartido/tipos';

/** Cada color tiene una versión fuerte (texto, punto) y una suave (fondo). Están en index.css. */
export const COLOR: Record<ColorProfesional, { fuerte: string; suave: string; nombre: string }> = {
  eucalipto: { fuerte: 'var(--prof-eucalipto)', suave: 'var(--prof-eucalipto-suave)', nombre: 'Eucalipto' },
  pizarra: { fuerte: 'var(--prof-pizarra)', suave: 'var(--prof-pizarra-suave)', nombre: 'Pizarra' },
  ciruela: { fuerte: 'var(--prof-ciruela)', suave: 'var(--prof-ciruela-suave)', nombre: 'Ciruela' },
  ocre: { fuerte: 'var(--prof-ocre)', suave: 'var(--prof-ocre-suave)', nombre: 'Ocre' },
  coral: { fuerte: 'var(--prof-coral)', suave: 'var(--prof-coral-suave)', nombre: 'Coral' },
  musgo: { fuerte: 'var(--prof-musgo)', suave: 'var(--prof-musgo-suave)', nombre: 'Musgo' },
};

export const nombreCompleto = (p: { titulo: string; nombre: string; apellido: string }) => [p.titulo, p.nombre, p.apellido].filter(Boolean).join(' ');
