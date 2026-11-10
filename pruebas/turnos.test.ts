import { beforeEach, describe, expect, it } from 'vitest';
import type { BaseDeDatos } from '../src/main/db/conexion';
import { esquemaBloqueo, esquemaMoverTurno, esquemaRango, esquemaTurno, type DatosTurno } from '../src/compartido/esquemas';
import { crearBloqueo } from '../src/main/servicios/bloqueos';
import { cambiarActivoPaciente } from '../src/main/servicios/pacientes';
import { cambiarActivoProfesional } from '../src/main/servicios/profesionales';
import {
  agenda,
  cambiarEstado,
  darTurno,
  horariosLibres,
  moverTurno,
  obtenerTurno,
  proximosLibres,
  turnosDePaciente,
} from '../src/main/servicios/turnos';
import { baseNueva, paciente, profesional } from './ayudantes';

// "Ahora" fijo: lunes 16/11/2026 a las 09:00 (así las pruebas dan igual cualquier día)
const AHORA = new Date(2026, 10, 16, 9, 0);
const LUNES = '2026-11-16';
const MARTES = '2026-11-17';

const franja = (diaSemana: number, desde: string, hasta: string) => ({ diaSemana, desde, hasta });
const lunesAViernes = [1, 2, 3, 4, 5].map((d) => franja(d, '08:00', '12:00'));

let db: BaseDeDatos;
let laura: number;
let martin: number;
let juan: number;
let ana: number;

beforeEach(() => {
  db = baseNueva();
  laura = profesional(db, { horarios: lunesAViernes }); // turnos de 20 min
  martin = profesional(db, { nombre: 'Martín', apellido: 'Acosta', titulo: 'Dr.', duracionTurnoMin: 30, horarios: [franja(2, '09:00', '13:00')] });
  juan = paciente(db, { apellido: 'Pérez', nombre: 'Juan' });
  ana = paciente(db, { apellido: 'Gómez', nombre: 'Ana' });
});

const dar = (datos: Partial<DatosTurno>, ahora = AHORA) =>
  darTurno(db, esquemaTurno.parse({ profesionalId: laura, pacienteId: juan, fecha: MARTES, desde: '08:00', ...datos }), ahora);

