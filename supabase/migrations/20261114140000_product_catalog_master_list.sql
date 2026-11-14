-- 2026-11-14: product_catalog = the ONE master product list (user decision).
-- Product Name in Enquiry / Quotation / Order / Dispatch / Sampling is a strict
-- pick from the ACTIVE rows here; HSN auto-fills from hsn_code (NULL → blank).
-- Nothing is deleted. Old saved line items are NOT touched.

alter table public.product_catalog add column if not exists active boolean not null default true;

-- 6 capitals-only names renamed in place to the master list's casing.
update public.product_catalog set product_name = 'Pine Oil 85'               where product_name = 'PINE OIL 85';
update public.product_catalog set product_name = 'Pine Oil 90'               where product_name = 'PINE OIL 90';
update public.product_catalog set product_name = 'Sodium Acetate Trihydrate' where product_name = 'SODIUM ACETATE TRIHYDRATE';
update public.product_catalog set product_name = 'Citronella Tops'           where product_name = 'CITRONELLA TOPS';
update public.product_catalog set product_name = 'Lemon Terpenes'            where product_name = 'LEMON TERPENES';
update public.product_catalog set product_name = 'Linalool Nat'              where product_name = 'LINALOOL NAT';

-- Master list, exact names + HSN (NULL = blank, to be filled later).
-- Pine Oil 90 keeps 38059090 (user decision); Lemongrass Oil and Timber Touch
-- Tops go blank (their old codes were shifted from the next product).
insert into public.product_catalog (product_name, hsn_code, active) values
  ('Alpha Pinene','29021900',true), ('Beta Pinene','29021900',true), ('Crude Beta Pinene',null,true),
  ('Camphene','29142390',true), ('Camphor Oil','33012941',true), ('Camphor Tops','29142990',true),
  ('Camphor Powder','29142922',true), ('D-Limonene','29029010',true), ('DL-Limonene','29021990',true),
  ('L-Limonene','29021900',true), ('Turpentine','38059090',true), ('Delta Carene','29029090',true),
  ('Delta-3-Carene','29029090',true), ('Dipentene','29029010',true), ('Fenchone','29142990',true),
  ('Gamma Terpinene','29061990',true), ('Rosin','38061010',true), ('Gum Rosin','38061090',true),
  ('Isoborneol','29061990',true), ('Isoborneol Flakes','29061990',true), ('Isobornyl Acetate','29153920',true),
  ('Longifolene','29021900',true), ('Pine Oil','38059090',true), ('Pine Oil 40','38059090',true),
  ('Pine Oil 50','38059090',true), ('Pine Oil 65','38059090',true), ('Pine Oil 70','38059090',true),
  ('Pine Oil 80',null,true), ('Pine Oil 85','38059090',true), ('Pine Oil 90','38059090',true),
  ('Pine Oil 211','38059090',true), ('Pine Oil 311','38059090',true), ('Pine Oil 411','38059090',true),
  ('Pine Oil 511','38059090',true), ('Pine Tar','38059010',true), ('Sodium Acetate Trihydrate','29152990',true),
  ('Terpene','29021990',true), ('Terpineol','29061990',true), ('Terpineol 70',null,true),
  ('Terpineol EP','29061990',true), ('Terpinyl Acetate','29153960',true), ('Terpinolene','29021900',true),
  ('Terpinen-4-OL','29061990',true), ('Terpin Hydrate Powder','29061990',true), ('Anthamber Residue','38259000',true),
  ('Anthamber Tops','38259000',true), ('Carvacrol','29071190',true), ('Citronella Tops','33011910',true),
  ('DHM Residue','38256100',true), ('DHM Tops','29052290',true), ('Ester Gum','38063000',true),
  ('Geraniol HB','38259000',true), ('Geraniol Tops','38259000',true), ('Isolongifolene Keton Comm','29142990',true),
  ('Lemon Terpenes','33012990',true), ('Lemongrass Oil',null,true), ('Linalool Nat','29052230',true),
  ('Methyl Pentanone','38259000',true), ('Orange Oil','29021990',true), ('OT PT','29142990',true),
  ('Timber Touch Tops',null,true), ('Titanium Recycle','81082000',true), ('TMCM T & B Residue','29061990',true)
on conflict (product_name) do update set hsn_code = excluded.hsn_code, active = true, updated_at = now();

-- Anything not on the master list stays, but inactive (hidden from dropdowns).
update public.product_catalog set active = false
where product_name not in (
  'Alpha Pinene','Beta Pinene','Crude Beta Pinene','Camphene','Camphor Oil','Camphor Tops','Camphor Powder',
  'D-Limonene','DL-Limonene','L-Limonene','Turpentine','Delta Carene','Delta-3-Carene','Dipentene','Fenchone',
  'Gamma Terpinene','Rosin','Gum Rosin','Isoborneol','Isoborneol Flakes','Isobornyl Acetate','Longifolene',
  'Pine Oil','Pine Oil 40','Pine Oil 50','Pine Oil 65','Pine Oil 70','Pine Oil 80','Pine Oil 85','Pine Oil 90',
  'Pine Oil 211','Pine Oil 311','Pine Oil 411','Pine Oil 511','Pine Tar','Sodium Acetate Trihydrate','Terpene',
  'Terpineol','Terpineol 70','Terpineol EP','Terpinyl Acetate','Terpinolene','Terpinen-4-OL','Terpin Hydrate Powder',
  'Anthamber Residue','Anthamber Tops','Carvacrol','Citronella Tops','DHM Residue','DHM Tops','Ester Gum',
  'Geraniol HB','Geraniol Tops','Isolongifolene Keton Comm','Lemon Terpenes','Lemongrass Oil','Linalool Nat',
  'Methyl Pentanone','Orange Oil','OT PT','Timber Touch Tops','Titanium Recycle','TMCM T & B Residue');

notify pgrst, 'reload schema';
