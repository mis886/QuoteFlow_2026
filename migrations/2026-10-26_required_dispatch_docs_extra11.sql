-- Required dispatch documents for the 11 customers whose name in the MIS sheet
-- did not exactly match EnqBoss. Matched by customer_id + GSTIN + PAN (2026-10-26).
-- ALREADY APPLIED to Supabase on 2026-10-26 — kept here as a record only.
-- LEO FRAGRANCES (sheet C336) intentionally left out: GSTIN and PAN differ from EnqBoss.
update customers c set
  req_doc_invoice = v.inv, req_doc_lr = v.lr, req_doc_eway_bill = v.eway,
  req_doc_coa = v.coa, req_doc_supplier_portal = v.sp
from (values
('C151',true,true,true,false,false),          -- JAYSHREE AROMATICS LIMITED
('C486',true,true,true,false,false),          -- M A AROMAS
('C414',true,false,true,false,false),         -- NEW BAROULIYA AROMATICS CO
('C712',true,true,true,false,false),          -- SAHAY ML ADDITIVES PRIVATE LIMITED
('C369',true,true,true,false,false),          -- SHALIMAR PAINTS LTD - (NASHIK)
('CUST-2026-207',true,true,true,false,false), -- SHALIMAR PAINTS LTD (SIKANDRABAD)
('C688',true,true,true,false,false),          -- JAYASHREE CHEMICALS (sheet: SHREE CHEMICALS)
('C203',true,true,true,false,false),          -- NAND CHEMICALS (OLD GST)
('C236',true,true,true,true,true),            -- PPG Asian Paints Pvt Ltd - (SATARA)
('C680',true,true,true,true,true),            -- PPG Asian Paints Pvt Ltd - (Tamil Nadu)
('CUST-2026-109',false,false,false,false,false) -- PARSHWA CHEM IMPEX (sheet: SURESH SHAH)
) as v(id, inv, lr, eway, coa, sp)
where c.customer_id = v.id;
