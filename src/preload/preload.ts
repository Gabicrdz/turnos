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
  obrasSociales: {
    listar: () => pedir(CANALES.obrasListar),
    guardar: (datos) => pedir(CANALES.obrasGuardar, datos),
    cambiarActivo: (id, activo) => pedir(CANALES.obrasActivo, id, activo),
  },
  consultorio: {
    obtener: () => pedir(CANALES.consultorioObtener),
    guardar: (datos) => pedir(CANALES.consultorioGuardar, datos),
  },
  sistema: {
    info: () => pedir(CANALES.sistemaInfo),
    resumen: () => pedir(CANALES.sistemaResumen),
    cargarEjemplo: () => pedir(CANALES.sistemaEjemplo),
  },
};

contextBridge.exposeInMainWorld('turnos', api);
