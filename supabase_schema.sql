-- ============================================================
-- Himalaya Terpenes ERP — COMPLETE Supabase Schema
-- Single file, run once on a fresh database (idempotent).
-- Covers all CRM + Production tables + Storage policies.
-- Safe to re-run: uses IF NOT EXISTS / DROP IF EXISTS throughout.
-- ============================================================

-- ╔══════════════════════════════════════════════════════════════╗
-- ║  SECTION 1 — CRM CORE TABLES                               ║
-- ╚══════════════════════════════════════════════════════════════╝

-- ── 1. customers ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.customers (
    id              TEXT PRIMARY KEY,
    code            TEXT UNIQUE NOT NULL,
    name            TEXT NOT NULL,
    seg             TEXT,
    gstin           TEXT,
    pan             TEXT,
    inco            TEXT,
    curr            TEXT DEFAULT 'INR',
    pay             TEXT DEFAULT '30 days',
    sites           JSONB DEFAULT '[]'::jsonb,
    tier            TEXT DEFAULT 'New',           -- 'New'|'Bronze'|'Silver'|'Gold'
    turnover        NUMERIC DEFAULT 0,
    revenue         NUMERIC DEFAULT 0,
    rating_payment  NUMERIC DEFAULT 0,
    rating_orders   NUMERIC DEFAULT 0,
    rating_trend    NUMERIC DEFAULT 0,
    next_orders     JSONB DEFAULT '[]'::jsonb,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. enquiries ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.enquiries (
    id              TEXT PRIMARY KEY,
    recv            TIMESTAMPTZ NOT NULL,
    src             TEXT NOT NULL,
    cust            TEXT NOT NULL,
    site_id         TEXT,
    contact_id      TEXT,
    contact         TEXT,
    email           TEXT,
    contact_phone   TEXT,
    urg             TEXT DEFAULT 'Normal',
    status          TEXT DEFAULT 'New',
    assigned        TEXT,
    doer            TEXT,
    notes           TEXT,
    items           JSONB DEFAULT '[]'::jsonb,
    attachments     JSONB DEFAULT '[]'::jsonb,
    age_h           INTEGER DEFAULT 0,
    q_ref           TEXT,
    cust_enq_doc_no TEXT,
    gmail_message_id TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── 3. quotes ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.quotes (
    id                   TEXT PRIMARY KEY,
    enq_ref              TEXT REFERENCES public.enquiries(id),
    cust                 TEXT NOT NULL,
    site_id              TEXT,
    contact_id           TEXT,
    contact              TEXT,
    email                TEXT,
    contact_phone        TEXT,
    date                 DATE NOT NULL,
    validity             DATE,
    status               TEXT DEFAULT 'Sent',
    inco                 TEXT,
    curr                 TEXT,
    pay                  TEXT,
    items                JSONB DEFAULT '[]'::jsonb,
    notes                JSONB DEFAULT '[]'::jsonb,
    attachments          JSONB DEFAULT '[]'::jsonb,
    authorized_person    JSONB,
    terms                TEXT,
    unit_id              TEXT,
    cust_enquiry_doc_no  TEXT,
    doer                 TEXT,
    sent_at              TIMESTAMPTZ,
    created_at           TIMESTAMPTZ DEFAULT NOW(),
    updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ── 4. orders ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orders (
    id                   TEXT PRIMARY KEY,
    quote_ref            TEXT REFERENCES public.quotes(id),
    enq_ref              TEXT REFERENCES public.enquiries(id),
    cust                 TEXT NOT NULL,
    site_id              TEXT,
    contact_id           TEXT,
    contact              TEXT,
    email                TEXT,
    contact_phone        TEXT,
    cust_enquiry_doc_no  TEXT,
    po_no                TEXT NOT NULL,
    po_date              DATE NOT NULL,
    dlv_date             DATE,
    status               TEXT DEFAULT 'Processing',
    value                NUMERIC DEFAULT 0,
    inco                 TEXT,
    items                JSONB DEFAULT '[]'::jsonb,
    adjustments          JSONB DEFAULT '[]'::jsonb,
    attachments          JSONB DEFAULT '[]'::jsonb,
    authorized_person    JSONB,
    terms                TEXT,
    po_filename          TEXT,
    unit_id              TEXT,
    bank_account_id      TEXT,
    price_basis          TEXT,
    country_of_origin    TEXT,
    exim_code            TEXT,
    custom_point         TEXT,
    pan                  TEXT,
    hsn                  TEXT,
    sheets_exported_at   TIMESTAMPTZ,
    doer                 TEXT,
    created_at           TIMESTAMPTZ DEFAULT NOW(),
    updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ── 5. followups ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.followups (
    id               TEXT PRIMARY KEY,
    quote_id         TEXT REFERENCES public.quotes(id) UNIQUE,
    owner            TEXT,
    next_date        DATE,
    next_time        TEXT,
    status           TEXT DEFAULT 'open',
    stage            TEXT DEFAULT 'Sent Quotation',
    stage_entered_at TIMESTAMPTZ,
    outcome          TEXT,
    logs             JSONB DEFAULT '[]'::jsonb,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_followups_quote_id  ON public.followups(quote_id);
CREATE INDEX IF NOT EXISTS idx_followups_next_date ON public.followups(next_date);

-- Trigger: keep updated_at current
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_followups_modtime ON public.followups;
CREATE TRIGGER update_followups_modtime
BEFORE UPDATE ON public.followups
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Backfill stage for rows created before the pipeline existed
UPDATE public.followups
   SET stage            = 'Sent Quotation',
       stage_entered_at = COALESCE(stage_entered_at, created_at, NOW())
 WHERE stage IS NULL;

UPDATE public.followups
   SET stage = 'Closed'
 WHERE status = 'closed' AND (stage IS NULL OR stage <> 'Closed');

-- ── 6. app_settings ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.app_settings (
    id                       TEXT PRIMARY KEY DEFAULT 'config',
    header_url               TEXT,
    sig_name                 TEXT DEFAULT 'Akash Gupta',
    sig_des                  TEXT DEFAULT 'Rubber Technologist',
    sig_phone                TEXT DEFAULT '+91-817171 6630',
    sig_url                  TEXT,
    bank_name                TEXT DEFAULT 'ICICI BANK LTD.',
    bank_acc                 TEXT DEFAULT '0000000000',
    bank_ifsc                TEXT DEFAULT 'ICIC0000000',
    bank_swift               TEXT,
    gmail_enabled            BOOLEAN DEFAULT FALSE,
    gmail_labels             JSONB DEFAULT '[]'::jsonb,
    gmail_sync_freq          INTEGER DEFAULT 0,
    gmail_last_sync          TIMESTAMPTZ,
    intelligence_pin         TEXT,
    sheets_webhook_url       TEXT,
    sheets_drive_folder_id   TEXT,
    pipeline_tat             JSONB,          -- legacy: per-lane TAT in days
    pipeline_tat_h           JSONB,          -- canonical: per-lane TAT in hours
    pipeline_roles           JSONB,          -- per-lane role ownership
    production_beta_enabled  BOOLEAN DEFAULT TRUE,
    updated_at               TIMESTAMPTZ DEFAULT NOW()
);

-- Seed singleton row
INSERT INTO public.app_settings (id) VALUES ('config') ON CONFLICT (id) DO NOTHING;

-- ── 7. authorized_signatories ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.authorized_signatories (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    designation TEXT NOT NULL,
    phone       TEXT,
    is_default  BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── 8. company_units ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.company_units (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    gstin         TEXT,
    address       TEXT,
    signatory_id  TEXT REFERENCES public.authorized_signatories(id) ON DELETE SET NULL,
    header_url    TEXT,
    sig_url       TEXT,
    is_default    BOOLEAN DEFAULT FALSE,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── 9. bank_accounts ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bank_accounts (
    id             TEXT PRIMARY KEY,
    unit_id        TEXT NOT NULL REFERENCES public.company_units(id) ON DELETE CASCADE,
    beneficiary    TEXT NOT NULL,
    bank_name      TEXT NOT NULL,
    branch_address TEXT,
    account_no     TEXT NOT NULL,
    ifsc           TEXT NOT NULL,
    branch_code    TEXT,
    micr           TEXT,
    swift          TEXT,
    is_default     BOOLEAN DEFAULT FALSE,
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── 10. team_roster ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.team_roster (
    email         TEXT NOT NULL,
    role          TEXT NOT NULL,
    display_name  TEXT NOT NULL,
    active        BOOLEAN DEFAULT TRUE,
    aliases       JSONB DEFAULT '[]'::jsonb,
    password_hash TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (email, role)
);

-- ── 11. po_submissions (supplier PO upload portal) ────────────
CREATE TABLE IF NOT EXISTS public.po_submissions (
    id           BIGSERIAL PRIMARY KEY,
    quote_id     TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    linked       BOOLEAN DEFAULT FALSE,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS po_submissions_quote_idx ON public.po_submissions(quote_id);
CREATE INDEX IF NOT EXISTS po_submissions_linked_idx ON public.po_submissions(linked);


-- ╔══════════════════════════════════════════════════════════════╗
-- ║  SECTION 2 — CRM RLS POLICIES                              ║
-- ╚══════════════════════════════════════════════════════════════╝

ALTER TABLE public.customers             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enquiries             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.followups             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.authorized_signatories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_units         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_accounts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_roster           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_submissions        ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'customers','enquiries','quotes','orders','followups',
    'app_settings','authorized_signatories','company_units',
    'bank_accounts','team_roster','po_submissions'
  ]) LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Allow company access" ON public.%I', t);
    EXECUTE format($f$
      CREATE POLICY "Allow company access"
      ON public.%I FOR ALL TO authenticated
      USING  (auth.jwt() ->> 'email' LIKE '%%@himalayaterpene.com')
      WITH CHECK (auth.jwt() ->> 'email' LIKE '%%@himalayaterpene.com')
    $f$, t);
  END LOOP;
END $$;

-- po_submissions: also allow unauthenticated inserts (suppliers submit without login)
DROP POLICY IF EXISTS "Allow public insert" ON public.po_submissions;
CREATE POLICY "Allow public insert"
ON public.po_submissions FOR INSERT TO anon
WITH CHECK (true);


-- ╔══════════════════════════════════════════════════════════════╗
-- ║  SECTION 3 — PRODUCTION TABLES                             ║
-- ╚══════════════════════════════════════════════════════════════╝

-- ── P1. prod_presses ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prod_presses (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    tonnage       TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'idle',
    active_job_id TEXT,
    pct_done      INTEGER DEFAULT 0,
    eta_text      TEXT DEFAULT 'Idle',
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── P2. prod_workers ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prod_workers (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    role       TEXT NOT NULL,
    department TEXT NOT NULL,
    present    BOOLEAN DEFAULT TRUE,
    shift      TEXT DEFAULT 'day',
    press_id   TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── P3. prod_compounds ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prod_compounds (
    id         TEXT PRIMARY KEY,
    code       TEXT NOT NULL UNIQUE,
    name       TEXT NOT NULL,
    grade      TEXT NOT NULL,
    shore_a    INTEGER,
    shelf_days INTEGER,
    colour     TEXT DEFAULT 'Black',
    notes      TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── P4. prod_products ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prod_products (
    id                   TEXT PRIMARY KEY,
    code                 TEXT NOT NULL UNIQUE,
    name                 TEXT NOT NULL,
    family_code          TEXT,
    item_category        TEXT,
    type_code            TEXT,
    model_no             TEXT,
    moc                  TEXT,
    make                 TEXT,
    colour_code          TEXT,
    customer_id          TEXT,
    customer_name        TEXT,
    compound_id          TEXT REFERENCES public.prod_compounds(id) ON DELETE SET NULL,
    compound_no          TEXT,
    mould_code           TEXT,
    cavities             INTEGER,
    tonnage              INTEGER,
    press_ids            TEXT[] DEFAULT '{}',
    cure_temp_c          INTEGER,
    cure_time_min        INTEGER,
    cycle_time_min       NUMERIC(6,2),
    shot_weight_g        INTEGER,
    blank_weight_g       NUMERIC(10,3),
    finished_weight_g    NUMERIC(10,3),
    tikli_size           TEXT,
    dori_size_required   TEXT,
    dori_size_used       TEXT,
    shrinkage            TEXT,
    oven_time_hrs        NUMERIC(6,2),
    oven_temp_c          INTEGER,
    pcs_hr_1side         NUMERIC(8,2),
    pcs_hr_2side         NUMERIC(8,2),
    mold_rate            NUMERIC(8,2),
    setup_time_hrs       NUMERIC(4,2) DEFAULT 0.5,
    finish_rate          NUMERIC(6,2),
    insp_rate            NUMERIC(6,2),
    pdi_time_hrs         NUMERIC(4,2) DEFAULT 0.25,
    maintenance_after_qty INTEGER,
    workshop_unit        TEXT,
    draw_ref             TEXT,
    revision             TEXT DEFAULT 'R1',
    unit_cost            NUMERIC(10,2),
    is_active            BOOLEAN DEFAULT TRUE,
    notes                TEXT,
    created_at           TIMESTAMPTZ DEFAULT NOW(),
    updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS prod_products_compound_idx ON public.prod_products(compound_id);
CREATE INDEX IF NOT EXISTS prod_products_customer_idx ON public.prod_products(customer_id);
CREATE INDEX IF NOT EXISTS prod_products_family_idx   ON public.prod_products(family_code);

-- ── P5. prod_jobs ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prod_jobs (
    id                     TEXT PRIMARY KEY,
    job_card_no            TEXT,
    order_id               TEXT,
    order_line_seq         INTEGER,
    customer_id            TEXT,
    customer_name          TEXT,
    product_id             TEXT REFERENCES public.prod_products(id) ON DELETE SET NULL,
    product_desc           TEXT NOT NULL,
    family_code            TEXT,
    qty                    INTEGER NOT NULL,
    qty_to_mould           INTEGER,
    qty_done               INTEGER DEFAULT 0,
    promised_date          DATE,
    lsd                    DATE,
    order_start_date       DATE,
    target_completion_date DATE,
    priority               TEXT DEFAULT 'normal',
    emergency_reason       TEXT,
    notes                  TEXT,
    stage                  TEXT NOT NULL DEFAULT 'queued',
    status                 TEXT NOT NULL DEFAULT 'queued',
    queue_seq              NUMERIC,
    -- Moulding
    batch_code             TEXT,
    batch_name             TEXT,
    mould_code             TEXT,
    cavities               INTEGER,
    cure_time_min          INTEGER,
    cure_temp_c            INTEGER,
    compound_code          TEXT,
    tikli_size             TEXT,
    press_id               TEXT REFERENCES public.prod_presses(id) ON DELETE SET NULL,
    -- Inspection
    inspector              TEXT,
    inspection_result      TEXT,
    -- PDI
    pdi_officer            TEXT,
    inspection_passed_at   TIMESTAMPTZ,
    -- Dispatch
    courier                TEXT,
    consignment_no         TEXT,
    dispatched_at          TIMESTAMPTZ,
    otd_result             TEXT,
    -- Job Card print snapshots
    fg_stock_at_print      INTEGER,
    wip_stock_at_print     INTEGER,
    press_operator_name    TEXT,
    finishing_checked_by   TEXT,
    inspection_checked_by  TEXT,
    approved_by            TEXT,
    created_at             TIMESTAMPTZ DEFAULT NOW(),
    updated_at             TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS prod_jobs_stage_idx    ON public.prod_jobs(stage);
CREATE INDEX IF NOT EXISTS prod_jobs_press_idx    ON public.prod_jobs(press_id);
CREATE INDEX IF NOT EXISTS prod_jobs_order_idx    ON public.prod_jobs(order_id);
CREATE INDEX IF NOT EXISTS prod_jobs_promised_idx ON public.prod_jobs(promised_date);
CREATE INDEX IF NOT EXISTS prod_jobs_product_idx  ON public.prod_jobs(product_id);
CREATE INDEX IF NOT EXISTS prod_jobs_family_idx   ON public.prod_jobs(family_code);

-- ── P6. prod_job_stage_events ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prod_job_stage_events (
    id         BIGSERIAL PRIMARY KEY,
    job_id     TEXT NOT NULL REFERENCES public.prod_jobs(id) ON DELETE CASCADE,
    from_stage TEXT,
    to_stage   TEXT NOT NULL,
    ts         TIMESTAMPTZ DEFAULT NOW(),
    actor      TEXT,
    notes      TEXT
);

CREATE INDEX IF NOT EXISTS prod_job_stage_events_job_idx ON public.prod_job_stage_events(job_id, ts);

-- ── P7. prod_ncrs ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prod_ncrs (
    id                TEXT PRIMARY KEY,
    job_id            TEXT NOT NULL REFERENCES public.prod_jobs(id) ON DELETE CASCADE,
    defect_desc       TEXT,
    defect_code       TEXT,
    responsible_stage TEXT,
    action            TEXT,
    raised_by         TEXT,
    raised_at         TIMESTAMPTZ DEFAULT NOW(),
    resolved_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS prod_ncrs_job_idx ON public.prod_ncrs(job_id);

-- ── P8. prod_shop_floor_settings ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.prod_shop_floor_settings (
    id                  TEXT PRIMARY KEY DEFAULT 'config',
    shift_started       BOOLEAN DEFAULT FALSE,
    shift_hours         INTEGER DEFAULT 8,
    shift_hours_left    NUMERIC DEFAULT 8,
    overtime_max        INTEGER DEFAULT 2,
    planned_finishers   INTEGER DEFAULT 6,
    planned_inspectors  INTEGER DEFAULT 3,
    emergency_active    BOOLEAN DEFAULT FALSE,
    active_shift        TEXT DEFAULT 'day',
    day_shift_hours     INTEGER DEFAULT 8,
    night_shift_hours   INTEGER DEFAULT 8,
    day_ot_max          NUMERIC DEFAULT 2,
    night_ot_max        NUMERIC DEFAULT 2,
    day_shift_start     TEXT DEFAULT '08:00',
    night_shift_start   TEXT DEFAULT '20:00',
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT prod_shop_floor_settings_single CHECK (id = 'config')
);

INSERT INTO public.prod_shop_floor_settings (id) VALUES ('config')
  ON CONFLICT (id) DO NOTHING;

-- ── P9. prod_molding ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prod_molding (
    id                TEXT PRIMARY KEY,
    job_card_id       TEXT NOT NULL REFERENCES public.prod_jobs(id) ON DELETE CASCADE,
    molding_date      DATE NOT NULL DEFAULT CURRENT_DATE,
    shift             TEXT DEFAULT 'A',
    operation_type    TEXT DEFAULT 'Production',
    press_no          TEXT NOT NULL,
    die_no            TEXT,
    tikli_size        TEXT,
    cure_time_min     INTEGER,
    cure_temp_c       INTEGER,
    scorch_time_min   INTEGER,
    die_change_min    INTEGER,
    dori_khatam_min   INTEGER,
    spray             TEXT,
    weight_before_g   NUMERIC(8,2),
    weight_after_g    NUMERIC(8,2),
    qty_molded        INTEGER NOT NULL,
    planned_qty       INTEGER,
    start_time        TIME,
    end_time          TIME,
    working_time_min  INTEGER,
    operator_name     TEXT NOT NULL,
    remarks           TEXT,
    entered_by        TEXT,
    corrected_at      TIMESTAMPTZ,
    corrected_by      TEXT,
    correction_note   TEXT,
    order_id          TEXT,
    item_code         TEXT,
    our_desc          TEXT,
    type_item_moc     TEXT,
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS prod_molding_jc_idx   ON public.prod_molding(job_card_id);
CREATE INDEX IF NOT EXISTS prod_molding_date_idx ON public.prod_molding(molding_date DESC);

-- ── P10. prod_finishing ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prod_finishing (
    id              TEXT PRIMARY KEY,
    job_card_id     TEXT NOT NULL REFERENCES public.prod_jobs(id) ON DELETE CASCADE,
    finishing_date  DATE NOT NULL DEFAULT CURRENT_DATE,
    actual_qty      INTEGER NOT NULL,
    planned_qty     INTEGER,
    working_hours   NUMERIC(5,2),
    finisher_name   TEXT NOT NULL,
    is_rework       BOOLEAN DEFAULT FALSE,
    remarks         TEXT,
    entered_by      TEXT,
    corrected_at    TIMESTAMPTZ,
    corrected_by    TEXT,
    correction_note TEXT,
    order_id        TEXT,
    die_no          TEXT,
    type_item_moc   TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS prod_finishing_jc_idx ON public.prod_finishing(job_card_id);

-- ── P11. prod_inspection ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prod_inspection (
    id                TEXT PRIMARY KEY,
    job_card_id       TEXT NOT NULL REFERENCES public.prod_jobs(id) ON DELETE CASCADE,
    inspection_date   DATE NOT NULL DEFAULT CURRENT_DATE,
    qty_to_inspect    INTEGER NOT NULL,
    qty_inspected     INTEGER NOT NULL,
    passed            INTEGER NOT NULL DEFAULT 0,
    rejected          INTEGER NOT NULL DEFAULT 0,
    rework            INTEGER NOT NULL DEFAULT 0,
    scrapped          INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT insp_split_check CHECK (passed + rejected + rework + scrapped = qty_to_inspect),
    inspector_name    TEXT NOT NULL,
    start_time        TIME,
    end_time          TIME,
    working_hours     NUMERIC(5,2),
    rejection_reasons TEXT,
    remarks           TEXT,
    entered_by        TEXT,
    corrected_at      TIMESTAMPTZ,
    corrected_by      TEXT,
    correction_note   TEXT,
    order_id          TEXT,
    die_no            TEXT,
    type_item_moc     TEXT,
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS prod_inspection_jc_idx ON public.prod_inspection(job_card_id);

-- ── P12. prod_pdi_logs ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prod_pdi_logs (
    id              TEXT PRIMARY KEY,
    job_card_id     TEXT NOT NULL REFERENCES public.prod_jobs(id),
    pdi_date        DATE NOT NULL,
    pdi_officer     TEXT NOT NULL,
    qty_checked     INTEGER NOT NULL DEFAULT 0,
    passed          INTEGER NOT NULL DEFAULT 0,
    failed          INTEGER NOT NULL DEFAULT 0,
    hold            INTEGER NOT NULL DEFAULT 0,
    remarks         TEXT,
    entered_by      TEXT,
    corrected_at    TIMESTAMPTZ,
    corrected_by    TEXT,
    correction_note TEXT,
    order_id        TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT pdi_split_check CHECK (passed + failed + hold = qty_checked)
);

CREATE INDEX IF NOT EXISTS prod_pdi_logs_jc_idx ON public.prod_pdi_logs(job_card_id);

-- ── P13. prod_dispatches ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prod_dispatches (
    id                    TEXT PRIMARY KEY,
    invoice_no            TEXT NOT NULL UNIQUE,
    dispatch_date         DATE NOT NULL DEFAULT CURRENT_DATE,
    customer_name         TEXT NOT NULL,
    po_no                 TEXT,
    po_date               DATE,
    total_qty_dispatched  INTEGER DEFAULT 0,
    mode                  TEXT DEFAULT 'Road',
    courier_name          TEXT,
    tracking_number       TEXT,
    bilty_no              TEXT,
    bilty_date            DATE,
    no_of_cartons         INTEGER,
    invoice_value         NUMERIC(12,2),
    status                TEXT DEFAULT 'Dispatched',
    remarks               TEXT,
    entered_by            TEXT,
    received_by_crm       BOOLEAN DEFAULT FALSE,
    unit_id               TEXT DEFAULT 'Unit 1',
    tax_type              TEXT DEFAULT 'SGST',
    invoice_seq           TEXT,
    financial_year        TEXT,
    corrected_at          TIMESTAMPTZ,
    corrected_by          TEXT,
    correction_note       TEXT,
    reversed_at           TIMESTAMPTZ,
    reversed_by           TEXT,
    reversal_note         TEXT,
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint: same seq allowed in different units, not same unit
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'prod_dispatches_unit_invoice_uniq'
  ) THEN
    ALTER TABLE public.prod_dispatches
      ADD CONSTRAINT prod_dispatches_unit_invoice_uniq
      UNIQUE (unit_id, invoice_seq, financial_year);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS prod_dispatches_date_idx ON public.prod_dispatches(dispatch_date DESC);
CREATE INDEX IF NOT EXISTS prod_dispatches_cust_idx ON public.prod_dispatches(customer_name);

-- ── P14. prod_dispatch_items ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prod_dispatch_items (
    id              TEXT PRIMARY KEY,
    dispatch_id     TEXT NOT NULL REFERENCES public.prod_dispatches(id) ON DELETE CASCADE,
    job_card_id     TEXT NOT NULL REFERENCES public.prod_jobs(id),
    qty_dispatched  INTEGER NOT NULL,
    unit            TEXT DEFAULT 'pcs',
    ordered_qty     INTEGER,
    remaining_qty   INTEGER,
    order_id        TEXT,
    po_no           TEXT,
    ordered_item    TEXT,
    die_no          TEXT,
    moc             TEXT,
    dispatch_date   DATE,
    invoice_no      TEXT,
    entered_by      TEXT,
    corrected_at    TIMESTAMPTZ,
    correction_note TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS prod_dispatch_items_dispatch_idx ON public.prod_dispatch_items(dispatch_id);
CREATE INDEX IF NOT EXISTS prod_dispatch_items_jc_idx       ON public.prod_dispatch_items(job_card_id);

-- ── P15. prod_boms ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prod_boms (
    id              BIGSERIAL PRIMARY KEY,
    product_id      TEXT NOT NULL REFERENCES public.prod_products(id) ON DELETE CASCADE,
    is_compound     BOOLEAN DEFAULT FALSE,
    raw_code        TEXT NOT NULL,
    raw_name        TEXT NOT NULL,
    qty_per_batch   NUMERIC(10,3),
    unit            TEXT DEFAULT 'kg',
    supplier        TEXT,
    kg_per_batch    NUMERIC(10,3),
    batches_per_run INTEGER,
    sort_order      INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS prod_boms_product_idx ON public.prod_boms(product_id);

-- ── P16. prod_fg_stock ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prod_fg_stock (
    id           TEXT PRIMARY KEY,
    family_code  TEXT NOT NULL,
    product_id   TEXT,
    job_card_id  TEXT,
    ref_job_id   TEXT,
    qty          NUMERIC NOT NULL,
    movement     TEXT NOT NULL,
    note         TEXT,
    created_by   TEXT,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS prod_fg_stock_family_idx ON public.prod_fg_stock(family_code);

-- ── P17. prod_options ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prod_options (
    id         TEXT PRIMARY KEY,
    field      TEXT NOT NULL,
    value      TEXT NOT NULL,
    meta       JSONB,
    sort       INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS prod_options_field_value_uniq
  ON public.prod_options(field, lower(value));

-- ── P18. prod_attachments ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prod_attachments (
    id           BIGSERIAL PRIMARY KEY,
    type         TEXT NOT NULL,
    shift_date   DATE NOT NULL,
    shift        TEXT,
    job_card_id  TEXT,
    log_entry_id TEXT,
    file_name    TEXT NOT NULL,
    file_path    TEXT NOT NULL,
    file_size    INTEGER,
    mime_type    TEXT,
    uploaded_by  TEXT,
    notes        TEXT,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);


-- ╔══════════════════════════════════════════════════════════════╗
-- ║  SECTION 4 — PRODUCTION RLS POLICIES                       ║
-- ╚══════════════════════════════════════════════════════════════╝

ALTER TABLE public.prod_presses              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prod_workers              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prod_compounds            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prod_products             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prod_jobs                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prod_job_stage_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prod_ncrs                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prod_shop_floor_settings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prod_molding              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prod_finishing            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prod_inspection           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prod_pdi_logs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prod_dispatches           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prod_dispatch_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prod_boms                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prod_fg_stock             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prod_options              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prod_attachments          ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'prod_presses','prod_workers','prod_compounds','prod_products',
    'prod_jobs','prod_job_stage_events','prod_ncrs','prod_shop_floor_settings',
    'prod_molding','prod_finishing','prod_inspection','prod_pdi_logs',
    'prod_dispatches','prod_dispatch_items','prod_boms','prod_fg_stock',
    'prod_options','prod_attachments'
  ]) LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Allow company access" ON public.%I', t);
    EXECUTE format($f$
      CREATE POLICY "Allow company access"
      ON public.%I FOR ALL TO authenticated
      USING  (auth.jwt() ->> 'email' LIKE '%%@himalayaterpene.com')
      WITH CHECK (auth.jwt() ->> 'email' LIKE '%%@himalayaterpene.com')
    $f$, t);
  END LOOP;
END $$;


-- ╔══════════════════════════════════════════════════════════════╗
-- ║  SECTION 5 — REALTIME PUBLICATION                          ║
-- ╚══════════════════════════════════════════════════════════════╝

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'enquiries','quotes','orders','followups','customers',
    'app_settings','authorized_signatories','company_units',
    'bank_accounts','team_roster','po_submissions',
    'prod_presses','prod_workers','prod_jobs','prod_job_stage_events',
    'prod_ncrs','prod_shop_floor_settings','prod_molding','prod_finishing',
    'prod_inspection','prod_pdi_logs','prod_dispatches','prod_dispatch_items',
    'prod_compounds','prod_products','prod_boms','prod_fg_stock',
    'prod_options','prod_attachments'
  ]) LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN undefined_object THEN
        RAISE NOTICE 'supabase_realtime publication not found — skipping';
        EXIT;
    END;
  END LOOP;
END $$;


-- ╔══════════════════════════════════════════════════════════════╗
-- ║  SECTION 6 — STORAGE BUCKET POLICIES                       ║
-- ║  (Buckets must be created first in Supabase dashboard)     ║
-- ║  • Docs          — private, for CRM attachments            ║
-- ║  • public-assets — public, for header/sig images           ║
-- ║  • po-uploads    — public, for supplier PO uploads         ║
-- ║  • prod-docs     — private, for DPR/PDI documents         ║
-- ╚══════════════════════════════════════════════════════════════╝

-- Docs (private — company attachments)
DROP POLICY IF EXISTS "Allow authenticated uploads"   ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated updates"   ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated downloads" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated deletes"   ON storage.objects;

CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'Docs');

CREATE POLICY "Allow authenticated updates"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'Docs');

CREATE POLICY "Allow authenticated downloads"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'Docs');

CREATE POLICY "Allow authenticated deletes"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'Docs');

-- public-assets (public read, authenticated write)
DROP POLICY IF EXISTS "Allow authenticated uploads to public assets"  ON storage.objects;
DROP POLICY IF EXISTS "Allow public select from public assets"        ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated updates to public assets"  ON storage.objects;

CREATE POLICY "Allow authenticated uploads to public assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'public-assets');

CREATE POLICY "Allow public select from public assets"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'public-assets');

CREATE POLICY "Allow authenticated updates to public assets"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'public-assets');

-- po-uploads (public — suppliers submit without login)
DROP POLICY IF EXISTS "Allow public po uploads"    ON storage.objects;
DROP POLICY IF EXISTS "Allow public po downloads"  ON storage.objects;

CREATE POLICY "Allow public po uploads"
ON storage.objects FOR INSERT TO anon
WITH CHECK (bucket_id = 'po-uploads');

CREATE POLICY "Allow public po downloads"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'po-uploads');

-- prod-docs (private — production documents)
DROP POLICY IF EXISTS "Company access to prod-docs" ON storage.objects;

CREATE POLICY "Company access to prod-docs"
ON storage.objects FOR ALL TO authenticated
USING  (bucket_id = 'prod-docs' AND (auth.jwt() ->> 'email') LIKE '%@himalayaterpene.com')
WITH CHECK (bucket_id = 'prod-docs' AND (auth.jwt() ->> 'email') LIKE '%@himalayaterpene.com');


-- ╔══════════════════════════════════════════════════════════════╗
-- ║  SECTION 7 — SEED DATA                                     ║
-- ╚══════════════════════════════════════════════════════════════╝

-- Presses
INSERT INTO public.prod_presses (id, name, tonnage, status, eta_text) VALUES
  ('P1','Press 1','100T','idle','Idle'),
  ('P2','Press 2','100T','idle','Idle'),
  ('P3','Press 3','150T','idle','Idle'),
  ('P4','Press 4','200T','idle','Idle')
ON CONFLICT (id) DO NOTHING;

-- Workers (finishers + inspectors + press operators)
INSERT INTO public.prod_workers (id, name, role, department, present, shift, press_id) VALUES
  ('F01','Ramesh K.', 'Senior Finisher', 'finishing',  TRUE,  'day',   NULL),
  ('F02','Suresh P.', 'Finisher',        'finishing',  TRUE,  'day',   NULL),
  ('F03','Dinesh M.', 'Finisher',        'finishing',  FALSE, 'day',   NULL),
  ('F04','Mahesh T.', 'Finisher',        'finishing',  TRUE,  'day',   NULL),
  ('F05','Ganesh R.', 'Finisher',        'finishing',  TRUE,  'day',   NULL),
  ('F06','Rajesh B.', 'Trainee Finisher','finishing',  TRUE,  'day',   NULL),
  ('F07','Harish V.', 'Finisher',        'finishing',  FALSE, 'day',   NULL),
  ('F08','Umesh S.',  'Finisher',        'finishing',  TRUE,  'day',   NULL),
  ('I01','Ravi K.',   'Sr. Inspector',   'inspection', TRUE,  'day',   NULL),
  ('I02','Mohan D.',  'Inspector',       'inspection', TRUE,  'day',   NULL),
  ('I03','Vijay S.',  'Inspector',       'inspection', FALSE, 'day',   NULL),
  ('I04','Anil C.',   'Inspector',       'inspection', TRUE,  'day',   NULL),
  ('P01','Kiran J.',  'Press Operator',  'press',      TRUE,  'day',   'P1'),
  ('P02','Nilesh B.', 'Press Operator',  'press',      TRUE,  'day',   'P2'),
  ('P03','Bharat S.', 'Sr. Press Operator','press',    TRUE,  'day',   'P3'),
  ('P04','Prakash N.','Press Operator',  'press',      FALSE, 'day',   'P4'),
  ('P05','Santosh K.','Press Operator',  'press',      FALSE, 'night', 'P1'),
  ('P06','Deepak R.', 'Press Operator',  'press',      FALSE, 'night', 'P2')
ON CONFLICT (id) DO NOTHING;

-- Compounds
INSERT INTO public.prod_compounds (id, code, name, grade, shore_a, shelf_days, colour) VALUES
  ('CM001','EPDM-70',  'EPDM 70 Shore A — General', 'EPDM', 70, 180, 'Black'),
  ('CM002','EPDM-70W', 'EPDM 70 Shore A — WRAS',    'EPDM', 70, 180, 'Black'),
  ('CM003','NBR-65',   'NBR 65 Shore A — General',  'NBR',  65, 120, 'Black'),
  ('CM004','HNBR-70',  'HNBR 70 Shore A — HT Grade','HNBR', 70, 150, 'Black'),
  ('CM005','FKM-75',   'FKM 75 Shore A — Chemical', 'FKM',  75, 365, 'Brown'),
  ('CM006','FFKM-80',  'FFKM 80 Shore A — Ultra',   'FFKM', 80, 365, 'White')
ON CONFLICT (id) DO NOTHING;

-- Team roster
INSERT INTO public.team_roster (email, display_name, role) VALUES
  ('accounts@himalayaterpene.com', 'Data Entry Operator',  'DEO'),
  ('accounts@himalayaterpene.com', 'Pankaj',               'Rate Entry'),
  ('sc1@himalayaterpene.com',      'Disha Khurana',        'SC_1'),
  ('akash@himalayaterpene.com',    'Akash Gupta',          'Negotiation'),
  ('sagar@himalayaterpene.com',    'Sagar Gupta',          'Negotiation'),
  ('accounts@himalayaterpene.com', 'PI Sender (Accounts)', 'PI Sender')
ON CONFLICT (email, role) DO NOTHING;

-- SC_1 alias for historical records
UPDATE public.team_roster
SET aliases = (
  SELECT jsonb_agg(DISTINCT a)
  FROM jsonb_array_elements_text(
    COALESCE(aliases, '[]'::jsonb) || '["himalaya terpenes/ disha khurana"]'::jsonb
  ) AS a
)
WHERE email = 'sc1@himalayaterpene.com' AND role = 'SC_1';

-- prod_options: Item Category → Workshop Unit + MOC / Colour Code starters
INSERT INTO public.prod_options (id, field, value, meta) VALUES
  ('opt-cat-gasket',         'item_category','Gasket',                      '{"unit":"Unit 2"}'),
  ('opt-cat-liner',          'item_category','Liner',                       '{"unit":"Unit 2"}'),
  ('opt-cat-bfly2',          'item_category','Butter Fly 2',                '{"unit":"Unit 2"}'),
  ('opt-cat-bfly1',          'item_category','Butter Fly 1',                '{"unit":"Unit 1"}'),
  ('opt-cat-orings',         'item_category','O-Rings',                     '{"unit":"Unit 1"}'),
  ('opt-cat-valves',         'item_category','Valves',                      '{"unit":"Unit 1"}'),
  ('opt-cat-flatewasher',    'item_category','Flate Washer',                '{"unit":"Unit 1"}'),
  ('opt-cat-rubberseat',     'item_category','Rubber Seat',                 '{"unit":"Unit 1"}'),
  ('opt-cat-seal',           'item_category','Seal',                        '{"unit":"Unit 1"}'),
  ('opt-cat-diskplate',      'item_category','Disk Plate',                  '{"unit":"Unit 1"}'),
  ('opt-cat-localdisk',      'item_category','Local Disk',                  '{"unit":"Unit 1"}'),
  ('opt-cat-pan',            'item_category','Pan',                         '{"unit":"Unit 1"}'),
  ('opt-cat-cord',           'item_category','Cord',                        '{"unit":"Unit 1"}'),
  ('opt-cat-dmc-u2',         'item_category','Die Making Charges U2',       '{"unit":"Unit 2"}'),
  ('opt-cat-dmc-u1',         'item_category','Die Making Charges U1',       '{"unit":"Unit 1"}'),
  ('opt-cat-coupling',       'item_category','Coupling',                    '{"unit":"Unit 1"}'),
  ('opt-cat-bellow',         'item_category','Bellow',                      '{"unit":"Unit 1"}'),
  ('opt-cat-hydbucket',      'item_category','Hydraulic Bucket',            '{"unit":"Unit 1"}'),
  ('opt-cat-taperplug',      'item_category','Taper Plug',                  '{"unit":"Unit 1"}'),
  ('opt-cat-grommet',        'item_category','Grommet',                     '{"unit":"Unit 1"}'),
  ('opt-cat-diaphragm',      'item_category','Diaphragm',                   '{"unit":"Unit 1"}'),
  ('opt-cat-hose',           'item_category','Hose',                        '{"unit":"Unit 1"}'),
  ('opt-cat-patti',          'item_category','Patti',                       '{"unit":"Unit 1"}'),
  ('opt-cat-rubbersheet',    'item_category','Rubber Sheet',                '{"unit":"Unit 1"}'),
  ('opt-cat-sealkit',        'item_category','Seal Kit',                    '{"unit":"Unit 1"}'),
  ('opt-cat-rubberstrip',    'item_category','Rubber Strip',                '{"unit":"Unit 1"}'),
  ('opt-cat-rubbersqueezer', 'item_category','Rubber Squeezer',             '{"unit":"Unit 1"}'),
  ('opt-cat-ssplate',        'item_category','SS Plate',                    '{"unit":"Unit 2"}'),
  ('opt-cat-bottomroller',   'item_category','Bottom Roller / Juice seal',  '{"unit":"Unit 1"}'),
  ('opt-cat-flatring',       'item_category','Flat Ring',                   '{"unit":"Unit 1"}'),
  ('opt-cat-bushplain',      'item_category','Bush - Plain',                '{"unit":"Unit 1"}'),
  ('opt-cat-bushbrass',      'item_category','Bush - Brass',                '{"unit":"Unit 1"}'),
  ('opt-cat-ucoupling',      'item_category','U Coupling',                  '{"unit":"Unit 1"}'),
  ('opt-cat-starcoupling',   'item_category','Star Coupling',               '{"unit":"Unit 1"}'),
  ('opt-cat-bushfeedpump',   'item_category','Bush - feed pump',            '{"unit":"Unit 1"}'),
  ('opt-cat-tensioner',      'item_category','Tensioner',                   '{"unit":"Unit 1"}'),
  ('opt-cat-dampingpad',     'item_category','Damping pad',                 '{"unit":"Unit 1"}'),
  ('opt-cat-hopper',         'item_category','Hopper',                      '{"unit":"Unit 1"}'),
  ('opt-cat-stator',         'item_category','Stator',                      '{"unit":"Unit 1"}'),
  ('opt-cat-bootseal',       'item_category','Boot seal',                   '{"unit":"Unit 1"}'),
  ('opt-cat-buffer',         'item_category','Buffer',                      '{"unit":"Unit 1"}'),
  ('opt-cat-soup',           'item_category','Soup',                        '{"unit":"Unit 1"}'),
  ('opt-cat-molassessleeve', 'item_category','Molasses sleeve',             '{"unit":"Unit 1"}'),
  ('opt-cat-exhvapseat',     'item_category','Exhaust & vapour value seat', '{"unit":"Unit 1"}'),
  ('opt-cat-mudscraper',     'item_category','Mud scraper',                 '{"unit":"Unit 1"}'),
  ('opt-cat-hydseals',       'item_category','HYDRAULIC SEALS',             '{"unit":"Unit 1"}'),
  ('opt-cat-sightglass',     'item_category','Sight Glass',                 '{"unit":"Unit 1"}'),
  ('opt-cat-uchannel',       'item_category','U Channel',                   '{"unit":"Unit 1"}'),
  ('opt-moc-nbr',      'moc',         'NBR',      NULL),
  ('opt-moc-epdm',     'moc',         'EPDM',     NULL),
  ('opt-moc-silicone', 'moc',         'Silicone', NULL),
  ('opt-moc-viton',    'moc',         'Viton',    NULL),
  ('opt-moc-natural',  'moc',         'Natural',  NULL),
  ('opt-col-black',    'colour_code', 'Black',    NULL),
  ('opt-col-red',      'colour_code', 'Red',      NULL),
  ('opt-col-green',    'colour_code', 'Green',    NULL),
  ('opt-col-blue',     'colour_code', 'Blue',     NULL),
  ('opt-col-white',    'colour_code', 'White',    NULL)
ON CONFLICT (field, lower(value)) DO NOTHING;
