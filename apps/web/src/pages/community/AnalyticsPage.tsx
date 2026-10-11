import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Download } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeading,
} from '@sparko/ui';
import { Metric } from '../../components/AppShell';
import { getAnalytics } from '../../services/modules';
import { errorMessage } from '../../services/http';
import {
  hourlySeries,
  metricLabels,
  summarize,
  type AnalyticsMetric,
  type Point,
} from '../../features/analytics/series';

const metrics = Object.keys(metricLabels) as AnalyticsMetric[];
const statusText: Record<string, string> = {
  'not-collected': 'Not collected',
  'collection-gaps': 'Collected with gaps',
  observed: 'Observed',
  'no-activity': 'Collected, no activity',
};
function format(value: number, metric: AnalyticsMetric) {
  return metric === 'voiceSeconds'
    ? Math.round(value).toLocaleString()
    : value.toLocaleString();
}
function daily(points: Point[]) {
  const days = new Map<
    string,
    { value: number; covered: number; hours: number; partial: number }
  >();
  for (const point of points) {
    const day = point.hour.slice(0, 10);
    const entry = days.get(day) ?? {
      value: 0,
      covered: 0,
      hours: 0,
      partial: 0,
    };
    entry.hours += 1;
    if (point.value !== null) {
      entry.value += point.value;
      entry.covered += 1;
    }
    if (point.partial) entry.partial += 1;
    days.set(day, entry);
  }
  return [...days.entries()];
}