describe('dar turnos', () => {
  it('guarda el turno con la duración del profesional', () => {
    const id = dar({ motivo: 'Control' });
    expect(obtenerTurno(db, id)).toMatchObject({ fecha: MARTES, desde: '08:00', hasta: '08:20', estado: 'reservado', motivo: 'Control', paciente: 'Pérez, Juan' });
    expect(obtenerTurno(db, dar({ desde: '09:00', pacienteId: ana, duracionMin: 40 })).hasta).toBe('09:40');
  });

  it('nunca deja que dos turnos del mismo profesional se pisen (pegados sí)', () => {
    dar({ desde: '08:00' });
    expect(() => dar({ desde: '08:10', pacienteId: ana })).toThrow('se pisa con el turno de Pérez, Juan (08:00 a 08:20)');
    expect(() => dar({ desde: '08:00', pacienteId: ana })).toThrow('se pisa');
    expect(dar({ desde: '08:20', pacienteId: ana })).toBeGreaterThan(0); // empieza justo cuando termina el otro
  });

  it('la base también se niega aunque se saltee el programa (trigger)', () => {
    dar({ desde: '08:00' });
    const insertar = () =>
      db.$client.prepare(`INSERT INTO turnos (profesional_id, paciente_id, fecha, desde, hasta) VALUES (?, ?, ?, '08:10', '08:30')`).run(laura, ana, MARTES);
    expect(insertar).toThrow('turno_superpuesto');
    // Otro profesional a la misma hora: sin problema
    db.$client.prepare(`INSERT INTO turnos (profesional_id, paciente_id, fecha, desde, hasta) VALUES (?, ?, ?, '09:00', '09:30')`).run(martin, ana, MARTES);
    // Pasarle ese turno a Laura con un UPDATE (quedaría 09:00–09:30 sobre... nada) y después pisarla: rechazado
    db.$client.prepare(`UPDATE turnos SET desde = '08:10', hasta = '08:30' WHERE profesional_id = ?`).run(martin);
    expect(() => db.$client.prepare(`UPDATE turnos SET profesional_id = ? WHERE profesional_id = ?`).run(laura, martin)).toThrow('turno_superpuesto');
  });

  it('un cancelado libera el horario; reactivarlo si ya se ocupó, no', () => {
    const primero = dar({ desde: '08:00' });
    cambiarEstado(db, primero, 'cancelado', AHORA);
    const segundo = dar({ desde: '08:00', pacienteId: ana });
    expect(() => cambiarEstado(db, primero, 'reservado', AHORA)).toThrow('se pisa con el turno de Gómez, Ana');
    cambiarEstado(db, segundo, 'cancelado', AHORA);
    cambiarEstado(db, primero, 'reservado', AHORA);
    expect(obtenerTurno(db, primero).estado).toBe('reservado');
  });

  it('el mismo paciente no puede tener dos turnos a la misma hora (aunque sea con otro profesional)', () => {
    dar({ desde: '09:00' });
    expect(() => dar({ profesionalId: martin, desde: '09:10' })).toThrow('Pérez, Juan ya tiene un turno a esa hora (09:00 con Dra. Laura Benítez)');
    expect(dar({ profesionalId: martin, desde: '09:30' })).toBeGreaterThan(0);
  });

  it('respeta el horario de atención, los días sin atención y las bajas', () => {
    expect(() => dar({ desde: '11:50' })).toThrow('fuera de la atención de Dra. Laura Benítez (ese día atiende de 08:00 a 12:00)');
    expect(() => dar({ desde: '07:40' })).toThrow('fuera de la atención');
    expect(() => dar({ fecha: '2026-11-21' })).toThrow('no atiende los sábados');
    expect(() => dar({ profesionalId: martin, fecha: LUNES, desde: '10:00' })).toThrow('no atiende los lunes');
    crearBloqueo(db, esquemaBloqueo.parse({ profesionalId: null, desde: MARTES, hasta: MARTES, motivo: 'Feriado' }));
    expect(() => dar({})).toThrow('no atiende ese día (Feriado)');
    cambiarActivoPaciente(db, ana, false);
    expect(() => dar({ fecha: LUNES, desde: '10:00', pacienteId: ana })).toThrow('Gómez, Ana está dado de baja');
    cambiarActivoProfesional(db, laura, false);
    expect(() => dar({ fecha: LUNES, desde: '10:00' })).toThrow('está dado de baja: no se le pueden dar turnos');
  });

  it('no da turnos en días que ya pasaron (hoy sí)', () => {
    expect(() => dar({ fecha: '2026-11-13' })).toThrow('días que ya pasaron');
    expect(dar({ fecha: LUNES, desde: '08:00' })).toBeGreaterThan(0); // hoy, aunque ya empezó (un paciente que llegó sin turno)
    expect(() => esquemaTurno.parse({ profesionalId: laura, pacienteId: juan, fecha: '2026-02-30', desde: '08:00' })).toThrow('no existe');
  });

  it('un bloqueo nuevo avisa cuántos turnos ya estaban dados', () => {
    dar({ desde: '08:00' });
    dar({ desde: '08:20', pacienteId: ana });
    const turnoMartin = dar({ profesionalId: martin, desde: '10:00', pacienteId: ana });
    cambiarEstado(db, turnoMartin, 'cancelado', AHORA);
    expect(crearBloqueo(db, esquemaBloqueo.parse({ profesionalId: laura, desde: MARTES, hasta: MARTES })).turnosAfectados).toBe(2);
    expect(crearBloqueo(db, esquemaBloqueo.parse({ profesionalId: martin, desde: MARTES, hasta: MARTES })).turnosAfectados).toBe(0);
  });
});

describe('estados', () => {
  it('sigue el recorrido del turno y anota la hora de llegada', () => {
    const id = dar({ fecha: LUNES, desde: '09:00' });
    cambiarEstado(db, id, 'confirmado', AHORA);
    cambiarEstado(db, id, 'en_sala', new Date(2026, 10, 16, 8, 52));
    expect(obtenerTurno(db, id)).toMatchObject({ estado: 'en_sala', llegoEn: '2026-11-16 08:52:00' });
    cambiarEstado(db, id, 'atendido', AHORA);
    expect(obtenerTurno(db, id).llegoEn).toBe('2026-11-16 08:52:00'); // se conserva
    cambiarEstado(db, id, 'en_sala', AHORA); // deshacer "atendido": mantiene la llegada
    expect(obtenerTurno(db, id).llegoEn).toBe('2026-11-16 08:52:00');
    cambiarEstado(db, id, 'confirmado', AHORA); // "no llegó todavía": se borra
    expect(obtenerTurno(db, id).llegoEn).toBeNull();
  });

  it('no deja marcar atendido o ausente un turno que todavía no llegó', () => {
    const id = dar({ fecha: MARTES });
    expect(() => cambiarEstado(db, id, 'atendido', AHORA)).toThrow('es para más adelante');
    expect(() => cambiarEstado(db, id, 'ausente', AHORA)).toThrow('es para más adelante');
    cambiarEstado(db, id, 'ausente', new Date(2026, 10, 17, 10)); // el martes sí
    expect(() => cambiarEstado(db, id, 'atendido', new Date(2026, 10, 17, 10))).toThrow('Un turno ausente no puede pasar a atendido');
  });

  it('un cancelado de un día que ya pasó no se puede reactivar', () => {
    const id = dar({ fecha: LUNES, desde: '10:00' });
    cambiarEstado(db, id, 'cancelado', AHORA);
    expect(() => cambiarEstado(db, id, 'reservado', new Date(2026, 10, 17, 9))).toThrow('ya pasó');
  });
});

