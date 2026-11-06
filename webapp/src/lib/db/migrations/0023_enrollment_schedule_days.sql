-- Corsi non contigui: modalita' calendario e giornate effettive del corso.
ALTER TABLE `enrollments`
  ADD `schedule_mode` enum('CONTIGUOUS','NON_CONTIGUOUS','NON_CONTIGUOUS_CUSTOM') NOT NULL DEFAULT 'CONTIGUOUS';
--> statement-breakpoint
CREATE TABLE `enrollment_schedule_days` (
  `enrollment_id` int NOT NULL,
  `course_date` date NOT NULL,
  CONSTRAINT `enrollment_schedule_days_pk` PRIMARY KEY (`enrollment_id`, `course_date`),
  CONSTRAINT `enrollment_schedule_days_enrollment_fk` FOREIGN KEY (`enrollment_id`)
    REFERENCES `enrollments`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `idx_enrollment_schedule_days_date` ON `enrollment_schedule_days` (`course_date`);
