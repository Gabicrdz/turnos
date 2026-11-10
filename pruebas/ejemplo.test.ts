import { describe, expect, it } from 'vitest';
import { cargarEjemplo, cargarTurnosEjemplo } from '../src/main/servicios/ejemplo';
import { seSuperponen } from '../src/compartido/agenda';
import { listarProfesionales } from '../src/main/servicios/profesionales';
import { obtenerConsultorio } from '../src/main/servicios/consultorio';
import { baseNueva, paciente } from './ayudantes';

describe('datos de ejemplo', () => {
  it('carga 3 profesionales, 8 obras sociales y 30 pacientes; solo en un consultorio vacío', () => {
    const db = baseNueva();
    expect(cargarEjemplo(db)).toMatchObject({ pacientes: 30, profesionales: 3, obrasSociales: 8 });
    expect(listarProfesionales(db).map((p) => p.horarios.length)).toEqual([5, 8, 2]); // Acosta, Benítez, Ríos
    expect(() => cargarEjemplo(db)).toThrow('Ya hay pacientes');
    expect(obtenerConsultorio(db)).toMatchObject({ nombreConsultorio: 'Mi Consultorio', direccion: '', telefono: '' });
    expect(obtenerConsultorio(db).mensajeRecordatorio).toContain('{profesional}');
  });

  it('no duplica profesionales si ya había', () => {
    const db = baseNueva();
    db.$client.exec("INSERT INTO profesionales (nombre, apellido) VALUES ('Propio', 'Profesional')");
    cargarEjemplo(db);
    expect(listarProfesionales(db)).toHaveLength(1);
    expect(() => paciente(db, { nombre: 'X', apellido: 'Y', dni: '30123456' })).toThrow('Ese DNI ya es de Zárate, Gustavo');
  });

  it('carga cuatro semanas de turnos sin superposiciones y con estados que tienen sentido', () => {
    const db = baseNueva();
    const ahora = new Date(2026, 10, 16, 10, 5); // lunes 16/11, 10:05
    cargarEjemplo(db, ahora);
    const turnos = db.$client.prepare('SELECT profesional_id AS p, paciente_id AS pac, fecha, desde, hasta, estado FROM turnos').all() as {
      p: number;
      pac: number;
      fecha: string;
      desde: string;
      hasta: string;
      estado: string;
    }[];
    expect(turnos.length).toBeGreaterThan(150);
    const activos = turnos.filter((t) => t.estado !== 'cancelado');
    for (const a of activos) {
      const pisados = activos.filter((b) => b !== a && b.fecha === a.fecha && (b.p === a.p || b.pac === a.pac) && seSuperponen(a, b));
      expect(pisados, `${a.fecha} ${a.desde}`).toHaveLength(0);
    }
    // Los pasados ya están resueltos; los futuros, pendientes
    expect(turnos.filter((t) => t.fecha < '2026-11-16' && ['reservado', 'confirmado', 'en_sala'].includes(t.estado))).toHaveLength(0);
    expect(turnos.filter((t) => t.fecha > '2026-11-16' && ['atendido', 'ausente', 'en_sala'].includes(t.estado))).toHaveLength(0);
    // "En sala" solo el que está en curso ahora (10:05)
    expect(turnos.filter((t) => t.estado === 'en_sala' && !(t.fecha === '2026-11-16' && t.desde <= '10:05' && '10:05' < t.hasta))).toHaveLength(0);
    expect(() => cargarTurnosEjemplo(db, ahora)).toThrow('Ya hay turnos');
    // Etapa 3: cada atendido tiene sus notas; los de días anteriores, también su cobro
    const cuenta = (sql: string) => (db.$client.prepare(sql).get() as { n: number }).n;
    expect(cuenta(`SELECT count(*) AS n FROM turnos t LEFT JOIN consultas c ON c.turno_id = t.id WHERE t.estado = 'atendido' AND c.id IS NULL`)).toBe(0);
    expect(cuenta(`SELECT count(*) AS n FROM turnos t LEFT JOIN cobros c ON c.turno_id = t.id WHERE t.estado = 'atendido' AND t.fecha < '2026-11-16' AND c.id IS NULL`)).toBe(0);
    expect(cuenta(`SELECT count(*) AS n FROM cobros c JOIN turnos t ON t.id = c.turno_id WHERE t.estado NOT IN ('atendido', 'en_sala')`)).toBe(0);
  });
});
