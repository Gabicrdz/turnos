// Etapa 4: usuarios con PIN, sesión, permisos y quién hizo cada cosa.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BaseDeDatos } from '../src/main/db/conexion';
import { esquemaCobro, esquemaConsulta, esquemaTurno, esquemaUsuario, type DatosUsuario } from '../src/compartido/esquemas';
import type { Usuario } from '../src/compartido/tipos';
import { darDeBajaUsuario, guardarUsuario, hashDePin, listarUsuarios, pinCorrecto } from '../src/main/servicios/usuarios';
import { iniciarSesion, reiniciarSesionParaPruebas, requerir } from '../src/main/servicios/sesion';
import { cambiarEstado, darTurno, obtenerTurno } from '../src/main/servicios/turnos';
import { guardarConsulta } from '../src/main/servicios/consultas';
import { anularCobro, registrarCobro } from '../src/main/servicios/cobros';
import { cargarEjemplo } from '../src/main/servicios/ejemplo';
import { baseNueva, paciente, profesional } from './ayudantes';

const AHORA = new Date(2026, 10, 16, 9, 0); // lunes 16/11/2026, 09:00
const lunesAViernes = [1, 2, 3, 4, 5].map((diaSemana) => ({ diaSemana, desde: '08:00', hasta: '12:00' }));

let db: BaseDeDatos;
let laura: number;
let martin: number;
const usuario = (datos: Partial<DatosUsuario>) => guardarUsuario(db, esquemaUsuario.parse({ nombre: 'Ana', rol: 'recepcion', pin: '1234', ...datos }));

beforeEach(() => {
  db = baseNueva();
  reiniciarSesionParaPruebas();
  laura = profesional(db, { horarios: lunesAViernes });
  martin = profesional(db, { nombre: 'Martín', apellido: 'Acosta', titulo: 'Dr.', horarios: lunesAViernes });
});
afterEach(() => reiniciarSesionParaPruebas());

describe('usuarios', () => {
  it('el PIN se guarda como hash con sal (nunca el número)', () => {
    const { hash, sal } = hashDePin('1234');
    expect(hash).not.toContain('1234');
    expect(hashDePin('1234', sal).hash).toBe(hash); // misma sal → misma huella
    expect(hashDePin('1234').hash).not.toBe(hash); // otra sal → otra huella
    expect(pinCorrecto('1234', hash, sal)).toBe(true);
    expect(pinCorrecto('1235', hash, sal)).toBe(false);
    usuario({ nombre: 'Ana' });
    const fila = db.$client.prepare('SELECT * FROM usuarios').get() as Record<string, unknown>;
    expect(JSON.stringify(fila)).not.toContain('1234');
  });

  it('profesional: tiene que estar vinculado, y cada profesional tiene un solo usuario', () => {
    expect(() => esquemaUsuario.parse({ nombre: 'Laura', rol: 'profesional', pin: '2222' })).toThrow('de qué profesional');
    // Recepción nunca queda vinculada (aunque lo pidan)
    expect(esquemaUsuario.parse({ nombre: 'Ana', rol: 'recepcion', profesionalId: laura, pin: '1111' }).profesionalId).toBeNull();
    usuario({ nombre: 'Laura', rol: 'profesional', profesionalId: laura });
    expect(() => usuario({ nombre: 'Otra', rol: 'profesional', profesionalId: laura })).toThrow('Dra. Laura Benítez ya tiene usuario ("Laura")');
    expect(() => usuario({ nombre: 'laura', rol: 'recepcion' })).toThrow('Ya hay un usuario que se llama');
    // Administración también puede estar vinculada (el dueño que además atiende)
    usuario({ nombre: 'Martín', rol: 'admin', profesionalId: martin });
    expect(listarUsuarios(db).map((u) => `${u.nombre}:${u.rol}:${u.profesionalId}`)).toEqual([`Martín:admin:${martin}`, `Laura:profesional:${laura}`]);
  });

  it('siempre queda al menos un usuario de administración', () => {
    const admin = usuario({ nombre: 'Gabriel', rol: 'admin' });
    const ana = usuario({ nombre: 'Ana' });
    expect(() => usuario({ id: admin, nombre: 'Gabriel', rol: 'recepcion' })).toThrow('al menos un usuario de administración');
    expect(() => darDeBajaUsuario(db, admin, ana)).toThrow('al menos un usuario de administración');
    expect(() => darDeBajaUsuario(db, admin, admin)).toThrow('No podés darte de baja a vos mismo');
    darDeBajaUsuario(db, ana, admin);
    expect(listarUsuarios(db).map((u) => u.nombre)).toEqual(['Gabriel']);
    // Editar sin PIN no lo cambia
    usuario({ id: admin, nombre: 'Gabriel C.', rol: 'admin', pin: '' });
    expect(iniciarSesion(db, admin, '1234').nombre).toBe('Gabriel C.');
  });
});

