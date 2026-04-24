"use client";
import { Phone, TrendingUp, Clock, Activity, PauseCircle, Plus, Search } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import LiveCallCard from '@/components/LiveCallCard';
import { mockStats, mockCalls, mockCampaigns, mockChartData, mockWeeklyData } from '@/lib/mock-data';
import { formatDuration, formatNumber, formatPercent } from '@/lib/utils';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const Tip = ({ active, payload, label }: any) => {
  if (!active || !payload) return null;
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
      <div style={{ color: 'var(--text2)', marginBottom: 4, fontWeight: 600 }}>{label}</div>
      {payload.map((p: any) => <div key={p.name} style={{ color: p.color, fontWeight: 500 }}>{p.name}: {p.value}</div>)}
    </div>
  );
};

export default function Dashboard() {
  const liveCalls = mockCalls.filter(c => c.status === 'in-progress' || c.status === 'ringing');
  const activeCampaigns = mockCampaigns.filter(c => c.status === 'active');

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar active="/dashboard" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Topbar crumbs={[{ label: 'Dashboard' }]} />

        <PageHeader
          title="Dashboard"
          subtitle="Overview of your BPO's calling operations"
          actions={
            <>
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
                <input
                  className="input"
                  placeholder="Search..."
                  style={{ width: 220, paddingLeft: 32, height: 36, fontSize: 13 }}
                />
              </div>
              <button className="btn btn-primary btn-sm">
                <Plus size={14} /> New Campaign
              </button>
            </>
          }
        />

        <main style={{ flex: 1, padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20, background: 'var(--bg)' }}>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            <StatCard label="Calls Today" value={formatNumber(mockStats.totalCallsToday)} change={mockStats.callsChange} icon={<Phone size={18} color="#0AB4F5" />} iconBg="rgba(10,180,245,0.12)" sub="vs yesterday" />
            <StatCard label="Active Right Now" value={mockStats.activeCallsNow.toString()} icon={<Activity size={18} color="#22c55e" />} iconBg="rgba(34,197,94,0.12)" sub="live calls in progress" />
            <StatCard label="Conversion Rate" value={formatPercent(mockStats.conversionRate)} change={mockStats.conversionChange} icon={<TrendingUp size={18} color="#f59e0b" />} iconBg="rgba(245,158,11,0.12)" sub="calls converted" />
            <StatCard label="Avg Duration" value={formatDuration(mockStats.avgCallDuration)} icon={<Clock size={18} color="#06b6d4" />} iconBg="rgba(6,182,212,0.12)" sub="per completed call" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div><div style={{ fontWeight: 600, marginBottom: 2 }}>Hourly Call Volume</div><div style={{ fontSize: 12, color: 'var(--text3)' }}>Calls & conversions today</div></div>
                <span className="badge badge-green">Live</span>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={mockChartData}>
                  <defs>
                    <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0AB4F5" stopOpacity={0.3}/><stop offset="95%" stopColor="#0AB4F5" stopOpacity={0}/></linearGradient>
                    <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/><stop offset="95%" stopColor="#22c55e" stopOpacity={0}/></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="hour" tick={{ fill: 'var(--text3)', fontSize: 10 }} tickLine={false} axisLine={false} interval={3} />
                  <YAxis tick={{ fill: 'var(--text3)', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip content={<Tip />} />
                  <Area type="monotone" dataKey="calls" stroke="#0AB4F5" fill="url(#g1)" strokeWidth={2} dot={false} name="Calls" />
                  <Area type="monotone" dataKey="conversions" stroke="#22c55e" fill="url(#g2)" strokeWidth={2} dot={false} name="Conversions" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="card">
              <div style={{ marginBottom: 20 }}><div style={{ fontWeight: 600, marginBottom: 2 }}>Weekly Performance</div><div style={{ fontSize: 12, color: 'var(--text3)' }}>7-day calls and conversions</div></div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={mockWeeklyData} barSize={18} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: 'var(--text3)', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: 'var(--text3)', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip content={<Tip />} />
                  <Bar dataKey="calls" fill="#0AB4F5" opacity={0.8} radius={[4,4,0,0]} name="Calls" />
                  <Bar dataKey="converted" fill="#22c55e" opacity={0.8} radius={[4,4,0,0]} name="Converted" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontWeight: 600 }}>Active Campaigns</div>
                <a href="/campaigns" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>View all →</a>
              </div>
              <table className="table">
                <thead><tr><th>Campaign</th><th>Agent</th><th>Progress</th><th>Conv.</th><th></th></tr></thead>
                <tbody>
                  {activeCampaigns.map(c => {
                    const pct = Math.round((c.called / c.totalContacts) * 100);
                    const cv = c.called > 0 ? ((c.converted / c.called) * 100).toFixed(1) : '0';
                    return (
                      <tr key={c.id}>
                        <td><div>{c.name}</div><div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{c.totalContacts.toLocaleString()} contacts</div></td>
                        <td><span className="badge badge-purple">{c.agentName}</span></td>
                        <td style={{ width: 140 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div className="progress" style={{ flex: 1 }}><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
                            <span style={{ fontSize: 11, color: 'var(--text3)' }}>{pct}%</span>
                          </div>
                        </td>
                        <td><span style={{ color: 'var(--green)', fontWeight: 600 }}>{cv}%</span></td>
                        <td><button className="btn btn-ghost btn-sm"><PauseCircle size={13} /></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontWeight: 600 }}>Live Calls</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div className="live-dot" />
                  <span style={{ fontSize: 12, color: 'var(--green)' }}>{liveCalls.length} active</span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', maxHeight: 340 }}>
                {liveCalls.map(c => <LiveCallCard key={c.id} call={c} />)}
              </div>
              <a href="/calls" style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none', textAlign: 'center', fontWeight: 500 }}>View all →</a>
            </div>
          </div>

        </main>
      </div>
    </div>
  );
}
