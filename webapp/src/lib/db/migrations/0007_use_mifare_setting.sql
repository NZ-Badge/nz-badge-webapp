-- Migration: add use_mifare setting (default: disabled)
INSERT INTO `settings` (`key`, `value`, `data_type`, `description`)
VALUES ('use_mifare', 'false', 'boolean', 'Abilita scrittura e cancellazione MIFARE (Key A/B su settori). Se disabilitato, la card viene registrata solo tramite UID.')
ON DUPLICATE KEY UPDATE `key` = `key`;
