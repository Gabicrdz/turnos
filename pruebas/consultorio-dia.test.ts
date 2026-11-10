// Etapa 3: notas de consulta, cobros, recordatorios por WhatsApp y la migración desde la etapa 2.
import { beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { BaseDeDatos } from '../src/main/db/conexion';
import { abrirBaseDeDatos, cerrarBaseDeDatos, VERSION_BASE } from '../src/main/db/conexion';
import { MIGRACIONES } from '../src/main/db/migraciones';
import { esquemaCobro, esquemaConsulta, esquemaTurno, type DatosCobro, type DatosConsulta } from '../src/compartido/esquemas';
import { armarMensaje, numeroWhatsApp } from '../src/compartido/whatsapp';
import { cambiarEstado, darTurno, obtenerTurno } from '../src/main/servicios/turnos';
import { guardarConsulta, historiaClinica } from '../src/main/servicios/consultas';
import { anularCobro, registrarCobro } from '../src/main/servicios/cobros';
import { enlaceRecordatorio, marcarRecordado } from '../src/main/servicios/recordatorios';
import { guardarConsultorio, guardarMensajeRecordatorio } from '../src/main/servicios/consultorio';
import { guardarObraSocial } from '../src/main/servicios/obras-sociales';
import { esquemaObraSocial } from '../src/compartido/esquemas';
import { baseNueva, paciente, profesional } from './ayudantes';

// Lunes 16/11/2026 a las 09:00
const AHORA = new Date(2026, 10, 16, 9, 0);
const HOY = '2026-11-16';
const MANANA = '2026-11-17';
const MANANA_9 = new Date(2026, 10, 17, 9, 0);
const lunesAViernes = [1, 2, 3, 4, 5].map((diaSemana) => ({ diaSemana, desde: '08:00', hasta: '12:00' }));

let db: BaseDeDatos;
let laura: number;
let juan: number;
let iasep: number;

beforeEach(() => {
  db = baseNueva();
  laura = profesional(db, { horarios: lunesAViernes, precioConsultaCentavos: 1_800_000 });
  iasep = guardarObraSocial(db, esquemaObraSocial.parse({ nombre: 'IASEP' }));
  juan = paciente(db, { apellido: 'Pérez', nombre: 'Juan', telefono: '370 455-1020' });
});

const turno = (fecha = HOY, desde = '09:00') =>
  darTurno(db, esquemaTurno.parse({ profesionalId: laura, pacienteId: juan, fecha, desde, motivo: 'Control' }), new Date(2026, 10, 16, 7));
const consulta = (datos: Partial<DatosConsulta> & { turnoId: number }, ahora = AHORA) =>
  guardarConsulta(db, esquemaConsulta.parse({ evolucion: 'Asintomático.', ...datos }), ahora);
const cobrar = (datos: Partial<DatosCobro> & { turnoId: number }) =>
  registrarCobro(db, esquemaCobro.parse({ tipo: 'particular', montoCentavos: 1_800_000, metodo: 'efectivo', ...datos }), AHORA);

describe('notas de la consulta (historia clínica)', () => {
  it('guardar la consulta deja el turno atendido y aparece en la historia', () => {
    const t = turno();
    cambiarEstado(db, t, 'en_sala', AHORA);
    consulta({ turnoId: t, motivo: 'Control', diagnostico: 'Control de salud' });
    expect(obtenerTurno(db, t)).toMatchObject({ estado: 'atendido', llegoEn: '2026-11-16 09:00:00' });
    expect(obtenerTurno(db, t).consultaId).toBeGreaterThan(0);
    expect(historiaClinica(db, juan, AHORA)).toMatchObject([
      { fecha: HOY, profesional: 'Dra. Laura Benítez', motivo: 'Control', evolucion: 'Asintomático.', diagnostico: 'Control de salud', editable: true },
    ]);
  });

  it('se corrige el mismo día; al día siguiente queda cerrada', () => {
    const t = turno();
    consulta({ turnoId: t });
    consulta({ turnoId: t, evolucion: 'Corregido.' }, new Date(2026, 10, 16, 18));
    expect(historiaClinica(db, juan, AHORA)).toHaveLength(1); // una por turno: corrige, no duplica
    expect(historiaClinica(db, juan, AHORA)[0]!.evolucion).toBe('Corregido.');
    expect(() => consulta({ turnoId: t, evolucion: 'Otra vez' }, MANANA_9)).toThrow('se cargó el 16/11/2026 y ya está cerrada');
    expect(historiaClinica(db, juan, MANANA_9)[0]!.editable).toBe(false);
  });

  it('no se carga en turnos futuros, cancelados ni ausentes; y pide la evolución', () => {
    const futuro = turno(MANANA);
    expect(() => consulta({ turnoId: futuro })).toThrow('todavía no llegó');
    const t = turno(HOY, '10:00');
    cambiarEstado(db, t, 'ausente', AHORA);
    expect(() => consulta({ turnoId: t })).toThrow('está ausente');
    expect(() => esquemaConsulta.parse({ turnoId: 1, evolucion: '  ' })).toThrow('Escribí la evolución');
  });

  it('con notas cargadas, el turno no puede volver atrás de "atendido"', () => {
    const t = turno();
    consulta({ turnoId: t });
    expect(() => cambiarEstado(db, t, 'en_sala', AHORA)).toThrow('ya tiene las notas de la consulta');
  });
});

describe('cobros', () => {
  it('particular u obra social, solo con el paciente en sala o atendido', () => {
    const t = turno();
    expect(() => cobrar({ turnoId: t })).toThrow('ya llegaron');
    cambiarEstado(db, t, 'en_sala', AHORA);
    cobrar({ turnoId: t, metodo: 'transferencia' });
    expect(obtenerTurno(db, t).cobro).toMatchObject({ tipo: 'particular', montoCentavos: 1_800_000, metodo: 'transferencia', obraSocial: null });

    const t2 = turno(HOY, '10:00');
    cambiarEstado(db, t2, 'atendido', AHORA);
    cobrar({ turnoId: t2, tipo: 'obra_social', obraSocialId: iasep, numeroAutorizacion: '12345678', montoCentavos: 0, metodo: 'efectivo' });
    // Sin copago, el método se descarta
    expect(obtenerTurno(db, t2).cobro).toMatchObject({ tipo: 'obra_social', obraSocial: 'IASEP', numeroAutorizacion: '12345678', montoCentavos: 0, metodo: null });
  });

  it('valida lo que falta según el tipo', () => {
    expect(() => esquemaCobro.parse({ turnoId: 1, tipo: 'particular', montoCentavos: 0 })).toThrow('cuánto paga');
    expect(() => esquemaCobro.parse({ turnoId: 1, tipo: 'particular', montoCentavos: 500 })).toThrow('cómo paga');
    expect(() => esquemaCobro.parse({ turnoId: 1, tipo: 'obra_social', montoCentavos: 0 })).toThrow('Elegí la obra social');
    expect(() => esquemaCobro.parse({ turnoId: 1, tipo: 'obra_social', obraSocialId: 1, montoCentavos: 300_000 })).toThrow('cómo paga');
  });

  it('un solo cobro vigente por turno (también lo controla la base); anulado se puede volver a cobrar', () => {
    const t = turno();
    cambiarEstado(db, t, 'en_sala', AHORA);
    const id = cobrar({ turnoId: t });
    expect(() => cobrar({ turnoId: t })).toThrow('ya está cobrado');
    expect(() =>
      db.$client.prepare(`INSERT INTO cobros (turno_id, tipo, monto_centavos, metodo) VALUES (?, 'particular', 100, 'efectivo')`).run(t),
    ).toThrow('UNIQUE');
    // Cobrado: no puede volver a "todavía no llegó"
    expect(() => cambiarEstado(db, t, 'confirmado', AHORA)).toThrow('anulá el cobro');
    anularCobro(db, id, AHORA);
    expect(() => anularCobro(db, id, AHORA)).toThrow('ya estaba anulado');
    expect(obtenerTurno(db, t).cobro).toBeNull();
    cobrar({ turnoId: t, montoCentavos: 1_500_000 });
    expect(obtenerTurno(db, t).cobro!.montoCentavos).toBe(1_500_000);
  });
});

describe('recordatorios por WhatsApp', () => {
  it('pasa los teléfonos argentinos al formato de WhatsApp', () => {
    expect(numeroWhatsApp('370 455-1020')).toBe('5493704551020');
    expect(numeroWhatsApp('0370 15 455-1020')).toBe('5493704551020');
    expect(numeroWhatsApp('3704 15 551020')).toBe('5493704551020');
    expect(numeroWhatsApp('+54 9 11 2345-6789')).toBe('5491123456789');
    expect(numeroWhatsApp('011 15 2345-6789')).toBe('5491123456789');
    expect(numeroWhatsApp('455-1020')).toBeNull(); // sin código de área
    expect(numeroWhatsApp('')).toBeNull();
  });

  it('arma el mensaje con la plantilla del consultorio y anota cuándo se mandó', () => {
    guardarConsultorio(db, { nombreConsultorio: 'Consultorio San Martín', direccion: 'Belgrano 120', telefono: '' });
    guardarMensajeRecordatorio(db, 'Hola {nombre}! Turno con {profesional} el {dia} a las {hora} en {consultorio} ({direccion}). {otra}');
    const t = turno(MANANA, '08:20');
    const url = new URL(enlaceRecordatorio(db, t, AHORA));
    expect(url.origin + url.pathname).toBe('https://wa.me/5493704551020');
    expect(url.searchParams.get('text')).toBe(
      'Hola Juan! Turno con Dra. Laura Benítez el martes 17/11 a las 08:20 en Consultorio San Martín (Belgrano 120). {otra}',
    );
    expect(obtenerTurno(db, t).recordadoEn).toBeNull(); // armar el enlace no escribe nada
    marcarRecordado(db, t, AHORA);
    expect(obtenerTurno(db, t).recordadoEn).toBe('2026-11-16 09:00:00');
  });

  it('no recuerda turnos pasados ni ya atendidos, y avisa si el teléfono no sirve', () => {
    const t = turno();
    cambiarEstado(db, t, 'atendido', AHORA);
    expect(() => enlaceRecordatorio(db, t, AHORA)).toThrow('pendientes');
    const sinCelular = paciente(db, { apellido: 'Gómez', nombre: 'Ana', telefono: '455-1020' });
    const t2 = darTurno(db, esquemaTurno.parse({ profesionalId: laura, pacienteId: sinCelular, fecha: MANANA, desde: '10:00' }), AHORA);
    expect(() => enlaceRecordatorio(db, t2, AHORA)).toThrow('no parece un celular');
    expect(armarMensaje('{nombre} {nada}', { nombre: 'Ana', apellido: '', profesional: '', dia: '', hora: '', consultorio: '', direccion: '' })).toBe('Ana {nada}');
  });
});

describe('migración 3 sobre una base de la etapa 2', () => {
  it('agrega precio, recordatorio, consultas y cobros sin tocar lo que había', () => {
    const carpeta = mkdtempSync(path.join(tmpdir(), 'turnos-'));
    const ruta = path.join(carpeta, 'turnos.db');
    try {
      // Una base "vieja" con solo las migraciones 1 y 2, y datos
      const vieja = new Database(ruta);
      for (const m of MIGRACIONES.slice(0, 2)) vieja.exec(m.sql);
      vieja.pragma('user_version = 2');
      vieja.exec(`INSERT INTO profesionales (nombre, apellido) VALUES ('Laura', 'Benítez');
                  INSERT INTO pacientes (nombre, apellido) VALUES ('Juan', 'Pérez');
                  INSERT INTO turnos (profesional_id, paciente_id, fecha, desde, hasta) VALUES (1, 1, '2026-11-16', '08:00', '08:20');`);
      vieja.close();

      cerrarBaseDeDatos();
      const nueva = abrirBaseDeDatos(ruta);
      expect(nueva.$client.pragma('user_version', { simple: true })).toBe(VERSION_BASE);
      expect(nueva.$client.prepare('SELECT precio_consulta_centavos AS p FROM profesionales').get()).toEqual({ p: 0 });
      expect(nueva.$client.prepare('SELECT recordado_en AS r, estado FROM turnos').get()).toEqual({ r: null, estado: 'reservado' });
      expect(nueva.$client.prepare(`SELECT count(*) AS n FROM configuracion WHERE clave = 'mensaje_recordatorio'`).get()).toEqual({ n: 1 });
    } finally {
      cerrarBaseDeDatos();
      rmSync(carpeta, { recursive: true, force: true });
    }
  });
});
