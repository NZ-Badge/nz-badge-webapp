-- Migration: Create settings table with default values
-- Created: 2026-03-10

CREATE TABLE IF NOT EXISTS `settings` (
	`id` int AUTO_INCREMENT PRIMARY KEY,
	`key` varchar(50) NOT NULL UNIQUE,
	`value` text NOT NULL,
	`data_type` enum('boolean', 'integer', 'string', 'json') DEFAULT 'string',
	`description` varchar(255),
	`updated_at` timestamp DEFAULT NOW() ON UPDATE NOW(),
	`updated_by_user_id` int,
	FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
-- Insert default settings
INSERT INTO `settings` (`key`, `value`, `data_type`, `description`) VALUES
('reset_entry_type_daily', 'true', 'boolean', 'Azzera tipo ingresso ogni giorno. Se abilitato, la prima strisciata del giorno viene sempre segnata come ingresso (entry).'),
('min_swipe_interval_minutes', '15', 'integer', 'Intervallo minimo tra strisciate per la stessa card (in minuti). Se un utente striscia due volte entro questo intervallo, la seconda strisciata viene ignorata.');
