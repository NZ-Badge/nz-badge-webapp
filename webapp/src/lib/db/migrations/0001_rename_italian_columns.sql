-- Migration: Rename Italian columns to English
-- Date: 2026-02-27
-- Fixed for MySQL 8.4 compatibility (stored procedure instead of PREPARE/EXECUTE)

DROP PROCEDURE IF EXISTS _mig_0001;
--> statement-breakpoint
CREATE PROCEDURE _mig_0001()
BEGIN
  -- subscribers: nome -> first_name
  IF EXISTS(SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subscribers' AND COLUMN_NAME = 'nome') THEN
    ALTER TABLE subscribers CHANGE COLUMN nome first_name VARCHAR(100) NOT NULL;
  END IF;
  -- subscribers: cognome -> last_name
  IF EXISTS(SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subscribers' AND COLUMN_NAME = 'cognome') THEN
    ALTER TABLE subscribers CHANGE COLUMN cognome last_name VARCHAR(100) NOT NULL;
  END IF;
  -- subscribers: telefono -> phone
  IF EXISTS(SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subscribers' AND COLUMN_NAME = 'telefono') THEN
    ALTER TABLE subscribers CHANGE COLUMN telefono phone VARCHAR(20);
  END IF;
  -- subscribers: codice_fiscale -> tax_id
  IF EXISTS(SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subscribers' AND COLUMN_NAME = 'codice_fiscale') THEN
    ALTER TABLE subscribers CHANGE COLUMN codice_fiscale tax_id VARCHAR(16);
  END IF;
  -- subscribers: corso_nome -> course_name
  IF EXISTS(SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subscribers' AND COLUMN_NAME = 'corso_nome') THEN
    ALTER TABLE subscribers CHANGE COLUMN corso_nome course_name VARCHAR(255);
  END IF;
  -- subscribers: data_acquisto -> purchase_date
  IF EXISTS(SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subscribers' AND COLUMN_NAME = 'data_acquisto') THEN
    ALTER TABLE subscribers CHANGE COLUMN data_acquisto purchase_date DATE;
  END IF;
  -- subscribers: data_inizio_corso -> course_start_date
  IF EXISTS(SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subscribers' AND COLUMN_NAME = 'data_inizio_corso') THEN
    ALTER TABLE subscribers CHANGE COLUMN data_inizio_corso course_start_date DATE;
  END IF;
  -- subscribers: data_fine_corso -> course_end_date
  IF EXISTS(SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subscribers' AND COLUMN_NAME = 'data_fine_corso') THEN
    ALTER TABLE subscribers CHANGE COLUMN data_fine_corso course_end_date DATE;
  END IF;
  -- card_rfid: data_scrittura -> write_date
  IF EXISTS(SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'card_rfid' AND COLUMN_NAME = 'data_scrittura') THEN
    ALTER TABLE card_rfid CHANGE COLUMN data_scrittura write_date TIMESTAMP;
  END IF;
  -- shopify_products_map: corso_nome -> course_name
  IF EXISTS(SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shopify_products_map' AND COLUMN_NAME = 'corso_nome') THEN
    ALTER TABLE shopify_products_map CHANGE COLUMN corso_nome course_name VARCHAR(255);
  END IF;
END
--> statement-breakpoint
CALL _mig_0001();
--> statement-breakpoint
DROP PROCEDURE IF EXISTS _mig_0001;
