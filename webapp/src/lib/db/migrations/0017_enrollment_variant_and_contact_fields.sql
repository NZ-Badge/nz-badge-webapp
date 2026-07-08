DROP PROCEDURE IF EXISTS _mig_0017;
--> statement-breakpoint
CREATE PROCEDURE _mig_0017()
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM information_schema.COLUMNS
		WHERE TABLE_SCHEMA = DATABASE()
			AND TABLE_NAME = 'enrollments'
			AND COLUMN_NAME = 'shopify_line_item_id'
	) THEN
		ALTER TABLE `enrollments` ADD COLUMN `shopify_line_item_id` varchar(255);
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM information_schema.COLUMNS
		WHERE TABLE_SCHEMA = DATABASE()
			AND TABLE_NAME = 'enrollments'
			AND COLUMN_NAME = 'internal_line_item_id'
	) THEN
		ALTER TABLE `enrollments` ADD COLUMN `internal_line_item_id` varchar(255);
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM information_schema.COLUMNS
		WHERE TABLE_SCHEMA = DATABASE()
			AND TABLE_NAME = 'enrollments'
			AND COLUMN_NAME = 'variant_id'
	) THEN
		ALTER TABLE `enrollments` ADD COLUMN `variant_id` varchar(255);
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM information_schema.COLUMNS
		WHERE TABLE_SCHEMA = DATABASE()
			AND TABLE_NAME = 'enrollments'
			AND COLUMN_NAME = 'vat_number'
	) THEN
		ALTER TABLE `enrollments` ADD COLUMN `vat_number` varchar(32);
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM information_schema.COLUMNS
		WHERE TABLE_SCHEMA = DATABASE()
			AND TABLE_NAME = 'enrollments'
			AND COLUMN_NAME = 'course_class'
	) THEN
		ALTER TABLE `enrollments` ADD COLUMN `course_class` varchar(50);
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM information_schema.COLUMNS
		WHERE TABLE_SCHEMA = DATABASE()
			AND TABLE_NAME = 'enrollments'
			AND COLUMN_NAME = 'enrollment_type_id'
	) THEN
		ALTER TABLE `enrollments` ADD COLUMN `enrollment_type_id` int;
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM information_schema.COLUMNS
		WHERE TABLE_SCHEMA = DATABASE()
			AND TABLE_NAME = 'enrollments'
			AND COLUMN_NAME = 'enrollment_type_name'
	) THEN
		ALTER TABLE `enrollments` ADD COLUMN `enrollment_type_name` varchar(255);
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM information_schema.COLUMNS
		WHERE TABLE_SCHEMA = DATABASE()
			AND TABLE_NAME = 'enrollments'
			AND COLUMN_NAME = 'enrollment_type_course_type'
	) THEN
		ALTER TABLE `enrollments` ADD COLUMN `enrollment_type_course_type` varchar(100);
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM information_schema.STATISTICS
		WHERE TABLE_SCHEMA = DATABASE()
			AND TABLE_NAME = 'enrollments'
			AND INDEX_NAME = 'idx_enrollment_variant'
	) THEN
		ALTER TABLE `enrollments` ADD INDEX `idx_enrollment_variant` (`variant_id`);
	END IF;
END
--> statement-breakpoint
CALL _mig_0017();
--> statement-breakpoint
DROP PROCEDURE IF EXISTS _mig_0017;
