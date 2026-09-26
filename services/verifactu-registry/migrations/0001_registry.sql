CREATE TABLE IF NOT EXISTS registry_practices (
 id TEXT PRIMARY KEY,
 last_hash TEXT NOT NULL DEFAULT '',
 record_count INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS registry_records (
 practice_id TEXT NOT NULL REFERENCES registry_practices(id),
 record_id TEXT NOT NULL,
 invoice_id TEXT NOT NULL,
 position INTEGER NOT NULL,
 hash TEXT NOT NULL,
 fingerprint TEXT NOT NULL,
 received_at TEXT NOT NULL,
 data TEXT NOT NULL,
 PRIMARY KEY(practice_id,record_id),
 UNIQUE(practice_id,position),
 UNIQUE(practice_id,hash)
);
CREATE INDEX IF NOT EXISTS registry_invoice ON registry_records(practice_id,invoice_id,position DESC);
CREATE TABLE IF NOT EXISTS registry_quota (id INTEGER PRIMARY KEY CHECK(id=1), records INTEGER NOT NULL DEFAULT 0);
INSERT OR IGNORE INTO registry_quota(id) VALUES(1);
