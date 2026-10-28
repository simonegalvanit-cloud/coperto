import { daysBetween, fromMinutes, toMinutes, type LocalNow } from "./time";

export type BookingRules = {
  capacity: number;
  maxCoversPerSlot: number | null;
  slotMinutes: number;
  durationMinutes: number;
  maxPartySize: number;
  minNoticeMinutes: number;
  maxDaysAhead: number;
};

export type Service = { startTime: string; endTime: string };

/** An active booking (confirmed or seated) on the same date. */
export type Booking = { time: string; partySize: number; durationMinutes: number };

/** Every arrival time offered by the day's services, in order. */
export function slotTimes(services: Service[], slotMinutes: number): string[] {
  const set = new Set<number>();
  for (const s of services) {
    for (let t = toMinutes(s.startTime); t <= toMinutes(s.endTime); t += slotMinutes) set.add(t);
  }
  return [...set].sort((a, b) => a - b).map(fromMinutes);
}

/**
 * Whether a party can sit from `time` for `duration` minutes without the room
 * going over capacity at any moment, and without breaking the arrival pacing.
 */
export function fits(
  bookings: Booking[],
  time: string,
  duration: number,
  partySize: number,
  rules: Pick<BookingRules, "capacity" | "maxCoversPerSlot">,
): boolean {
  const start = toMinutes(time);
  const end = start + duration;
  const spans = bookings.map((b) => ({
    start: toMinutes(b.time),
    end: toMinutes(b.time) + b.durationMinutes,
    covers: b.partySize,
  }));

  // Occupancy only rises when a booking starts, so the peak inside [start, end)
  // is at our own start or at the start of a booking that begins during our stay.
  const checkpoints = [start, ...spans.map((s) => s.start).filter((t) => t > start && t < end)];
  for (const x of checkpoints) {
    const load = spans.reduce((sum, s) => (s.start <= x && x < s.end ? sum + s.covers : sum), 0);
    if (load + partySize > rules.capacity) return false;
  }

  if (rules.maxCoversPerSlot != null) {
    const arriving = spans.reduce((sum, s) => (s.start === start ? sum + s.covers : sum), 0);
    if (arriving + partySize > rules.maxCoversPerSlot) return false;
  }
  return true;
}

/** Arrival times a guest can book online for this date and party size. */
export function availableSlots(input: {
  date: string;
  partySize: number;
  rules: BookingRules;
  services: Service[];
  closed: boolean;
  bookings: Booking[];
  now: LocalNow;
}): string[] {
  const { date, partySize, rules, services, closed, bookings, now } = input;
  if (closed || partySize < 1 || partySize > rules.maxPartySize) return [];
  const daysAhead = daysBetween(now.date, date);
  if (daysAhead < 0 || daysAhead > rules.maxDaysAhead) return [];

  const earliest = now.minutes + rules.minNoticeMinutes;
  return slotTimes(services, rules.slotMinutes).filter(
    (time) =>
      daysAhead * 1440 + toMinutes(time) >= earliest &&
      fits(bookings, time, rules.durationMinutes, partySize, rules),
  );
}
