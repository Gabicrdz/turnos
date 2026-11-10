// Reglas de los datos que viajan de la ventana al proceso main.
// Zod las revisa en el main (nunca confiamos en lo que manda la ventana) y
// TypeScript saca de acá los tipos, así la ventana y el main hablan igual.
import { z } from 'zod';
import { aMinutos, esHora } from './horarios';
import { ESTADOS } from './agenda';

export const id = z.number().int().positive();
const texto = (campo: string, maximo: number) =>
  z
    .string()
    .trim()
    .min(1, `Escribí ${campo}.`)
    .max(maximo, `${campo[0]?.toUpperCase()}${campo.slice(1)}: máximo ${maximo} caracteres.`);
const textoOpcional = (maximo: number) => z.string().trim().max(maximo, `Máximo ${maximo} caracteres.`).default('');

/** 'AAAA-MM-DD' que además sea una fecha REAL (SQLite no lo controla: '2026-02-31' pasaría). */
export const esquemaFecha = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha no es válida.')
  .refine((f) => {
    const [a, m, d] = f.split('-').map(Number) as [number, number, number];
    const fecha = new Date(a, m - 1, d);
    return fecha.getFullYear() === a && fecha.getMonth() === m - 1 && fecha.getDate() === d;
  }, 'Esa fecha no existe.');

export const esquemaHora = z.string().refine(esHora, 'La hora tiene que ser como 08:30.');

/** Solo los números del DNI: "30.123.456" → "30123456". */
export function limpiarDni(dni: string): string {
  return dni.replace(/\D/g, '');
}

// ---------- Obras sociales ----------
export const esquemaObraSocial = z.object({
  id: id.optional(),
  nombre: texto('el nombre de la obra social', 60),
});
export type DatosObraSocial = z.input<typeof esquemaObraSocial>;

// ---------- Profesionales ----------
export const COLORES_PROFESIONAL = ['eucalipto', 'pizarra', 'ciruela', 'ocre', 'coral', 'musgo'] as const;
export const DURACIONES = [10, 15, 20, 30, 40, 45, 60, 90] as const;

export const esquemaFranja = z
  .object({
    diaSemana: z.number().int().min(1).max(7),
    desde: esquemaHora,
    hasta: esquemaHora,
  })
  .refine((f) => aMinutos(f.desde) < aMinutos(f.hasta), { message: 'En cada franja, "desde" tiene que ser antes que "hasta".' });

export const esquemaProfesional = z
  .object({
    id: id.optional(),
    titulo: textoOpcional(10),
    nombre: texto('el nombre', 40),
    apellido: texto('el apellido', 40),
    especialidad: textoOpcional(60),
    matricula: textoOpcional(30),
    color: z.enum(COLORES_PROFESIONAL).default('eucalipto'),
    duracionTurnoMin: z.number().int().min(5, 'El turno dura al menos 5 minutos.').max(240, 'El turno dura como máximo 4 horas.'),
    /** Lo que cobra una consulta particular (se propone al cobrar). 0 = sin precio cargado. */
    precioConsultaCentavos: z.number().int().min(0).max(100_000_000, 'El precio es demasiado alto.').default(0),
    horarios: z.array(esquemaFranja).max(50),
  })
  .superRefine((p, ctx) => {
    // Dos franjas del mismo día no se pueden pisar (09–13 y 12–16).
    for (let dia = 1; dia <= 7; dia++) {
      const delDia = p.horarios.filter((h) => h.diaSemana === dia).sort((a, b) => aMinutos(a.desde) - aMinutos(b.desde));
      for (let i = 1; i < delDia.length; i++) {
        if (aMinutos(delDia[i]!.desde) < aMinutos(delDia[i - 1]!.hasta)) {
          ctx.addIssue({ code: 'custom', message: `Hay dos franjas que se pisan el ${NOMBRE_DIA[dia]}.`, path: ['horarios'] });
          return;
        }
      }
    }
  });
export type DatosProfesional = z.input<typeof esquemaProfesional>;

export const NOMBRE_DIA: Record<number, string> = {
  1: 'lunes',
  2: 'martes',
  3: 'miércoles',
  4: 'jueves',
  5: 'viernes',
  6: 'sábado',
  7: 'domingo',
};

// ---------- Días sin atención ----------
export const esquemaBloqueo = z
  .object({
    profesionalId: id.nullable(), // null = todo el consultorio
    desde: esquemaFecha,
    hasta: esquemaFecha,
    motivo: textoOpcional(80),
  })
  .refine((b) => b.desde <= b.hasta, { message: '"Hasta" no puede ser antes que "desde".', path: ['hasta'] });
export type DatosBloqueo = z.input<typeof esquemaBloqueo>;

