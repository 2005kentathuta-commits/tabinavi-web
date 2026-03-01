const fs = require('node:fs');
const path = require('node:path');

const DB_PATH =
  process.env.VERCEL || process.env.VERCEL_ENV
    ? path.join('/tmp', 'travel-site-db.json')
    : path.join(__dirname, '..', 'data', 'db.json');

function ensureDbFile() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ trips: [] }, null, 2), 'utf8');
  }
}

function readDb() {
  ensureDbFile();
  const raw = fs.readFileSync(DB_PATH, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.trips || !Array.isArray(parsed.trips)) {
      return { trips: [] };
    }
    return parsed;
  } catch {
    return { trips: [] };
  }
}

function writeDb(next) {
  ensureDbFile();
  const tmpPath = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(next, null, 2), 'utf8');
  fs.renameSync(tmpPath, DB_PATH);
}

module.exports = {
  readDb,
  writeDb,
};
