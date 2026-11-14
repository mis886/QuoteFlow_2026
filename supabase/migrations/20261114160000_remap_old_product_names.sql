-- 2026-11-14: re-map OLD saved product names to the master list.
-- Mapping: Claude outputs/product_name_mapping_2026-11-14.csv (user-approved),
-- 352 saved names with a base name. The 17 without one are NOT touched.
--
-- Rules, for a saved product name EXACTLY equal to a mapped "saved name":
--   product name -> base name
--   grade        -> mapped grade, ONLY if the current grade is empty
--   hsn          -> base name's product_catalog HSN ('' when none) — line items only
-- Scope: enquiries.items, quotes.items, orders.items, orders.dispatch_snapshot->items,
--        dispatch_entries.items, sample_products (product_name/grade),
--        samples.product_name/product_grade, samples.products (name/grade).
-- BACKUP: every changed row's old values are copied into backup_20261114_* tables first.
-- Undo: supabase/rollback/20261114160000_remap_old_product_names_ROLLBACK.sql (not a migration).

create temp table _remap (saved text primary key, base text not null, grade text not null) on commit drop;
insert into _remap (saved, base, grade) values
  ('PINE OIL 85', 'Pine Oil 85', ''),
  ('Terpineol PG ', 'Terpineol', 'PG'),
  ('Isoborneol Flakes small ', 'Isoborneol Flakes', 'Small'),
  ('Isoborneol Flakes BIG ', 'Isoborneol Flakes', 'Big'),
  ('Gum Rosin ', 'Gum Rosin', ''),
  ('Isoborneol Flakes big ', 'Isoborneol Flakes', 'Big'),
  ('Gum Rosin WW Indo ', 'Gum Rosin', 'WW Indo'),
  ('Gum Rosin WG Grade ', 'Gum Rosin', 'WG Grade'),
  ('Isoborneol Flakes SMALL ', 'Isoborneol Flakes', 'Small'),
  ('Gum Rosin WW INDO ', 'Gum Rosin', 'WW Indo'),
  ('Terpineol EP ', 'Terpineol EP', ''),
  ('Gum Rosin WW Grade ', 'Gum Rosin', 'WW Grade'),
  ('Isoborneol Flakes Small ', 'Isoborneol Flakes', 'Small'),
  ('Beta Pinene 95%', 'Beta Pinene', '95%'),
  ('Alpha Pinene 95%', 'Alpha Pinene', '95%'),
  ('Terpineol Commercial ', 'Terpineol', 'Commercial'),
  ('Gum Rosin N Grade ', 'Gum Rosin', 'N Grade'),
  ('Isoborneol Flakes small', 'Isoborneol Flakes', 'Small'),
  ('Terpineol pg', 'Terpineol', 'PG'),
  ('Terpinolene 90', 'Terpinolene', '90'),
  ('Camphor Oil (comm)', 'Camphor Oil', 'Commercial'),
  ('Pine Oil Std Special ', 'Pine Oil', 'Std Special'),
  ('Terpineol PG', 'Terpineol', 'PG'),
  ('Terpineol pg ', 'Terpineol', 'PG'),
  ('Gum Rosin WW Grade Indo ', 'Gum Rosin', 'WW Grade Indo'),
  ('Isoborneol Flakes (small)', 'Isoborneol Flakes', 'Small'),
  ('Terpineol comm', 'Terpineol', 'Commercial'),
  ('Camphor Oil Commercial', 'Camphor Oil', 'Commercial'),
  ('DD Turpentine', 'Turpentine', 'DD'),
  ('Terpinolene 20', 'Terpinolene', '20'),
  ('Dipentine ', 'Dipentene', ''),
  ('Isoborneol Flakes Small', 'Isoborneol Flakes', 'Small'),
  (' small Isoborneol Flakes', 'Isoborneol Flakes', 'Small'),
  ('DHM Tops White', 'DHM Tops', 'White'),
  ('DHM Tops Yellow ', 'DHM Tops', 'Yellow'),
  ('Gum Rosin INDO', 'Gum Rosin', 'Indo'),
  ('Isoborneol Flakes BIG', 'Isoborneol Flakes', 'Big'),
  ('Pine Oil ', 'Pine Oil', ''),
  ('Pine Tar 100', 'Pine Tar', '100'),
  ('Terpineol ep', 'Terpineol EP', ''),
  ('Alpha Pinene 95% Negative OR', 'Alpha Pinene', '95% Negative OR'),
  ('Gum Rosin INDO ', 'Gum Rosin', 'Indo'),
  ('Gum Rosin WW ', 'Gum Rosin', 'WW'),
  ('Gum Rosin WW Grade Indian ', 'Gum Rosin', 'WW Grade Indian'),
  ('Isoborneol Flakes (Small)', 'Isoborneol Flakes', 'Small'),
  ('Pine Oil Standard Special ', 'Pine Oil', 'Std Special'),
  ('PINE OIL STD SPECIAL ', 'Pine Oil', 'Std Special'),
  ('Pine Oil Std.Spl.', 'Pine Oil', 'Std Special'),
  ('Terpineol Comm', 'Terpineol', 'Commercial'),
  ('Terpineol ep super ', 'Terpineol EP', 'Super'),
  ('Terpinyl Acetate ', 'Terpinyl Acetate', ''),
  ('Camphor Oil Commercial ', 'Camphor Oil', 'Commercial'),
  ('DHM Tops (white)', 'DHM Tops', 'White'),
  ('Gum Rosin B GRADE ', 'Gum Rosin', 'B Grade'),
  ('Gum Rosin WW Grade', 'Gum Rosin', 'WW Grade'),
  ('Isoborneol Flakes Big ', 'Isoborneol Flakes', 'Big'),
  ('Anthamber Tops ', 'Anthamber Tops', ''),
  ('Anthamber Tops (yellow)', 'Anthamber Tops', 'Yellow'),
  ('DHM Tops WHITE', 'DHM Tops', 'White'),
  ('DHM Tops White ', 'DHM Tops', 'White'),
  ('Dipentine', 'Dipentene', ''),
  ('Gum Rosin Crushed ', 'Gum Rosin', 'Crushed'),
  ('Gum Rosin N', 'Gum Rosin', 'N'),
  ('Isoborneol Flakes SMALL', 'Isoborneol Flakes', 'Small'),
  ('Pine oil Std Special ', 'Pine Oil', 'Std Special'),
  ('Terpene 610', 'Terpene', '610'),
  ('Terpinolene 90 ', 'Terpinolene', '90'),
  (' Big Isoborneol Flakes', 'Isoborneol Flakes', 'Big'),
  ('Camphor Oil pfg', 'Camphor Oil', 'PFG'),
  ('Camphor Powder T Grade ', 'Camphor Powder', 'T Grade'),
  ('Gum Rosin Indo ', 'Gum Rosin', 'Indo'),
  ('Gum Rosin WG', 'Gum Rosin', 'WG'),
  ('Gum Rosin WW Indo Non PHT ', 'Gum Rosin', 'WW Indo Non PHT'),
  ('Terpineol EP SUPER ', 'Terpineol EP', 'Super'),
  ('  small Isoborneol Flakes', 'Isoborneol Flakes', 'Small'),
  ('Alpha Pinene 95 -', 'Alpha Pinene', '95'),
  ('Alpha Pinene 97% (-ve) 37 OR ', 'Alpha Pinene', '97% -ve 37 OR'),
  ('Alpha Pinene 98% ', 'Alpha Pinene', '98%'),
  ('Alpha Pinene 99%', 'Alpha Pinene', '99%'),
  ('Alpha Pinene 99% -21', 'Alpha Pinene', '99% -21'),
  ('Alpha Pinene LEAVO ', 'Alpha Pinene', 'Leavo'),
  ('Alpha Pinene95% -24', 'Alpha Pinene', '95% -24'),
  ('Alpha Pinene99% -24 ', 'Alpha Pinene', '99% -24'),
  ('Beta Pinene ', 'Beta Pinene', ''),
  ('Beta Pinene 95 %', 'Beta Pinene', '95%'),
  ('Beta Pinene 98%', 'Beta Pinene', '98%'),
  ('Camphor Oil ', 'Camphor Oil', ''),
  ('Camphor Oil  (pfg)', 'Camphor Oil', 'PFG'),
  ('Camphor Oil  PFG', 'Camphor Oil', 'PFG'),
  ('Camphor Oil  Pfg ', 'Camphor Oil', 'PFG'),
  ('Camphor Oil ( comm) ', 'Camphor Oil', 'Commercial'),
  ('Camphor Oil (pfg)', 'Camphor Oil', 'PFG'),
  ('Camphor Oil PFG ', 'Camphor Oil', 'PFG'),
  ('Camphor Powder ', 'Camphor Powder', ''),
  ('Camphor Powder  ( Blue Bags )', 'Camphor Powder', 'Blue Bags'),
  ('Camphor Powder - BQ ', 'Camphor Powder', 'BQ'),
  ('Camphor Powder ( Red Bag )', 'Camphor Powder', 'Red Bags'),
  ('Camphor Powder ( Red Bags )', 'Camphor Powder', 'Red Bags'),
  ('Camphor Powder (natural )', 'Camphor Powder', 'Natural'),
  ('Camphor Powder blue ', 'Camphor Powder', 'Blue'),
  ('Camphor Powder Natural ', 'Camphor Powder', 'Natural'),
  ('Camphor Powder T Grade ( GF ) ', 'Camphor Powder', 'T Grade GF'),
  ('DHM Tops ', 'DHM Tops', ''),
  ('DHM Tops  (Y)', 'DHM Tops', 'Y'),
  ('DHM Tops (100)', 'DHM Tops', '100'),
  ('DHM Tops (W) ', 'DHM Tops', 'W'),
  ('DHM Tops (Yellow) ', 'DHM Tops', 'Yellow'),
  ('DHM Tops 100', 'DHM Tops', '100'),
  ('DHM Tops 200', 'DHM Tops', '200'),
  ('DHM Tops 200 ( Yellow) ', 'DHM Tops', '200 Yellow'),
  ('Dipentene ', 'Dipentene', ''),
  ('Dipentine Zest ', 'Dipentene', 'Zest'),
  ('Gamma Terpinene ', 'Gamma Terpinene', ''),
  ('Gum Rosin  PHT', 'Gum Rosin', 'PHT'),
  ('Gum Rosin ( WW Grade ) ', 'Gum Rosin', 'WW Grade'),
  ('Gum Rosin (b grade )', 'Gum Rosin', 'B Grade'),
  ('Gum Rosin (BRAZIL)', 'Gum Rosin', 'Brazil'),
  ('Gum Rosin (indo non pht)', 'Gum Rosin', 'Indo Non PHT'),
  ('Gum Rosin B ', 'Gum Rosin', 'B'),
  ('Gum Rosin Black Grade ', 'Gum Rosin', 'Black Grade'),
  ('Gum Rosin indo', 'Gum Rosin', 'Indo'),
  ('GUM ROSIN INDO', 'Gum Rosin', 'Indo'),
  ('Gum Rosin Indo PHT ', 'Gum Rosin', 'Indo PHT'),
  ('Gum Rosin Indonesia', 'Gum Rosin', 'Indonesia'),
  ('Gum Rosin WG ', 'Gum Rosin', 'WG'),
  ('Gum Rosin WG grade ', 'Gum Rosin', 'WG Grade'),
  ('Gum Rosin WW  Indo ', 'Gum Rosin', 'WW Indo'),
  ('Gum Rosin WW GRADE ', 'Gum Rosin', 'WW Grade'),
  ('GUM ROSIN WW GRADE (BRAZIL)', 'Gum Rosin', 'WW Grade Brazil'),
  ('Gum Rosin WW Grade Indonesia', 'Gum Rosin', 'WW Grade Indonesia'),
  ('Gum Rosin WW Indo Private ', 'Gum Rosin', 'WW Indo Private'),
  ('Gum Rosin WW Indonesia', 'Gum Rosin', 'WW Indonesia'),
  ('Gum Rosin WW Indonesia ', 'Gum Rosin', 'WW Indonesia'),
  ('Isoborneol Flakes ', 'Isoborneol Flakes', ''),
  ('Isoborneol Flakes (Big )', 'Isoborneol Flakes', 'Big'),
  ('Isoborneol Flakes (big)', 'Isoborneol Flakes', 'Big'),
  ('Isoborneol Flakes (Big)', 'Isoborneol Flakes', 'Big'),
  ('Isoborneol Normal ', 'Isoborneol', 'Normal'),
  ('OTPT', 'OT PT', ''),
  ('PINE OIL ', 'Pine Oil', ''),
  ('Pine Oil  (311 Grade)', 'Pine Oil', '311 Grade'),
  ('Pine Oil 211 ', 'Pine Oil 211', ''),
  ('Pine oil 311', 'Pine Oil 311', ''),
  ('Pine Oil 311 ( Phenyl Grade )', 'Pine Oil 311', 'Phenyl Grade'),
  ('Pine Oil 411 (32%)', 'Pine Oil 411', '32%'),
  ('Pine Oil 42', 'Pine Oil', '42'),
  ('Pine Oil 511 ', 'Pine Oil 511', ''),
  ('Pine Oil 511 +', 'Pine Oil 511', '+'),
  ('Pine Oil 511+', 'Pine Oil 511', '+'),
  ('Pine Oil Std Spcl ', 'Pine Oil', 'Std Special'),
  ('Pine Oil.Std.Spl.', 'Pine Oil', 'Std Special'),
  ('Rosin ( WW Indo) ', 'Rosin', 'WW Indo'),
  ('Rosin WW (INDO)', 'Rosin', 'WW Indo'),
  ('small Isoborneol Flakes', 'Isoborneol Flakes', 'Small'),
  ('Terpene 620', 'Terpene', '620'),
  ('Terpene 620 ', 'Terpene', '620'),
  ('Terpeneol PG ', 'Terpineol', 'PG'),
  ('Terpenolene-20', 'Terpinolene', '20'),
  ('Terpineol ', 'Terpineol', ''),
  ('Terpineol  PG', 'Terpineol', 'PG'),
  ('Terpineol  pg ', 'Terpineol', 'PG'),
  ('Terpineol  PG ', 'Terpineol', 'PG'),
  ('Terpineol (comm)', 'Terpineol', 'Commercial'),
  ('Terpineol (commercial)', 'Terpineol', 'Commercial'),
  ('Terpineol BP', 'Terpineol', 'BP'),
  ('TERPINEOL BP ', 'Terpineol', 'BP'),
  ('Terpineol COM', 'Terpineol', 'Commercial'),
  ('Terpineol cp', 'Terpineol', 'CP'),
  ('Terpineol EP Super ', 'Terpineol EP', 'Super'),
  ('Terpineol P G ', 'Terpineol', 'PG'),
  ('Terpinyl Acetate (-)', 'Terpinyl Acetate', ''),
  ('Turpentine ', 'Turpentine', ''),
  ('Turpentine DD ', 'Turpentine', 'DD'),
  ('Turpentine Oil', 'Turpentine', ''),
  ('    Big Isoborneol Flakes', 'Isoborneol Flakes', 'Big'),
  ('Alpha Pinene +-', 'Alpha Pinene', '+'),
  ('Alpha Pinene 95% ', 'Alpha Pinene', '95%'),
  ('Alpha Pinene 98 +ve ', 'Alpha Pinene', '98 +ve'),
  ('Alpha Pinene 98 +ve ( LOT NO 260413 )', 'Alpha Pinene', '98 +ve Lot No 260413'),
  ('Alpha Pinene 98% ( +VE ) 30-35 OR', 'Alpha Pinene', '98% +ve 30-35 OR'),
  ('Anthamber Tops White', 'Anthamber Tops', 'White'),
  ('Camphor Oil Comm', 'Camphor Oil', 'Commercial'),
  ('Camphor Powder Red Bags L Grade', 'Camphor Powder', 'Red Bags L Grade'),
  ('Camphor Powder T Grade ( Blue Bags )', 'Camphor Powder', 'T Grade Blue Bags'),
  ('CITRONELLA TOPS', 'Citronella Tops', ''),
  ('DHM Tops (white )', 'DHM Tops', 'White'),
  ('DHM Tops white', 'DHM Tops', 'White'),
  ('DHM TOPS WHITE', 'DHM Tops', 'White'),
  ('DHM Tops White ( 100)', 'DHM Tops', 'White 100'),
  ('Gum Rosin  (WW Grade Indo )', 'Gum Rosin', 'WW Grade Indo'),
  ('Gum Rosin B Grade ', 'Gum Rosin', 'B Grade'),
  ('Gum Rosin N ', 'Gum Rosin', 'N'),
  ('Gum Rosin N Grade', 'Gum Rosin', 'N Grade'),
  ('Gum Rosin WW Indo PHT', 'Gum Rosin', 'WW Indo PHT'),
  ('Gum Turpentine oil ', 'Turpentine', ''),
  ('Gum Turpentine Oil ', 'Turpentine', ''),
  ('Gum Turpentine oil  ', 'Turpentine', ''),
  ('Isoborneol Flakes  Small', 'Isoborneol Flakes', 'Small'),
  ('Isoborneol Flakes  SMALL ', 'Isoborneol Flakes', 'Small'),
  ('Isoborneol Flakes (small )', 'Isoborneol Flakes', 'Small'),
  ('Isoborneol Flakes SAMLL', 'Isoborneol Flakes', 'Small'),
  ('pine oil 211 ', 'Pine Oil 211', ''),
  ('Pine oil 85', 'Pine Oil 85', ''),
  ('PIne Tar', 'Pine Tar', ''),
  ('Small Isoborneol Flakes', 'Isoborneol Flakes', 'Small'),
  ('Terpineol BP ', 'Terpineol', 'BP'),
  ('Terpineol Commercial', 'Terpineol', 'Commercial'),
  ('Turpentine Oil ', 'Turpentine', ''),
  ('Alpha Pinene 95', 'Alpha Pinene', '95'),
  ('Alpha Pinene 95 +', 'Alpha Pinene', '95 +'),
  ('Alpha Pinene 97', 'Alpha Pinene', '97'),
  ('Alpha Pinene 98 (+)', 'Alpha Pinene', '98 +'),
  ('Alpha Pinene 98 (+ve) 30-35 OR', 'Alpha Pinene', '98 +ve 30-35 OR'),
  ('Alpha Pinene 98%', 'Alpha Pinene', '98%'),
  ('Alpha Pinene 98+', 'Alpha Pinene', '98+'),
  ('Alpha Pinene 99 -ve', 'Alpha Pinene', '99 -ve'),
  ('Alpha Pinene 99 %', 'Alpha Pinene', '99%'),
  ('Alpha Pinene 99%+ ', 'Alpha Pinene', '99%+'),
  ('Alpha Terpineol ', 'Terpineol', 'Alpha'),
  ('Anthamber Tops (y)', 'Anthamber Tops', 'Y'),
  ('Anthamber Tops/ PCM TOPS ', 'Anthamber Tops', 'PCM Tops'),
  ('Beta Pinene 98% (+)', 'Beta Pinene', '98% +'),
  ('big Isoborneol Flakes', 'Isoborneol Flakes', 'Big'),
  ('Camphene  93% -15 OR ', 'Camphene', '93% -15 OR'),
  ('Camphor Oil  (PFG)', 'Camphor Oil', 'PFG'),
  ('Camphor Oil  comm', 'Camphor Oil', 'Commercial'),
  ('Camphor Oil comm', 'Camphor Oil', 'Commercial'),
  ('Camphor Powder synthetic ', 'Camphor Powder', 'Synthetic'),
  ('Camphor Powder Synthetic ', 'Camphor Powder', 'Synthetic'),
  ('Crude Camphene', 'Camphene', 'Crude'),
  ('Delta Carene 95%', 'Delta Carene', '95%'),
  ('Gamma Terpinene 95%', 'Gamma Terpinene', '95%'),
  ('Gum  Turpentine', 'Turpentine', ''),
  ('Gum Rosin  Nepal  WG ', 'Gum Rosin', 'Nepal WG'),
  ('Gum Rosin ( N Grade ) ', 'Gum Rosin', 'N Grade'),
  ('Gum Rosin (Indo)', 'Gum Rosin', 'Indo'),
  ('Gum Rosin (WW Grade ) ', 'Gum Rosin', 'WW Grade'),
  ('Gum Rosin Black', 'Gum Rosin', 'Black'),
  ('Gum Rosin INDIAN ', 'Gum Rosin', 'Indian'),
  ('Gum Rosin Indo WW Peruthani ', 'Gum Rosin', 'Indo WW Peruthani'),
  ('Gum Rosin PRIVATE', 'Gum Rosin', 'Private'),
  ('Gum Rosin PRIVETE', 'Gum Rosin', 'Private'),
  ('Gum Rosin WG Grade', 'Gum Rosin', 'WG Grade'),
  ('Gum rosin WG grade ', 'Gum Rosin', 'WG Grade'),
  ('Gum Rosin WG GRADE ', 'Gum Rosin', 'WG Grade'),
  ('Gum rosin WG grade (drum packing Nepal make )', 'Gum Rosin', 'WG Grade Drum Packing Nepal Make'),
  ('Gum Rosin WW', 'Gum Rosin', 'WW'),
  ('Gum Rosin WW  ', 'Gum Rosin', 'WW'),
  ('Gum Rosin WW ( Indo )', 'Gum Rosin', 'WW Indo'),
  ('Gum Rosin WW ( Indo ) ', 'Gum Rosin', 'WW Indo'),
  ('Gum Rosin WW Grade ( indonesia perhutani )', 'Gum Rosin', 'WW Grade Indonesia Perhutani'),
  ('Gum Rosin WW Grade Indo Pht ', 'Gum Rosin', 'WW Grade Indo PHT'),
  ('Gum Rosin WW Indian ', 'Gum Rosin', 'WW Indian'),
  ('Gum Rosin WW INDO Private ', 'Gum Rosin', 'WW Indo Private'),
  ('Gum Turpentine', 'Turpentine', ''),
  ('Gum Turpentine ', 'Turpentine', ''),
  ('Isoboneol Flakes BIG ', 'Isoborneol Flakes', 'Big'),
  ('Isoborneol Flakes  big ', 'Isoborneol Flakes', 'Big'),
  ('Isoborneol Flakes Big', 'Isoborneol Flakes', 'Big'),
  ('myrcene terpene', 'Terpene', 'Myrcene'),
  ('PINE 311', 'Pine Oil 311', ''),
  ('Pine oil ', 'Pine Oil', ''),
  ('PINE OIL  211', 'Pine Oil 211', ''),
  ('Pine Oil 311 ( 22% )', 'Pine Oil 311', '22%'),
  ('Pine oil 311 (22%) ', 'Pine Oil 311', '22%'),
  ('Pine Oil 511  ( 40-42%)', 'Pine Oil 511', '40-42%'),
  ('Pine Oil 611 Super', 'Pine Oil', '611 Super'),
  ('Pine Oil 65%', 'Pine Oil 65', ''),
  ('PINE OIL42%', 'Pine Oil', '42%'),
  ('Terpentine', 'Turpentine', ''),
  ('Terpentine Oil ', 'Turpentine', ''),
  ('Terpinenyll Acetate ', 'Terpinyl Acetate', ''),
  ('Terpineol  EP ', 'Terpineol EP', ''),
  ('TERPINEOL BP', 'Terpineol', 'BP'),
  ('Terpineol comm ', 'Terpineol', 'Commercial'),
  ('Terpineol EP  ', 'Terpineol EP', ''),
  ('Terpineol EP ( Alpha)', 'Terpineol EP', 'Alpha'),
  ('Terpineol HP', 'Terpineol', 'HP'),
  ('Terpineol PG ( PINE OIL 70)', 'Terpineol', 'PG Pine Oil 70'),
  ('Terpinolene ', 'Terpinolene', ''),
  ('TERPINOLENE 20', 'Terpinolene', '20'),
  ('Terpinolene 90%', 'Terpinolene', '90%'),
  ('Terpinyl Acetate ( OR +) ', 'Terpinyl Acetate', 'OR +'),
  ('Turpentine oil', 'Turpentine', ''),
  ('Turpentine OIL', 'Turpentine', ''),
  (' big Isoborneol Flakes', 'Isoborneol Flakes', 'Big'),
  (' Big Isoborneol Flakes ', 'Isoborneol Flakes', 'Big'),
  (' Small Isoborneol Flakes', 'Isoborneol Flakes', 'Small'),
  ('Alpha Pinene ', 'Alpha Pinene', ''),
  ('Alpha Pinene 95 %', 'Alpha Pinene', '95%'),
  ('Alpha Pinene 95% +', 'Alpha Pinene', '95% +'),
  ('Alpha terpineol ', 'Terpineol', 'Alpha'),
  ('Anthamber Tops 100', 'Anthamber Tops', '100'),
  ('Bete Pinene 98', 'Beta Pinene', '98'),
  ('Camphene 97% ', 'Camphene', '97%'),
  ('Camphor Oil (PFG)', 'Camphor Oil', 'PFG'),
  ('Camphor oil PFG', 'Camphor Oil', 'PFG'),
  ('Camphor Oil PFG', 'Camphor Oil', 'PFG'),
  ('Camphor Powder Natural', 'Camphor Powder', 'Natural'),
  ('Camphor Powder synthetic', 'Camphor Powder', 'Synthetic'),
  ('Camphor Tops (OTPT)', 'Camphor Tops', 'OT PT'),
  ('Delta Carene  95% ', 'Delta Carene', '95%'),
  ('DHM TOP  ( White ) ', 'DHM Tops', 'White'),
  ('DHM TOP  ( Yellow ) ', 'DHM Tops', 'Yellow'),
  ('DHM Tops (white) ', 'DHM Tops', 'White'),
  ('DHM Tops (Y)', 'DHM Tops', 'Y'),
  ('DHM Tops (yellow )', 'DHM Tops', 'Yellow'),
  ('DHM Tops WHITE ', 'DHM Tops', 'White'),
  ('DHM TOPS WHITE ', 'DHM Tops', 'White'),
  ('DHM Tops White (100)', 'DHM Tops', 'White 100'),
  ('DHM Tops Y ', 'DHM Tops', 'Y'),
  ('DHM Tops Yellow', 'DHM Tops', 'Yellow'),
  ('DHM Tops YELLOW', 'DHM Tops', 'Yellow'),
  ('Fenchone 98', 'Fenchone', '98'),
  ('Gama Terpinene 95', 'Gamma Terpinene', '95'),
  ('gum roin B Grade ', 'Gum Rosin', 'B Grade'),
  ('Gum Rosin  WG', 'Gum Rosin', 'WG'),
  ('Gum Rosin  WG Grade ', 'Gum Rosin', 'WG Grade'),
  ('Gum Rosin ( INDIAN )', 'Gum Rosin', 'Indian'),
  ('Gum Rosin (ww  indo )', 'Gum Rosin', 'WW Indo'),
  ('Gum Rosin (ww indo)', 'Gum Rosin', 'WW Indo'),
  ('Gum Rosin Indian ', 'Gum Rosin', 'Indian'),
  ('Gum Rosin indo ', 'Gum Rosin', 'Indo'),
  ('Gum Rosin K Grade ', 'Gum Rosin', 'K Grade'),
  ('Gum Rosin WW (Indo)', 'Gum Rosin', 'WW Indo'),
  ('Gum Rosin WW INDO PRIVATE', 'Gum Rosin', 'WW Indo Private'),
  ('Gum Rosin WW INDO PRIVATE ', 'Gum Rosin', 'WW Indo Private'),
  ('Iso Bornyl Flakes', 'Isoborneol Flakes', ''),
  ('Isoborneol Flakes  small ', 'Isoborneol Flakes', 'Small'),
  ('Isoborneol Flakes SMALL  ', 'Isoborneol Flakes', 'Small'),
  ('Isoborneol powder', 'Isoborneol', 'Powder'),
  ('pine oil ', 'Pine Oil', ''),
  ('PINE OIL 70', 'Pine Oil 70', ''),
  ('PINE OIL 85 ', 'Pine Oil 85', ''),
  ('terpene 610', 'Terpene', '610'),
  ('terpene 620', 'Terpene', '620'),
  ('Terpenes 610', 'Terpene', '610'),
  ('Terpenes 620', 'Terpene', '620'),
  ('TERPENTINE', 'Turpentine', ''),
  ('Terpineol  ep', 'Terpineol EP', ''),
  ('Terpineol 92 ', 'Terpineol', '92'),
  ('Terpineol 95 ', 'Terpineol', '95'),
  ('Terpineol 98 ', 'Terpineol', '98'),
  ('Terpineol acetate', 'Terpinyl Acetate', ''),
  ('Terpineol Acetate', 'Terpinyl Acetate', ''),
  ('terpineol EP ', 'Terpineol EP', ''),
  ('Terpineol ep ', 'Terpineol EP', ''),
  ('Terpineol EP 97%', 'Terpineol EP', '97%'),
  ('Terpineol oil pg ', 'Terpineol', 'Oil PG'),
  ('Terpinolene 30 ', 'Terpinolene', '30'),
  ('Terpinyl  Acetate', 'Terpinyl Acetate', ''),
  ('Turpentine OIL ', 'Turpentine', '');

