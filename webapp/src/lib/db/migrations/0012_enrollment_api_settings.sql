-- Migration: Add enrollment API URL and key settings
-- Created at: 2026-04-02

INSERT INTO settings (`key`, `value`, `data_type`, `description`) VALUES
('enrollment_api_url', '', 'string', 'URL base dell\'API esterna per la sincronizzazione iscrizioni'),
('enrollment_api_key', '', 'string', 'API key per l\'autenticazione con l\'API esterna iscrizioni')
ON DUPLICATE KEY UPDATE `key` = `key`;
