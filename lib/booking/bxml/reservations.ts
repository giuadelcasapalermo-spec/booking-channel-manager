/**
 * B.XML Reservations pull
 * Endpoint: POST https://secure-supply-xml.booking.com/hotels/xml/reservations
 * Policy: call at most once every 20 seconds
 * Docs: https://developers.booking.com/connectivity/docs/reservations-api/managing-reservations-bxml
 */
import { parseXml } from '../xml';
import { authHeaders } from '../auth';
import type { BookingReservation, BookingGuest, NightlyRate, CancelPenalty } from '../types';
import { MOCK_RESERVATIONS } from '@/lib/mock/reservations';

const BASE = () => process.env.BOOKING_RES_BASE ?? 'https://secure-supply-xml.booking.com';

// ── Pull from API ─────────────────────────────────────────────────────────

export async function pullReservations(): Promise<BookingReservation[]> {
  if (process.env.BOOKING_MOCK_MODE === 'true') {
    return MOCK_RESERVATIONS;
  }

  const xml = buildPullRequest();
  const res = await fetch(`${BASE()}/hotels/xml/reservations`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/xml' },
    body: xml,
  });

  if (!res.ok) {
    throw new Error(`Reservations pull failed: ${res.status} ${res.statusText}`);
  }

  const text = await res.text();
  return parseBxmlReservations(text);
}

// ── XML builder ──────────────────────────────────────────────────────────

function buildPullRequest(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<request version="1.0">
  <username>${process.env.BOOKING_USERNAME ?? ''}</username>
  <password>${process.env.BOOKING_PASSWORD ?? ''}</password>
  <hotel_id>${process.env.BOOKING_HOTEL_ID ?? ''}</hotel_id>
</request>`;
}

// ── XML parser ────────────────────────────────────────────────────────────

interface BxmlDoc {
  reservations?: { reservation?: BxmlReservation[] };
}

interface BxmlReservation {
  '@_id': string;
  '@_hotel_id': string;
  '@_status': string;
  '@_totalprice': number;
  '@_booked_at': string;
  '@_modified_at'?: string;
  customer?: {
    '@_name': string;
    '@_email': string;
    '@_telephone': string;
    '@_address'?: string;
    '@_country_code'?: string;
    '@_country'?: string;
  };
  room?: {
    '@_name'?: string;
    '@_room_id'?: string;
    '@_checkin': string;
    '@_checkout': string;
    '@_guest_name'?: string;
    '@_adults': number;
    '@_children'?: number;
    '@_child_ages'?: string;
    price?: { '@_date': string; '@_rate_id': string; '@_price': number; '@_currency': string }[];
  };
  price_details?: {
    commission?: number;
    hotel_receivable?: { '@_amount': number; '@_currency': string };
    guest_paid?: { city_tax?: { '@_included': number; '#text': number } };
  };
  cancel_penalties?: {
    cancel_penalty?: {
      '@_amount': number;
      '@_currency': string;
      '@_from': string;
    }[];
  };
}

// ── Acknowledge ──────────────────────────────────────────────────────────

export async function acknowledgeBxmlReservations(ids: string[]): Promise<void> {
  if (process.env.BOOKING_MOCK_MODE === 'true') return;
  if (ids.length === 0) return;

  const idTags = ids.map(id => `  <id>${id}</id>`).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<request version="1.0">
  <username>${process.env.BOOKING_USERNAME ?? ''}</username>
  <password>${process.env.BOOKING_PASSWORD ?? ''}</password>
  <hotel_id>${process.env.BOOKING_HOTEL_ID ?? ''}</hotel_id>
${idTags}
</request>`;

  await fetch(`${BASE()}/hotels/xml/reservationAck`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/xml' },
    body: xml,
  });
}

export function parseBxmlReservations(xml: string): BookingReservation[] {
  const doc = parseXml<BxmlDoc>(xml);
  const items = doc.reservations?.reservation ?? [];

  return items.map((r): BookingReservation => {
    const room = r.room;
    const guest: BookingGuest = {
      firstName: r.customer?.['@_name']?.split(' ')[0] ?? '',
      lastName: r.customer?.['@_name']?.split(' ').slice(1).join(' ') ?? '',
      email: r.customer?.['@_email'] ?? '',
      phone: r.customer?.['@_telephone'] ?? '',
      address: r.customer?.['@_address'],
      countryCode: r.customer?.['@_country_code'],
      country: r.customer?.['@_country'],
      adults: room?.['@_adults'] ?? 1,
      children: room?.['@_children'] ?? 0,
      childAges: room?.['@_child_ages']
        ? String(room['@_child_ages']).split(',').map(Number)
        : undefined,
    };

    const nights: NightlyRate[] = (room?.price ?? []).map(p => ({
      date: p['@_date'],
      price: p['@_price'],
      currency: p['@_currency'],
      ratePlanId: String(p['@_rate_id']),
    }));

    const pd = r.price_details;
    const cityTaxRaw = pd?.guest_paid?.city_tax;

    const penalties: CancelPenalty[] =
      (r.cancel_penalties?.cancel_penalty ?? []).map(cp => ({
        amount: cp['@_amount'],
        currency: cp['@_currency'],
        from: cp['@_from'],
      }));

    return {
      id: String(r['@_id']),
      hotelId: String(r['@_hotel_id']),
      roomId: String(room?.['@_room_id'] ?? ''),
      ratePlanId: String(nights[0]?.ratePlanId ?? ''),
      status: r['@_status'] as BookingReservation['status'],
      bookedAt: String(r['@_booked_at']),
      modifiedAt: r['@_modified_at'] ? String(r['@_modified_at']) : undefined,
      checkIn: room?.['@_checkin'] ?? '',
      checkOut: room?.['@_checkout'] ?? '',
      guest,
      nightlyRates: nights,
      totalPrice: r['@_totalprice'] ?? 0,
      currency: nights[0]?.currency ?? 'EUR',
      commission: pd?.commission ?? 0,
      hotelReceivable: pd?.hotel_receivable?.['@_amount'] ?? 0,
      cityTax: typeof cityTaxRaw === 'object' ? (cityTaxRaw?.['#text'] ?? 0) : (cityTaxRaw ?? 0),
      cityTaxIncluded: cityTaxRaw?.['@_included'] === 1,
      cancelPenalties: penalties.length > 0 ? penalties : undefined,
      rawXml: xml,
    };
  });
}
