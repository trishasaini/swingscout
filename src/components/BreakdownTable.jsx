// BreakdownTable — the numeric signal breakdown shown beneath every verdict
// (RULES.md §4: "Always show the signal breakdown table with actual values").
// Renders exactly the four Phase 2 checks, in a fixed order, straight from
// data.json's `signals` object — never recomputed in the browser (RULES §3).
const SIGNAL_ORDER = ['candleSize', 'candleOverlap', 'volumeTrend', 'emaDirection'];

export default function BreakdownTable({ signals }) {
  return (
    <table className="breakdown">
      <tbody>
        {SIGNAL_ORDER.map((key) => {
          const s = signals[key];
          if (!s) return null;
          return (
            <tr key={key} className={s.pass ? 'sig-pass' : 'sig-fail'}>
              <td className="sig-check" aria-label={s.pass ? 'pass' : 'fail'}>
                {s.pass ? '✓' : '✗'}
              </td>
              <td className="sig-label">{s.label}</td>
              <td className="sig-value">{s.value}</td>
              <td className="sig-detail">{s.detail}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
