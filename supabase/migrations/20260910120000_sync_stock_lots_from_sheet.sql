-- Backfills stock_lots with lots added to the "Stock Lot Godown Wise" Google
-- Sheet tab after the original 2026-09-01 migration (as of 2026-09-10).
-- Only adds genuinely missing lots + fills NULL gaps left by the original
-- migration. Deliberately does NOT touch any existing lot's live party/
-- quantity columns (qty_hariom/qty_wada_he/qty_he/qty_reliable/qty_swastik/
-- qty_balaji/qty_wada/quantity) beyond the 3 explicit NULL backfills below —
-- ~24 existing lots show the DB with higher quantities than the sheet
-- because real Inward/Outward entries have been logged through Stock
-- Movements since the sheet was last touched; the DB is correct there, the
-- sheet is stale.
--
-- Sheet row "260704" (Terpineol CP Import) was deliberately excluded from
-- the insert below — it looks like the same physical lot as existing lot
-- "H0591" (same factory lot W0636, same COA file W0636.pdf, same 925 total
-- quantity), possibly renamed with its 5 units moved from Hariom to Balaji.
-- Left as a flagged question for a human decision (rename H0591, or accept
-- both as distinct rows) rather than auto-merged/auto-renamed here.
--
-- One correction made before applying: two rows below (260683, W1006)
-- initially had no sample_off value, but that column is NOT NULL (default
-- false) — every other row in this set explicitly sets TRUE/FALSE. Confirmed
-- with the user to set both to FALSE (matches the column default and the
-- majority pattern here) rather than guess a different value.
--
-- Applied live to project nheujyknkqeimgpdfyiw on 2026-09-10 via
-- mcp__Supabase__apply_migration (migration name: sync_stock_lots_from_sheet).

