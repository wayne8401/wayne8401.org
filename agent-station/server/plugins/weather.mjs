// Free weather from Open-Meteo (open-source, no API key).
const CODES = { 0: 'clear', 1: 'mostly clear', 2: 'partly cloudy', 3: 'overcast', 45: 'fog', 48: 'fog', 51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle', 61: 'light rain', 63: 'rain', 65: 'heavy rain', 71: 'light snow', 73: 'snow', 75: 'heavy snow', 80: 'showers', 81: 'showers', 82: 'heavy showers', 95: 'thunderstorm', 96: 'thunderstorm with hail', 99: 'thunderstorm with hail' };

export default {
  name: 'weather', label: 'Weather', icon: '⛅',
  description: 'Current weather and a 3-day forecast for any city (Open-Meteo, free).',
  parameters: { type: 'object', properties: { city: { type: 'string', description: 'City name, e.g. "Austin" or "Paris, France"' } }, required: ['city'] },
  async run({ city }) {
    const g = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(String(city).split(',')[0])}`, { signal: AbortSignal.timeout(10000) })).json();
    const p = g.results?.[0];
    if (!p) return `Couldn't find a place called "${city}".`;
    const w = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}&current=temperature_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max&forecast_days=3&timezone=auto`, { signal: AbortSignal.timeout(10000) })).json();
    const c = w.current, d = w.daily;
    const days = d.time.map((t, i) => `${t}: ${CODES[d.weather_code[i]] || 'mixed'}, ${d.temperature_2m_min[i]}–${d.temperature_2m_max[i]}°C, rain chance ${d.precipitation_probability_max[i] ?? '?'}%`);
    return `${p.name}, ${p.country}: now ${c.temperature_2m}°C, ${CODES[c.weather_code] || 'mixed'}, wind ${c.wind_speed_10m} km/h.\n${days.join('\n')}`;
  },
};
