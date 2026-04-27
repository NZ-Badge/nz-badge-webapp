-- Migration: Set use_single_mifare_key default to true
-- Created: 2026-03-10
-- Issue: The setting was defaulting to false, but we want single key mode enabled by default

-- Update the existing setting value to 'true'
UPDATE `settings` 
SET `value` = 'true' 
WHERE `key` = 'use_single_mifare_key' AND `value` = 'false';
