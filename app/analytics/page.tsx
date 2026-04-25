"use client";
import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';
import PageHeader from '@/components/PageHeader';
import { mockWeeklyData, mockChartData } from '@/lib/mock-data';
import { formatPercent, formatDuration } from '@/lib/utils';
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { Agent, DashboardStats } from '@/types';

const Tip = ({ active, payload, label }: any) => {
  if (!active || !payload) return null;
  return (
    <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
      <div style={{ color: 'var(--text2)', marginBottom: 4 }}>{label}</div>
      {payload.map((p: any) => <div key={p.name} style={{ color: p.color }}>{p.name}: {p.value}</div>)}
    </div>
  );
};

const sentimentData = [
  { name: 'Positive', value: 52, color: '#22c55e' },
  { name: 'Neutral', value: 31, color: '#f59e0b' },
  { name: 'Negative', value: 17, color: '#ef4444' },
];

const outcomeData = [
  { name: 'Converted', value: 23.4, color: '#0AB4F5' },
  { name: 'Callback', value: 18.2, color: '#06b6d4' },
  { name: 'No Answer', value: 31.1, color: '#888' },
  { name: 'Rejected', value: 27.3, color: '#ef4444' },
];

export default function Analytics() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [statsRes, agentsRes] = await Promise.all([
          fetch('/api/analytics/stats'),
          fetch('/api/agents'),
        ]);

        if (statsRes.ok) setStats(await statsRes.json());
        if (agentsRes.ok) {
          const data = await agentsRes.json();
          setAgents(data.agents || []);
        }
      } catch (err) {
        console.error('Failed to fetch analytics data:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const languageData = [
    { name: 'English', value: 45, color: '#0AB4F5' },
    { name: 'Hindi', value: 35, color: '#22c55e' },
    { name: 'Tamil', value: 15, color: '#f59e0b' },
    { name: 'Others', value: 5, color: '#888' },
  ];

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar active="/analytics" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Topbar crumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Analytics' }]} />

        <PageHeader
          title="Analytics"
          subtitle="Deep insights into your calling performance"
        />

        <main style={{ flex: 1, padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20, background: 'var(--bg)' }}>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
            {[
              { label: 'Total Calls', value: (stats?.totalCallsToday || 0).toLocaleString(), sub: 'Today' },
              { label: 'Conversion Rate', value: formatPercent(stats?.conversionRate || 0), sub: stats?.conversionChange ? `${stats.conversionChange}% vs yesterday` : 'Steady' },
              { label: 'Avg Duration', value: formatDuration(stats?.avgCallDuration || 0), sub: 'Per call' },
              { label: 'Cost per Call', value: '₹1.24', sub: 'All-in cost' },
              { label: 'Revenue Generated', value: '₹12.4L', sub: 'Via conversions' },
            ].map(k => (
              <div key={k.label} className="stat-card">
                <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{k.value}</div>
                <div style={{ fontSize: 13, color: 'var(--text2)' }}>{k.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{k.sub}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 16 }}>
            <div className="card">
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Call Volume Trend</div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>Daily calls over last 24 hours</div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={mockChartData}>
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
            </div>

            <div className="card">
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Sentiment</div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>Call sentiment distribution</div>
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
            </div>

            <div className="card">
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Call Outcomes</div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>What happens after calls</div>
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
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr', gap: 16 }}>
            <div className="card">
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Weekly Performance</div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>Calls and conversions by day</div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={mockWeeklyData} barSize={14} barGap={3}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: 'var(--text3)', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: 'var(--text3)', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip content={<Tip />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: 'var(--text3)' }} />
                  <Bar dataKey="calls" fill="#0AB4F5" opacity={0.8} radius={[3,3,0,0]} name="Calls" />
                  <Bar dataKey="converted" fill="#22c55e" opacity={0.8} radius={[3,3,0,0]} name="Converted" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card">
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Language Distribution</div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>Calls by language</div>
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
            </div>

            <div className="card">
              <div style={{ fontWeight: 600, marginBottom: 16 }}>Agent Leaderboard</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {agents.length > 0 ? agents.filter(a => a.callsHandled > 0).sort((a, b) => b.successRate - a.successRate).slice(0, 5).map((agent, i) => (
                  <div key={agent.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: i === 0 ? 'rgba(245,158,11,0.2)' : 'var(--bg4)', fontSize: 11, fontWeight: 700, color: i === 0 ? '#f59e0b' : 'var(--text3)' }}>#{i + 1}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{agent.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--text3)' }}>{formatPercent(agent.successRate)} success</div>
                    </div>
                  </div>
                )) : (
                  <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text3)', fontSize: 12 }}>No agent data</div>
                )}
              </div>
            </div>
          </div>

        </main>
      </div>
    </div>
  );
}
