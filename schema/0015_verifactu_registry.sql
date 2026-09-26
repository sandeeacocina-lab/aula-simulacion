CREATE TABLE IF NOT EXISTS vf_registry (
 id INTEGER PRIMARY KEY CHECK(id=1),
 company_id TEXT NOT NULL DEFAULT 'demo' CHECK(company_id='demo'),
 practice_id TEXT NOT NULL,
 write_key TEXT NOT NULL,
 acknowledged_id TEXT NOT NULL DEFAULT '',
 acknowledged_hash TEXT NOT NULL DEFAULT '',
 received_at TEXT NOT NULL DEFAULT ''
);
