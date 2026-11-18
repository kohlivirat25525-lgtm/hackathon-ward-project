import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import type { Complaint } from '../src/types/wardwise.ts';
import type { WardwiseDatabase } from './seed.ts';

dotenv.config();
const localEnv = path.resolve(process.cwd(), '.env');
const parentEnv = path.resolve(process.cwd(), '../.env');
if (fs.existsSync(localEnv)) dotenv.config({ path: localEnv });
if (fs.existsSync(parentEnv)) dotenv.config({ path: parentEnv });

const rawUrl = process.env.SUPABASE_URL || '';
export const supabaseUrl = rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
export const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
export const BUCKET_NAME = process.env.SUPABASE_STORAGE_BUCKET || 'civic-evidence';

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseKey &&
  supabaseUrl.startsWith('http') &&
  !supabaseUrl.includes('your-project')
);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    })
  : null;

/**
 * Deterministically convert a string ID into a valid UUID
 * (e.g. 'WW-8802' -> '7a1b3c4d-5e6f-4a8b-9c0d-1e2f3a4b5c6d')
 */
export function toUUID(str: string): string {
  const hash = crypto.createHash('md5').update(`wardwise:${str}`).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

/**
 * Fetch the latest database state from Supabase
 */
export async function pullFromSupabase(): Promise<WardwiseDatabase | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('wardwise_state')
      .select('data')
      .eq('id', 'active')
      .maybeSingle();

    if (error || !data?.data) {
      console.warn('[Supabase] No remote state found or table not created yet:', error?.message || 'Empty state');
      return null;
    }
    console.log('[Supabase] Successfully pulled state from Supabase cloud.');
    return data.data as WardwiseDatabase;
  } catch (err) {
    console.error('[Supabase] Error pulling state:', err);
    return null;
  }
}

function mapPriority(sev: string): string {
  const lower = (sev || 'medium').toLowerCase();
  // Map common variants: 'critical' -> 'urgent' if needed
  return lower;
}

function mapStatus(status: string): string {
  const s = status || 'submitted';
  const mapping: Record<string, string> = {
    'Submitted': 'submitted',
    'Routed': 'in_progress',
    'In Progress': 'in_progress',
    'Escalated': 'in_progress',
    'Resolved': 'resolved',
    'Closed': 'closed',
    'Reopened': 'open',
  };
  return mapping[s] || s.toLowerCase().replace(/\s+/g, '_');
}

/**
 * Sync in-memory state, wards, departments, and complaints table to Supabase
 */
export async function pushToSupabase(db: WardwiseDatabase): Promise<void> {
  if (!supabase) return;
  try {
    // 1. Sync full JSON state into wardwise_state
    const { error: stateError } = await supabase.from('wardwise_state').upsert({
      id: 'active',
      data: db,
    });

    if (stateError) {
      console.warn('[Supabase] State sync note:', stateError.message);
    } else {
      console.log('[Supabase] State JSON synced to cloud.');
    }

    // 2. Sync Departments (for Foreign Key integrity)
    if (db.departments && db.departments.length > 0) {
      const deptRows = db.departments.map((d) => ({
        id: toUUID(d.id),
        name: d.name,
        description: d.description || d.headquarter || 'Department',
        is_active: d.active !== false,
      }));
      const { error: deptErr } = await supabase.from('departments').upsert(deptRows, { onConflict: 'id' });
      if (deptErr) {
        console.warn('[Supabase] Departments table sync note:', deptErr.message);
      }
    }

    // 3. Sync Wards (for Foreign Key integrity)
    if (db.wards && db.wards.length > 0) {
      const wardRows = db.wards.map((w) => ({
        id: toUUID(w.id),
        name: w.name,
        ward_number: w.code,
        boundary_geojson: { mapBounds: w.mapBounds, districtSummary: w.districtSummary },
        is_active: true,
      }));
      const { error: wardErr } = await supabase.from('wards').upsert(wardRows, { onConflict: 'id' });
      if (wardErr) {
        console.warn('[Supabase] Wards table sync note:', wardErr.message);
      }
    }

    // 4. Sync Complaints into Supabase "complaints" table
    if (db.complaints && db.complaints.length > 0) {
      const complaintRows = db.complaints.map((c: Complaint) => {
        let p = (c.severity || 'medium').toLowerCase();
        if (p === 'critical') p = 'urgent'; // standard civic schema enum: low, medium, high, urgent
        return {
          id: toUUID(c.id),
          title: c.title,
          description: c.description,
          category: c.category,
          address: c.address,
          latitude: c.lat,
          longitude: c.lng,
          ward_id: toUUID(c.wardId),
          department_id: toUUID(c.departmentId),
          assigned_officer_id: null,
          status: mapStatus(c.status),
          priority: p,
          visibility: c.isPublic ? 'public' : 'internal',
          sla_deadline: c.slaDeadline,
          resolved_at: c.resolvedAt,
          resolution_notes: c.resolutionNotes,
          resolution_evidence: c.photoUrl ? [c.photoUrl] : [],
          created_at: c.createdAt,
          updated_at: c.updatedAt,
        };
      });

      const { error: complaintsError } = await supabase
        .from('complaints')
        .upsert(complaintRows, { onConflict: 'id' });

      if (complaintsError) {
        console.warn('[Supabase] Complaints table sync note:', complaintsError.message);
      } else {
        console.log(`[Supabase] Successfully stored ${complaintRows.length} rows in Supabase "complaints" table!`);
      }
    }
  } catch (err) {
    console.error('[Supabase] Error pushing sync:', err);
  }
}

/**
 * Upload an image buffer directly to Supabase Storage
 */
export async function uploadEvidenceToSupabase(
  filename: string,
  buffer: Buffer,
  contentType: string
): Promise<string | null> {
  if (!supabase) return null;
  try {
    const mime = contentType === 'image/jpg' ? 'image/jpeg' : (contentType || 'image/jpeg');
    const filePath = `evidence/${Date.now()}-${filename}`;
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, buffer, {
        contentType: mime,
        upsert: true,
      });

    if (error) {
      console.warn('[Supabase Storage] Upload note:', error.message);
      return null;
    }

    const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath);
    return data.publicUrl;
  } catch (err) {
    console.error('[Supabase Storage] Failed to upload:', err);
    return null;
  }
}
