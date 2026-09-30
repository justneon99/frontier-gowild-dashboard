CREATE TABLE IF NOT EXISTS booking_tasks (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  travel_date TEXT NOT NULL,
  earliest_time TEXT NOT NULL,
  latest_time TEXT NOT NULL,
  max_total_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  cancelled_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_booking_tasks_owner ON booking_tasks(owner_id, created_at DESC);
CREATE TABLE IF NOT EXISTS booking_checks (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES booking_tasks(id),
  checked_at TEXT NOT NULL,
  result TEXT NOT NULL,
  reasons_json TEXT NOT NULL,
  flight_number TEXT,
  departure_time TEXT,
  arrival_time TEXT,
  total_cents INTEGER,
  evidence_url TEXT,
  checkpoint TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_booking_checks_task ON booking_checks(task_id, checked_at DESC);
