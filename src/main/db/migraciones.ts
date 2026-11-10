// Migraciones: la lista de cambios de la base, en orden. La versión de la base
// (PRAGMA user_version) dice cuántas ya se aplicaron. REGLA: nunca editar una
// migración que ya se entregó; si hay que cambiar algo, se agrega otra.

export interface Migracion {
  nombre: string;
  sql: string;
}

export const MIGRACIONES: Migracion[] = [
  {
    nombre: 'Consultorio: obras sociales, profesionales con horarios, días sin atención y pacientes',
    sql: /* sql */ `
      CREATE TABLE configuracion (
        clave TEXT PRIMARY KEY,
        valor TEXT NOT NULL
      );
      INSERT INTO configuracion (clave, valor) VALUES
        ('nombre_consultorio', 'Mi Consultorio'),
        ('direccion', ''),
        ('telefono', '');

      CREATE TABLE obras_sociales (
        id        INTEGER PRIMARY KEY,
        nombre    TEXT    NOT NULL COLLATE NOCASE UNIQUE,
        activo    INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
        creado_en TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
      );

      CREATE TABLE profesionales (
        id                 INTEGER PRIMARY KEY,
        nombre             TEXT    NOT NULL,
        apellido           TEXT    NOT NULL,
        titulo             TEXT    NOT NULL DEFAULT '',          -- "Dra.", "Lic."…
        especialidad       TEXT    NOT NULL DEFAULT '',
        matricula          TEXT    NOT NULL DEFAULT '',
        color              TEXT    NOT NULL DEFAULT 'eucalipto', -- para distinguirlo en la agenda
        duracion_turno_min INTEGER NOT NULL DEFAULT 30 CHECK (duracion_turno_min BETWEEN 5 AND 240),
        activo             INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
        creado_en          TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
      );

      -- Franjas de atención semanales. Un día puede tener varias (mañana y tarde).
      -- dia_semana: 1 = lunes … 7 = domingo. Horas 'HH:MM'.
      CREATE TABLE horarios (
        id             INTEGER PRIMARY KEY,
        profesional_id INTEGER NOT NULL REFERENCES profesionales (id) ON DELETE CASCADE,
        dia_semana     INTEGER NOT NULL CHECK (dia_semana BETWEEN 1 AND 7),
        desde          TEXT    NOT NULL,
        hasta          TEXT    NOT NULL,
        CHECK (desde < hasta)
      );
      CREATE INDEX horarios_por_profesional ON horarios (profesional_id, dia_semana);

      -- Días sin atención: feriados, vacaciones, congresos. Sin profesional = todo el consultorio.
      CREATE TABLE bloqueos (
        id             INTEGER PRIMARY KEY,
        profesional_id INTEGER REFERENCES profesionales (id) ON DELETE CASCADE,
        desde          TEXT    NOT NULL,
        hasta          TEXT    NOT NULL,
        motivo         TEXT    NOT NULL DEFAULT '',
        creado_en      TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
        CHECK (desde <= hasta)
      );

      CREATE TABLE pacientes (
        id               INTEGER PRIMARY KEY,
        nombre           TEXT    NOT NULL,
        apellido         TEXT    NOT NULL,
        dni              TEXT,                 -- solo números; puede faltar
        fecha_nacimiento TEXT,                 -- 'AAAA-MM-DD'
        telefono         TEXT    NOT NULL DEFAULT '',
        email            TEXT    NOT NULL DEFAULT '',
        obra_social_id   INTEGER REFERENCES obras_sociales (id),  -- NULL = particular
        numero_afiliado  TEXT    NOT NULL DEFAULT '',
        notas            TEXT    NOT NULL DEFAULT '',             -- administrativas, NO clínicas
        busqueda         TEXT    NOT NULL DEFAULT '',             -- apellido, nombre, dni y teléfono sin tildes
        activo           INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
        creado_en        TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
        actualizado_en   TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
      );
      -- El DNI no se repite, pero puede no estar cargado (índice único PARCIAL).
      CREATE UNIQUE INDEX pacientes_dni_unico ON pacientes (dni) WHERE dni IS NOT NULL;
      CREATE INDEX pacientes_por_apellido ON pacientes (apellido COLLATE NOCASE, nombre COLLATE NOCASE);
    `,
  },
];