do $$ begin
  if exists (select 1 from _remap r left join public.product_catalog c on c.product_name = r.base where c.id is null) then
    raise exception 'remap: a base name is not in product_catalog';
  end if;
end $$;

-- 1. BACKUPS (old values of exactly the rows that will change).
-- Plain CREATE TABLE: fails if a backup already exists, so a re-run can never overwrite one.
create table public.backup_20261114_enquiries_items as
  select id, items from public.enquiries t where jsonb_typeof(t.items) = 'array' and exists (select 1 from jsonb_array_elements(t.items) x join _remap r on r.saved = x->>'desc');
create table public.backup_20261114_quotes_items as
  select id, items from public.quotes t where jsonb_typeof(t.items) = 'array' and exists (select 1 from jsonb_array_elements(t.items) x join _remap r on r.saved = x->>'desc');
create table public.backup_20261114_orders as
  select id, items, dispatch_snapshot from public.orders t
  where (jsonb_typeof(t.items) = 'array' and exists (select 1 from jsonb_array_elements(t.items) x join _remap r on r.saved = x->>'desc')) or (jsonb_typeof(t.dispatch_snapshot->'items') = 'array' and exists (select 1 from jsonb_array_elements(t.dispatch_snapshot->'items') x join _remap r on r.saved = x->>'desc'));
