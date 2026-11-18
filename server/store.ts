import fs from 'node:fs';
import path from 'node:path';
import { createSeedDatabase, type WardwiseDatabase } from './seed.ts';
import { isSupabaseConfigured, pullFromSupabase, pushToSupabase } from './supabase.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'wardwise-db.json');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

let cachedDb: WardwiseDatabase | null = null;

export async function initDatabase(): Promise<WardwiseDatabase> {
  ensureDirs();

  if (isSupabaseConfigured) {
    try {
      const remote = await pullFromSupabase();
      if (remote) {
        cachedDb = remote;
        const tmpFile = `${DB_FILE}.tmp`;
        fs.writeFileSync(tmpFile, JSON.stringify(cachedDb, null, 2), 'utf-8');
        fs.renameSync(tmpFile, DB_FILE);
        pushToSupabase(cachedDb).catch((err) =>
          console.warn('[Supabase] Initial relational sync note:', err)
        );
        return remote;
      }
    } catch (err) {
      console.warn('[Supabase] Initial pull failed, using local database:', err);
    }
  }

  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      cachedDb = JSON.parse(raw) as WardwiseDatabase;
      if (isSupabaseConfigured && cachedDb) {
        pushToSupabase(cachedDb).catch((err) =>
          console.warn('[Supabase] Background initial seed failed:', err)
        );
      }
      return cachedDb;
    } catch (err) {
      console.error('Failed to parse wardwise-db.json, re-seeding:', err);
    }
  }

  cachedDb = createSeedDatabase();
  saveDatabase(cachedDb);
  return cachedDb;
}

export function getDatabase(): WardwiseDatabase {
  if (cachedDb) return cachedDb;
  ensureDirs();
  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      cachedDb = JSON.parse(raw) as WardwiseDatabase;
      return cachedDb;
    } catch (err) {
      console.error('Failed to parse wardwise-db.json, re-seeding:', err);
    }
  }
  cachedDb = createSeedDatabase();
  saveDatabase(cachedDb);
  return cachedDb;
}

export function saveDatabase(db: WardwiseDatabase): void {
  ensureDirs();
  cachedDb = db;
  const tmpFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), 'utf-8');
  fs.renameSync(tmpFile, DB_FILE);

  if (isSupabaseConfigured) {
    pushToSupabase(db).catch((err) =>
      console.warn('[Supabase] Background sync failed:', err)
    );
  }
}
