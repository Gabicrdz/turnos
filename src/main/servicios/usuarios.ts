// Usuarios con PIN (como en la Caja). El PIN NUNCA se guarda: se guarda el
// resultado de pasarlo por scrypt (una función "lenta a propósito") junto con
// una sal al azar. Para revisar un PIN se repite la cuenta y se comparan.
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { z } from 'zod';
import type { BaseDeDatos } from '../db/conexion';
import type { esquemaUsuario } from '@compartido/esquemas';
import type { Rol, Usuario } from '@compartido/tipos';
import { ErrorDeUsuario } from './errores';

type Lector = Pick<BaseDeDatos, '$client'>;

export function hashDePin(pin: string, sal: string = randomBytes(16).toString('hex')) {
  return { hash: scryptSync(pin, sal, 32).toString('hex'), sal };
}

export function pinCorrecto(pin: string, hash: string, sal: string): boolean {
  const calculado = Buffer.from(hashDePin(pin, sal).hash, 'hex');
  const guardado = Buffer.from(hash, 'hex');
  // timingSafeEqual tarda lo mismo acierte o no (no da pistas por el tiempo)
  return calculado.length === guardado.length && timingSafeEqual(calculado, guardado);
}

const SELECT_USUARIO = `SELECT id, nombre, rol, profesional_id AS profesionalId FROM usuarios`;

/** Activos: administración primero, después profesionales y recepción. */
export function listarUsuarios(db: Lector): Usuario[] {
  return db.$client
    .prepare(`${SELECT_USUARIO} WHERE activo = 1 ORDER BY CASE rol WHEN 'admin' THEN 0 WHEN 'profesional' THEN 1 ELSE 2 END, nombre COLLATE NOCASE`)
    .all() as Usuario[];
}

export function hayUsuarios(db: Lector): boolean {
  return db.$client.prepare('SELECT 1 FROM usuarios LIMIT 1').get() !== undefined;
}

function adminsActivos(db: Lector, excepto: number): number {
  return (db.$client.prepare(`SELECT count(*) AS n FROM usuarios WHERE activo = 1 AND rol = 'admin' AND id <> ?`).get(excepto) as { n: number }).n;
}

/** Crea o edita un usuario. Al crear, el PIN es obligatorio. */
export function guardarUsuario(db: BaseDeDatos, datos: z.output<typeof esquemaUsuario>): number {
  return db.$client.transaction(() => {
    const repetido = db.$client
      .prepare('SELECT 1 FROM usuarios WHERE activo = 1 AND nombre = ? COLLATE NOCASE AND id IS NOT ?')
      .get(datos.nombre, datos.id ?? null);
    if (repetido) throw new ErrorDeUsuario(`Ya hay un usuario que se llama "${datos.nombre}".`);

    if (datos.profesionalId !== null) {
      const p = db.$client
        .prepare(`SELECT trim(titulo || ' ' || nombre || ' ' || apellido) AS nombre, activo FROM profesionales WHERE id = ?`)
        .get(datos.profesionalId) as { nombre: string; activo: number } | undefined;
      if (!p) throw new ErrorDeUsuario('Ese profesional ya no existe.');
      if (p.activo !== 1) throw new ErrorDeUsuario(`${p.nombre} está dado de baja.`);
      const otro = db.$client
        .prepare('SELECT nombre FROM usuarios WHERE activo = 1 AND profesional_id = ? AND id IS NOT ?')
        .get(datos.profesionalId, datos.id ?? null) as { nombre: string } | undefined;
      if (otro) throw new ErrorDeUsuario(`${p.nombre} ya tiene usuario ("${otro.nombre}").`);
    }

    if (!datos.id) {
      if (!datos.pin) throw new ErrorDeUsuario('Elegí un PIN de 4 a 6 números.');
      const { hash, sal } = hashDePin(datos.pin);
      return Number(
        db.$client
          .prepare('INSERT INTO usuarios (nombre, rol, profesional_id, pin_hash, pin_sal) VALUES (?, ?, ?, ?, ?)')
          .run(datos.nombre, datos.rol, datos.profesionalId, hash, sal).lastInsertRowid,
      );
    }

    const anterior = db.$client.prepare('SELECT rol FROM usuarios WHERE id = ? AND activo = 1').get(datos.id) as { rol: Rol } | undefined;
    if (!anterior) throw new ErrorDeUsuario('Ese usuario ya no existe.');
    if (anterior.rol === 'admin' && datos.rol !== 'admin' && adminsActivos(db, datos.id) === 0) {
      throw new ErrorDeUsuario('Tiene que quedar al menos un usuario de administración. Creá otro antes de cambiar este.');
    }
    db.$client.prepare('UPDATE usuarios SET nombre = ?, rol = ?, profesional_id = ? WHERE id = ?').run(datos.nombre, datos.rol, datos.profesionalId, datos.id);
    if (datos.pin) {
      const { hash, sal } = hashDePin(datos.pin);
      db.$client.prepare('UPDATE usuarios SET pin_hash = ?, pin_sal = ? WHERE id = ?').run(hash, sal, datos.id);
    }
    return datos.id;
  })();
}

/** Baja lógica: no puede entrar más, pero lo que hizo queda registrado con su nombre. */
export function darDeBajaUsuario(db: BaseDeDatos, id: number, quienLoHace: number): void {
  if (id === quienLoHace) throw new ErrorDeUsuario('No podés darte de baja a vos mismo.');
  const u = db.$client.prepare('SELECT rol FROM usuarios WHERE id = ? AND activo = 1').get(id) as { rol: Rol } | undefined;
  if (!u) throw new ErrorDeUsuario('Ese usuario ya no existe.');
  if (u.rol === 'admin' && adminsActivos(db, id) === 0) throw new ErrorDeUsuario('Tiene que quedar al menos un usuario de administración.');
  db.$client.prepare('UPDATE usuarios SET activo = 0 WHERE id = ?').run(id);
}

/** Revisa el PIN. Devuelve el usuario o null si no coincide. */
export function verificarPin(db: Lector, id: number, pin: string): Usuario | null {
  const u = db.$client.prepare(`SELECT id, nombre, rol, profesional_id AS profesionalId, pin_hash AS pinHash, pin_sal AS pinSal FROM usuarios WHERE id = ? AND activo = 1`).get(id) as
    | (Usuario & { pinHash: string; pinSal: string })
    | undefined;
  if (!u) throw new ErrorDeUsuario('Ese usuario ya no existe.');
  if (!pinCorrecto(pin, u.pinHash, u.pinSal)) return null;
  return { id: u.id, nombre: u.nombre, rol: u.rol, profesionalId: u.profesionalId };
}
