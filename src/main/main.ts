// Proceso MAIN: arranca la app, abre la base de datos y crea la ventana.
import { app, BrowserWindow, Menu } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { abrirBaseDeDatos, cerrarBaseDeDatos, rutaBaseDeDatos } from './db/conexion';
import { registrarCanales } from './ipc';
import { copiaAlIniciar } from './copias';

// Instalador de Windows: crea/borra accesos directos y se cierra.
if (started) app.quit();

// La carpeta de datos queda fija en AppData\Roaming\turnos aunque después
// cambiemos el nombre del programa (lección aprendida en el gimnasio).
app.setPath('userData', path.join(app.getPath('appData'), 'turnos'));

// Un solo programa abierto a la vez: dos ventanas escribiendo la misma base
// podrían dar el mismo turno dos veces. Si ya hay una abierta, esta se cierra.
const esLaUnica = app.requestSingleInstanceLock();
if (!esLaUnica) app.quit();

let ventana: BrowserWindow | null = null;

function crearVentana(): void {
  ventana = new BrowserWindow({
    width: 1366,
    height: 820,
    minWidth: 1100,
    minHeight: 680,
    show: false,
    backgroundColor: '#f4f6f5',
    title: 'Turnos',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  // La ventana nunca navega a otra página ni abre ventanas nuevas.
  ventana.webContents.on('will-navigate', (evento, url) => {
    if (!MAIN_WINDOW_VITE_DEV_SERVER_URL || !url.startsWith(MAIN_WINDOW_VITE_DEV_SERVER_URL)) {
      evento.preventDefault();
    }
  });
  // El sistema no tiene links a internet: cualquier intento de abrir una ventana
  // nueva se rechaza (así nadie puede usar la ventana para abrir páginas).
  ventana.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  ventana.once('ready-to-show', () => {
    ventana?.maximize();
    ventana?.show();
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void ventana.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void ventana.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
}

app.on('second-instance', () => {
  if (ventana?.isMinimized()) ventana.restore();
  ventana?.focus();
});

app.whenReady().then(() => {
  if (!esLaUnica) return;
  if (app.isPackaged) Menu.setApplicationMenu(null);
  abrirBaseDeDatos(path.join(app.getPath('userData'), 'turnos.db'));
  registrarCanales(() => ({ version: app.getVersion(), baseDeDatos: rutaBaseDeDatos() }));
  crearVentana();
  // Copia de seguridad del día (en Documentos\Turnos\Copias\Automaticas). Se revisa
  // cada hora por si el programa queda abierto de un día para el otro.
  void copiaAlIniciar();
  setInterval(() => void copiaAlIniciar(), 60 * 60 * 1000);
});

app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => cerrarBaseDeDatos());
