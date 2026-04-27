DROP PROCEDURE IF EXISTS _mig_0014;
--> statement-breakpoint
CREATE PROCEDURE _mig_0014()
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM information_schema.COLUMNS
		WHERE TABLE_SCHEMA = DATABASE()
			AND TABLE_NAME = 'enrollments'
			AND COLUMN_NAME = 'course_duration_days'
	) THEN
		ALTER TABLE `enrollments` ADD COLUMN `course_duration_days` int;
	END IF;
END
--> statement-breakpoint
CALL _mig_0014();
--> statement-breakpoint
DROP PROCEDURE IF EXISTS _mig_0014;
