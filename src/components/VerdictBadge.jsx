// VerdictBadge — small colored pill for a verdict string (RULES.md §4/§7).
// Pure presentational: color is driven entirely by the `color` prop shipped
// in data.json (verdictColor), never re-derived here.
export default function VerdictBadge({ verdict, color }) {
  return <span className={`badge ${color}`}>{verdict}</span>;
}
