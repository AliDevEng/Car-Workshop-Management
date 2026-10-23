-- Apply the confirmed workshop identity to installations that already have a
-- `workshop` settings row. Keep details the owner did not replace here (for
-- example organisation number and e-mail) exactly as they are.
UPDATE "Setting"
SET
  "valueJson" = "valueJson" || jsonb_build_object(
    'name', 'M&R AUTOMOTIVE',
    'address', 'Gustavslundsvägen 10',
    'postalCode', '241 39',
    'city', 'Eslöv',
    'phone', '+46 765 79 54 90',
    'secondaryPhone', '+46 737 01 84 04'
  ),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'workshop';
