-- Migration: Seed default admin user
-- Created: 2026-04-13
-- Inserts the default admin user if no users exist yet.
-- ON DUPLICATE KEY UPDATE is a no-op (key = key) so this is safe to re-run.

INSERT INTO `users` (`name`, `email`, `password_hash`, `role`)
VALUES ('Admin', 'admin@nicolatomassoni.it', '$2b$12$pcpkXn9lYirYpzcvHxog8.yKzPNUw4NF49CxqLVAueTTPlh0VHoRW', 'admin')
ON DUPLICATE KEY UPDATE `email` = `email`;
