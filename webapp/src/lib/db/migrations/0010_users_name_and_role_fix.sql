-- Migration: Add name column and update role enum for users table
-- Created: 2026-03-17
-- Fixed for MySQL 8.4 compatibility (stored procedures instead of PREPARE/EXECUTE)

-- Add name column to users table only if it doesn't exist
DROP PROCEDURE IF EXISTS _mig_0010_add_name;
--> statement-breakpoint
CREATE PROCEDURE _mig_0010_add_name()
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_NAME = 'users' AND TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'name'
  ) THEN
    ALTER TABLE users ADD COLUMN name VARCHAR(100) NULL AFTER id;
  END IF;
END
--> statement-breakpoint
CALL _mig_0010_add_name();
--> statement-breakpoint
DROP PROCEDURE IF EXISTS _mig_0010_add_name;
--> statement-breakpoint

-- Update existing rows with name from email (part before @) where name is NULL or empty
UPDATE users SET name = SUBSTRING_INDEX(email, '@', 1) WHERE name IS NULL OR name = '';
--> statement-breakpoint

-- Make name NOT NULL after populating (only if still NULLable)
DROP PROCEDURE IF EXISTS _mig_0010_make_name_notnull;
--> statement-breakpoint
CREATE PROCEDURE _mig_0010_make_name_notnull()
BEGIN
  IF EXISTS(
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_NAME = 'users' AND TABLE_SCHEMA = DATABASE()
      AND COLUMN_NAME = 'name' AND IS_NULLABLE = 'YES'
  ) THEN
    ALTER TABLE users MODIFY COLUMN name VARCHAR(100) NOT NULL;
  END IF;
END
--> statement-breakpoint
CALL _mig_0010_make_name_notnull();
--> statement-breakpoint
DROP PROCEDURE IF EXISTS _mig_0010_make_name_notnull;
--> statement-breakpoint

-- Update existing 'operator' roles to 'staff' (idempotent, only affects old data)
UPDATE users SET role = 'staff' WHERE role = 'operator';
--> statement-breakpoint

-- Modify the enum only if it still contains 'operator'
DROP PROCEDURE IF EXISTS _mig_0010_fix_enum;
--> statement-breakpoint
CREATE PROCEDURE _mig_0010_fix_enum()
BEGIN
  IF EXISTS(
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_NAME = 'users' AND TABLE_SCHEMA = DATABASE()
      AND COLUMN_NAME = 'role' AND COLUMN_TYPE LIKE '%operator%'
  ) THEN
    ALTER TABLE users MODIFY COLUMN role ENUM('admin', 'staff') NOT NULL DEFAULT 'staff';
  END IF;
END
--> statement-breakpoint
CALL _mig_0010_fix_enum();
--> statement-breakpoint
DROP PROCEDURE IF EXISTS _mig_0010_fix_enum;
