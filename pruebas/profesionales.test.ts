import { beforeEach, describe, expect, it } from 'vitest';
import type { BaseDeDatos } from '../src/main/db/conexion';
import { esquemaBloqueo, esquemaProfesional } from '../src/compartido/esquemas';
import { cambiarActivoProfesional, listarProfesionales, nombreProfesional } from '../src/main/servicios/profesionales';
import { bloqueosProximos, borrarBloqueo, crearBloqueo, estaBloqueado } from '../src/main/servicios/bloqueos';
import { baseNueva, profesional } from './ayudantes';

let db: BaseDeDatos;
beforeEach(() => {
  db = baseNueva();
});

const franja = (diaSemana: number, desde: string, hasta: string) => ({ diaSemana, desde, hasta });

describe('profesionales', () => {
  it('guarda con su horario y al editar REEMPLAZA las franjas', () => {
    const id = profesional(db, { horarios: [franja(1, '08:00', '12:00'), franja(1, '16:00', '20:00')] });
    expect(listarProfesionales(db)[0]).toMatchObject({ apellido: 'Benítez', duracionTurnoMin: 20, color: 'eucalipto', horarios: [franja(1, '08:00', '12:00'), franja(1, '16:00', '20:00')] });
    profesional(db, { id, duracionTurnoMin: 30, horarios: [franja(3, '09:00', '13:00')] });
    expect(listarProfesionales(db)[0]).toMatchObject({ duracionTurnoMin: 30, horarios: [franja(3, '09:00', '13:00')] });
    expect(nombreProfesional(listarProfesionales(db)[0]!)).toBe('Dra. Laura Benítez');
  });

  it('rechaza franjas que se pisan o al revés, y horas mal escritas', () => {
    const base = { nombre: 'A', apellido: 'B', duracionTurnoMin: 20 };
    expect(() => esquemaProfesional.parse({ ...base, horarios: [franja(2, '09:00', '13:00'), franja(2, '12:00', '16:00')] })).toThrow('se pisan el martes');
    expect(() => esquemaProfesional.parse({ ...base, horarios: [franja(2, '13:00', '09:00')] })).toThrow('antes que');
    expect(() => esquemaProfesional.parse({ ...base, horarios: [franja(2, '9:00', '13:00')] })).toThrow('como 08:30');
    expect(() => esquemaProfesional.parse({ ...base, duracionTurnoMin: 2, horarios: [] })).toThrow('al menos 5');
    // pegadas (13:00 termina, 13:00 empieza) sí se puede
    expect(esquemaProfesional.parse({ ...base, horarios: [franja(2, '09:00', '13:00'), franja(2, '13:00', '16:00')] }).horarios).toHaveLength(2);
  });

  it('si falla al guardar, el horario anterior queda intacto', () => {
    const id = profesional(db, { horarios: [franja(1, '08:00', '12:00')] });
    const malo = esquemaProfesional.parse({ id, nombre: 'Laura', apellido: 'Benítez', duracionTurnoMin: 20, horarios: [franja(1, '08:00', '12:00')] });
    db.$client.exec('CREATE TRIGGER romper BEFORE INSERT ON horarios BEGIN SELECT RAISE(ABORT, \'falla a propósito\'); END;');
    expect(() => profesional(db, { ...malo, horarios: [franja(5, '10:00', '11:00')] })).toThrow();
    db.$client.exec('DROP TRIGGER romper');
    expect(listarProfesionales(db)[0]!.horarios).toEqual([franja(1, '08:00', '12:00')]);
  });

  it('dar de baja lo deja último', () => {
    const a = profesional(db, { apellido: 'Acosta' });
    profesional(db, { apellido: 'Zárate' });
    cambiarActivoProfesional(db, a, false);
    expect(listarProfesionales(db).map((p) => [p.apellido, p.activo])).toEqual([['Zárate', true], ['Acosta', false]]);
  });
});

describe('días sin atención', () => {
  it('para todos o para un profesional; los vencidos no se listan', () => {
    const laura = profesional(db);
    const otro = profesional(db, { apellido: 'Acosta', titulo: 'Dr.', nombre: 'Martín' });
    const hoy = new Date(2026, 10, 10, 9);
    crearBloqueo(db, esquemaBloqueo.parse({ profesionalId: null, desde: '2026-11-20', hasta: '2026-11-20', motivo: 'Feriado' }));
    crearBloqueo(db, esquemaBloqueo.parse({ profesionalId: laura, desde: '2026-11-10', hasta: '2026-11-14', motivo: 'Congreso' }));
    const viejo = crearBloqueo(db, esquemaBloqueo.parse({ profesionalId: laura, desde: '2026-10-01', hasta: '2026-10-05' }));
    expect(bloqueosProximos(db, hoy).map((b) => [b.quien, b.desde, b.motivo])).toEqual([
      ['Dra. Laura Benítez', '2026-11-10', 'Congreso'],
      ['Todo el consultorio', '2026-11-20', 'Feriado'],
    ]);
    expect(estaBloqueado(db, laura, '2026-11-12')).toBe(true);
    expect(estaBloqueado(db, otro, '2026-11-12')).toBe(false);
    expect(estaBloqueado(db, otro, '2026-11-20')).toBe(true);
    borrarBloqueo(db, viejo);
    expect(() => borrarBloqueo(db, viejo)).toThrow('ya no existe');
    expect(() => esquemaBloqueo.parse({ profesionalId: null, desde: '2026-11-20', hasta: '2026-11-19' })).toThrow('no puede ser antes');
  });
});
