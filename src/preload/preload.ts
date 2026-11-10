// PRELOAD: el único puente entre la ventana y el main. Expone `window.turnos`
// con funciones concretas; la ventana nunca tiene acceso a ipcRenderer.
import { contextBridge, ipcRenderer } from 'electron';
import { CANALES, type ApiTurnos } from '@compartido/api';

const pedir = (canal: string, ...args: unknown[]) => ipcRenderer.invoke(canal, ...args);

const api: ApiTurnos = {
  pacientes: {
    buscar: (filtro) => pedir(CANALES.pacientesBuscar, filtro),
    guardar: (datos) => pedir(CANALES.pacientesGuardar, datos),
    cambiarActivo: (id, activo) => pedir(CANALES.pacientesActivo, id, activo),
  },
  profesionales: {
    listar: () => pedir(CANALES.profesionalesListar),
    guardar: (datos) => pedir(CANALES.profesionalesGuardar, datos),
    cambiarActivo: (id, activo) => pedir(CANALES.profesionalesActivo, id, activo),
  },
  bloqueos: {
    proximos: () => pedir(CANALES.bloqueosProximos),
    crear: (datos) => pedir(CANALES.bloqueosCrear, datos),
    borrar: (id) => pedir(CANALES.bloqueosBorrar, id),
  },
  turnos: {
    agenda: (rango) => pedir(CANALES.turnosAgenda, rango),
    libres: (profesionalId, fecha) => pedir(CANALES.turnosLibres, profesionalId, fecha),
    proximosLibres: (profesionalId) => pedir(CANALES.turnosProximosLibres, profesionalId),
    dar: (datos) => pedir(CANALES.turnosDar, datos),
    mover: (datos) => pedir(CANALES.turnosMover, datos),
    cambiarEstado: (id, estado) => pedir(CANALES.turnosEstado, id, estado),
    dePaciente: (pacienteId) => pedir(CANALES.turnosDePaciente, pacienteId),
    recordar: (id) => pedir(CANALES.turnosRecordar, id),
  },
  consultas: {
    historia: (pacienteId) => pedir(CANALES.consultasHistoria, pacienteId),
    guardar: (datos) => pedir(CANALES.consultasGuardar, datos),
  },
  cobros: {
    registrar: (datos) => pedir(CANALES.cobrosRegistrar, datos),
    anular: (id) => pedir(CANALES.cobrosAnular, id),
  },
  obrasSociales: {
    listar: () => pedir(CANALES.obrasListar),
    guardar: (datos) => pedir(CANALES.obrasGuardar, datos),
    cambiarActivo: (id, activo) => pedir(CANALES.obrasActivo, id, activo),
  },
  consultorio: {
    obtener: () => pedir(CANALES.consultorioObtener),
    guardar: (datos) => pedir(CANALES.consultorioGuardar, datos),
    guardarMensaje: (mensaje) => pedir(CANALES.consultorioMensaje, mensaje),
  },
  sistema: {
    info: () => pedir(CANALES.sistemaInfo),
    resumen: () => pedir(CANALES.sistemaResumen),
    cargarEjemplo: () => pedir(CANALES.sistemaEjemplo),
    cargarTurnosEjemplo: () => pedir(CANALES.sistemaEjemploTurnos),
  },
};

contextBridge.exposeInMainWorld('turnos', api);
