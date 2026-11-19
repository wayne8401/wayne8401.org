// Current time in America/Chicago (or any time zone).
export default {
  name: 'current_time', label: 'Current time', icon: '🕒',
  description: "Today's date and the current time in America/Chicago (Central time), or another time zone if asked.",
  parameters: { type: 'object', properties: { timezone: { type: 'string', description: 'IANA time zone, default America/Chicago' } } },
  async run({ timezone } = {}) {
    const tz = timezone || 'America/Chicago';
    try {
      const now = new Date();
      const date = now.toLocaleDateString('en-US', { timeZone: tz, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      const time = now.toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
      return `${date}, ${time} (${tz}).`;
    } catch { return `Unknown time zone "${tz}".`; }
  },
};