export function AnalyticsPage() {
  const { guildId = '' } = useParams();
  const [range, setRange] = useState('7');
  const [metric, setMetric] = useState<AnalyticsMetric>('messages');
  const query = useQuery({
    queryKey: ['analytics', guildId, range],
    queryFn: ({ signal }) => getAnalytics(guildId, range, signal),
  });
  const series = useMemo(() => {
    if (!query.data) return null;
    const { rows, gaps, range: window } = query.data;
    return Object.fromEntries(
      metrics.map((name) => [
        name,
        hourlySeries(rows, gaps, name, window.from, window.to),
      ]),
    ) as Record<AnalyticsMetric, Point[]>;
  }, [query.data]);
  const download = () => {
    if (!query.data) return;
    const lines = [
      'type,hour_or_from,metric,count_or_to,observed_at_or_reason',
      ...query.data.rows.map((row) =>
        ['observation', row.hour, row.metric, row.count, row.observedAt].join(
          ',',
        ),
      ),
      ...query.data.gaps.map((gap) =>
        ['gap', gap.from, gap.metric, gap.to, JSON.stringify(gap.reason)].join(
          ',',
        ),
      ),
    ];
    const url = URL.createObjectURL(
      new Blob([lines.join('\n')], { type: 'text/csv' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `sparko-analytics-${range}d.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const points = series?.[metric] ?? [];
  const summary = summarize(points);
  const label = metricLabels[metric];
  return (
    <>
      <PageHeading
        eyebrow="Insights"
        title="See the story behind the activity."
        description="Observed activity by UTC hour. Hours Sparko did not observe are shown as gaps, never as zero."
        actions={
          <div className="row">
            <select
              aria-label="Analytics date range"
              value={range}
              onChange={(event) => setRange(event.target.value)}
            >
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
            </select>
            <Button
              variant="secondary"
              disabled={!query.data}
              onClick={download}
            >
              <Download size={15} />
              Export CSV
            </Button>
          </div>
        }
      />
      {query.isPending ? (
        <LoadingState />
      ) : query.error ? (
        <ErrorState
          message={errorMessage(query.error)}
          retry={() => void query.refetch()}
        />
      ) : (
        <>
          <div className="status-line">
            <Badge
              tone={
                query.data.status === 'observed'
                  ? 'success'
                  : query.data.status === 'not-collected'
                    ? 'neutral'
                    : 'warning'
              }
            >
              {statusText[query.data.status] ?? query.data.status}
            </Badge>
            <span className="muted">
              {query.data.observedAt
                ? `Last observation ${new Date(query.data.observedAt).toLocaleString()}`
                : 'No observation in this range'}{' '}
              · UTC hours; boundary hours are counted in full
            </span>
          </div>
          {!query.data.enabled && (
            <div className="alert alert-warning" role="status">
              <div>
                <strong>Analytics collection is off.</strong>
                <p>
                  Turn on Server analytics in the Insights settings to start
                  collecting.
                </p>
              </div>
            </div>
          )}
          <div className="tabs module-tabs" role="group" aria-label="Metric">
            {metrics.map((name) => (
              <button
                key={name}
                type="button"
                aria-pressed={metric === name}
                className={metric === name ? 'active' : ''}
                onClick={() => setMetric(name)}
              >
                {metricLabels[name].label}
              </button>
            ))}
          </div>
          <div className="metric-grid">
            <Metric
              label={`${label.label} in range`}
              value={format(summary.total, metric)}
              detail={`${label.unit}, observed hours only`}
            />
            <Metric
              label="Coverage"
              value={
                summary.hours
                  ? `${Math.round((summary.coveredHours / summary.hours) * 100)}%`
                  : '—'
              }
              detail={`${summary.coveredHours} of ${summary.hours} hours observed${summary.partialHours ? `, ${summary.partialHours} partly` : ''}`}
            />
            <Metric
              label="Members"
              value={query.data.members.count?.toLocaleString() ?? '—'}
              detail={
                query.data.members.observedAt
                  ? `Reported by Discord ${new Date(query.data.members.observedAt).toLocaleString()}`
                  : 'Not reported yet'
              }
            />
          </div>
          <Card>
            <h2>
              {label.label} per hour{' '}
              <small className="muted">({label.unit})</small>
            </h2>
            {summary.coveredHours ? (
              <div
                className="analytics-chart"
                role="img"
                aria-label={`${label.label} per UTC hour. Breaks mark hours that were not observed. A daily table follows.`}
              >
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={points}>
                    <CartesianGrid stroke="var(--line)" vertical={false} />
                    <XAxis
                      dataKey="hour"
                      tickFormatter={(value: string) =>
                        new Date(value).toLocaleDateString()
                      }
                      stroke="var(--muted)"
                      fontSize={10}
                      minTickGap={24}
                    />
                    <YAxis
                      stroke="var(--muted)"
                      fontSize={10}
                      allowDecimals={false}
                    />
                    <Tooltip
                      labelFormatter={(value) =>
                        new Date(String(value)).toLocaleString()
                      }
                      formatter={(value, _name, item) => {
                        const point = item.payload as Point;
                        return point.value === null
                          ? ['Not observed', label.label]
                          : [
                              `${format(Number(value), metric)} ${label.unit}${point.partial ? ' (partly observed)' : ''}`,
                              label.label,
                            ];
                      }}
                      contentStyle={{
                        background: 'var(--surface)',
                        borderColor: 'var(--line)',
                        color: 'var(--text)',
                      }}
                    />
                    <Area
                      type="linear"
                      dataKey="value"
                      stroke="#FACC15"
                      fill="#FACC15"
                      fillOpacity={0.12}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState
                title={`${label.label} were not observed in this range`}
                description="A missing observation is not zero. Check that collection is on and Sparko has the needed Discord intents."
              />
            )}
          </Card>
          {query.data.gaps.length > 0 && (
            <Card>
              <h2>Collection gaps</h2>
              {query.data.gaps.map((gap, index) => (
                <div className="activity-row" key={index}>
                  <span>
                    <strong>{gap.metric}</strong>
                    <small>{gap.reason}</small>
                  </span>
                  <small className="muted">
                    {new Date(gap.from).toLocaleString()} –{' '}
                    {new Date(gap.to).toLocaleString()}
                  </small>
                </div>
              ))}
            </Card>
          )}
          <div className="overview-grid">
            <Card className="table-wrap">
              <table>
                <caption>
                  {label.label} per UTC day ({label.unit})
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Day (UTC)</th>
                    <th scope="col">Total</th>
                    <th scope="col">Hours observed</th>
                  </tr>
                </thead>
                <tbody>
                  {daily(points).map(([day, entry]) => (
                    <tr key={day}>
                      <td>{day}</td>
                      <td>
                        {entry.covered
                          ? format(entry.value, metric)
                          : 'Not observed'}
                      </td>
                      <td>
                        {entry.covered}/{entry.hours}
                        {entry.partial ? ` (${entry.partial} partly)` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <Card>
              <h2>Module activity</h2>
              <p className="field-hint">
                Committed business operations in this range.
              </p>
              {query.data.moduleActions.length ? (
                [...query.data.moduleActions]
                  .sort((a, b) => b.count - a.count)
                  .slice(0, 12)
                  .map((row) => (
                    <div className="activity-row" key={row.action}>
                      <span>{row.action}</span>
                      <strong>{row.count.toLocaleString()}</strong>
                    </div>
                  ))
              ) : (
                <p className="muted">No recorded operations.</p>
              )}
            </Card>
          </div>
        </>
      )}
    </>
  );
}
