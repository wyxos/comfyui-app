import { mkdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { configDir, jobs, jobsDatabasePath } from './config.mjs'

let jobDatabase = null
let jobsLoaded = false

function openJobDatabase() {
  if (jobDatabase) {
    return jobDatabase
  }

  mkdirSync(configDir, { recursive: true })
  jobDatabase = new DatabaseSync(jobsDatabasePath)
  jobDatabase.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS jobs (
      prompt_id TEXT PRIMARY KEY,
      state TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      data_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS jobs_updated_at_index ON jobs (updated_at DESC);
    CREATE INDEX IF NOT EXISTS jobs_state_index ON jobs (state);
  `)

  return jobDatabase
}

function coerceTimestamp(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : Date.now()
}

function serializeJobForStorage(job) {
  return JSON.stringify(job)
}

function normalizePersistedJob(row) {
  try {
    const parsedJob = JSON.parse(row.data_json)
    if (!parsedJob || typeof parsedJob !== 'object' || !parsedJob.promptId) {
      return null
    }

    return {
      ...parsedJob,
      promptId: String(parsedJob.promptId),
      state: typeof parsedJob.state === 'string' ? parsedJob.state : row.state,
      createdAt: coerceTimestamp(parsedJob.createdAt ?? row.created_at),
      updatedAt: coerceTimestamp(parsedJob.updatedAt ?? row.updated_at),
    }
  } catch {
    return null
  }
}

export function ensureJobsLoaded() {
  if (jobsLoaded) {
    return
  }

  const db = openJobDatabase()
  const rows = db
    .prepare('SELECT prompt_id, state, created_at, updated_at, data_json FROM jobs ORDER BY updated_at DESC')
    .all()

  jobs.clear()
  for (const row of rows) {
    const job = normalizePersistedJob(row)
    if (job) {
      jobs.set(job.promptId, job)
    }
  }

  jobsLoaded = true
}

export function persistJob(job) {
  if (!job?.promptId) {
    return
  }

  const db = openJobDatabase()
  db.prepare(`
    INSERT INTO jobs (prompt_id, state, created_at, updated_at, data_json)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(prompt_id) DO UPDATE SET
      state = excluded.state,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      data_json = excluded.data_json
  `).run(
    job.promptId,
    typeof job.state === 'string' ? job.state : 'queued',
    coerceTimestamp(job.createdAt),
    coerceTimestamp(job.updatedAt),
    serializeJobForStorage(job),
  )
}

export function resetJobStoreRuntimeState({ clearMemory = true } = {}) {
  if (jobDatabase) {
    jobDatabase.close()
  }

  jobDatabase = null
  jobsLoaded = false
  if (clearMemory) {
    jobs.clear()
  }
}
