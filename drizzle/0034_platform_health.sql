-- Sign-in back-off per platform. After a rejected or failed INTTRA sign-in the platform is
-- left alone until blocked_until (epoch ms), so repeated automatic attempts never pile up
-- against the platform's own security checks. Saving new credentials clears the row.
CREATE TABLE IF NOT EXISTS platform_health (
 platform TEXT PRIMARY KEY,
 blocked_until INTEGER NOT NULL DEFAULT 0,
 failures INTEGER NOT NULL DEFAULT 0,
 reason TEXT,
 updated_at TEXT
);