insert into stock_lots (wh_lot_no, fact_lot_no, product_code, product_name, inward_date, sample_off, coa_file, qty_hariom, qty_wada_he, qty_he, qty_reliable, qty_swastik, qty_balaji, qty_wada, packing, quantity, make, remark, no_of_barrels, mou, packing_type)
values
  ('W1045', NULL, NULL, 'Alpha Pinene 95 % -ve', '2026-08-25', FALSE, 'W1045_ALPHA PINENE_COA.pdf', NULL, NULL, NULL, NULL, NULL, NULL, 5, 175, 875, NULL, NULL, NULL, 'Kg', 'Plastic'),  -- W1045 Alpha Pinene 95 % -ve
  ('W1053', NULL, NULL, 'Camphor Oil Comm HTPL', NULL, FALSE, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 16, 175, 2800, NULL, NULL, NULL, 'Kg', 'Plastic'),  -- W1053 Camphor Oil Comm HTPL
  ('260722', NULL, 'HT00511', 'CAMPHOR POWDER -BQ', '2026-09-03', FALSE, NULL, NULL, NULL, NULL, NULL, NULL, 1, NULL, 30, 30, 'Oriental', NULL, 1, 'Kg', 'BAGS'),  -- 260722 CAMPHOR POWDER -BQ
  ('260683', NULL, 'HT00500', 'Camphor Powder Blue HTPL', '2026-08-31', FALSE, NULL, NULL, NULL, NULL, NULL, NULL, 74, NULL, 30, 2220, 'WADA', NULL, 335, 'Kg', 'BAGS'),  -- 260683 Camphor Powder Blue HTPL (sample_off corrected NULL -> FALSE, see header comment)
  ('260689', NULL, 'HT00620', 'D-Limonene (MCI)', '2026-09-03', FALSE, NULL, NULL, NULL, NULL, NULL, NULL, 5, NULL, 30, 150, 'Indian Metal', 'h2055', 5, 'Kg', 'CAN'),  -- 260689 D-Limonene (MCI)
  ('260686', NULL, 'HT00620', 'D-Limonene (MCI)', '2026-09-03', FALSE, NULL, NULL, NULL, NULL, NULL, NULL, 1, NULL, 173, 173, 'Indian Metal', 'h2055', 1, 'Kg', 'MS'),  -- 260686 D-Limonene (MCI)
  ('W1014', NULL, NULL, 'Dipentene', '2026-07-16', FALSE, 'W1014_DIPENTENE_COA - Production Htpl.pdf', NULL, NULL, NULL, NULL, NULL, NULL, 2, 185, 370, NULL, NULL, NULL, 'Kg', 'Plastic'),  -- W1014 Dipentene
  ('W1055', NULL, NULL, 'Dipentene', '2026-09-03', FALSE, 'W1047 NR AROMAS - Himalaya Terpenes Mumbai.pdf', NULL, NULL, NULL, NULL, NULL, NULL, 22, 175, 3850, NULL, NULL, NULL, 'Kg', 'Plastic'),  -- W1055 Dipentene
  ('W1042', NULL, NULL, 'Dipentene', '2026-08-22', FALSE, 'W1038_PINE OIL 311_COA.pdf', NULL, NULL, NULL, NULL, NULL, NULL, 23, 169, 3887, NULL, NULL, NULL, 'Kg', 'Plastic'),  -- W1042 Dipentene
  ('W1056', NULL, NULL, 'Dipentene', NULL, FALSE, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 30, 175, 5250, NULL, NULL, NULL, 'Kg', 'Plastic'),  -- W1056 Dipentene
  ('W1050', NULL, NULL, 'Dipentene', NULL, FALSE, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 33, 175, 5775, NULL, NULL, NULL, 'Kg', 'GI'),  -- W1050 Dipentene
  ('260707', NULL, NULL, 'ISO BORNEOL ACEATE', '2026-09-03', TRUE, NULL, NULL, NULL, NULL, NULL, NULL, 1, NULL, 190, 190, 'WADA', NULL, 1, 'Kg', 'Plastic'),  -- 260707 ISO BORNEOL ACEATE
  ('260719', NULL, 'HT01610', 'Isoborneol Flakes Big [MOL]', '2026-09-03', FALSE, NULL, NULL, NULL, NULL, NULL, NULL, 2, NULL, 30, 60, 'MOL', '2 flakes damange', 2, 'Kg', 'Carbouys'),  -- 260719 Isoborneol Flakes Big [MOL]
  ('W1052', NULL, NULL, 'Pine oil 311', NULL, FALSE, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 52, 173, 8996, NULL, NULL, NULL, 'Kg', 'GI'),  -- W1052 Pine oil 311
  ('260701', 'W0854', NULL, 'Pine Oil 311 (22%)', '2026-09-03', TRUE, NULL, NULL, NULL, NULL, NULL, NULL, 2, NULL, 200, 400, 'WADA', NULL, 2, 'Ltr', 'Plastic'),  -- 260701 Pine Oil 311 (22%)
  ('W1059', NULL, NULL, 'Pine Oil 311 (22%)', NULL, FALSE, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 82, 173, 14186, NULL, NULL, NULL, 'Kg', 'Plastic'),  -- W1059 Pine Oil 311 (22%)
  ('W1047', NULL, NULL, 'Pine oil 85', NULL, FALSE, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 227, 185, 41995, NULL, NULL, NULL, 'Kg', 'MS'),  -- W1047 Pine oil 85
  ('W1039', NULL, NULL, 'Pine Tar 100', '2026-08-20', FALSE, 'W1038_PINE OIL 311_COA.pdf', NULL, NULL, NULL, NULL, NULL, NULL, 15, 200, 3000, NULL, NULL, NULL, 'Kg', 'Plastic'),  -- W1039 Pine Tar 100
  ('W1006', NULL, NULL, 'Terpineol EP Super', NULL, FALSE, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 8, 185, 1480, NULL, NULL, NULL, 'Kg', 'HDPE'),  -- W1006 Terpineol EP Super (sample_off corrected NULL -> FALSE, see header comment)
  ('W1040', NULL, NULL, 'Terpineol EP Super', '2026-08-21', FALSE, 'W1038_PINE OIL 311_COA.pdf', NULL, NULL, NULL, NULL, NULL, NULL, 19, 185, 3515, NULL, NULL, NULL, 'Kg', 'Plastic'),  -- W1040 Terpineol EP Super
  ('260710', NULL, NULL, 'Terpinyl Acetate', '2026-09-03', TRUE, NULL, NULL, NULL, NULL, NULL, NULL, 1, NULL, 190, 190, 'Jayshree', '3*200 KG ,1*97 KG', 1, 'Kg', 'New Plastic');  -- 260710 Terpinyl Acetate

update stock_lots set quantity = 175 where wh_lot_no = '260425' and quantity is null;
update stock_lots set quantity = 175 where wh_lot_no = '260443' and quantity is null;
update stock_lots set qty_balaji = 3, quantity = 600 where wh_lot_no = '260346' and quantity is null;
