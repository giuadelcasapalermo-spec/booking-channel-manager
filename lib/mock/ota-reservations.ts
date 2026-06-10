/**
 * Genera XML OTA_HotelResNotifRQ realistico da una BookingReservation.
 * Usato dal mock Booking.com server per restituire prenotazioni in formato OTA.
 *
 * COMPATIBILITÀ: usa i valori ResStatus attesi dal parser OTA interno.
 * In produzione Booking.com invia "Committed" → "Modify" → "Cancel" — il parser
 * li normalizza con STATUS_MAP prima di castare a BookingReservation['status'].
 */
import type { BookingReservation } from '@/lib/booking/types';
import { OTA_NS, OTA_VERSION } from '@/lib/booking/xml';

const STATUS_MAP: Record<BookingReservation['status'], string> = {
  new: 'Committed',
  modified: 'Modify',
  cancelled: 'Cancel',
};

/** Restituisce solo l'elemento <HotelReservation>…</HotelReservation> (senza wrapper). */
export function otaReservationElement(r: BookingReservation): string {
  const resStatus = STATUS_MAP[r.status];

  const roomRates = r.nightlyRates
    .map(
      nr =>
        `        <RoomRate EffectiveDate="${nr.date}" RatePlanCode="${nr.ratePlanId}">
          <Rates><Rate><Base Amount="${nr.price}" CurrencyCode="${nr.currency}"/></Rate></Rates>
        </RoomRate>`,
    )
    .join('\n');

  const adultCount = `<GuestCount AgeQualifyingCode="10" Count="${r.guest.adults}"/>`;
  const childCount =
    r.guest.children > 0
      ? `\n        <GuestCount AgeQualifyingCode="8" Count="${r.guest.children}"/>`
      : '';
  const childAges =
    r.guest.childAges
      ?.map(age => `\n        <GuestCount AgeQualifyingCode="8" Count="1" Age="${age}"/>`)
      .join('') ?? '';

  const cancelPenalties =
    r.cancelPenalties && r.cancelPenalties.length > 0
      ? `
        <CancelPenalties>
${r.cancelPenalties
  .map(
    cp =>
      `          <CancelPenalty>
            <AmountPercent Amount="${cp.amount}" CurrencyCode="${cp.currency}"/>
            <Deadline AbsoluteDeadline="${cp.from}"/>
          </CancelPenalty>`,
  )
  .join('\n')}
        </CancelPenalties>`
      : '';

  const addressBlock =
    r.guest.address || r.guest.city || r.guest.countryCode
      ? `
                <Address>
                  ${r.guest.address ? `<AddressLine>${r.guest.address}</AddressLine>` : ''}
                  ${r.guest.city ? `<CityName>${r.guest.city}</CityName>` : ''}
                  ${r.guest.countryCode ? `<CountryName Code="${r.guest.countryCode}"/>` : ''}
                </Address>`
      : '';

  return `    <HotelReservation ResStatus="${resStatus}" CreateDateTime="${r.bookedAt}"${r.modifiedAt ? ` LastModifyDateTime="${r.modifiedAt}"` : ''}>
      <UniqueID Type="14" ID="${r.id}"/>
      <RoomStays>
        <RoomStay>
          <RoomTypes>
            <RoomType RoomTypeCode="${r.roomId}"/>
          </RoomTypes>
          <RatePlans>
            <RatePlan RatePlanCode="${r.ratePlanId}">
              <Commission CommissionPayableAmount="${r.commission}" CurrencyCode="${r.currency}"/>
            </RatePlan>
          </RatePlans>
          <RoomRates>
${roomRates}
          </RoomRates>
          <GuestCounts>
        ${adultCount}${childCount}${childAges}
          </GuestCounts>
          <TimeSpan Start="${r.checkIn}" End="${r.checkOut}"/>
          <Taxes>
            <Tax Amount="${r.cityTax}" CurrencyCode="${r.currency}" Code="CityTax"/>
          </Taxes>
          <BasicPropertyInfo HotelCode="${r.hotelId}"/>${cancelPenalties}
        </RoomStay>
      </RoomStays>
      <ResGuests>
        <ResGuest PrimaryIndicator="1">
          <Profiles>
            <Profile>
              <Customer>
                <PersonName>
                  <GivenName>${r.guest.firstName}</GivenName>
                  <Surname>${r.guest.lastName}</Surname>
                </PersonName>
                <Telephone PhoneNumber="${r.guest.phone}"/>
                <Email>${r.guest.email}</Email>${addressBlock}
              </Customer>
            </Profile>
          </Profiles>
          <GuestCounts>
        ${adultCount}${childCount}${childAges}
          </GuestCounts>
        </ResGuest>
      </ResGuests>
    </HotelReservation>`;
}

/** Restituisce il documento OTA completo con un'unica prenotazione. */
export function mockOTAXml(r: BookingReservation): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<OTA_HotelResNotifRQ xmlns="${OTA_NS}" Version="${OTA_VERSION}" EchoToken="mock-${r.id}" TimeStamp="${r.bookedAt}">
  <HotelReservations>
${otaReservationElement(r)}
  </HotelReservations>
</OTA_HotelResNotifRQ>`;
}

/** Restituisce il documento OTA con più prenotazioni in un singolo messaggio. */
export function mockOTAXmlBatch(reservations: BookingReservation[]): string {
  const ts = new Date().toISOString();
  const elements = reservations.map(r => otaReservationElement(r)).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<OTA_HotelResNotifRQ xmlns="${OTA_NS}" Version="${OTA_VERSION}" EchoToken="mock-batch-${Date.now()}" TimeStamp="${ts}">
  <HotelReservations>
${elements}
  </HotelReservations>
</OTA_HotelResNotifRQ>`;
}
