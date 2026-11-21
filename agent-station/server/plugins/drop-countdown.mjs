// Drop countdown: days and hours left until a date (midnight, America/Chicago unless a time zone is given).
const tzOffsetMs = (tz, at) => {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const v = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  return Date.UTC(v.year, v.month - 1, v.day, v.hour, v.minute, v.second) - at.getTime();
};

function targetFor(date, tz) {
  const m = String(date).trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2}))?$/);
  if (m) {
    const [, y, mo, d, h = 0, mi = 0] = m.map((x, i) => (i && x !== undefined ? +x : x));
    const guess = Date.UTC(y, mo - 1, d, h, mi);
    let t = guess - tzOffsetMs(tz, new Date(guess));
    t = guess - tzOffsetMs(tz, new Date(t)); // second pass handles daylight-saving edges
    return new Date(t);
  }
  const t = new Date(date); // e.g. "Nov 27, 2026"
  return Number.isNaN(t.getTime()) ? null : t;
}

export default {
  name: 'drop_countdown', label: 'Drop countdown', icon: '⏳',
  description: 'How many days and hours are left until a date, such as a product drop or Black Friday. Dates count from midnight Central time unless a time zone is given.',
  parameters: { type: 'object', properties: {
    date: { type: 'string', description: 'Target date, best as YYYY-MM-DD (optionally "YYYY-MM-DD HH:MM"), e.g. 2026-11-27' },
    timezone: { type: 'string', description: 'IANA time zone, default America/Chicago' },
  }, required: ['date'] },
  async run({ date, timezone }) {
    const tz = timezone || 'America/Chicago';
    try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); } catch { return `Unknown time zone "${tz}".`; }
    const t = targetFor(date, tz);
    if (!t) return `Couldn't read the date "${date}". Use YYYY-MM-DD.`;
    const ms = t - Date.now();
    const label = t.toLocaleString('en-US', { timeZone: tz, dateStyle: 'full', timeStyle: 'short' });
    if (ms <= 0) {
      const ago = Math.floor(-ms / 36e5);
      return `That moment (${label}) has already passed, ${Math.floor(ago / 24)} days ${ago % 24} hours ago.`;
    }
    const hours = Math.floor(ms / 36e5);
    return `${Math.floor(hours / 24)} days and ${hours % 24} hours left until ${label} (${tz}).`;
  },
};
