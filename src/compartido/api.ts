// El contrato entre la ventana y el main: qué funciones existen, qué reciben
// y qué devuelven. El preload lo implementa; la ventana lo usa como window.turnos.
import type {
  DatosBloqueo,
  DatosBuscarPacientes,
  DatosConsultorio,
  DatosObraSocial,
  DatosPaciente,
  DatosProfesional,
} from './esquemas';
import type { Bloqueo, Consultorio, InfoSistema, ObraSocial, Paciente, Profesional, Respuesta, Resumen } from './tipos';

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
    crear(datos: DatosBloqueo): Promise<Respuesta<number>>;
    borrar(id: number): Promise<Respuesta<null>>;
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
  obrasListar: 'obras:listar',
  obrasGuardar: 'obras:guardar',
  obrasActivo: 'obras:activo',
  consultorioObtener: 'consultorio:obtener',
  consultorioGuardar: 'consultorio:guardar',
  sistemaInfo: 'sistema:info',
  sistemaResumen: 'sistema:resumen',
  sistemaEjemplo: 'sistema:ejemplo',
} as const;
