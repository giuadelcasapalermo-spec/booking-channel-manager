/**
 * B.XML Rates & Availability push
 * Endpoint: POST https://supply-xml.booking.com/hotels/xml/availability
 * Docs: https://developers.booking.com/connectivity/docs/b_xml-availability
 */
import { buildXml, parseXml, uniqueEchoToken } from '../xml';
import { authHeaders } from '../auth';
import type { RateUpdate, AvailabilityUpdate, ARIResult } from '../types';

const BASE = () => process.env.BOOKING_ARI_BASE ?? 'https://supply-xml.booking.com';
const HOTEL_ID = () => process.env.BOOKING_HOTEL_ID ?? '';

// ── Build XML ────────────────────────────────────────────────────────────

function buildRateXml(updates: RateUpdate[]): string {
  const rooms: unknown[] = [];

  for (const u of updates) {
    const dateNodes: unknown[] = [];
    // Expand date range day by day
    const dates = expandDateRange(u.dateFrom, u.dateTo);
    for (const date of dates) {
      if (u.daysOfWeek) {
        const dow = new Date(date).getDay(); // 0=Sun … 6=Sat
        // Convert to Mon=0 … Sun=6 convention used in our types
        const mapped = dow === 0 ? 6 : dow - 1;
        if (!u.daysOfWeek.includes(mapped)) continue;
      }

      const rateAttr: Record<string, unknown> = {
        '@_rate_id': u.ratePlanId,
        '@_price': u.price,
        '@_currency': u.currency,
      };

      if (u.priceByOccupancy) {
        for (const [guests, price] of Object.entries(u.priceByOccupancy)) {
          rateAttr[`@_price${guests}`] = price;
        }
      }

      dateNodes.push({ '@_date': date, rate: rateAttr });
    }
    rooms.push({ '@_room_id': u.roomId, date: dateNodes });
  }

  const doc = {
    request: {
      '@_version': '1.1',
      '@_date': new Date().toISOString().slice(0, 10),
      username: process.env.BOOKING_USERNAME ?? '',
      password: process.env.BOOKING_PASSWORD ?? '',
      hotel: {
        '@_hotel_id': HOTEL_ID(),
        room: rooms,
      },
    },
  };

  return `<?xml version="1.0" encoding="UTF-8"?>\n${buildXml(doc)}`;
}

function buildAvailabilityXml(updates: AvailabilityUpdate[]): string {
  const rooms: unknown[] = [];

  for (const u of updates) {
    const dateNodes: unknown[] = [];
    const dates = expandDateRange(u.dateFrom, u.dateTo);
    for (const date of dates) {
      const rateAttr: Record<string, unknown> = {
        '@_rate_id': u.ratePlanId ?? '',
        '@_roomstosell': u.roomsToSell,
        '@_closed': u.closed ? 1 : 0,
      };
      if (u.closedOnArrival !== undefined) rateAttr['@_closedonarrival'] = u.closedOnArrival ? 1 : 0;
      if (u.closedOnDeparture !== undefined) rateAttr['@_closedondeparture'] = u.closedOnDeparture ? 1 : 0;
      if (u.minStay !== undefined) rateAttr['@_minimumstay'] = u.minStay;
      if (u.maxStay !== undefined) rateAttr['@_maximumstay'] = u.maxStay;
      if (u.minStayArrival !== undefined) rateAttr['@_minimumstay_arrival'] = u.minStayArrival;
      if (u.maxStayArrival !== undefined) rateAttr['@_maximumstay_arrival'] = u.maxStayArrival;
      if (u.minAdvanceBookingDays !== undefined) rateAttr['@_min_advance_res'] = `${u.minAdvanceBookingDays}D`;
      if (u.maxAdvanceBookingDays !== undefined) rateAttr['@_max_advance_res'] = `${u.maxAdvanceBookingDays}D`;

      dateNodes.push({ '@_date': date, rate: rateAttr });
    }
    rooms.push({ '@_room_id': u.roomId, date: dateNodes });
  }

  const doc = {
    request: {
      '@_version': '1.1',
      username: process.env.BOOKING_USERNAME ?? '',
      password: process.env.BOOKING_PASSWORD ?? '',
      hotel: {
        '@_hotel_id': HOTEL_ID(),
        room: rooms,
      },
    },
  };

  return `<?xml version="1.0" encoding="UTF-8"?>\n${buildXml(doc)}`;
}

// ── Send ─────────────────────────────────────────────────────────────────

async function postARI(xml: string, requestId: string): Promise<ARIResult> {
  if (process.env.BOOKING_MOCK_MODE === 'true') {
    return { ok: true, requestId };
  }

  const res = await fetch(`${BASE()}/hotels/xml/availability`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/xml', 'Accept-Version': '1.1' },
    body: xml,
  });

  const text = await res.text();
  if (!res.ok) {
    return { ok: false, requestId, errors: [{ code: String(res.status), message: text }] };
  }

  const doc = parseXml<{ response?: { acknowledged?: string; error?: string } }>(text);
  const response = doc.response;

  if (response?.error) {
    return { ok: false, requestId, errors: [{ code: 'API', message: response.error }] };
  }

  return { ok: true, requestId };
}

export async function pushRates(updates: RateUpdate[]): Promise<ARIResult> {
  const requestId = uniqueEchoToken();
  const xml = buildRateXml(updates);
  return postARI(xml, requestId);
}

export async function pushAvailability(updates: AvailabilityUpdate[]): Promise<ARIResult> {
  const requestId = uniqueEchoToken();
  const xml = buildAvailabilityXml(updates);
  return postARI(xml, requestId);
}

// ── Utility ──────────────────────────────────────────────────────────────

function expandDateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const cur = new Date(from);
  const end = new Date(to);
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}
