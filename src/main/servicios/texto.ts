// Ayudas para buscar texto en SQLite.

/** "José Pérez" → "jose perez" (sin tildes, minúsculas). */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * En LIKE, "%" y "_" son comodines. Si alguien busca "50%" lo tomaríamos como
 * "50 y cualquier cosa". Los "escapamos" con \ (y la consulta dice ESCAPE '\').
 */
export function escaparLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (c) => `\\${c}`);
}
