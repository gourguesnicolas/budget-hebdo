import { fm } from "../lib/dates";
import { niceStep } from "../lib/budget";

interface BarsProps {
  labels: string[]; values: number[]; colors: string[]; budgets?: number[] | null; w?: number; h?: number;
  labelEvery?: number; valueLabels?: boolean; titles?: string[];
}
export function SvgBars({ labels, values, colors, budgets = null, w = 720, h = 230, labelEvery = 1, valueLabels = false, titles }: BarsProps) {
  const padL = 40, padR = 8, padT = 16, padB = 26, iw = w - padL - padR, ih = h - padT - padB;
  const mx = Math.max(1, ...values, ...(budgets || [0]));
  const step = Math.max(1, niceStep(mx / 4)), top = step * 4;
  const n = values.length, bw = iw / n, barW = Math.max(3, Math.min(36, bw * .62));
  return (
    <svg className="ch" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Graphique à barres">
      {[0, 1, 2, 3, 4].map(i => {
        const y = padT + ih - ih * i / 4;
        return <g key={i}><line className="grid" x1={padL} x2={w - padR} y1={y} y2={y} /><text className="axis" x={padL - 6} y={y + 3} textAnchor="end">{Math.round(step * i)}</text></g>;
      })}
      {values.map((v, i) => {
        const x = padL + bw * i + (bw - barW) / 2, hh = ih * v / top, y = padT + ih - hh;
        const yb = budgets ? padT + ih - ih * budgets[i] / top : 0;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={Math.max(hh, 0)} rx={3} style={{ fill: colors[i] }}><title>{(titles && titles[i]) || labels[i]} : {fm(v)}</title></rect>
            {valueLabels && v > 0 && <text className="axis" x={x + barW / 2} y={y - 3} textAnchor="middle">{Math.round(v)}</text>}
            {budgets && <line x1={padL + bw * i + 1} x2={padL + bw * (i + 1) - 1} y1={yb} y2={yb} style={{ stroke: "var(--cbad)" }} strokeWidth={2} strokeDasharray={bw < 8 ? "0" : "4 3"} />}
            {i % labelEvery === 0 && <text className="axis" x={padL + bw * i + bw / 2} y={h - 9} textAnchor="middle">{labels[i]}</text>}
          </g>
        );
      })}
    </svg>
  );
}