describe('sesión y permisos', () => {
  it('5 PIN mal seguidos → hay que esperar 30 segundos', () => {
    const ana = usuario({ nombre: 'Ana' });
    for (let i = 0; i < 4; i++) expect(() => iniciarSesion(db, ana, '0000', 1000)).toThrow('PIN incorrecto.');
    expect(() => iniciarSesion(db, ana, '0000', 1000)).toThrow('Esperá 30 segundos');
    expect(() => iniciarSesion(db, ana, '1234', 20_000)).toThrow('Esperá 11 segundos'); // ni con el PIN bueno
    expect(iniciarSesion(db, ana, '1234', 31_001).nombre).toBe('Ana');
  });

  it('cada permiso: sesión, historia clínica (vinculados) y administración', () => {
    expect(requerir('libre')).toBeNull();
    expect(() => requerir('sesion')).toThrow('La sesión se cerró');
    const ver = (u: Usuario) => {
      reiniciarSesionParaPruebas(u);
      return (['sesion', 'clinica', 'admin'] as const).map((p) => {
        try {
          requerir(p);
          return p;
        } catch {
          return '-';
        }
      });
    };
    expect(ver({ id: 1, nombre: 'Ana', rol: 'recepcion', profesionalId: null })).toEqual(['sesion', '-', '-']);
    expect(ver({ id: 2, nombre: 'Laura', rol: 'profesional', profesionalId: laura })).toEqual(['sesion', 'clinica', '-']);
    expect(ver({ id: 3, nombre: 'Gabriel', rol: 'admin', profesionalId: null })).toEqual(['sesion', '-', 'admin']);
    expect(ver({ id: 4, nombre: 'Martín', rol: 'admin', profesionalId: martin })).toEqual(['sesion', 'clinica', 'admin']);
    reiniciarSesionParaPruebas({ id: 1, nombre: 'Ana', rol: 'recepcion', profesionalId: null });
    expect(() => requerir('clinica')).toThrow('La historia clínica la ven solo los profesionales');
  });
});

describe('quién hizo cada cosa', () => {
  it('queda registrado quién dio el turno y quién cobró; cada profesional carga solo SUS notas', () => {
    const ana = usuario({ nombre: 'Ana' });
    const uLaura = usuario({ nombre: 'Laura', rol: 'profesional', profesionalId: laura });
    const uMartin = usuario({ nombre: 'Martín', rol: 'profesional', profesionalId: martin });
    const juan = paciente(db, { apellido: 'Pérez', nombre: 'Juan' });
    const t = darTurno(db, esquemaTurno.parse({ profesionalId: laura, pacienteId: juan, fecha: '2026-11-16', desde: '09:00' }), AHORA, ana);
    expect(obtenerTurno(db, t)).toMatchObject({ dadoPor: 'Ana', creadoEn: '2026-11-16 09:00:00' });

    cambiarEstado(db, t, 'en_sala', AHORA);
    const notas = esquemaConsulta.parse({ turnoId: t, evolucion: 'Bien.' });
    expect(() => guardarConsulta(db, notas, { id: uMartin, profesionalId: martin }, AHORA)).toThrow('Este turno es de Dra. Laura Benítez');
    guardarConsulta(db, notas, { id: uLaura, profesionalId: laura }, AHORA);
    expect(db.$client.prepare('SELECT usuario_id AS u FROM consultas').get()).toEqual({ u: uLaura });

    const cobro = registrarCobro(db, esquemaCobro.parse({ turnoId: t, tipo: 'particular', montoCentavos: 1_000_000, metodo: 'efectivo' }), AHORA, ana);
    expect(obtenerTurno(db, t).cobro).toMatchObject({ usuario: 'Ana', creadoEn: '2026-11-16 09:00:00' });

    // Anular: el mismo usuario el mismo día sí; otro (o al día siguiente) solo administración
    expect(() => anularCobro(db, cobro, { id: uLaura, rol: 'profesional' }, AHORA)).toThrow('Solo administración');
    expect(() => anularCobro(db, cobro, { id: ana, rol: 'recepcion' }, new Date(2026, 10, 17, 9))).toThrow('Solo administración');
    anularCobro(db, cobro, { id: ana, rol: 'recepcion' }, AHORA);
  });

  it('los datos de ejemplo traen usuarios para probar cada rol', () => {
    const r = cargarEjemplo(db, AHORA);
    // Ya había profesionales (los de este archivo): no crea usuarios de ejemplo
    expect(r.usuarios).toEqual([]);
    const limpia = baseNueva();
    const conUsuarios = cargarEjemplo(limpia, AHORA);
    expect(conUsuarios.usuarios.map((u) => `${u.nombre} ${u.pin}`)).toEqual(['Marta 1111', 'Laura Benítez 2222', 'Martín Acosta 3333', 'Sofía Ríos 4444']);
    const sinAutor = (sql: string) => (limpia.$client.prepare(sql).get() as { n: number }).n;
    expect(sinAutor('SELECT count(*) AS n FROM turnos WHERE dado_por IS NULL')).toBe(0);
    expect(sinAutor('SELECT count(*) AS n FROM consultas WHERE usuario_id IS NULL')).toBe(0);
    expect(sinAutor('SELECT count(*) AS n FROM cobros WHERE usuario_id IS NULL')).toBe(0);
  });
});
