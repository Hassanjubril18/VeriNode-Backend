-- Migration: Create reputations table
-- Description: Reputation scoring system for nodes with race-condition protection
-- Created: 2026-06-24

-- Create reputations table
CREATE TABLE IF NOT EXISTS reputations (
    node_id VARCHAR(255) PRIMARY KEY,
    score INTEGER NOT NULL DEFAULT 0 CHECK (score >= -1000 AND score <= 1000),
    slash_version INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create index on slash_version for monitoring and queries
CREATE INDEX IF NOT EXISTS idx_reputations_slash_version ON reputations(slash_version);

-- Create index on score for leaderboard queries
CREATE INDEX IF NOT EXISTS idx_reputations_score ON reputations(score DESC);

-- Create index on updated_at for temporal queries
CREATE INDEX IF NOT EXISTS idx_reputations_updated_at ON reputations(updated_at DESC);

-- Add comment to table
COMMENT ON TABLE reputations IS 'Node reputation scores with atomic update support to prevent write-skew race conditions';

-- Add comments to columns
COMMENT ON COLUMN reputations.node_id IS 'Unique identifier for the node';
COMMENT ON COLUMN reputations.score IS 'Reputation score bounded by [-1000, 1000]';
COMMENT ON COLUMN reputations.slash_version IS 'Incremented on each slashing event for optimistic concurrency control';
COMMENT ON COLUMN reputations.updated_at IS 'Timestamp of last score modification';
COMMENT ON COLUMN reputations.created_at IS 'Timestamp of reputation record creation';
