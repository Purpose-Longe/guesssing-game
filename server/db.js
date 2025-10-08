const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

// Try to load a .env file from the project root (one level up from server/)
// This is tolerant: if dotenv isn't installed we skip gracefully.
try {
  const dotenvPath = path.resolve(__dirname, '..', '.env');
  if (fs.existsSync(dotenvPath)) {
    try {
      require('dotenv').config({ path: dotenvPath });
      console.log('Loaded environment from .env');
    } catch (err) {
      // dotenv not installed or failed to load; continue silently
      console.log('dotenv not available or failed to load; continuing without .env');
    }
  }
} catch (err) {
  // Non-fatal; proceed to validate env vars below
}

// Diagnostic: validate DATABASE_URL is a string
if (typeof process.env.DATABASE_URL !== 'string' || process.env.DATABASE_URL.trim() === '') {
  console.error('Invalid or missing DATABASE_URL environment variable.');
  console.error('Please set DATABASE_URL to a Postgres connection string like:');
  console.error('  postgres://user:password@host:port/database');
  throw new Error('Missing DATABASE_URL');
}

// show a masked diagnostic for debugging (do not print raw password)
try {
  const url = new URL(process.env.DATABASE_URL);
  const maskedUserInfo = `${url.username || ''}:${url.password ? '***' : ''}`;
  console.log('Connecting to Postgres host=%s port=%s db=%s user=%s', url.hostname, url.port || '5432', url.pathname.replace(/^\//, ''), maskedUserInfo);
} catch (e) {
  // If DATABASE_URL is not a valid URL object (pg accepts multiple forms), just print its type
  console.log('DATABASE_URL provided, type=%s', typeof process.env.DATABASE_URL);
}

// Centralized Postgres pool for the app
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, withTransaction };
