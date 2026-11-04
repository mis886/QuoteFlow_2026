# Dispatch Step 11 — "Send through WhatsApp" (2026-11-03)

Some customers have no email; their documents (invoice, e-way bill, LR, COA)
are sent on WhatsApp outside the app. Without a record the entry stayed
stuck at Step 11 "Send Documents".

## What the button does

- Where (moved 2026-11-04, user decision): the dispatch ENTRY page
  (`NewDispatchEntry.tsx`, the page "Attach Documents & Send →" opens), the
  FIRST button of the bottom action bar, directly left of Save, same Button
  style as Save / Email to Client. It is NOT in the Dispatch drawer any more
  (the drawer's Step 11 is back to how it was before f34cf9f; its Undo still
  clears a WhatsApp mark, see below).
- It opens WhatsApp / sends NOTHING. After the confirm box ("Mark documents
  as sent on WhatsApp? … This completes Step 11 and moves this entry to
  Delivered." — "Yes, mark sent" / "Cancel") it:
  1. sets `dispatch_entries.email_sent_at = now()` and `docs_sent_via =
     'whatsapp'` (only while `email_sent_at` is still empty);
  2. writes Step 11 Done (`dispatch_steps`, remark "sent via WhatsApp"),
     through `saveEntryStepRows` like the "Documents sent" button.
  If step 2 fails, step 1 is taken back — never half-done.
  Code: `markEntryDocsSentWhatsApp` in `src/lib/dispatchEntrySteps.ts` (the
  drawer's code, moved there — one copy).
- After it succeeds: toast "Documents marked as sent on WhatsApp"; the page
  shows the sent state (Email Sent stage — View / Download, like after Email
  to Client) and the button is gone; Back / Cancel go to the List's Delivered
  pill (`/dispatch?pill=delivered`).
- History Log: "… Step 11 Send Documents · Done (documents sent on WhatsApp)"
  (dispatch_steps) and "… Step 11 done — documents sent on WhatsApp"
  (dispatch_entries, before/after), each with the user and time.

## Rules (same as Email to Client)

Shown on the entry page until the entry is sent (either way — `email_sent_at`
set hides it). Enabled only when all of these hold, otherwise greyed with
the reason as its tooltip (no text under the bar):

- the entry is saved ("Save the dispatch entry first");
- a `canActOnDispatchBoard` login (DISPATCH_BOARD_EMAILS), not the read-only
  login (the usual board tooltip);
- not a system-import entry;
- the entry is AT Step 11 (`showStep11WhatsApp`): Steps 8 and 9 finished
  (Step 9 Bhiwandi done), Step 10 done or skipped (Self Pickup) ("Finish Step
  N first …");
- required documents (`customers.req_doc_*`) saved on the entry — a required
  Invoice / Eway Bill, LR (not Self Pickup), COA or Supplier Portal file
  (`step11WhatsAppBlock`, its reason).

Unsaved changes on the form when it is clicked → toast "Save the entry
first" and nothing else (it never saves for you). "Unsaved" = any field
Save writes differs from how the saved entry was loaded, or a document was
added / removed. Checked again against the database on confirm (still at
Step 11, not sent, documents saved).

## Why reusing `email_sent_at` works

Every place that means "documents sent" reads `dispatch_entries.email_sent_at`,
so a WhatsApp entry behaves exactly like an emailed one:

| Reader | Effect |
|---|---|
| `entryStepBlock` Step 11 proof (dispatchFlow.ts) | passes → Step 11 can be written / auto-completed |
| Delivered list (`deliveredCards`, Dispatch.tsx) | entry listed in the Delivered pill |
| Email Sent header box (`headerCounts.emailSent`) | counted |
| Board row text (`TimeBar`) | "Sent on WhatsApp …" (emailed: "Email sent …") |
| Delivered list "Email Sent On" column, drawer entry row | date + WhatsApp / Email tag (`SentViaTag`) |
| Entry page `docStage` (NewDispatchEntry.tsx) | "Email Sent" stage (View / Download buttons) |
| `autoCompleteEntrySteps` | no double row (Step 11 already done) |

Database: `enforce_dispatch_entry_step_prereqs` (trigger on dispatch_steps)
checks Steps 8–10 only and reads `bhiwandi_email_sent_at`; no function, view
or trigger reads `dispatch_entries.email_sent_at`, so nothing there changed.
`stock_movements.email_sent_at` (the DO email, Step 6) is not touched.

## Undo

Undo of a WhatsApp Step 11 (drawer "Undo last step" — still in the drawer
after the 2026-11-04 move) clears
`email_sent_at` + `docs_sent_via` first, then deletes the Step 11 row (if
that fails the mark is put back). The entry is back at Step 11, not sent, out
of Delivered, tag gone. Logged in the History Log.
Undo of an EMAILED Step 11 is unchanged: only the step row goes, the email
stays recorded (it really was sent).

## Database

`supabase/migrations/20261103210000_dispatch_entries_docs_sent_via.sql`:
`docs_sent_via text` ('email' | 'whatsapp' | null), backfilled 'email' for
every entry already sent, check: `docs_sent_via` set only together with
`email_sent_at`. Email to Client (`markDispatchEmailSent`) now writes
`docs_sent_via = 'email'`. The 2026-11-04 move changed no database object.
