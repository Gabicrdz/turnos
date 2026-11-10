import { beforeEach, describe, expect, it } from 'vitest';
import type { BaseDeDatos } from '../src/main/db/conexion';
import { esquemaBuscarPacientes, esquemaObraSocial, esquemaPaciente } from '../src/compartido/esquemas';
import { buscarPacientes, cambiarActivoPaciente } from '../src/main/servicios/pacientes';
import { cambiarActivoObraSocial, guardarObraSocial, listarObrasSociales } from '../src/main/servicios/obras-sociales';
import { baseNueva, paciente } from './ayudantes';

let db: BaseDeDatos;
const buscar = (texto = '', extra: object = {}) => buscarPacientes(db, esquemaBuscarPacientes.parse({ texto, ...extra }));

beforeEach(() => {
  db = baseNueva();
});

describe('pacientes', () => {
  it('valida DNI, fecha y email; el DNI se guarda solo con números', () => {
    expect(() => esquemaPaciente.parse({ nombre: 'Ana', apellido: 'Paz', dni: '123' })).toThrow('7 u 8 números');
    expect(() => esquemaPaciente.parse({ nombre: 'Ana', apellido: 'Paz', fechaNacimiento: '1990-02-31' })).toThrow('no existe');
    expect(() => esquemaPaciente.parse({ nombre: 'Ana', apellido: 'Paz', email: 'ana@' })).toThrow('email');
    expect(() => esquemaPaciente.parse({ nombre: ' ', apellido: 'Paz' })).toThrow('Escribí el nombre');
    paciente(db, { nombre: 'Ana', apellido: 'Paz', dni: '30.123.456' });
    expect(buscar()[0]).toMatchObject({ dni: '30123456', obraSocial: null, fechaNacimiento: null });
  });

  it('el DNI no se repite, pero puede faltar en varios', () => {
    paciente(db, { nombre: 'Ana', apellido: 'Paz', dni: '30123456' });
    expect(() => paciente(db, { nombre: 'Otra', apellido: 'Persona', dni: '30 123 456' })).toThrow('Ese DNI ya es de Paz, Ana');
    paciente(db, { nombre: 'Sin', apellido: 'Dni1' });
    paciente(db, { nombre: 'Sin', apellido: 'Dni2' });
    expect(buscar()).toHaveLength(3);
  });

  it('no acepta fecha de nacimiento futura', () => {
    expect(() => paciente(db, { nombre: 'Ana', apellido: 'Paz', fechaNacimiento: '2999-01-01' })).toThrow('no puede ser futura');
  });

  it('busca sin tildes, por varias palabras, DNI con puntos y teléfono', () => {
    paciente(db, { nombre: 'José', apellido: 'Pérez', dni: '20345671', telefono: '370 455-1020' });
    paciente(db, { nombre: 'María José', apellido: 'Gómez', dni: '30123456' });
    paciente(db, { nombre: 'Ana', apellido: 'López' });
    expect(buscar('jose').map((p) => p.apellido)).toEqual(['Gómez', 'Pérez']); // ordenados por apellido
    expect(buscar('perez jose').map((p) => p.apellido)).toEqual(['Pérez']);
    expect(buscar('30.123.456').map((p) => p.apellido)).toEqual(['Gómez']);
    expect(buscar('4551020').map((p) => p.apellido)).toEqual(['Pérez']);
    expect(buscar('%')).toEqual([]); // los comodines de LIKE se buscan como texto
    expect(buscar('_')).toEqual([]);
  });

  it('filtra por obra social o particulares; la baja lo esconde', () => {
    const osde = guardarObraSocial(db, esquemaObraSocial.parse({ nombre: 'OSDE' }));
    const a = paciente(db, { nombre: 'Ana', apellido: 'Paz', obraSocialId: osde, numeroAfiliado: '61 1' });
    paciente(db, { nombre: 'Juan', apellido: 'Ríos', numeroAfiliado: 'no se guarda' });
    expect(buscar('', { obraSocialId: osde }).map((p) => p.apellido)).toEqual(['Paz']);
    expect(buscar('', { obraSocialId: 'particular' })).toMatchObject([{ apellido: 'Ríos', numeroAfiliado: '' }]);
    expect(listarObrasSociales(db)).toMatchObject([{ nombre: 'OSDE', pacientes: 1, activo: true }]);
    cambiarActivoPaciente(db, a, false);
    expect(buscar().map((p) => p.apellido)).toEqual(['Ríos']);
    expect(buscar('', { incluirBajas: true }).map((p) => [p.apellido, p.activo])).toEqual([['Ríos', true], ['Paz', false]]);
  });

  it('editar actualiza la búsqueda', () => {
    const id = paciente(db, { nombre: 'Ana', apellido: 'Paz' });
    paciente(db, { id, nombre: 'Ana', apellido: 'Benítez' });
    expect(buscar('paz')).toEqual([]);
    expect(buscar('benitez')).toHaveLength(1);
  });
});

describe('obras sociales', () => {
  it('no se repite el nombre (sin importar mayúsculas) y la baja la conserva', () => {
    const id = guardarObraSocial(db, esquemaObraSocial.parse({ nombre: 'PAMI' }));
    expect(() => guardarObraSocial(db, esquemaObraSocial.parse({ nombre: 'pami' }))).toThrow('Ya existe la obra social "PAMI"');
    guardarObraSocial(db, esquemaObraSocial.parse({ id, nombre: 'PAMI ' })); // renombrar a sí misma
    guardarObraSocial(db, esquemaObraSocial.parse({ nombre: 'IASEP' }));
    cambiarActivoObraSocial(db, id, false);
    expect(listarObrasSociales(db).map((o) => [o.nombre, o.activo])).toEqual([['IASEP', true], ['PAMI', false]]);
  });
});