create table public.backup_20261114_dispatch_entries_items as
  select id, items from public.dispatch_entries t where jsonb_typeof(t.items) = 'array' and exists (select 1 from jsonb_array_elements(t.items) x join _remap r on r.saved = x->>'desc');
create table public.backup_20261114_sample_products as
  select sp.id, sp.product_name, sp.grade from public.sample_products sp where sp.product_name in (select saved from _remap);
create table public.backup_20261114_samples as
  select id, product_name, product_grade, products from public.samples t
  where t.product_name in (select saved from _remap) or (jsonb_typeof(t.products) = 'array' and exists (select 1 from jsonb_array_elements(t.products) x join _remap r on r.saved = x->>'name'));

-- Backups are admin-only: RLS on, no policies (app users / anon can't read them).
alter table public.backup_20261114_enquiries_items enable row level security;
alter table public.backup_20261114_quotes_items enable row level security;
alter table public.backup_20261114_orders enable row level security;
alter table public.backup_20261114_dispatch_entries_items enable row level security;
alter table public.backup_20261114_sample_products enable row level security;
alter table public.backup_20261114_samples enable row level security;

-- 2. UPDATES
update public.enquiries t set items = (select jsonb_agg(case when r.saved is null then e.i
       else e.i || jsonb_build_object('desc', r.base, 'hsn', coalesce(c.hsn_code, ''))
              || case when coalesce(e.i->>'grade', '') = '' and r.grade <> '' then jsonb_build_object('grade', r.grade) else '{}'::jsonb end
     end order by e.ord)
   from jsonb_array_elements(t.items) with ordinality e(i, ord)
   left join _remap r on r.saved = e.i->>'desc'
   left join public.product_catalog c on c.product_name = r.base)
where jsonb_typeof(t.items) = 'array' and exists (select 1 from jsonb_array_elements(t.items) x join _remap r on r.saved = x->>'desc');

update public.quotes t set items = (select jsonb_agg(case when r.saved is null then e.i
       else e.i || jsonb_build_object('desc', r.base, 'hsn', coalesce(c.hsn_code, ''))
              || case when coalesce(e.i->>'grade', '') = '' and r.grade <> '' then jsonb_build_object('grade', r.grade) else '{}'::jsonb end
     end order by e.ord)
   from jsonb_array_elements(t.items) with ordinality e(i, ord)
   left join _remap r on r.saved = e.i->>'desc'
   left join public.product_catalog c on c.product_name = r.base)
where jsonb_typeof(t.items) = 'array' and exists (select 1 from jsonb_array_elements(t.items) x join _remap r on r.saved = x->>'desc');

update public.orders t set items = (select jsonb_agg(case when r.saved is null then e.i
       else e.i || jsonb_build_object('desc', r.base, 'hsn', coalesce(c.hsn_code, ''))
              || case when coalesce(e.i->>'grade', '') = '' and r.grade <> '' then jsonb_build_object('grade', r.grade) else '{}'::jsonb end
     end order by e.ord)
   from jsonb_array_elements(t.items) with ordinality e(i, ord)
   left join _remap r on r.saved = e.i->>'desc'
   left join public.product_catalog c on c.product_name = r.base)
where jsonb_typeof(t.items) = 'array' and exists (select 1 from jsonb_array_elements(t.items) x join _remap r on r.saved = x->>'desc');

update public.orders t set dispatch_snapshot = jsonb_set(t.dispatch_snapshot, '{items}', (select jsonb_agg(case when r.saved is null then e.i
       else e.i || jsonb_build_object('desc', r.base, 'hsn', coalesce(c.hsn_code, ''))
              || case when coalesce(e.i->>'grade', '') = '' and r.grade <> '' then jsonb_build_object('grade', r.grade) else '{}'::jsonb end
     end order by e.ord)
   from jsonb_array_elements(t.dispatch_snapshot->'items') with ordinality e(i, ord)
   left join _remap r on r.saved = e.i->>'desc'
   left join public.product_catalog c on c.product_name = r.base))
where jsonb_typeof(t.dispatch_snapshot->'items') = 'array' and exists (select 1 from jsonb_array_elements(t.dispatch_snapshot->'items') x join _remap r on r.saved = x->>'desc');

update public.dispatch_entries t set items = (select jsonb_agg(case when r.saved is null then e.i
       else e.i || jsonb_build_object('desc', r.base, 'hsn', coalesce(c.hsn_code, ''))
              || case when coalesce(e.i->>'grade', '') = '' and r.grade <> '' then jsonb_build_object('grade', r.grade) else '{}'::jsonb end
     end order by e.ord)
   from jsonb_array_elements(t.items) with ordinality e(i, ord)
   left join _remap r on r.saved = e.i->>'desc'
   left join public.product_catalog c on c.product_name = r.base)
where jsonb_typeof(t.items) = 'array' and exists (select 1 from jsonb_array_elements(t.items) x join _remap r on r.saved = x->>'desc');

update public.sample_products sp
set product_name = r.base,
    grade = case when coalesce(sp.grade, '') = '' and r.grade <> '' then r.grade else sp.grade end
from _remap r where sp.product_name = r.saved;

update public.samples s
set product_name = r.base,
    product_grade = case when coalesce(s.product_grade, '') = '' and r.grade <> '' then r.grade else s.product_grade end
from _remap r where s.product_name = r.saved;

update public.samples t set products = (select jsonb_agg(case when r.saved is null then e.i
       else e.i || jsonb_build_object('name', r.base)
              || case when coalesce(e.i->>'grade', '') = '' and r.grade <> '' then jsonb_build_object('grade', r.grade) else '{}'::jsonb end
     end order by e.ord)
   from jsonb_array_elements(t.products) with ordinality e(i, ord)
   left join _remap r on r.saved = e.i->>'name'
   left join public.product_catalog c on c.product_name = r.base)
where jsonb_typeof(t.products) = 'array' and exists (select 1 from jsonb_array_elements(t.products) x join _remap r on r.saved = x->>'name');
