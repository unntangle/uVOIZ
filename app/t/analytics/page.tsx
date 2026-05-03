"use client";
import { useState, useEffect } from 'react';
import Topbar from '@/components/Topbar';
import PageHeader from '@/components/PageHeader';
import EmptyChart from '@/components/EmptyChart';
import { formatPercent, formatDuration } from '@/lib/utils';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import { Phone, BarChart3, PieChart as PieChartIcon, Trophy } from 'lucide-react';
import { Agent, Call, DashboardStats } from '@/types';

const Tip = ({ active, payload, label }: any) => {
  if (!active || !payload) return null;
  return (
    <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
      <div style={{ color: 'var(--text2)', marginBottom: 4 }}>{label}</div>
      {payload.map((p: any) => <div key={p.name} style={{ color: p.color }}>{p.name}: {p.value}</div>)}
    </div>
  );
};

const SENTIMENT_COLORS: Record<string, string> = {
  positive: '#22c55e',
  neutral: '#f59e0b',
  negative: '#ef4444',
};

const LANG_NAMES: Record<string, string> = {
  en: 'English', hi: 'Hindi', ta: 'Tamil', te: 'Telugu',
  kn: 'Kannada', bn: 'Bengali', mr: 'Marathi', gu: 'Gujarati',
};

const OUTCOME_COLORS: Record<string, string> = {
  Converted: '#0AB4F5',
  Callback: '#06b6d4',
  'No Answer': '#888',
  Failed: '#ef4444',
  Busy: '#f59e0b',
};

