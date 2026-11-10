// Datos de ejemplo para probar sin cargar todo a mano: un consultorio chico
// de Formosa con 3 profesionales, obras sociales comunes y 30 pacientes.
// Solo se puede cargar si todavía no hay pacientes.
import type { BaseDeDatos } from '../db/conexion';
import { esquemaObraSocial, esquemaPaciente, esquemaProfesional } from '@compartido/esquemas';
import type { Resumen } from '@compartido/tipos';
import { ErrorDeUsuario } from './errores';
import { guardarObraSocial } from './obras-sociales';
import { guardarPaciente } from './pacientes';
import { guardarProfesional } from './profesionales';
import { resumen } from './consultorio';

const OBRAS_SOCIALES = ['IASEP', 'PAMI', 'OSDE', 'Swiss Medical', 'OSECAC', 'Sancor Salud', 'Galeno', 'OSPRERA'];

const dias = (lista: number[], desde: string, hasta: string) => lista.map((diaSemana) => ({ diaSemana, desde, hasta }));

const PROFESIONALES = [
  {
    titulo: 'Dra.', nombre: 'Laura', apellido: 'Benítez', especialidad: 'Clínica médica', matricula: 'MP 4521', color: 'eucalipto' as const,
    duracionTurnoMin: 20,
    horarios: [...dias([1, 2, 3, 4, 5], '08:00', '12:00'), ...dias([1, 3, 5], '16:00', '20:00')],
  },
  {
    titulo: 'Dr.', nombre: 'Martín', apellido: 'Acosta', especialidad: 'Pediatría', matricula: 'MP 3877', color: 'ciruela' as const,
    duracionTurnoMin: 30,
    horarios: [...dias([2, 4], '09:00', '13:00'), ...dias([2, 4], '17:00', '20:00'), ...dias([6], '09:00', '12:00')],
  },
  {
    titulo: 'Lic.', nombre: 'Sofía', apellido: 'Ríos', especialidad: 'Nutrición', matricula: 'MP 1290', color: 'ocre' as const,
    duracionTurnoMin: 40,
    horarios: dias([1, 3], '15:00', '19:00'),
  },
];

// [apellido, nombre, dni, nacimiento, teléfono, obra social (índice o null = particular), afiliado]
const PACIENTES: [string, string, string, string, string, number | null, string][] = [
  ['Aguirre', 'Ramón', '14567890', '1958-03-12', '370 455-1020', 1, '15-14567890-03'],
  ['Álvarez', 'Micaela', '38901234', '1995-07-21', '370 412-3344', 0, '201554'],
  ['Benítez', 'Juan Cruz', '52345678', '2016-11-02', '370 466-7788', 0, '201555'],
  ['Cabrera', 'Silvia', '22456789', '1971-01-30', '370 433-1122', 2, '61 123456 7'],
  ['Cáceres', 'Nahuel', '45678123', '2004-05-17', '370 498-5566', null, ''],
  ['Duarte', 'Graciela', '11234567', '1949-09-08', '370 421-9090', 1, '15-11234567-01'],
  ['Escobar', 'Lucas', '40123987', '1997-12-03', '370 477-2211', 4, 'O-889912'],
  ['Fernández', 'Ana María', '17890456', '1965-04-25', '370 455-6677', 0, '198732'],
  ['Figueredo', 'Tomás', '55123456', '2019-02-14', '370 466-1010', 3, '0012-77'],
  ['Giménez', 'Rocío', '36789012', '1992-08-09', '370 411-8899', 5, 'SS-55210'],
  ['González', 'Héctor', '20345671', '1968-10-19', '370 499-3030', 4, 'O-771204'],
  ['Ibáñez', 'Valentina', '47890123', '2006-03-28', '370 432-4545', null, ''],
  ['Leiva', 'Marcos', '33456120', '1988-06-11', '370 481-6060', 0, '210098'],
  ['López', 'Carmen', '9876543', '1944-12-24', '370 425-7070', 1, '15-09876543-02'],
  ['Martínez', 'Agustina', '42345678', '2000-01-15', '370 444-1212', 2, '61 998877 1'],
  ['Medina', 'Pablo', '28901234', '1981-07-07', '370 455-3434', 6, 'G-123987'],
  ['Morínigo', 'Celeste', '53987654', '2017-09-30', '370 466-9898', 0, '220341'],
  ['Núñez', 'Ricardo', '16543210', '1963-02-02', '370 412-5656', 1, '15-16543210-00'],
  ['Ojeda', 'Florencia', '39012345', '1996-11-12', '370 477-8080', null, ''],
  ['Ortiz', 'Daniel', '25678901', '1976-05-05', '370 488-2323', 7, 'R-55120'],
  ['Paredes', 'Lourdes', '43219876', '2001-08-18', '370 433-6767', 0, '215560'],
  ['Pereyra', 'Emilio', '56789012', '2020-04-04', '370 466-2424', 3, '0045-12'],
  ['Ramírez', 'Teresa', '13456789', '1956-06-26', '370 421-1313', 1, '15-13456789-04'],
  ['Romero', 'Facundo', '37890123', '1994-10-01', '370 499-4747', 4, 'O-661245'],
  ['Sánchez', 'Elena', '24567890', '1974-03-16', '370 455-8181', 5, 'SS-40018'],
  ['Sosa', 'Matías', '41234567', '1999-12-29', '370 411-9292', null, ''],
  ['Torres', 'Liliana', '19876543', '1967-07-13', '370 432-1515', 2, '61 552210 4'],
  ['Vera', 'Joaquín', '54321098', '2018-01-20', '370 477-3636', 0, '221870'],
  ['Villalba', 'Norma', '12345678', '1952-11-05', '370 425-6464', 1, '15-12345678-05'],
  ['Zárate', 'Gustavo', '30123456', '1983-09-22', '370 488-9595', 6, 'G-334410'],
];

export function cargarEjemplo(db: BaseDeDatos): Resumen {
  if ((db.$client.prepare('SELECT count(*) AS n FROM pacientes').get() as { n: number }).n > 0) {
    throw new ErrorDeUsuario('Ya hay pacientes cargados: los datos de ejemplo son solo para un consultorio vacío.');
  }
  db.$client.transaction(() => {
    // Reutiliza obras sociales que ya existan con el mismo nombre
    const ids = OBRAS_SOCIALES.map((nombre) => {
      const existe = db.$client.prepare('SELECT id FROM obras_sociales WHERE nombre = ? COLLATE NOCASE').get(nombre) as { id: number } | undefined;
      return existe?.id ?? guardarObraSocial(db, esquemaObraSocial.parse({ nombre }));
    });
    const hayProfesionales = (db.$client.prepare('SELECT count(*) AS n FROM profesionales').get() as { n: number }).n > 0;
    if (!hayProfesionales) for (const p of PROFESIONALES) guardarProfesional(db, esquemaProfesional.parse(p));
    for (const [apellido, nombre, dni, fechaNacimiento, telefono, os, numeroAfiliado] of PACIENTES) {
      guardarPaciente(
        db,
        esquemaPaciente.parse({ apellido, nombre, dni, fechaNacimiento, telefono, obraSocialId: os === null ? null : ids[os], numeroAfiliado }),
      );
    }
  })();
  return resumen(db);
}
