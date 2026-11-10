import { describe, expect, it } from 'vitest';
import { cargarEjemplo } from '../src/main/servicios/ejemplo';
import { listarProfesionales } from '../src/main/servicios/profesionales';
import { obtenerConsultorio } from '../src/main/servicios/consultorio';
import { baseNueva, paciente } from './ayudantes';

describe('datos de ejemplo', () => {
  it('carga 3 profesionales, 8 obras sociales y 30 pacientes; solo en un consultorio vacío', () => {
    const db = baseNueva();
    expect(cargarEjemplo(db)).toEqual({ pacientes: 30, profesionales: 3, obrasSociales: 8 });
    expect(listarProfesionales(db).map((p) => p.horarios.length)).toEqual([5, 8, 2]); // Acosta, Benítez, Ríos
    expect(() => cargarEjemplo(db)).toThrow('Ya hay pacientes');
    expect(obtenerConsultorio(db)).toEqual({ nombreConsultorio: 'Mi Consultorio', direccion: '', telefono: '' });
  });

  it('no duplica profesionales si ya había', () => {
    const db = baseNueva();
    db.$client.exec("INSERT INTO profesionales (nombre, apellido) VALUES ('Propio', 'Profesional')");
    cargarEjemplo(db);
    expect(listarProfesionales(db)).toHaveLength(1);
    expect(() => paciente(db, { nombre: 'X', apellido: 'Y', dni: '30123456' })).toThrow('Ese DNI ya es de Zárate, Gustavo');
  });
});