describe('reprogramar', () => {
  it('mueve el turno (puede pisar su propio horario viejo) y vuelve a "reservado"', () => {
    const id = dar({ desde: '08:00' });
    cambiarEstado(db, id, 'confirmado', AHORA);
    moverTurno(db, esquemaMoverTurno.parse({ id, profesionalId: laura, fecha: MARTES, desde: '08:10' }), AHORA);
    expect(obtenerTurno(db, id)).toMatchObject({ desde: '08:10', hasta: '08:30', estado: 'reservado' });
  });

  it('a otro profesional toma su duración; y no mueve turnos ya atendidos', () => {
    const id = dar({ desde: '08:00' });
    moverTurno(db, esquemaMoverTurno.parse({ id, profesionalId: martin, fecha: MARTES, desde: '09:00' }), AHORA);
    expect(obtenerTurno(db, id)).toMatchObject({ profesionalId: martin, hasta: '09:30' });
    const otro = dar({ fecha: LUNES, desde: '08:00', pacienteId: ana });
    cambiarEstado(db, otro, 'atendido', AHORA);
    expect(() => moverTurno(db, esquemaMoverTurno.parse({ id: otro, profesionalId: laura, fecha: MARTES, desde: '10:00' }), AHORA)).toThrow(
      'ya está atendido',
    );
  });
});

describe('horarios libres y agenda', () => {
  it('ofrece solo lo libre y, hoy, solo lo que no pasó', () => {
    dar({ fecha: LUNES, desde: '09:20' });
    const libresHoy = horariosLibres(db, laura, LUNES, AHORA);
    expect(libresHoy.slice(0, 3)).toEqual(['09:00', '09:40', '10:00']);
    expect(libresHoy).toHaveLength(8); // 09:00 a 12:00 = 9 turnos, menos el ocupado
    expect(horariosLibres(db, laura, MARTES, AHORA)).toHaveLength(12);
    expect(horariosLibres(db, laura, '2026-11-13', AHORA)).toEqual([]); // ya pasó
  });

  it('los próximos libres saltean días sin atención y fines de semana', () => {
    crearBloqueo(db, esquemaBloqueo.parse({ profesionalId: martin, desde: '2026-11-17', hasta: '2026-11-17', motivo: 'Congreso' }));
    const libres = proximosLibres(db, martin, AHORA, 3);
    expect(libres).toEqual([
      { fecha: '2026-11-24', desde: '09:00' },
      { fecha: '2026-11-24', desde: '09:30' },
      { fecha: '2026-11-24', desde: '10:00' },
    ]);
  });

  it('la agenda trae turnos y bloqueos del rango, y la ficha del paciente sus turnos', () => {
    const t1 = dar({ fecha: LUNES, desde: '08:00' }, new Date(2026, 10, 16, 7));
    dar({ fecha: MARTES, desde: '08:00' });
    dar({ fecha: '2026-11-25', desde: '08:00' });
    crearBloqueo(db, esquemaBloqueo.parse({ profesionalId: null, desde: '2026-11-20', hasta: '2026-11-23', motivo: 'Feriado largo' }));
    const semana = agenda(db, esquemaRango.parse({ desde: LUNES, hasta: '2026-11-22' }));
    expect(semana.turnos.map((t) => t.fecha)).toEqual([LUNES, MARTES]);
    expect(semana.bloqueos.map((b) => b.motivo)).toEqual(['Feriado largo']);
    cambiarEstado(db, t1, 'atendido', AHORA);
    const ficha = turnosDePaciente(db, juan, new Date(2026, 10, 17, 7));
    expect(ficha.proximos.map((t) => t.fecha)).toEqual([MARTES, '2026-11-25']);
    expect(ficha.anteriores).toMatchObject([{ fecha: LUNES, estado: 'atendido', profesional: 'Dra. Laura Benítez', color: 'eucalipto' }]);
    expect(() => esquemaRango.parse({ desde: '2026-11-01', hasta: '2026-12-31' })).toThrow('42 días');
  });
});
