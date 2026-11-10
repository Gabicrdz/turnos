// El contrato entre la ventana y el main: qué funciones existen, qué reciben
// y qué devuelven. El preload lo implementa; la ventana lo usa como window.turnos.
import type {
  DatosBloqueo,
  DatosBuscarPacientes,
  DatosConsultorio,
  DatosMoverTurno,
  DatosObraSocial,
  DatosPaciente,
  DatosProfesional,
  DatosRango,
  DatosTurno,
} from './esquemas';
import type { EstadoTurno } from './agenda';
import type {
  Agenda,
  Bloqueo,
  BloqueoCreado,
  Consultorio,
  HorarioLibre,
  InfoSistema,
  ObraSocial,
  Paciente,
  Profesional,
  Respuesta,
  Resumen,
  TurnosDePaciente,
} from './tipos';

export interface ApiTurnos {
  pacientes: {
    buscar(filtro: DatosBuscarPacientes): Promise<Respuesta<Paciente[]>>;
    guardar(datos: DatosPaciente): Promise<Respuesta<number>>;
    cambiarActivo(id: number, activo: boolean): Promise<Respuesta<null>>;
  };
  profesionales: {
    listar(): Promise<Respuesta<Profesional[]>>;
    guardar(datos: DatosProfesional): Promise<Respuesta<number>>;
    cambiarActivo(id: number, activo: boolean): Promise<Respuesta<null>>;
  };
  bloqueos: {
    /** Los que terminan hoy o después (los viejos no hacen falta). */
    proximos(): Promise<Respuesta<Bloqueo[]>>;
    crear(datos: DatosBloqueo): Promise<Respuesta<BloqueoCreado>>;
    borrar(id: number): Promise<Respuesta<null>>;
  };
  turnos: {
    /** Turnos y días sin atención de un rango (un día o una semana). */
    agenda(rango: DatosRango): Promise<Respuesta<Agenda>>;
    /** Horarios libres de un profesional en un día (sin los que ya pasaron). */
    libres(profesionalId: number, fecha: string): Promise<Respuesta<string[]>>;
    /** Los próximos horarios libres de un profesional, desde ahora. */
    proximosLibres(profesionalId: number): Promise<Respuesta<HorarioLibre[]>>;
    dar(datos: DatosTurno): Promise<Respuesta<number>>;
    mover(datos: DatosMoverTurno): Promise<Respuesta<null>>;
    cambiarEstado(id: number, estado: EstadoTurno): Promise<Respuesta<null>>;
    dePaciente(pacienteId: number): Promise<Respuesta<TurnosDePaciente>>;
  };
  obrasSociales: {
    listar(): Promise<Respuesta<ObraSocial[]>>;
    guardar(datos: DatosObraSocial): Promise<Respuesta<number>>;
    cambiarActivo(id: number, activo: boolean): Promise<Respuesta<null>>;
  };
  consultorio: {
    obtener(): Promise<Respuesta<Consultorio>>;
    guardar(datos: DatosConsultorio): Promise<Respuesta<null>>;
  };
  sistema: {
    info(): Promise<Respuesta<InfoSistema>>;
    resumen(): Promise<Respuesta<Resumen>>;
    /** Carga profesionales, obras sociales y pacientes de ejemplo (solo si no hay pacientes). */
    cargarEjemplo(): Promise<Respuesta<Resumen>>;
    /** Carga turnos de ejemplo (2 semanas atrás y 2 adelante), solo si no hay turnos. */
    cargarTurnosEjemplo(): Promise<Respuesta<number>>;
  };
}

export const CANALES = {
  pacientesBuscar: 'pacientes:buscar',
  pacientesGuardar: 'pacientes:guardar',
  pacientesActivo: 'pacientes:activo',
  profesionalesListar: 'profesionales:listar',
  profesionalesGuardar: 'profesionales:guardar',
  profesionalesActivo: 'profesionales:activo',
  bloqueosProximos: 'bloqueos:proximos',
  bloqueosCrear: 'bloqueos:crear',
  bloqueosBorrar: 'bloqueos:borrar',
  turnosAgenda: 'turnos:agenda',
  turnosLibres: 'turnos:libres',
  turnosProximosLibres: 'turnos:proximos-libres',
  turnosDar: 'turnos:dar',
  turnosMover: 'turnos:mover',
  turnosEstado: 'turnos:estado',
  turnosDePaciente: 'turnos:de-paciente',
  obrasListar: 'obras:listar',
  obrasGuardar: 'obras:guardar',
  obrasActivo: 'obras:activo',
  consultorioObtener: 'consultorio:obtener',
  consultorioGuardar: 'consultorio:guardar',
  sistemaInfo: 'sistema:info',
  sistemaResumen: 'sistema:resumen',
  sistemaEjemplo: 'sistema:ejemplo',
  sistemaEjemploTurnos: 'sistema:ejemplo-turnos',
} as const;
