/**
 * File-based persistent store — sopravvive ai hot-reload di Next.js.
 * Scrive in data/store.json. In produzione usare PostgreSQL.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import type { BookingReservation, BAPConnection, PollState } from '@/lib/booking/types';

export interface PollLogEntry {
  ts: string;
  pulled: number;
  format: string;
  durationMs: number;
  error?: string;
  ids: string[];
}

interface StoreData {
  reservations: Record<string, BookingReservation>;
  connections: Record<string, BAPConnection>;
  pollState: PollState;
  pollLog: PollLogEntry[];
}

const STORE_DIR = join(process.cwd(), 'data');
const STORE_PATH = join(STORE_DIR, 'store.json');
const MAX_LOG = 100;

let _cache: StoreData | null = null;

function read(): StoreData {
  if (_cache) return _cache;
  if (existsSync(STORE_PATH)) {
    try {
      _cache = JSON.parse(readFileSync(STORE_PATH, 'utf-8')) as StoreData;
      return _cache;
    } catch {
      // Corrupt file — start fresh
    }
  }
  _cache = {
    reservations: {},
    connections: {},
    pollState: { lastPollAt: null, pendingCount: 0, lastError: null },
    pollLog: [],
  };
  return _cache;
}

function persist(): void {
  if (!existsSync(STORE_DIR)) mkdirSync(STORE_DIR, { recursive: true });
  writeFileSync(STORE_PATH, JSON.stringify(_cache, null, 2), 'utf-8');
}

// ── Reservations ──────────────────────────────────────────────────────────

export function upsertReservation(res: BookingReservation): void {
  read().reservations[res.id] = res;
  persist();
}

export function getReservation(id: string): BookingReservation | undefined {
  return read().reservations[id];
}

export function listReservations(filter?: {
  status?: BookingReservation['status'];
  checkInFrom?: string;
  checkInTo?: string;
}): BookingReservation[] {
  let list = Object.values(read().reservations);
  if (filter?.status) list = list.filter(r => r.status === filter.status);
  if (filter?.checkInFrom) list = list.filter(r => r.checkIn >= filter.checkInFrom!);
  if (filter?.checkInTo) list = list.filter(r => r.checkIn <= filter.checkInTo!);
  return list.sort((a, b) => a.checkIn.localeCompare(b.checkIn));
}

export function clearReservations(): void {
  read().reservations = {};
  persist();
}

// ── Connections ───────────────────────────────────────────────────────────

export function upsertConnection(conn: BAPConnection): void {
  read().connections[conn.connectionId] = conn;
  persist();
}

export function getConnection(id: string): BAPConnection | undefined {
  return read().connections[id];
}

export function listConnections(): BAPConnection[] {
  return Object.values(read().connections);
}

// ── Poll state + log ──────────────────────────────────────────────────────

export function getPollState(): PollState {
  return { ...read().pollState };
}

export function setPollState(patch: Partial<PollState>): void {
  const s = read();
  s.pollState = { ...s.pollState, ...patch };
  persist();
}

export function appendPollLog(entry: PollLogEntry): void {
  const s = read();
  s.pollLog.unshift(entry); // latest first
  if (s.pollLog.length > MAX_LOG) s.pollLog.length = MAX_LOG;
  persist();
}

export function getPollLog(): PollLogEntry[] {
  return read().pollLog;
}

export function clearPollLog(): void {
  read().pollLog = [];
  persist();
}
