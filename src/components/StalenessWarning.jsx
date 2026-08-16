import { daysSince, isStale } from '../lib/staleness';

// StalenessWarning — surfaces a silently-stale data.json (e.g. a failed
// nightly Action run left yesterday's — or older — file in place with no
// other visible sign). Renders nothing when data is fresh.
export default function StalenessWarning({ dataAsOf }) {
  if (!isStale(dataAsOf)) return null;
  const days = daysSince(dataAsOf);
  return (
    <div className="staleness-warning">
      ⚠️ This data is {days} days old — the nightly refresh may have failed. Don't treat this as today's numbers.
    </div>
  );
}
