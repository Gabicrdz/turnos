// El contrato entre la ventana y el main: qué funciones existen, qué reciben
// y qué devuelven. El preload lo implementa; la ventana lo usa como window.turnos.
import type {
  DatosBloqueo,
  DatosBuscarPacientes,
  DatosCobro,
  DatosConsulta,
  DatosConsultorio,
  DatosMoverTurno,
  DatosObraSocial,
  DatosPaciente,
  DatosProfesional,
  DatosRango,
  DatosTurno,
  DatosUsuario,
} from './esquemas';
import type { EstadoTurno } from './agenda';
import type {
  Agenda,
  Bloqueo,
  BloqueoCreado,
  Consulta,
  Consultorio,
  HorarioLibre,
  InfoSistema,
  ObraSocial,
  Paciente,
  Profesional,
  Respuesta,
  ResultadoEjemplo,
  Resumen,
  TurnosDePaciente,
  Usuario,
} from './tipos';

export interface ApiTurnos {
  sesion: {
    /** Quién está usando el sistema (null = nadie: pantalla de ingreso). */
    actual(): Promise<Respuesta<Usuario | null>>;
    iniciar(usuarioId: number, pin: string): Promise<Respuesta<Usuario>>;
    cerrar(): Promise<Respuesta<null>>;
  };
  usuarios: {
    /** Para la pantalla de ingreso: solo nombre y rol. */
    paraIngresar(): Promise<Respuesta<Usuario[]>>;
    /** Solo la primera vez (sin usuarios): crea el de administración y entra. */
    crearPrimero(nombre: string, pin: string): Promise<Respuesta<Usuario>>;
    listar(): Promise<Respuesta<Usuario[]>>;
    guardar(datos: DatosUsuario): Promise<Respuesta<number>>;
    darDeBaja(id: number): Promise<Respuesta<null>>;
  };
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
    /** Abre WhatsApp con el recordatorio ya escrito y anota que se mandó. */
    recordar(id: number): Promise<Respuesta<null>>;
  };
  consultas: {
    /** Historia clínica del paciente, de la más nueva a la más vieja. */
    historia(pacienteId: number): Promise<Respuesta<Consulta[]>>;
    /** Guarda las notas de la consulta y deja el turno como atendido. */
    guardar(datos: DatosConsulta): Promise<Respuesta<number>>;
  };
  cobros: {
    registrar(datos: DatosCobro): Promise<Respuesta<number>>;
    anular(id: number): Promise<Respuesta<null>>;
  };
  obrasSociales: {
    listar(): Promise<Respuesta<ObraSocial[]>>;
    guardar(datos: DatosObraSocial): Promise<Respuesta<number>>;
    cambiarActivo(id: number, activo: boolean): Promise<Respuesta<null>>;
  };
  consultorio: {
    obtener(): Promise<Respuesta<Consultorio>>;
    guardar(datos: DatosConsultorio): Promise<Respuesta<null>>;
    guardarMensaje(mensaje: string): Promise<Respuesta<null>>;
  };
  sistema: {
    info(): Promise<Respuesta<InfoSistema>>;
    resumen(): Promise<Respuesta<Resumen>>;
    /** Carga profesionales, obras sociales y pacientes de ejemplo (solo si no hay pacientes). */
    cargarEjemplo(): Promise<Respuesta<ResultadoEjemplo>>;
    /** Carga turnos de ejemplo (2 semanas atrás y 2 adelante), solo si no hay turnos. */
    cargarTurnosEjemplo(): Promise<Respuesta<number>>;
  };
}

export const CANALES = {
  sesionActual: 'sesion:actual',
  sesionIniciar: 'sesion:iniciar',
  sesionCerrar: 'sesion:cerrar',
  usuariosParaIngresar: 'usuarios:para-ingresar',
  usuariosCrearPrimero: 'usuarios:crear-primero',
  usuariosListar: 'usuarios:listar',
  usuariosGuardar: 'usuarios:guardar',
  usuariosBaja: 'usuarios:baja',
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
  turnosRecordar: 'turnos:recordar',
  consultasHistoria: 'consultas:historia',
  consultasGuardar: 'consultas:guardar',
  cobrosRegistrar: 'cobros:registrar',
  cobrosAnular: 'cobros:anular',
  obrasListar: 'obras:listar',
  obrasGuardar: 'obras:guardar',
  obrasActivo: 'obras:activo',
  consultorioObtener: 'consultorio:obtener',
  consultorioGuardar: 'consultorio:guardar',
  consultorioMensaje: 'consultorio:mensaje',
  sistemaInfo: 'sistema:info',
  sistemaResumen: 'sistema:resumen',
  sistemaEjemplo: 'sistema:ejemplo',
  sistemaEjemploTurnos: 'sistema:ejemplo-turnos',
} as const;
