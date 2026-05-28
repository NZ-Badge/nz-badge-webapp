DROP PROCEDURE IF EXISTS _mig_0015;
--> statement-breakpoint
CREATE PROCEDURE _mig_0015()
BEGIN
	IF EXISTS (
		SELECT 1
		FROM information_schema.COLUMNS
		WHERE TABLE_SCHEMA = DATABASE()
			AND TABLE_NAME = 'enrollments'
			AND COLUMN_NAME = 'preferred_date'
	) AND NOT EXISTS (
		SELECT 1
		FROM information_schema.COLUMNS
		WHERE TABLE_SCHEMA = DATABASE()
			AND TABLE_NAME = 'enrollments'
			AND COLUMN_NAME = 'start_date'
	) THEN
		ALTER TABLE `enrollments` CHANGE COLUMN `preferred_date` `start_date` date;
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM information_schema.COLUMNS
		WHERE TABLE_SCHEMA = DATABASE()
			AND TABLE_NAME = 'enrollments'
			AND COLUMN_NAME = 'start_date'
	) THEN
		ALTER TABLE `enrollments` ADD COLUMN `start_date` date;
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM information_schema.COLUMNS
		WHERE TABLE_SCHEMA = DATABASE()
			AND TABLE_NAME = 'enrollments'
			AND COLUMN_NAME = 'end_date'
	) THEN
		ALTER TABLE `enrollments` ADD COLUMN `end_date` date;
	END IF;
END
--> statement-breakpoint
CALL _mig_0015();
--> statement-breakpoint
DROP PROCEDURE IF EXISTS _mig_0015;
