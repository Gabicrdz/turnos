import { abrirBaseDeDatos, cerrarBaseDeDatos, type BaseDeDatos } from '../src/main/db/conexion';
import { esquemaPaciente, esquemaProfesional, type DatosPaciente, type DatosProfesional } from '../src/compartido/esquemas';
import { guardarPaciente } from '../src/main/servicios/pacientes';
import { guardarProfesional } from '../src/main/servicios/profesionales';

/** Una base nueva y vacía, en memoria, para cada prueba. */
export function baseNueva(): BaseDeDatos {
  cerrarBaseDeDatos();
  return abrirBaseDeDatos(':memory:');
}

/** Guarda un paciente pasando por Zod, igual que cuando llega de la ventana. */
export function paciente(db: BaseDeDatos, datos: DatosPaciente) {
  return guardarPaciente(db, esquemaPaciente.parse(datos));
}

export function profesional(db: BaseDeDatos, datos: Partial<DatosProfesional> = {}) {
  return guardarProfesional(
    db,
    esquemaProfesional.parse({ nombre: 'Laura', apellido: 'Benítez', titulo: 'Dra.', duracionTurnoMin: 20, horarios: [], ...datos }),
  );
}
