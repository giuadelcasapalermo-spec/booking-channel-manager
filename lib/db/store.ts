/**
 * Re-export everything from file-store so the rest of the app
 * keeps the same import path (@/lib/db/store).
 */
export {
  upsertReservation,
  getReservation,
  listReservations,
  clearReservations,
  upsertConnection,
  getConnection,
  listConnections,
  getPollState,
  setPollState,
  appendPollLog,
  getPollLog,
  clearPollLog,
  type PollLogEntry,
} from './file-store';
