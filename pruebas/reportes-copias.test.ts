// Etapa 5: reportes, órdenes para obras sociales y copias de seguridad.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { existsSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { BaseDeDatos } from '../src/main/db/conexion';
import { abrirBaseDeDatos, cerrarBaseDeDatos, VERSION_BASE } from '../src/main/db/conexion';
import { esquemaBloqueo, esquemaCobro, esquemaObraSocial, esquemaPeriodo, esquemaTurno, type DatosCobro } from '../src/compartido/esquemas';
import { crearBloqueo } from '../src/main/servicios/bloqueos';
import { guardarObraSocial } from '../src/main/servicios/obras-sociales';
import { cambiarEstado, darTurno } from '../src/main/servicios/turnos';
import { registrarCobro } from '../src/main/servicios/cobros';
import { csvDeOrdenes, diasDelPeriodo, ordenesDeObraSocial, reporte } from '../src/main/servicios/reportes';
import { cargarEjemplo } from '../src/main/servicios/ejemplo';
import {
  COPIAS_AUTOMATICAS_A_GUARDAR,
  copiaAutomatica,
  copiasAutomaticas,
  descripcionDeCopia,
  hacerCopia,
  nombreDeCopia,
  reemplazarBase,
  revisarCopia,
} from '../src/main/servicios/copias';
import { baseNueva, paciente, profesional } from './ayudantes';

const ANTES = new Date(2026, 10, 15, 10); // domingo 15/11: se dan los turnos
const DESPUES = new Date(2026, 10, 20, 10); // viernes 20/11: ya pasaron
const SEMANA = esquemaPeriodo.parse({ desde: '2026-11-16', hasta: '2026-11-20' });

describe('reportes', () => {
  let db: BaseDeDatos;
  let iasep: number;
  let juan: number;

  beforeEach(() => {
    db = baseNueva();
    const laura = profesional(db, { horarios: [1, 2, 3, 4, 5].map((diaSemana) => ({ diaSemana, desde: '08:00', hasta: '12:00' })) }); // 12 turnos por día
    iasep = guardarObraSocial(db, esquemaObraSocial.parse({ nombre: 'IASEP' }));
    juan = paciente(db, { apellido: 'Pérez', nombre: 'Juan', obraSocialId: iasep, numeroAfiliado: 'A-77' });
    const ana = paciente(db, { apellido: 'Gómez', nombre: 'Ana' });
    const pedro = paciente(db, { apellido: 'Ruiz', nombre: 'Pedro' });
    const turno = (pacienteId: number, fecha: string, desde: string) =>
      darTurno(db, esquemaTurno.parse({ profesionalId: laura, pacienteId, fecha, desde }), ANTES);
    const cobrar = (turnoId: number, datos: Partial<DatosCobro>) =>
      registrarCobro(db, esquemaCobro.parse({ turnoId, tipo: 'particular', montoCentavos: 1_800_000, metodo: 'efectivo', ...datos }), DESPUES);

    const t1 = turno(juan, '2026-11-16', '08:00');
    const t2 = turno(ana, '2026-11-16', '08:20');
    const t3 = turno(juan, '2026-11-17', '08:00');
    const t4 = turno(ana, '2026-11-17', '08:20');
    const t5 = turno(pedro, '2026-11-17', '08:40');
    const t6 = turno(ana, '2026-11-18', '08:00');
    for (const t of [t1, t3, t5]) cambiarEstado(db, t, 'atendido', DESPUES);
    for (const t of [t2, t4]) cambiarEstado(db, t, 'ausente', DESPUES);
    cambiarEstado(db, t6, 'cancelado', DESPUES);
    cobrar(t1, {});
    cobrar(t3, { tipo: 'obra_social', obraSocialId: iasep, numeroAutorizacion: '111', montoCentavos: 300_000, metodo: 'transferencia' });
    crearBloqueo(db, esquemaBloqueo.parse({ profesionalId: null, desde: '2026-11-19', hasta: '2026-11-19', motivo: 'Feriado' }));
  });

  it('totales: ausentismo sin contar cancelados, ingresos de lo que paga el paciente', () => {
    const r = reporte(db, SEMANA);
    expect(r.totales).toEqual({
      turnos: 5,
      atendidos: 3,
      ausentes: 2,
      cancelados: 1,
      ausentismo: 2 / 5,
      ingresosCentavos: 2_100_000,
      porMetodo: [
        { metodo: 'efectivo', centavos: 1_800_000, cantidad: 1 },
        { metodo: 'transferencia', centavos: 300_000, cantidad: 1 },
      ],
      ordenes: 1,
      atendidosSinCobrar: 1,
      pacientesAtendidos: 2,
      pacientesNuevos: 2,
    });
  });

  it('ocupación según el horario, sin el feriado; cobertura; días; los que más faltan', () => {
    const r = reporte(db, SEMANA);
    expect(r.porProfesional).toMatchObject([
      { nombre: 'Dra. Laura Benítez', turnos: 5, atendidos: 3, ausentes: 2, disponibles: 48, ocupacion: 5 / 48, ingresosCentavos: 2_100_000 },
    ]);
    expect(r.porCobertura.map((c) => `${c.nombre} ${c.atenciones} ${c.ordenes} ${c.montoCentavos}`).sort()).toEqual([
      'IASEP 1 1 300000',
      'Particular 1 0 1800000',
      'Sin cobrar 1 0 0',
    ]);
    expect(r.porDia).toHaveLength(5);
    expect(r.porDia[0]).toEqual({ fecha: '2026-11-16', atendidos: 1, ausentes: 1, ingresosCentavos: 1_800_000 });
    expect(r.porDia[3]).toEqual({ fecha: '2026-11-19', atendidos: 0, ausentes: 0, ingresosCentavos: 0 });
    expect(r.faltadores).toMatchObject([{ paciente: 'Gómez, Ana', ausentes: 2, turnos: 2 }]);
    // Un período sin nada no se rompe
    expect(reporte(db, esquemaPeriodo.parse({ desde: '2026-01-01', hasta: '2026-01-31' })).totales.ausentismo).toBeNull();
    expect(() => esquemaPeriodo.parse({ desde: '2025-01-01', hasta: '2026-11-20' })).toThrow('hasta un año');
    expect(diasDelPeriodo('2026-02-27', '2026-03-02')).toEqual(['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02']);
  });

  it('las órdenes de una obra social salen en un CSV para Excel en español', () => {
    const { obraSocial, filas } = ordenesDeObraSocial(db, SEMANA, iasep);
    expect(obraSocial).toBe('IASEP');
    expect(filas).toMatchObject([{ fecha: '2026-11-17', paciente: 'Pérez, Juan', numeroAfiliado: 'A-77', numeroAutorizacion: '111', copagoCentavos: 300_000 }]);
    const csv = csvDeOrdenes(filas);
    expect(csv.startsWith('﻿Fecha;Paciente;DNI;')).toBe(true); // BOM: Excel lee bien las tildes
    expect(csv).toContain('17/11/2026;Pérez, Juan;');
    expect(csv).toContain(';111;Dra. Laura Benítez;');
    expect(csv.trim().endsWith(';3000,00')).toBe(true);
    expect(csvDeOrdenes([{ ...filas[0]!, paciente: 'Raro; "Nombre"' }])).toContain(';"Raro; ""Nombre""";');
  });
});

