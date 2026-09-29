ALTER TABLE users ADD COLUMN last_signed_in_at TEXT;
ALTER TABLE users ADD COLUMN revoked_at TEXT;
CREATE TABLE IF NOT EXISTS invitations (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  invited_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email, created_at);
