import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { buildTrendSeries } from './utilityTrend';

/*
 * Recharts takes colors as JS props, not CSS, so the token values are
 * duplicated here as literals. That duplication is deliberate and bounded:
 * the six --accent-* tokens have NO dark-mode override in _global.scss (only
 * surfaces, borders, text and shadows are redefined under .app-mode-dark), so
 * these two bar colors are correct in both themes and need no theme branch.
 */
const BAR_UTILITY = '#0ea271'; // --accent-green
const BAR_EMPTY = '#dc3a3a';   // --accent-red

/*
 * Chrome DOES vary by theme, because these mirror tokens that .app-mode-dark
 * genuinely overrides: --text-tertiary, --border-primary, --surface-elevated,
 * --text-primary and --border-hover respectively.
 */
const CHROME = {
  dark: {
    axis: '#6b6b78',
    grid: 'rgba(255, 255, 255, 0.07)',
    tooltipBg: '#1e1e21',
    tooltipText: '#ededef',
    tooltipBorder: 'rgba(255, 255, 255, 0.12)',
  },
  light: {
    axis: '#8b8d9e',
    grid: 'rgba(0, 0, 0, 0.08)',
    tooltipBg: '#ffffff',
    tooltipText: '#1a1a2e',
    tooltipBorder: 'rgba(0, 0, 0, 0.15)',
  },
};

/*
 * `compact` is the Chain Activity strip (issue #346).
 *
 * The chart used to BE the page -- 200px of chrome rendering two numbers that
 * the stat band above now states outright, and with the scanner behind it drew
 * a single rectangle. In compact mode it keeps the one thing a chart is better
 * at than a number (shape across the window) and drops the rest: no Y axis, no
 * legend, tighter margins.
 *
 * The height must be passed to ResponsiveContainer rather than set in CSS. It
 * measures its own box and renders to that number, so a hardcoded 200 inside a
 * 120px strip does not shrink -- it OVERFLOWS, and the legend lands on top of
 * whatever follows. That is exactly what happened on the first attempt here.
 */
export function UtilityTrendChart({ daily, theme, compact = false }) {
  const data = buildTrendSeries(daily);
  const chrome = CHROME[theme] || CHROME.dark;

  return (
    <div className="ca-trend-chart" role="img" aria-label="Daily utility and empty block counts across the retained window">
      <ResponsiveContainer width="100%" height={compact ? 116 : 200}>
        <BarChart accessibilityLayer data={data} margin={compact ? { top: 4, right: 4, left: 4, bottom: 0 } : { top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid stroke={chrome.grid} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: chrome.axis, fontSize: 11 }}
            axisLine={{ stroke: chrome.grid }}
            tickLine={false}
          />
          {/*
            `hide`, NOT removed. The band above already states utility and empty
            outright, so the ticks are redundant -- but dropping the YAxis
            element takes the numeric scale with it, and the stacked bars then
            render at zero height. The compact strip came out completely empty
            the first time for exactly this reason.
          */}
          <YAxis
            hide={compact}
            tick={{ fill: chrome.axis, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ fill: chrome.grid }}
            contentStyle={{
              background: chrome.tooltipBg,
              border: `1px solid ${chrome.tooltipBorder}`,
              borderRadius: 6,
              fontSize: 12,
            }}
            labelStyle={{ color: chrome.tooltipText, fontWeight: 600 }}
            itemStyle={{ color: chrome.tooltipText }}
          />
          {/* Green is utility, red is empty, and the tooltip names both. */}
          {!compact && <Legend wrapperStyle={{ fontSize: 11, color: chrome.axis }} />}
          <Bar dataKey="utility" name="Utility" stackId="blocks" fill={BAR_UTILITY} />
          <Bar dataKey="empty" name="Empty" stackId="blocks" fill={BAR_EMPTY} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
