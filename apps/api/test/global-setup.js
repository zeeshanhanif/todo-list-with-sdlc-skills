// Jest globalSetup for the API: ensure the database schema exists before any
// integration test runs, so `npm test` is self-contained and order-independent
// (it does not rely on a separate migrate step running first). Idempotent —
// already-applied migrations are a no-op. Uses DATABASE_URL from the environment
// (CI sets it; locally it defaults to the docker-compose Postgres).
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
