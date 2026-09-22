CREATE TABLE IF NOT EXISTS documentation_assignments (
 id TEXT PRIMARY KEY,
 company_id TEXT NOT NULL DEFAULT 'demo' CHECK(company_id='demo'),
 title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 120),
 period TEXT NOT NULL DEFAULT '' CHECK(length(period)<=80),
 instructions TEXT NOT NULL DEFAULT '' CHECK(length(instructions)<=12000),
 created_at TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0)
);
CREATE TABLE IF NOT EXISTS documentation_files (
 id TEXT PRIMARY KEY,
 company_id TEXT NOT NULL DEFAULT 'demo' CHECK(company_id='demo'),
 assignment_id TEXT NOT NULL REFERENCES documentation_assignments(id),
 name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 180),
 file_key TEXT NOT NULL UNIQUE,
 type TEXT NOT NULL,
 size INTEGER NOT NULL CHECK(size>0 AND size<=8388608),
 position INTEGER NOT NULL CHECK(position>=0),
 category TEXT NOT NULL DEFAULT 'sin-clasificar' CHECK(category IN ('sin-clasificar','compra','venta','banco','laboral','impuestos','otros')),
 status TEXT NOT NULL DEFAULT 'pendiente' CHECK(status IN ('pendiente','en-curso','completado')),
 notes TEXT NOT NULL DEFAULT '' CHECK(length(notes)<=4000),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0)
);
CREATE INDEX IF NOT EXISTS documentation_files_assignment ON documentation_files(assignment_id,position);