export default function Analytics() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [statsRes, agentsRes, callsRes] = await Promise.all([
          fetch('/api/analytics/stats'),
          fetch('/api/agents'),
          fetch('/api/calls'),
        ]);

        if (statsRes.ok) setStats(await statsRes.json());
        if (agentsRes.ok) {
          const data = await agentsRes.json();
          setAgents(data.agents || []);
        }
        if (callsRes.ok) {
          const data = await callsRes.json();
          setCalls(data.calls || []);
        }
      } catch (err) {
        console.error('Failed to fetch analytics data:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // ─── Derived data ─────────────────────────────────────────────────────

  // Today's hourly volume
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const hourlyData = Array.from({ length: 24 }, (_, h) => ({
    hour: `${h.toString().padStart(2, '0')}:00`,
    calls: 0,
    conversions: 0,
  }));
  let hasHourlyData = false;
  for (const c of calls) {
    if (!c.startedAt) continue;
    const d = new Date(c.startedAt);
    if (d < today) continue;
    const h = d.getHours();
    hourlyData[h].calls += 1;
    if (c.converted) hourlyData[h].conversions += 1;
    hasHourlyData = true;
  }

  // Last 7 days
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const weeklyData: { day: string; calls: number; converted: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    weeklyData.push({ day: dayNames[d.getDay()], calls: 0, converted: 0 });
  }
  let hasWeeklyData = false;
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);
  for (const c of calls) {
    if (!c.startedAt) continue;
    const d = new Date(c.startedAt);
    if (d < weekStart) continue;
    const dayDiff = Math.floor((d.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24));
    if (dayDiff < 0 || dayDiff > 6) continue;
    weeklyData[dayDiff].calls += 1;
    if (c.converted) weeklyData[dayDiff].converted += 1;
    hasWeeklyData = true;
  }

  // Sentiment distribution (only completed calls with sentiment)
  const sentimentMap: Record<string, number> = {};
  for (const c of calls) {
    if (!c.sentiment) continue;
    sentimentMap[c.sentiment] = (sentimentMap[c.sentiment] || 0) + 1;
  }
  const sentimentTotal = Object.values(sentimentMap).reduce((a, b) => a + b, 0);
  const sentimentData = sentimentTotal > 0
    ? Object.entries(sentimentMap).map(([key, count]) => ({
        name: key.charAt(0).toUpperCase() + key.slice(1),
        value: Math.round((count / sentimentTotal) * 100),
        color: SENTIMENT_COLORS[key] || '#888',
      }))
    : [];

  // Outcome distribution (from call status + converted flag)
  const outcomeMap: Record<string, number> = {};
  for (const c of calls) {
    let key: string;
    if (c.converted) key = 'Converted';
    else if (c.status === 'completed') key = 'Callback';
    else if (c.status === 'no-answer') key = 'No Answer';
    else if (c.status === 'failed') key = 'Failed';
    else if (c.status === 'busy') key = 'Busy';
    else continue;
    outcomeMap[key] = (outcomeMap[key] || 0) + 1;
  }
  const outcomeTotal = Object.values(outcomeMap).reduce((a, b) => a + b, 0);
  const outcomeData = outcomeTotal > 0
    ? Object.entries(outcomeMap).map(([name, count]) => ({
        name,
        value: Math.round((count / outcomeTotal) * 1000) / 10, // one decimal
        color: OUTCOME_COLORS[name] || '#888',
      }))
    : [];

  // Language distribution — derived from agents (since calls don't carry language directly)
  // We weight by callsHandled to give a realistic share
  const langMap: Record<string, number> = {};
  for (const a of agents) {
    const lang = (a as any).language || 'unknown';
    const count = a.callsHandled || 0;
    if (count === 0) continue;
    // Agent.language can be a code ('hi') or a label ('Hindi + English'); normalize
    const normalized = LANG_NAMES[lang] || lang.split('+')[0].trim() || 'Other';
    langMap[normalized] = (langMap[normalized] || 0) + count;
  }
  const langTotal = Object.values(langMap).reduce((a, b) => a + b, 0);
  const PIE_COLORS = ['#0AB4F5', '#22c55e', '#f59e0b', '#06b6d4', '#a855f7', '#ef4444'];
  const languageData = langTotal > 0
    ? Object.entries(langMap).map(([name, count], i) => ({
        name,
        value: Math.round((count / langTotal) * 100),
        color: PIE_COLORS[i % PIE_COLORS.length],
      }))
    : [];

  // Agent leaderboard — only agents with calls
  const leaderboard = agents
    .filter(a => (a.callsHandled || 0) > 0)
    .sort((a, b) => (b.successRate || 0) - (a.successRate || 0))
    .slice(0, 5);

  return (
    <>
      <Topbar crumbs={[{ label: 'Dashboard', href: '/app/dashboard' }, { label: 'Analytics' }]} />

      <PageHeader
        title="Analytics"
        subtitle="Deep insights into your calling performance"
      />

      <main style={{ flex: 1, padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20, background: 'var(--bg)' }}>

        {/* Top stat strip — only real numbers, no fake "Cost per call" / "Revenue" */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {[
            { label: 'Total Calls Today', value: (stats?.totalCallsToday || 0).toLocaleString(), sub: 'across all campaigns' },
            { label: 'Conversion Rate', value: formatPercent(stats?.conversionRate || 0), sub: stats?.conversionChange ? `${stats.conversionChange}% vs yesterday` : 'No prior data yet' },
            { label: 'Avg Duration', value: formatDuration(stats?.avgCallDuration || 0), sub: 'per completed call' },
          ].map(k => (
            <div key={k.label} className="stat-card">
              <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{k.value}</div>
              <div style={{ fontSize: 13, color: 'var(--text2)' }}>{k.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Charts row 1 */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 16 }}>
          <div className="card">
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Call Volume Today</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>Hourly breakdown of calls and conversions</div>
            {hasHourlyData ? (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={hourlyData}>
                  <defs>
                    <linearGradient id="ag1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0AB4F5" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#0AB4F5" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="hour" tick={{ fill: 'var(--text3)', fontSize: 10 }} tickLine={false} axisLine={false} interval={3} />
                  <YAxis tick={{ fill: 'var(--text3)', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip content={<Tip />} />
                  <Area type="monotone" dataKey="calls" stroke="#0AB4F5" fill="url(#ag1)" strokeWidth={2} dot={false} name="Calls" />
                  <Area type="monotone" dataKey="conversions" stroke="#22c55e" fill="none" strokeWidth={1.5} dot={false} name="Conversions" strokeDasharray="4 2" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart icon={<Phone size={28} />} title="No calls today" message="Hourly breakdown will populate once your campaigns start running." height={200} />
            )}
          </div>

          <div className="card">
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Sentiment</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>Call sentiment distribution</div>
            {sentimentData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={sentimentData} cx="50%" cy="50%" innerRadius={45} outerRadius={65} paddingAngle={3} dataKey="value">
                      {sentimentData.map((entry, i) => <Cell key={i} fill={entry.color} opacity={0.9} />)}
                    </Pie>
                    <Tooltip formatter={(val) => `${val}%`} contentStyle={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                  {sentimentData.map(s => (
                    <div key={s.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color }} />
                        <span style={{ color: 'var(--text2)' }}>{s.name}</span>
                      </div>
                      <span style={{ fontWeight: 600 }}>{s.value}%</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <EmptyChart icon={<PieChartIcon size={24} />} title="No sentiment data" message="Sentiment is captured per completed call." height={200} />
            )}
          </div>

          <div className="card">
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Call Outcomes</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>What happens after calls</div>
            {outcomeData.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {outcomeData.map(o => (
                  <div key={o.name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
                      <span style={{ color: 'var(--text2)' }}>{o.name}</span>
                      <span style={{ fontWeight: 600 }}>{o.value}%</span>
                    </div>
                    <div className="progress">
                      <div style={{ height: '100%', background: o.color, borderRadius: 3, width: `${o.value}%`, transition: 'width 0.5s' }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyChart icon={<BarChart3 size={24} />} title="No outcomes yet" message="Run a campaign to see how calls resolve." height={200} />
            )}
          </div>
        </div>

        {/* Charts row 2 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr', gap: 16 }}>
          <div className="card">
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Weekly Performance</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>Calls and conversions by day</div>
            {hasWeeklyData ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={weeklyData} barSize={14} barGap={3}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: 'var(--text3)', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: 'var(--text3)', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip content={<Tip />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: 'var(--text3)' }} />
                  <Bar dataKey="calls" fill="#0AB4F5" opacity={0.8} radius={[3,3,0,0]} name="Calls" />
                  <Bar dataKey="converted" fill="#22c55e" opacity={0.8} radius={[3,3,0,0]} name="Converted" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart icon={<BarChart3 size={28} />} title="No weekly data yet" message="Weekly trends will appear here once you've made calls over multiple days." height={200} />
            )}
          </div>

          <div className="card">
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Language Distribution</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>Calls by language</div>
            {languageData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={languageData} cx="50%" cy="50%" innerRadius={0} outerRadius={65} paddingAngle={0} dataKey="value">
                      {languageData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={(val) => `${val}%`} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                  {languageData.map(l => (
                    <div key={l.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: l.color }} />
                        <span style={{ color: 'var(--text2)' }}>{l.name}</span>
                      </div>
                      <span style={{ fontWeight: 600 }}>{l.value}%</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <EmptyChart icon={<PieChartIcon size={24} />} title="No language data" message="Language mix is computed from agents that have handled calls." height={200} />
            )}
          </div>

          <div className="card">
            <div style={{ fontWeight: 600, marginBottom: 16 }}>Agent Leaderboard</div>
            {leaderboard.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {leaderboard.map((agent, i) => (
                  <div key={agent.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: i === 0 ? 'rgba(245,158,11,0.2)' : 'var(--bg3)',
                      fontSize: 11, fontWeight: 700,
                      color: i === 0 ? '#f59e0b' : 'var(--text3)',
                    }}>#{i + 1}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{agent.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--text3)' }}>{formatPercent(agent.successRate || 0)} success · {(agent.callsHandled || 0).toLocaleString()} calls</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyChart icon={<Trophy size={24} />} title="No ranking yet" message="Leaderboard ranks agents once they've handled calls." height={200} />
            )}
          </div>
        </div>

      </main>
    </>
  );
}
