// One local calendar day, midnight to midnight, so DST days are 23 or 25 hours.
export function dayWindow(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const [y, mo, d] = m ? m.slice(1).map(Number) : [];
  const start = m && new Date(y, mo - 1, d);
  if (!start || start.getFullYear() !== y || start.getMonth() !== mo - 1 || start.getDate() !== d) {
    throw new Error('--date must be YYYY-MM-DD');
  }
  return { start, end: new Date(y, mo - 1, d + 1) };
}
