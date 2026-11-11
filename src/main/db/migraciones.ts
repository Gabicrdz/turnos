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
  {
    nombre: 'Turnos: agenda con estados y sin superposiciones',
    sql: /* sql */ `
      CREATE TABLE turnos (
        id             INTEGER PRIMARY KEY,
        profesional_id INTEGER NOT NULL REFERENCES profesionales (id),
        paciente_id    INTEGER NOT NULL REFERENCES pacientes (id),
        fecha          TEXT    NOT NULL,                -- 'AAAA-MM-DD'
        desde          TEXT    NOT NULL,                -- 'HH:MM'
        hasta          TEXT    NOT NULL,                -- 'HH:MM' (desde + duración)
        estado         TEXT    NOT NULL DEFAULT 'reservado'
                       CHECK (estado IN ('reservado', 'confirmado', 'en_sala', 'atendido', 'ausente', 'cancelado')),
        motivo         TEXT    NOT NULL DEFAULT '',     -- "Control", "Primera vez"… (administrativo)
        llego_en       TEXT,                            -- cuándo pasó a "en sala" (para la sala de espera)
        creado_en      TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
        actualizado_en TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
        CHECK (desde < hasta)
      );
      CREATE INDEX turnos_por_dia ON turnos (fecha, profesional_id, desde);
      CREATE INDEX turnos_por_paciente ON turnos (paciente_id, fecha);

      -- SEGUNDA LÍNEA DE DEFENSA: aunque el programa ya controla que dos turnos
      -- del mismo profesional no se pisen, la base también se niega. Así, ni un
      -- error del programa ni alguien editando con DB Browser pueden romper la agenda.
      -- Dos turnos se pisan si uno empieza antes de que termine el otro (y al revés).
      -- Los cancelados no cuentan: liberan el horario.
      CREATE TRIGGER turnos_sin_superposicion_al_crear
      BEFORE INSERT ON turnos
      WHEN NEW.estado <> 'cancelado'
      BEGIN
        SELECT RAISE(ABORT, 'turno_superpuesto')
        WHERE EXISTS (
          SELECT 1 FROM turnos t
          WHERE t.profesional_id = NEW.profesional_id AND t.fecha = NEW.fecha AND t.estado <> 'cancelado'
            AND t.desde < NEW.hasta AND NEW.desde < t.hasta
        );
      END;

      CREATE TRIGGER turnos_sin_superposicion_al_cambiar
      BEFORE UPDATE OF profesional_id, fecha, desde, hasta, estado ON turnos
      WHEN NEW.estado <> 'cancelado'
      BEGIN
        SELECT RAISE(ABORT, 'turno_superpuesto')
        WHERE EXISTS (
          SELECT 1 FROM turnos t
          WHERE t.id <> NEW.id
            AND t.profesional_id = NEW.profesional_id AND t.fecha = NEW.fecha AND t.estado <> 'cancelado'
            AND t.desde < NEW.hasta AND NEW.desde < t.hasta
        );
      END;
    `,
  },
  {
    nombre: 'Consultas (historia clínica), cobros, precio de consulta y recordatorios por WhatsApp',
    sql: /* sql */ `
      -- Columnas nuevas en tablas que ya tienen datos: ADD COLUMN con un valor por defecto
      ALTER TABLE profesionales ADD COLUMN precio_consulta_centavos INTEGER NOT NULL DEFAULT 0
        CHECK (precio_consulta_centavos >= 0);
      ALTER TABLE turnos ADD COLUMN recordado_en TEXT;   -- cuándo se mandó el recordatorio

      INSERT INTO configuracion (clave, valor) VALUES
        ('mensaje_recordatorio',
         'Hola {nombre}! Te recordamos tu turno con {profesional} el {dia} a las {hora} en {consultorio}. Por favor, respondé SÍ para confirmar o avisanos si no podés venir. ¡Gracias!');

      -- Notas de la consulta (historia clínica simple): una por turno.
      CREATE TABLE consultas (
        id             INTEGER PRIMARY KEY,
        turno_id       INTEGER NOT NULL UNIQUE REFERENCES turnos (id),
        paciente_id    INTEGER NOT NULL REFERENCES pacientes (id),
        profesional_id INTEGER NOT NULL REFERENCES profesionales (id),
        fecha          TEXT    NOT NULL,                -- el día del turno
        motivo         TEXT    NOT NULL DEFAULT '',
        evolucion      TEXT    NOT NULL,                -- lo que se vio y se hizo
        diagnostico    TEXT    NOT NULL DEFAULT '',
        indicaciones   TEXT    NOT NULL DEFAULT '',
        creado_en      TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
        actualizado_en TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
      );
      CREATE INDEX consultas_por_paciente ON consultas (paciente_id, fecha);

      -- Cobro de cada turno: particular (paga el paciente) u obra social
      -- (orden o autorización, con copago opcional). Se ANULAN, no se borran.
      CREATE TABLE cobros (
        id                  INTEGER PRIMARY KEY,
        turno_id            INTEGER NOT NULL REFERENCES turnos (id),
        tipo                TEXT    NOT NULL CHECK (tipo IN ('particular', 'obra_social')),
        obra_social_id      INTEGER REFERENCES obras_sociales (id),
        numero_autorizacion TEXT    NOT NULL DEFAULT '',
        monto_centavos      INTEGER NOT NULL DEFAULT 0 CHECK (monto_centavos >= 0),  -- lo que paga el paciente
        metodo              TEXT    CHECK (metodo IN ('efectivo', 'transferencia', 'debito', 'credito')),
        anulado             INTEGER NOT NULL DEFAULT 0 CHECK (anulado IN (0, 1)),
        anulado_en          TEXT,
        creado_en           TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
        CHECK (tipo = 'particular' OR obra_social_id IS NOT NULL),
        CHECK (monto_centavos = 0 OR metodo IS NOT NULL)
      );
      -- Un solo cobro vigente por turno (los anulados no cuentan): índice único PARCIAL
      CREATE UNIQUE INDEX cobros_uno_por_turno ON cobros (turno_id) WHERE anulado = 0;
    `,
  },
  {
    nombre: 'Usuarios con PIN y roles; quién dio cada turno, quién cobró y quién escribió cada consulta',
    sql: /* sql */ `
      -- El PIN NO se guarda: se guarda su "huella" (hash) con una sal al azar.
      -- profesional_id vincula al usuario con su ficha de profesional: es lo que
      -- le permite ver la historia clínica y cargar las notas de SUS turnos.
      CREATE TABLE usuarios (
        id             INTEGER PRIMARY KEY,
        nombre         TEXT    NOT NULL,
        rol            TEXT    NOT NULL CHECK (rol IN ('admin', 'recepcion', 'profesional')),
        profesional_id INTEGER REFERENCES profesionales (id),
        pin_hash       TEXT    NOT NULL,
        pin_sal        TEXT    NOT NULL,
        activo         INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
        creado_en      TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
        CHECK (rol <> 'profesional' OR profesional_id IS NOT NULL),
        CHECK (rol <> 'recepcion' OR profesional_id IS NULL)
      );
      CREATE UNIQUE INDEX usuarios_nombre_unico ON usuarios (nombre COLLATE NOCASE) WHERE activo = 1;
      -- Un solo usuario (activo) por profesional
      CREATE UNIQUE INDEX usuarios_uno_por_profesional ON usuarios (profesional_id) WHERE activo = 1 AND profesional_id IS NOT NULL;

      -- Quién hizo cada cosa (NULL en lo cargado antes de que hubiera usuarios)
      ALTER TABLE turnos ADD COLUMN dado_por INTEGER REFERENCES usuarios (id);
      ALTER TABLE consultas ADD COLUMN usuario_id INTEGER REFERENCES usuarios (id);
      ALTER TABLE cobros ADD COLUMN usuario_id INTEGER REFERENCES usuarios (id);
    `,
  },
];
