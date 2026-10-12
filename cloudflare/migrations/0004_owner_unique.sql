-- One business per owner during initial solo-operator release.
-- Do not apply until reviewing existing member rows (if any) for duplicate subjects.
CREATE UNIQUE INDEX IF NOT EXISTS one_business_per_subject
ON business_memberships(subject);
