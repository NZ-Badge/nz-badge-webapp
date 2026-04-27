-- Migration: Add type column to card_rfid for distinguishing physical RFID cards from NFC smartphone pairings
-- Created: 2026-03-10

ALTER TABLE `card_rfid`
    ADD COLUMN `type` ENUM('rfid', 'nfc') NOT NULL DEFAULT 'rfid'
    AFTER `uid`;
