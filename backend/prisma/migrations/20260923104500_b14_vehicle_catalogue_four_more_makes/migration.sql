-- ---------------------------------------------------------------------------
-- Four more makes for the booking form's catalogue (B14.1).
--
-- Peugeot, Renault, Opel and Hyundai were the nearest candidates that did not
-- make the original ten, and all four are common enough in the Swedish car
-- park that a workshop meets them regularly. Eight models each, on the same
-- rule as before: the models the *park* is made of, not this year's brochure.
--
-- A second migration rather than an edit to
-- `20260923073417_b14_vehicle_catalogue`. That one has already been applied,
-- and Prisma records a checksum per applied migration — editing it in place
-- makes every environment that already ran it fail on the next
-- `migrate deploy`, which is exactly the silent divergence §8.2 bans `db push`
-- for.
--
-- `sortOrder` continues at 110 in tens, so these sit after the original ten
-- and a later row can still be slotted between any two without renumbering.
-- No schema change: this migration inserts data and nothing else.
-- ---------------------------------------------------------------------------

INSERT INTO "VehicleMake" ("id", "name", "sortOrder", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'Peugeot', 110, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Renault', 120, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Opel',    130, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Hyundai', 140, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "VehicleModel" ("id", "makeId", "name", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, m."id", v."model", v."sortOrder", CURRENT_TIMESTAMP
FROM (VALUES
  ('Peugeot', '308',       10),
  ('Peugeot', '208',       20),
  ('Peugeot', '3008',      30),
  ('Peugeot', '206',       40),
  ('Peugeot', '207',       50),
  ('Peugeot', 'Partner',   60),
  ('Peugeot', '508',       70),
  ('Peugeot', '2008',      80),

  ('Renault', 'Clio',      10),
  ('Renault', 'Mégane',    20),
  ('Renault', 'Captur',    30),
  ('Renault', 'Scénic',    40),
  ('Renault', 'Kangoo',    50),
  ('Renault', 'Trafic',    60),
  ('Renault', 'Zoe',       70),
  ('Renault', 'Twingo',    80),

  ('Opel',    'Astra',     10),
  ('Opel',    'Insignia',  20),
  ('Opel',    'Corsa',     30),
  ('Opel',    'Zafira',    40),
  ('Opel',    'Vectra',    50),
  ('Opel',    'Meriva',    60),
  ('Opel',    'Mokka',     70),
  ('Opel',    'Vivaro',    80),

  ('Hyundai', 'i30',       10),
  ('Hyundai', 'Tucson',    20),
  ('Hyundai', 'i20',       30),
  ('Hyundai', 'Kona',      40),
  ('Hyundai', 'Santa Fe',  50),
  ('Hyundai', 'ix35',      60),
  ('Hyundai', 'i10',       70),
  ('Hyundai', 'Ioniq',     80)
) AS v("make", "model", "sortOrder")
JOIN "VehicleMake" m ON m."name" = v."make"
ON CONFLICT ("makeId", "name") DO NOTHING;
