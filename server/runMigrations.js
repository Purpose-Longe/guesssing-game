require('dotenv').config();
const { pool } = require('./db');
const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'db', 'migrations');

async function run() {
  try {
    const client = await pool.connect();
    try {
      // ensure migrations table
      await client.query(`
        CREATE TABLE IF NOT EXISTS migrations (
          name text PRIMARY KEY,
          applied_at timestamptz NOT NULL DEFAULT now()
        )
      `);

      const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();
      for (const file of files) {
        const already = await client.query('SELECT 1 FROM migrations WHERE name=$1 LIMIT 1', [file]);
        if (already.rowCount > 0) {
          console.log('skip', file);
          continue;
        }

        console.log('apply', file);
        const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
        try {
          await client.query('BEGIN');
          await client.query(sql);
          await client.query('INSERT INTO migrations(name) VALUES($1)', [file]);
          await client.query('COMMIT');
          console.log('applied', file);
        } catch (err) {
          await client.query('ROLLBACK');
          console.error('migration failed', file, err);
          throw err;
        }
      }
      console.log('migrations finished');
    } finally {
      client.release();
    }
  } finally {
    // don't end shared pool here - leave lifecycle to server process
  }
}

run().catch((err) => { console.error(err); process.exit(1); });