describe('copias de seguridad', () => {
  let carpeta: string;
  const ruta = (nombre: string) => path.join(carpeta, nombre);
  beforeEach(() => {
    carpeta = mkdtempSync(path.join(tmpdir(), 'turnos-copias-'));
  });
  afterEach(() => {
    cerrarBaseDeDatos();
    rmSync(carpeta, { recursive: true, force: true });
  });

  it('copia, revisa y restaura', async () => {
    expect(nombreDeCopia(new Date(2026, 10, 10, 9, 5))).toBe('turnos-2026-11-10-0905.db');
    cerrarBaseDeDatos();
    const db = abrirBaseDeDatos(ruta('turnos.db'));
    cargarEjemplo(db, new Date(2026, 10, 16, 10));
    const copia = await hacerCopia(db, ruta('copias/turnos-1.db'));
    const resumen = revisarCopia(copia.ruta);
    expect(resumen).toMatchObject({ version: VERSION_BASE, pacientes: 30 });
    expect(resumen.turnos).toBeGreaterThan(100);
    expect(/^30 pacientes y [\d.]+ turnos; última atención del 16\/11\/2026$/.test(descripcionDeCopia(resumen))).toBe(true);

    db.$client.exec('DELETE FROM cobros; DELETE FROM consultas; DELETE FROM turnos;');
    cerrarBaseDeDatos();
    reemplazarBase(copia.ruta, ruta('turnos.db'));
    const restaurada = abrirBaseDeDatos(ruta('turnos.db'));
    expect((restaurada.$client.prepare('SELECT count(*) AS n FROM turnos').get() as { n: number }).n).toBeGreaterThan(100);
  });

  it('rechaza archivos que no son de Turnos, de una versión más nueva, o la base misma', () => {
    expect(() => reemplazarBase(ruta('turnos.db'), ruta('turnos.db'))).toThrow('el archivo que Turnos está usando');
    writeFileSync(ruta('foto.db'), 'esto no es una base de datos');
    expect(() => revisarCopia(ruta('foto.db'))).toThrow('no es una copia de Turnos');
    const caja = new Database(ruta('caja.db'));
    caja.exec('CREATE TABLE pedidos (id INTEGER); CREATE TABLE configuracion (clave TEXT);');
    caja.pragma('user_version = 6');
    caja.close();
    expect(() => revisarCopia(ruta('caja.db'))).toThrow('no es una copia de Turnos');
    const futura = new Database(ruta('futura.db'));
    futura.exec('CREATE TABLE pacientes (id INTEGER, activo INTEGER); CREATE TABLE profesionales (id INTEGER); CREATE TABLE horarios (id INTEGER); CREATE TABLE configuracion (clave TEXT);');
    futura.pragma(`user_version = ${VERSION_BASE + 1}`);
    futura.close();
    expect(() => revisarCopia(ruta('futura.db'))).toThrow('versión más nueva');
  });

  it('copia automática: una por día y guarda solo las últimas 10', async () => {
    cerrarBaseDeDatos();
    const db = abrirBaseDeDatos(ruta('turnos.db'));
    const auto = ruta('automaticas');
    for (let dia = 1; dia <= 12; dia++) {
      const hecha = await copiaAutomatica(db, auto, new Date(2026, 10, dia, 9, 0));
      expect(hecha).not.toBeNull();
      utimesSync(hecha!.ruta, new Date(2026, 10, dia), new Date(2026, 10, dia));
    }
    expect(await copiaAutomatica(db, auto, new Date(2026, 10, 12, 18, 0))).toBeNull();
    const lista = copiasAutomaticas(auto);
    expect(lista).toHaveLength(COPIAS_AUTOMATICAS_A_GUARDAR);
    expect(lista[0]!.nombre).toBe('turnos-automatica-2026-11-12-0900.db');
    expect(existsSync(path.join(auto, 'turnos-automatica-2026-11-01-0900.db'))).toBe(false);
  });
});
