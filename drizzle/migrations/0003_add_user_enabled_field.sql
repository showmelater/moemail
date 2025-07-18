-- Migration: Add enabled field to users table
-- This allows emperors to disable student accounts

-- Add enabled column to users table with default value true
ALTER TABLE user ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;

-- Create index for faster queries on enabled status
CREATE INDEX idx_user_enabled ON user(enabled);

-- Update existing users to be enabled by default (redundant but explicit)
UPDATE user SET enabled = 1 WHERE enabled IS NULL;
