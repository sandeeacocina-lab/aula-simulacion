CREATE TABLE IF NOT EXISTS vf_invoices (
 id TEXT PRIMARY KEY,
 company_id TEXT NOT NULL DEFAULT 'demo' CHECK(company_id='demo'),
 state TEXT NOT NULL CHECK(state IN ('draft','issued')),
 data TEXT NOT NULL,
 source_key TEXT NOT NULL DEFAULT '',
 revision INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS vf_records (
 seq INTEGER PRIMARY KEY AUTOINCREMENT,
 id TEXT NOT NULL UNIQUE,
 company_id TEXT NOT NULL DEFAULT 'demo' CHECK(company_id='demo'),
 invoice_id TEXT NOT NULL REFERENCES vf_invoices(id),
 kind TEXT NOT NULL CHECK(kind IN ('alta','subsanacion','anulacion')),
 previous_hash TEXT NOT NULL,
 hash TEXT NOT NULL,
 created_at TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('Correcto','AceptadoConErrores','Incorrecto')),
 message TEXT NOT NULL,
 payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS vf_records_invoice ON vf_records(invoice_id,seq);
