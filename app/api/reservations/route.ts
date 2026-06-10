/**
 * GET /api/reservations        → lista prenotazioni dallo store
 * GET /api/reservations?status=new|modified|cancelled
 */
import { NextRequest } from 'next/server';
import { listReservations, getPollState } from '@/lib/db/store';

export async function GET(req: NextRequest): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') as 'new' | 'modified' | 'cancelled' | null;
  const checkInFrom = searchParams.get('from') ?? undefined;
  const checkInTo = searchParams.get('to') ?? undefined;

  const reservations = listReservations({
    status: status ?? undefined,
    checkInFrom,
    checkInTo,
  });

  return Response.json({
    total: reservations.length,
    pollState: getPollState(),
    reservations,
  });
}
