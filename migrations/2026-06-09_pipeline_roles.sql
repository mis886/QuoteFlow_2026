-- Migration: 2026-06-09 — Role ownership per pipeline stage
--
-- The Doer KPI page needs to know which role owns each board lane so it can show
-- a doer their stage workload ("cards by stage") and frame tasks the way the team
-- thinks about them. Stored as JSONB on app_settings, edited in Settings →
-- Pipeline TAT alongside the per-lane TAT hours (mirrors pipeline_tat_h, added in
-- 2026-05-29_pipeline_kanban.sql).
--
-- Shape: { "New Enquiry": "DEO", "To Quote": "Rate Entry", "1st Follow-up": "SC_1", ... }
-- Missing lanes fall back to DEFAULT_STAGE_ROLE in code.

ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS pipeline_roles JSONB;
