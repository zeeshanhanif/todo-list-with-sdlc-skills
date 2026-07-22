// Jest globalSetup for the worker: ensure the DB schema exists before any
// integration test runs (mirrors the API's setup), so `npm test` is
// self-contained and order-independent. Idempotent. Uses DATABASE_URL from the
// environment; locally defaults to the docker-compose Postgres.
const { execSync } = require('child_process');
const path = require('path');

module.exports = async () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const databaseUrl =
    process.env.DATABASE_URL || 'postgres://todo:todo@localhost:5432/todo';
  execSync('npx node-pg-migrate up -m migrations', {
    cwd: repoRoot,
    stdio: 'ignore',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
};
