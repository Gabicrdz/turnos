/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />
import type { ApiTurnos } from './compartido/api';

declare global {
  interface Window {
    /** La API que expone el preload (ver src/preload/preload.ts). */
    turnos: ApiTurnos;
  }
}
