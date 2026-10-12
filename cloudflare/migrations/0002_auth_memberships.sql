-- Owner memberships are provisioned through a trusted administrative onboarding path,
-- NEVER by a public sign-up endpoint that accepts an arbitrary business id.
CREATE TABLE IF NOT EXISTS business_memberships (
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','worker')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (business_id,subject)
);
CREATE INDEX IF NOT EXISTS memberships_subject_idx ON business_memberships(subject,business_id);
