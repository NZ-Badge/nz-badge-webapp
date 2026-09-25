-- Riepilogo settimanale (item 28 del TODO): la riga di log viene riservata con stato
-- `pending` prima dell'invio della mail e poi aggiornata a `sent`/`error`, cosi' due
-- esecuzioni sovrapposte non possono inviare due volte lo stesso riepilogo.
ALTER TABLE `weekly_attendance_summary_log`
  MODIFY COLUMN `status` enum('pending','sent','skipped','error') NOT NULL DEFAULT 'sent';
