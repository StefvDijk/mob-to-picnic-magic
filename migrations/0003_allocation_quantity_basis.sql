-- A cart allocation must retain the content basis used for its quantity.
-- NULL means unverified; proposal validation must not treat it as a proven match.
ALTER TABLE basket_allocations
  ADD COLUMN quantity_basis TEXT CHECK (quantity_basis IN ('net', 'drained'));
