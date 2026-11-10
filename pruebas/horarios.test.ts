import { describe, expect, it } from 'vitest';
import { aHora, aMinutos, diaDeLaSemana, esHora, horariosDeTurno, resumenDeHorario, turnosPorSemana } from '../src/compartido/horarios';

describe('horarios', () => {
  it('horas y minutos', () => {
    expect(esHora('08:30')).toBe(true);
    expect(esHora('8:30')).toBe(false);
    expect(esHora('24:00')).toBe(false);
    expect(aMinutos('08:30')).toBe(510);
    expect(aHora(510)).toBe('08:30');
  });

  it('horarios de turno: solo los que entran enteros en la franja', () => {
    expect(horariosDeTurno([{ desde: '08:00', hasta: '09:00' }], 20)).toEqual(['08:00', '08:20', '08:40']);
    expect(horariosDeTurno([{ desde: '08:00', hasta: '09:00' }], 25)).toEqual(['08:00', '08:25']); // 08:50 no entra
    // dos franjas, desordenadas
    expect(horariosDeTurno([{ desde: '16:00', hasta: '17:00' }, { desde: '08:00', hasta: '09:00' }], 30)).toEqual(['08:00', '08:30', '16:00', '16:30']);
  });

  it('día de la semana (1 = lunes … 7 = domingo)', () => {
    expect(diaDeLaSemana('2026-11-09')).toBe(1); // lunes
    expect(diaDeLaSemana('2026-11-15')).toBe(7); // domingo
  });

  it('resumen del horario agrupa días seguidos iguales', () => {
    const f = (dias: number[], desde: string, hasta: string) => dias.map((diaSemana) => ({ diaSemana, desde, hasta }));
    expect(resumenDeHorario([])).toBe('Sin horario cargado');
    expect(resumenDeHorario(f([1, 2, 3, 4, 5], '08:00', '12:00'))).toBe('Lun a Vie 08:00–12:00');
    expect(resumenDeHorario([...f([1, 3], '15:00', '19:00')])).toBe('Lun 15:00–19:00 · Mié 15:00–19:00');
    expect(resumenDeHorario([...f([2, 3], '09:00', '13:00'), ...f([2, 3], '17:00', '20:00'), ...f([6], '09:00', '12:00')])).toBe(
      'Mar y Mié 09:00–13:00 y 17:00–20:00 · Sáb 09:00–12:00',
    );
    expect(turnosPorSemana(f([1, 2], '08:00', '10:00'), 30)).toBe(8);
  });
});
