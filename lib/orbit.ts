const NORAD_ID = "68261";
export const MAX_ORBIT_AGE_DAYS = 7;

function validLine(line: string, prefix: string) {
  if (line.length !== 69 || !line.startsWith(prefix) || line.slice(2, 7) !== NORAD_ID) return false;
  const checksum = [...line.slice(0, 68)].reduce((sum, character) =>
    sum + (/\d/.test(character) ? Number(character) : character === "-" ? 1 : 0), 0);
  return checksum % 10 === Number(line[68]);
}

/** Accept only valid, recent orbital elements for Ten-Koh 2, never the ISS or HTV-X. */
export function validateOrbit(line1: string, line2: string, now = new Date()) {
  if (!validLine(line1, "1 ") || !validLine(line2, "2 ")) {
    throw new Error("Invalid Ten-Koh 2 orbital elements");
  }
  const shortYear = Number(line1.slice(18, 20));
  const year = shortYear >= 57 ? 1900 + shortYear : 2000 + shortYear;
  const day = Number(line1.slice(20, 32));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  if (!Number.isFinite(day) || day < 1 || day >= (leap ? 367 : 366)) {
    throw new Error("Invalid orbital epoch");
  }
  const epoch = new Date(Date.UTC(year, 0, 1) + (day - 1) * 86_400_000);
  const ageDays = (now.getTime() - epoch.getTime()) / 86_400_000;
  if (ageDays < -1 || ageDays > MAX_ORBIT_AGE_DAYS) {
    throw new Error("Ten-Koh 2 orbital elements are out of date");
  }
  return { line1, line2, epoch: epoch.toISOString() };
}

export function parseOrbit(text: string, now = new Date()) {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const line1 = lines.find((line) => line.startsWith("1 "));
  const line2 = lines.find((line) => line.startsWith("2 "));
  if (!line1 || !line2) throw new Error("Orbital elements missing");
  return validateOrbit(line1, line2, now);
}

/** A failed refresh may keep a previously validated orbit only while it is still recent. */
export function retainOrbit<T extends { line1: string; line2: string }>(previous: T | null, now = new Date()) {
  if (!previous) return null;
  try {
    validateOrbit(previous.line1, previous.line2, now);
    return { ...previous, mode: "reference" as const };
  } catch {
    return null;
  }
}
