-- 2026-11-03: Dispatch Step 11 "Send Documents" — documents can also be sent
-- on WhatsApp (outside the app; the app sends nothing, it only records it).
--
-- dispatch_entries.docs_sent_via: how the documents went out —
--   'email'    = Email to Client (the app's own email)
--   'whatsapp' = "Send through WhatsApp" on the Dispatch drawer
--   null       = not sent yet
-- The WhatsApp button sets email_sent_at = now() AND docs_sent_via =
-- 'whatsapp', so every existing "documents sent" check (Step 11 proof,
-- Delivered list, Email Sent box, entry page "Email Sent" stage) works
-- unchanged. Undo of a WhatsApp Step 11 clears both again.
--
-- Backfill: every entry already sent (email_sent_at set, imported ones
-- included — 753 of 758 on 2026-11-03) is 'email', which is what the app shows
-- for them today ("Email sent …").
--
-- No function / trigger change: enforce_dispatch_entry_step_prereqs (on
-- dispatch_steps) checks Steps 8–10 only and reads bhiwandi_email_sent_at,
-- not email_sent_at; no other function, view or trigger reads
-- dispatch_entries.email_sent_at.

alter table public.dispatch_entries add column if not exists docs_sent_via text;

update public.dispatch_entries set docs_sent_via = 'email'
  where email_sent_at is not null and docs_sent_via is null;

alter table public.dispatch_entries
  add constraint dispatch_entries_docs_sent_via_check
  check (docs_sent_via is null or (docs_sent_via in ('email', 'whatsapp') and email_sent_at is not null));
