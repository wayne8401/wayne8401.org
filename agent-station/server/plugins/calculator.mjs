// Exact arithmetic so agents don't guess at math. No eval(): a small parser.
const FN = { sqrt: Math.sqrt, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil, ln: Math.log, log: Math.log10, sin: Math.sin, cos: Math.cos, tan: Math.tan };
const CONST = { pi: Math.PI, e: Math.E };

function evaluate(src) {
  const s = String(src).replace(/\s+/g, '').replace(/,/g, '').toLowerCase();
  let i = 0;
  const peek = () => s[i];
  const expr = () => { let v = term(); while (peek() === '+' || peek() === '-') v = s[i++] === '+' ? v + term() : v - term(); return v; };
  const term = () => { let v = factor(); while ('*/%'.includes(peek() || '_')) { const op = s[i++]; const r = factor(); v = op === '*' ? v * r : op === '/' ? v / r : v % r; } return v; };
  const factor = () => { const b = unary(); return peek() === '^' ? (i++, b ** factor()) : b; };
  const unary = () => (peek() === '-' ? (i++, -unary()) : peek() === '+' ? (i++, unary()) : atom());
  const atom = () => {
    if (peek() === '(') { i++; const v = expr(); if (s[i++] !== ')') throw new Error('missing )'); return pct(v); }
    const num = s.slice(i).match(/^\d+(\.\d+)?(e[+-]?\d+)?/);
    if (num) { i += num[0].length; return pct(+num[0]); }
    const id = s.slice(i).match(/^[a-z]+/);
    if (id) {
      i += id[0].length;
      if (id[0] in CONST) return CONST[id[0]];
      if (id[0] in FN && peek() === '(') { i++; const v = expr(); if (s[i++] !== ')') throw new Error('missing )'); return FN[id[0]](v); }
      throw new Error(`unknown name "${id[0]}"`);
    }
    throw new Error(`unexpected "${peek() ?? 'end'}"`);
  };
  const pct = (v) => (peek() === '%' && !/[\d(a-z]/.test(s[i + 1] || '') ? (i++, v / 100) : v);
  const v = expr();
  if (i < s.length) throw new Error(`unexpected "${s[i]}"`);
  return v;
}

export default {
  name: 'calculator', label: 'Calculator', icon: '🧮',
  description: 'Exact math: + - * / ^ %, parentheses, sqrt, abs, round, ln, log, sin, cos, tan, pi, e. Use it for any arithmetic instead of guessing.',
  parameters: { type: 'object', properties: { expression: { type: 'string', description: 'e.g. (1299*0.85)+49 or sqrt(2)^2' } }, required: ['expression'] },
  async run({ expression }) {
    try { const v = evaluate(expression); return Number.isFinite(v) ? `${expression} = ${+v.toPrecision(12)}` : 'Result is not a finite number.'; }
    catch (e) { return `Could not calculate: ${e.message}`; }
  },
};
