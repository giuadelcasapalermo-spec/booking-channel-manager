/** DELETE /api/reservations/clear — svuota lo store (utile per resettare i test) */
import { clearReservations } from '@/lib/db/store';

export async function DELETE(): Promise<Response> {
  clearReservations();
  return Response.json({ cleared: true });
}
