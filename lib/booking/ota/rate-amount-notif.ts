/**
 * OTA_HotelRateAmountNotif
 * Sends rate updates in OTA 2003B XML format.
 * Endpoint: POST https://supply-xml.booking.com/hotels/ota/OTA_HotelRateAmountNotif
 */
import { otaEnvelope, uniqueEchoToken, parseOTAResponse } from '../xml';
import { authHeaders } from '../auth';
import type { RateUpdate, ARIResult } from '../types';

const ENDPOINT = () =>
  `${process.env.BOOKING_ARI_BASE ?? 'https://supply-xml.booking.com'}/hotels/ota/OTA_HotelRateAmountNotif`;

const DOW_ATTRS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

function buildPayload(updates: RateUpdate[]): unknown {
  const ratePlans = updates.map(u => {
    const dowAttrs: Record<string, 'true' | 'false'> = {};
    for (let i = 0; i < 7; i++) {
      const active = u.daysOfWeek ? u.daysOfWeek.includes(i) : true;
      dowAttrs[`@_${DOW_ATTRS[i]}`] = active ? 'true' : 'false';
    }

    // Build BaseByGuestAmt nodes — one per occupancy level (or just one if standard pricing)
    const guestAmts = u.priceByOccupancy
      ? Object.entries(u.priceByOccupancy).map(([guests, price]) => ({
          '@_AmountAfterTax': price.toFixed(2),
          '@_CurrencyCode': u.currency,
          '@_DecimalPlaces': 2,
          '@_NumberOfGuests': Number(guests),
        }))
      : [
          {
            '@_AmountAfterTax': u.price.toFixed(2),
            '@_CurrencyCode': u.currency,
            '@_DecimalPlaces': 2,
          },
        ];

    return {
      '@_RatePlanNotifType': 'Delta',
      '@_RatePlanCode': u.ratePlanId,
      Rates: {
        Rate: {
          StatusApplicationControl: {
            '@_Start': u.dateFrom,
            '@_End': u.dateTo,
            '@_InvTypeCode': u.roomId,
            '@_RatePlanCode': u.ratePlanId,
            ...dowAttrs,
          },
          BaseByGuestAmts: { BaseByGuestAmt: guestAmts },
        },
      },
    };
  });

  return {
    RatePlans: { RatePlan: ratePlans },
  };
}

export async function sendRateAmountNotif(updates: RateUpdate[]): Promise<ARIResult> {
  const echoToken = uniqueEchoToken();
  const xml = otaEnvelope('HotelRateAmountNotif', echoToken, buildPayload(updates));

  if (process.env.BOOKING_MOCK_MODE === 'true') {
    return { ok: true, requestId: echoToken };
  }

  const res = await fetch(ENDPOINT(), {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/xml' },
    body: xml,
  });

  const text = await res.text();
  const result = parseOTAResponse(text, 'OTA_HotelRateAmountNotifRS');
  return { ...result, requestId: echoToken };
}