// ---------- Pacientes ----------
export const esquemaPaciente = z.object({
  id: id.optional(),
  nombre: texto('el nombre', 40),
  apellido: texto('el apellido', 40),
  dni: z
    .string()
    .trim()
    .default('')
    .transform(limpiarDni)
    .refine((d) => d === '' || (d.length >= 7 && d.length <= 8), 'El DNI tiene que tener 7 u 8 números.'),
  fechaNacimiento: z.union([esquemaFecha, z.literal('')]).default(''),
  telefono: textoOpcional(30),
  email: z.union([z.literal(''), z.string().trim().email('El email no es válido.').max(80)]).default(''),
  obraSocialId: id.nullable().default(null),
  numeroAfiliado: textoOpcional(30),
  notas: textoOpcional(300),
});
export type DatosPaciente = z.input<typeof esquemaPaciente>;

export const esquemaBuscarPacientes = z.object({
  texto: z.string().trim().max(60).default(''),
  obraSocialId: z.union([id, z.literal('particular')]).nullable().default(null),
  incluirBajas: z.boolean().default(false),
});
export type DatosBuscarPacientes = z.input<typeof esquemaBuscarPacientes>;

// ---------- Consultorio ----------
export const esquemaConsultorio = z.object({
  nombreConsultorio: texto('el nombre del consultorio', 50),
  direccion: textoOpcional(80),
  telefono: textoOpcional(40),
});

export const esquemaMensajeRecordatorio = texto('el mensaje del recordatorio', 600);
export type DatosConsultorio = z.input<typeof esquemaConsultorio>;

// ---------- Turnos ----------
export const esquemaEstado = z.enum(ESTADOS);

export const esquemaTurno = z.object({
  profesionalId: id,
  pacienteId: id,
  fecha: esquemaFecha,
  desde: esquemaHora,
  /** Si no viene, se usa la duración de turno del profesional. */
  duracionMin: z.number().int().min(5).max(240).optional(),
  motivo: textoOpcional(80),
});
export type DatosTurno = z.input<typeof esquemaTurno>;

/** Reprogramar: otro día, otra hora y/o otro profesional. */
export const esquemaMoverTurno = z.object({
  id,
  profesionalId: id,
  fecha: esquemaFecha,
  desde: esquemaHora,
});
export type DatosMoverTurno = z.input<typeof esquemaMoverTurno>;

const MAXIMO_DIAS_AGENDA = 42;
/** Un rango de días para la agenda (la semana, o un día solo). */
export const esquemaRango = z
  .object({ desde: esquemaFecha, hasta: esquemaFecha })
  .refine((r) => r.desde <= r.hasta, { message: '"Hasta" no puede ser antes que "desde".' })
  .refine((r) => (Date.parse(r.hasta) - Date.parse(r.desde)) / 86_400_000 < MAXIMO_DIAS_AGENDA, {
    message: `La agenda se pide de a ${MAXIMO_DIAS_AGENDA} días como máximo.`,
  });
export type DatosRango = z.input<typeof esquemaRango>;

// ---------- Consultas (historia clínica) ----------
export const esquemaConsulta = z.object({
  turnoId: id,
  motivo: textoOpcional(120),
  evolucion: texto('la evolución (qué se vio en la consulta)', 4000),
  diagnostico: textoOpcional(200),
  indicaciones: textoOpcional(2000),
});
export type DatosConsulta = z.input<typeof esquemaConsulta>;

// ---------- Cobros ----------
export const METODOS = ['efectivo', 'transferencia', 'debito', 'credito'] as const;
export const NOMBRE_METODO: Record<(typeof METODOS)[number], string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  debito: 'Débito',
  credito: 'Crédito',
};

export const esquemaCobro = z
  .object({
    turnoId: id,
    tipo: z.enum(['particular', 'obra_social']),
    obraSocialId: id.nullable().default(null),
    numeroAutorizacion: textoOpcional(40),
    /** Lo que paga el paciente: la consulta particular, o el copago / plus con obra social. */
    montoCentavos: z.number().int().min(0).max(100_000_000, 'El importe es demasiado alto.'),
    metodo: z.enum(METODOS).nullable().default(null),
  })
  .superRefine((c, ctx) => {
    if (c.tipo === 'particular' && c.montoCentavos === 0) ctx.addIssue({ code: 'custom', message: 'Escribí cuánto paga.', path: ['montoCentavos'] });
    if (c.tipo === 'obra_social' && c.obraSocialId === null) ctx.addIssue({ code: 'custom', message: 'Elegí la obra social.', path: ['obraSocialId'] });
    if (c.montoCentavos > 0 && c.metodo === null) ctx.addIssue({ code: 'custom', message: 'Elegí cómo paga.', path: ['metodo'] });
  })
  // Sin importe, el método no tiene sentido; con particular, la obra social tampoco
  .transform((c) => ({ ...c, metodo: c.montoCentavos > 0 ? c.metodo : null, obraSocialId: c.tipo === 'particular' ? null : c.obraSocialId }));
export type DatosCobro = z.input<typeof esquemaCobro>;
