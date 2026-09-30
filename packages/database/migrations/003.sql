ALTER TABLE ledger ADD COLUMN asset_before jsonb NOT NULL DEFAULT '{}';
ALTER TABLE ledger ADD COLUMN asset_after jsonb NOT NULL DEFAULT '{}';
