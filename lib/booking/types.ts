// ── Core domain types for the Booking.com Channel Manager ──────────────────

// --- Auth ----------------------------------------------------------------

export interface BookingCredentials {
  username: string;
  password: string;
}

export interface BookingToken {
  token: string;
  expiresAt: Date;
}

// --- Property identifiers ------------------------------------------------

export interface PropertyRef {
  hotelId: string;
  roomId: string;
  ratePlanId: string;
}

// --- Rates & Availability ------------------------------------------------

export interface RateUpdate {
  roomId: string;
  ratePlanId: string;
  /** YYYY-MM-DD */
  dateFrom: string;
  /** YYYY-MM-DD (inclusive) */
  dateTo: string;
  /** Price per night (after tax) */
  price: number;
  currency: string;
  /** Occupancy-based rates: key = number of guests */
  priceByOccupancy?: Record<number, number>;
  /** Days of week this rate applies to (Mon=0 … Sun=6); undefined = all */
  daysOfWeek?: number[];
}

export interface AvailabilityUpdate {
  roomId: string;
  ratePlanId?: string;
  /** YYYY-MM-DD */
  dateFrom: string;
  /** YYYY-MM-DD (inclusive) */
  dateTo: string;
  /** Number of rooms to sell (255 = unlimited) */
  roomsToSell: number;
  closed?: boolean;
  closedOnArrival?: boolean;
  closedOnDeparture?: boolean;
  minStay?: number;
  maxStay?: number;
  minStayArrival?: number;
  maxStayArrival?: number;
  minAdvanceBookingDays?: number;
  maxAdvanceBookingDays?: number;
}

export type ARIResult =
  | { ok: true; requestId: string }
  | { ok: false; requestId: string; errors: ARIError[] };

export interface ARIError {
  code: string;
  message: string;
}

// --- Reservations --------------------------------------------------------

export type ReservationStatus = 'new' | 'modified' | 'cancelled';

export interface BookingGuest {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address?: string;
  city?: string;
  country?: string;
  countryCode?: string;
  adults: number;
  children: number;
  childAges?: number[];
}

export interface NightlyRate {
  date: string;
  price: number;
  currency: string;
  ratePlanId: string;
}

export interface CancelPenalty {
  amount: number;
  currency: string;
  /** ISO8601 deadline after which penalty applies */
  from: string;
}

export interface BookingReservation {
  /** Booking.com reservation ID */
  id: string;
  hotelId: string;
  roomId: string;
  ratePlanId: string;
  status: ReservationStatus;
  /** ISO8601 */
  bookedAt: string;
  modifiedAt?: string;
  checkIn: string;
  checkOut: string;
  guest: BookingGuest;
  nightlyRates: NightlyRate[];
  totalPrice: number;
  currency: string;
  commission: number;
  hotelReceivable: number;
  cityTax: number;
  cityTaxIncluded: boolean;
  cancelPenalties?: CancelPenalty[];
  /** Raw XML as received, for audit */
  rawXml?: string;
}

// --- BAP (connection authorization) -------------------------------------

export type ConnectionStatus = 'pending' | 'active' | 'suspended' | 'revoked';

export interface BAPConnection {
  connectionId: string;
  hotelId: string;
  channelManagerName: string;
  status: ConnectionStatus;
  createdAt: string;
  activatedAt?: string;
  permissions: ConnectionPermission[];
}

export type ConnectionPermission = 'ari' | 'reservations' | 'content';

// --- Webhook / polling state --------------------------------------------

export interface PollState {
  lastPollAt: string | null;
  pendingCount: number;
  lastError: string | null;
}
