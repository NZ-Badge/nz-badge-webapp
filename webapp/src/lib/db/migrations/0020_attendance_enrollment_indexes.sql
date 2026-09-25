-- Indici per le query su intervalli temporali (item 15 del TODO).
-- attendance: ricerche per card o iscritto ordinate/filtrate per `read_timestamp`
-- (antirimbalzo e ultimo evento per card, presenze del periodo corso, ultimo ingresso).
ALTER TABLE `attendance`
  ADD INDEX `idx_attendance_card_time` (`card_uid`, `read_timestamp`),
  ADD INDEX `idx_attendance_subscriber_time` (`subscriber_id`, `read_timestamp`);
--> statement-breakpoint

-- enrollments: `start_date <= d AND end_date >= d` (corsi attivi, validazione strisciate)
-- usa il composito; `end_date >= d` da solo (dashboard, export) usa il secondo.
ALTER TABLE `enrollments`
  ADD INDEX `idx_enrollment_start_end` (`start_date`, `end_date`),
  ADD INDEX `idx_enrollment_end_date` (`end_date`);
--> statement-breakpoint

-- card_rfid.uid ha gia' il vincolo UNIQUE (indice `uid`): `idx_uid` e' un duplicato.
ALTER TABLE `card_rfid`
  DROP INDEX `idx_uid`;
