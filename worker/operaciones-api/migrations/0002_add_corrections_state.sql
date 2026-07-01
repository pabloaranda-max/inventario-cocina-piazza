-- Track edits made after a zone was closed.
ALTER TABLE inv_sesiones ADD COLUMN corrections_by_zone TEXT NOT NULL DEFAULT '{}';
