import { useEffect, useState } from 'react';

/** La hora actual, actualizada cada 30 segundos (para la línea roja, los libres de hoy y las esperas). */
export function useAhora(): Date {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setAhora(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  return ahora;
}
