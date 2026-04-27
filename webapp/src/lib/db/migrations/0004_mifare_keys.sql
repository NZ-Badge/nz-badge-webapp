-- Migration: Create mifare_keys table for global key management
-- Created: 2026-03-10

-- Tabella per la gestione delle chiavi MIFARE
-- Supporta sia chiave unica globale che chiavi multiple per uso futuro
CREATE TABLE IF NOT EXISTS `mifare_keys` (
	`id` int AUTO_INCREMENT PRIMARY KEY,
	`name` varchar(50) NOT NULL DEFAULT 'default',
	`key_a` varchar(12) NOT NULL,
	`key_b` varchar(12) NOT NULL,
	`is_active` boolean DEFAULT true,
	`created_at` timestamp DEFAULT NOW(),
	`updated_at` timestamp DEFAULT NOW() ON UPDATE NOW()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
-- Indice univoco per il nome (solo una chiave 'default' attiva)
CREATE UNIQUE INDEX `idx_mifare_keys_name` ON `mifare_keys`(`name`);
--> statement-breakpoint
-- Inserisci chiavi di default (verranno generate automaticamente dall'app se vuote)
INSERT INTO `mifare_keys` (`name`, `key_a`, `key_b`, `is_active`) VALUES
('default', '', '', true);
--> statement-breakpoint
-- Aggiungi setting per abilitare/disabilitare la modalità chiave unica
INSERT INTO `settings` (`key`, `value`, `data_type`, `description`) VALUES
('use_single_mifare_key', 'true', 'boolean', 'Se abilitato, tutte le card RFID utilizzeranno la stessa coppia di chiavi MIFARE definita nella tabella mifare_keys. Se disabilitato, ogni card avrà una coppia di chiavi univoca come comportamento attuale.');
