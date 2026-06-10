/**
 * GET  /api/reservations/log   → ultimi 100 entry del poll log
 * DELETE /api/reservations/log → cancella il log
 */
import { getPollLog, clearPollLog, getPollState } from '@/lib/db/store';

export async function GET(): Promise<Response> {
  return Response.json({ pollState: getPollState(), log: getPollLog() });
}

export async function DELETE(): Promise<Response> {
  clearPollLog();
  return Response.json({ cleared: true });
}
