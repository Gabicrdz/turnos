import { describe, expect, it } from 'vitest';
import { dentroDeLasFranjas, espaciosLibres, estadosPermitidos, estadosPosibles, rangoVisible, seSuperponen, sumarMinutos } from '../src/compartido/agenda';

describe('reglas de la agenda (funciones puras)', () => {
  it('dos turnos se pisan solo si se cruzan de verdad', () => {
    expect(seSuperponen({ desde: '08:00', hasta: '08:20' }, { desde: '08:10', hasta: '08:30' })).toBe(true);
    expect(seSuperponen({ desde: '08:00', hasta: '09:00' }, { desde: '08:20', hasta: '08:40' })).toBe(true); // uno adentro del otro
    expect(seSuperponen({ desde: '08:00', hasta: '08:20' }, { desde: '08:20', hasta: '08:40' })).toBe(false); // pegados
    expect(sumarMinutos('08:40', 20)).toBe('09:00');
  });

  it('los espacios libres esquivan los ocupados (aunque no estén en la grilla)', () => {
    const franjas = [{ desde: '08:00', hasta: '10:00' }];
    // Un turno corrido de 08:30 a 08:50 tapa los espacios de 08:20 y 08:40
    expect(espaciosLibres(franjas, 20, [{ desde: '08:30', hasta: '08:50' }])).toEqual(['08:00', '09:00', '09:20', '09:40']);
    expect(espaciosLibres(franjas, 20, [], 9 * 60 + 5)).toEqual(['09:20', '09:40']); // hoy a las 09:05
    expect(dentroDeLasFranjas(franjas, { desde: '09:40', hasta: '10:00' })).toBe(true);
    expect(dentroDeLasFranjas(franjas, { desde: '09:50', hasta: '10:10' })).toBe(false);
  });

  it('la máquina de estados depende del día del turno', () => {
    expect(estadosPosibles('reservado', '2026-11-20', '2026-11-16')).toEqual(['confirmado', 'cancelado']);
    expect(estadosPosibles('reservado', '2026-11-16', '2026-11-16')).toEqual(['confirmado', 'en_sala', 'atendido', 'ausente', 'cancelado']);
    expect(estadosPosibles('en_sala', '2026-11-16', '2026-11-16')).toEqual(['atendido', 'confirmado']);
    expect(estadosPosibles('cancelado', '2026-11-15', '2026-11-16')).toEqual([]);
    // Con lo ya registrado: notas → no vuelve atrás; cobrado → no vuelve a pendiente
    expect(estadosPermitidos({ estado: 'atendido', fecha: '2026-11-16', consultaId: 3, cobro: null }, '2026-11-16')).toEqual([]);
    expect(estadosPermitidos({ estado: 'en_sala', fecha: '2026-11-16', consultaId: null, cobro: {} }, '2026-11-16')).toEqual(['atendido']);
  });

  it('la grilla va de hora en punto a hora en punto', () => {
    expect(rangoVisible([{ desde: '08:20', hasta: '12:00' }, { desde: '16:00', hasta: '19:40' }])).toEqual({ desde: 480, hasta: 1200 });
    expect(rangoVisible([])).toEqual({ desde: 480, hasta: 1200 });
  });
});
