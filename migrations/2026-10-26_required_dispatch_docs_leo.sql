-- Required dispatch documents for LEO FRAGRANCES (2026-10-26).
-- MIS sheet: "LEO FRAGRANCES", old GSTIN 27AACFL8497N1ZF (firm). EnqBoss: C336
-- "LEO FRAGRANCES AND FLAVOURS LIMITED", GSTIN 27AAFCL9849Q1ZE (now a Ltd
-- company) — same customer, so matched by customer_id. Name/GSTIN/PAN unchanged.
update customers set req_doc_invoice=true, req_doc_lr=true, req_doc_eway_bill=true,
  req_doc_coa=false, req_doc_supplier_portal=false where customer_id='C336';
