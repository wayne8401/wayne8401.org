// Store profit calculator: profit in dollars and margin percent for a product.
const money = (n) => `$${n.toFixed(2)}`;

export default {
  name: 'store_profit', label: 'Store profit', icon: '💵',
  description: 'Profit calculator for store products. Give a selling price and a base cost; returns profit in dollars, margin percent and markup percent.',
  parameters: { type: 'object', properties: {
    price: { type: 'number', description: 'Selling price in dollars, e.g. 34.99' },
    cost: { type: 'number', description: 'Base cost in dollars, e.g. 13' },
  }, required: ['price', 'cost'] },
  async run({ price, cost }) {
    const p = Number(price), c = Number(cost);
    if (!Number.isFinite(p) || !Number.isFinite(c) || p <= 0 || c < 0) return 'Give a selling price above 0 and a base cost of 0 or more.';
    const profit = p - c;
    const margin = (profit / p) * 100;
    const markup = c > 0 ? (profit / c) * 100 : null;
    return `Price ${money(p)}, cost ${money(c)}: profit ${money(profit)} per sale, margin ${margin.toFixed(2)}%${markup === null ? '' : `, markup ${markup.toFixed(2)}%`}.${profit < 0 ? ' This sells at a loss.' : ''}`;
  },
};
