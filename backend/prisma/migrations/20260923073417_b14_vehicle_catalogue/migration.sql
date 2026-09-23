-- CreateTable
CREATE TABLE "VehicleMake" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "VehicleMake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleModel" (
    "id" TEXT NOT NULL,
    "makeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "VehicleModel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VehicleMake_name_key" ON "VehicleMake"("name");

-- CreateIndex
CREATE INDEX "VehicleMake_sortOrder_idx" ON "VehicleMake"("sortOrder");

-- CreateIndex
CREATE INDEX "VehicleModel_makeId_sortOrder_idx" ON "VehicleModel"("makeId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleModel_makeId_name_key" ON "VehicleModel"("makeId", "name");

-- AddForeignKey
ALTER TABLE "VehicleModel" ADD CONSTRAINT "VehicleModel_makeId_fkey" FOREIGN KEY ("makeId") REFERENCES "VehicleMake"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- The catalogue's contents.
--
-- Seed data lives in the migration rather than in `prisma/seed.ts` because
-- `seed.ts` refuses to run against production by design, and this is reference
-- data the booking form needs in every environment. It is idempotent on the
-- same unique keys the model declares, so re-running a restored database or
-- applying this after a manual insert is a no-op rather than an error.
--
-- The ten makes are the most common in the Swedish passenger-car park, and the
-- eight models under each are the ones that park is actually made of — not the
-- manufacturer's current brochure. A workshop sees fifteen-year-old cars, so
-- V70 and Avensis earn their place over this year's launches.
--
-- `sortOrder` counts in tens so that a later row can be slotted between two
-- existing ones without renumbering the table.
--
-- There is deliberately no "Övrigt" row: it would be copied verbatim into
-- `Vehicle.make` and the register would fill with cars whose make is the word
-- "other". The escape hatch is a free-text field in the UI.
-- ---------------------------------------------------------------------------

INSERT INTO "VehicleMake" ("id", "name", "sortOrder", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'Volvo',          10, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Volkswagen',     20, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Toyota',         30, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Audi',           40, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'BMW',            50, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Mercedes-Benz',  60, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Kia',            70, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Skoda',          80, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Ford',           90, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Nissan',        100, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "VehicleModel" ("id", "makeId", "name", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, m."id", v."model", v."sortOrder", CURRENT_TIMESTAMP
FROM (VALUES
  ('Volvo',         'V70',        10),
  ('Volvo',         'XC60',       20),
  ('Volvo',         'V60',        30),
  ('Volvo',         'XC90',       40),
  ('Volvo',         'V90',        50),
  ('Volvo',         'S60',        60),
  ('Volvo',         'V40',        70),
  ('Volvo',         'XC40',       80),

  ('Volkswagen',    'Golf',       10),
  ('Volkswagen',    'Passat',     20),
  ('Volkswagen',    'Tiguan',     30),
  ('Volkswagen',    'Polo',       40),
  ('Volkswagen',    'Transporter',50),
  ('Volkswagen',    'Caddy',      60),
  ('Volkswagen',    'T-Roc',      70),
  ('Volkswagen',    'ID.4',       80),

  ('Toyota',        'Yaris',      10),
  ('Toyota',        'Corolla',    20),
  ('Toyota',        'RAV4',       30),
  ('Toyota',        'Auris',      40),
  ('Toyota',        'Avensis',    50),
  ('Toyota',        'Aygo',       60),
  ('Toyota',        'C-HR',       70),
  ('Toyota',        'Prius',      80),

  ('Audi',          'A4',         10),
  ('Audi',          'A6',         20),
  ('Audi',          'A3',         30),
  ('Audi',          'Q5',         40),
  ('Audi',          'Q3',         50),
  ('Audi',          'A5',         60),
  ('Audi',          'Q7',         70),
  ('Audi',          'A1',         80),

  ('BMW',           '3-serie',    10),
  ('BMW',           '5-serie',    20),
  ('BMW',           'X3',         30),
  ('BMW',           '1-serie',    40),
  ('BMW',           'X1',         50),
  ('BMW',           '2-serie',    60),
  ('BMW',           'X5',         70),
  ('BMW',           '4-serie',    80),

  ('Mercedes-Benz', 'C-klass',    10),
  ('Mercedes-Benz', 'E-klass',    20),
  ('Mercedes-Benz', 'A-klass',    30),
  ('Mercedes-Benz', 'GLC',        40),
  ('Mercedes-Benz', 'B-klass',    50),
  ('Mercedes-Benz', 'Vito',       60),
  ('Mercedes-Benz', 'CLA',        70),
  ('Mercedes-Benz', 'GLA',        80),

  ('Kia',           'Ceed',       10),
  ('Kia',           'Sportage',   20),
  ('Kia',           'Niro',       30),
  ('Kia',           'Rio',        40),
  ('Kia',           'Picanto',    50),
  ('Kia',           'Sorento',    60),
  ('Kia',           'Stonic',     70),
  ('Kia',           'EV6',        80),

  ('Skoda',         'Octavia',    10),
  ('Skoda',         'Superb',     20),
  ('Skoda',         'Fabia',      30),
  ('Skoda',         'Kodiaq',     40),
  ('Skoda',         'Karoq',      50),
  ('Skoda',         'Yeti',       60),
  ('Skoda',         'Scala',      70),
  ('Skoda',         'Enyaq',      80),

  ('Ford',          'Focus',      10),
  ('Ford',          'Kuga',       20),
  ('Ford',          'Fiesta',     30),
  ('Ford',          'Mondeo',     40),
  ('Ford',          'Transit',    50),
  ('Ford',          'C-Max',      60),
  ('Ford',          'Puma',       70),
  ('Ford',          'S-Max',      80),

  ('Nissan',        'Qashqai',    10),
  ('Nissan',        'Leaf',       20),
  ('Nissan',        'Juke',       30),
  ('Nissan',        'Micra',      40),
  ('Nissan',        'X-Trail',    50),
  ('Nissan',        'Note',       60),
  ('Nissan',        'Navara',     70),
  ('Nissan',        'Pulsar',     80)
) AS v("make", "model", "sortOrder")
JOIN "VehicleMake" m ON m."name" = v."make"
ON CONFLICT ("makeId", "name") DO NOTHING;
