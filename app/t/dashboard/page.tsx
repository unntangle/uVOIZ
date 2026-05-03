"use client";
import { useState, useEffect } from 'react';
import { Phone, TrendingUp, Clock, Activity, PauseCircle, Plus, Search, Calendar, ChevronRight, User, Bot, CreditCard, BarChart3 } from 'lucide-react';
import Topbar from '@/components/Topbar';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import LiveCallCard from '@/components/LiveCallCard';
import EmptyChart from '@/components/EmptyChart';
import { formatDuration, formatNumber, formatPercent } from '@/lib/utils';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Call, Campaign, DashboardStats } from '@/types';

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
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [calls, setCalls] = useState<Call[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [statsRes, callsRes, campaignsRes] = await Promise.all([
          fetch('/api/analytics/stats'),
          fetch('/api/calls'),
          fetch('/api/campaigns'),
        ]);

        if (statsRes.ok) setStats(await statsRes.json());
        if (callsRes.ok) {
          const data = await callsRes.json();
          setCalls(data.calls || []);
        }
        if (campaignsRes.ok) {
          const data = await campaignsRes.json();
          setCampaigns(data.campaigns || []);
        }
      } catch (err) {
        console.error('Failed to fetch dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const liveCalls = calls.filter(c => c.status === 'in-progress' || c.status === 'ringing');
  const activeCampaigns = campaigns.filter(c => c.status === 'active').slice(0, 5);
  const recentCalls = calls.slice(0, 5);

  // Build hourly series from real call data. Empty array (length 0) means
  // no calls today — we render an empty state instead of a flat-line chart.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const hourlyData: { hour: string; calls: number; conversions: number }[] = Array.from({ length: 24 }, (_, h) => ({
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

  // Build weekly aggregates (last 7 days) from real call data
  const weeklyData: { day: string; calls: number; converted: number }[] = [];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
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

  return (
    <>
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

          {/* Stat Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            <StatCard 
              label="Calls Today" 
              value={formatNumber(stats?.totalCallsToday || 0)} 
              change={stats?.callsChange} 
              icon={<Phone size={18} color="#0AB4F5" />} 
              iconBg="rgba(10,180,245,0.12)" 
              sub="vs yesterday" 
            />
            <StatCard 
              label="Active Right Now" 
              value={(stats?.activeCallsNow || 0).toString()} 
              icon={<Activity size={18} color="#22c55e" />} 
              iconBg="rgba(34,197,94,0.12)" 
              sub="live calls in progress" 
            />
            <StatCard 
              label="Conversion Rate" 
              value={formatPercent(stats?.conversionRate || 0)} 
              change={stats?.conversionChange} 
              icon={<TrendingUp size={18} color="#f59e0b" />} 
              iconBg="rgba(245,158,11,0.12)" 
              sub="calls converted" 
            />
            <StatCard 
              label="Avg Duration" 
              value={formatDuration(stats?.avgCallDuration || 0)} 
              icon={<Clock size={18} color="#06b6d4" />} 
              iconBg="rgba(6,182,212,0.12)" 
              sub="per completed call" 
            />
          </div>

          {/* Charts Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div><div style={{ fontWeight: 600, marginBottom: 2 }}>Hourly Call Volume</div><div style={{ fontSize: 12, color: 'var(--text3)' }}>Calls & conversions today</div></div>
                {hasHourlyData && <span className="badge badge-green">Live</span>}
              </div>
              {hasHourlyData ? (
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={hourlyData}>
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
              ) : (
                <EmptyChart
                  icon={<Phone size={28} />}
                  title="No calls today"
                  message="Hourly call volume will show up here once your campaigns start dialing."
                  height={180}
                />
              )}
            </div>
            <div className="card">
              <div style={{ marginBottom: 20 }}><div style={{ fontWeight: 600, marginBottom: 2 }}>Weekly Performance</div><div style={{ fontSize: 12, color: 'var(--text3)' }}>7-day calls and conversions</div></div>
              {hasWeeklyData ? (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={weeklyData} barSize={18} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="day" tick={{ fill: 'var(--text3)', fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: 'var(--text3)', fontSize: 10 }} tickLine={false} axisLine={false} />
                    <Tooltip content={<Tip />} />
                    <Bar dataKey="calls" fill="#0AB4F5" opacity={0.8} radius={[4,4,0,0]} name="Calls" />
                    <Bar dataKey="converted" fill="#22c55e" opacity={0.8} radius={[4,4,0,0]} name="Converted" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart
                  icon={<BarChart3 size={28} />}
                  title="No data yet"
                  message="Weekly performance will populate once you have completed calls."
                  height={180}
                />
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
            {/* Active Campaigns */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontWeight: 600 }}>Active Campaigns</div>
                <a href="/app/campaigns" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>View all →</a>
              </div>
              <table className="table">
                <thead><tr><th>Campaign</th><th>Agent</th><th>Progress</th><th>Conv.</th><th></th></tr></thead>
                <tbody>
                  {activeCampaigns.length > 0 ? activeCampaigns.map(c => {
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
                  }) : (
                    <tr><td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: 'var(--text3)', fontSize: 13 }}>No active campaigns</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Live Calls Feed */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontWeight: 600 }}>Live Calls</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div className="live-dot" />
                  <span style={{ fontSize: 12, color: 'var(--green)' }}>{liveCalls.length} active</span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', maxHeight: 340 }}>
                {liveCalls.length > 0 ? liveCalls.map(c => <LiveCallCard key={c.id} call={c} />) : (
                  <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text3)', fontSize: 12 }}>No live calls at the moment</div>
                )}
              </div>
              <a href="/app/calls" style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none', textAlign: 'center', fontWeight: 500 }}>View all →</a>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            {[
              { label: 'New Agent', icon: Bot, href: '/app/agents', color: 'var(--accent)' },
              { label: 'Upload Contacts', icon: User, href: '/app/campaigns', color: 'var(--green)' },
              { label: 'View Analytics', icon: TrendingUp, href: '/app/analytics', color: 'var(--amber)' },
              { label: 'Buy Minutes', icon: CreditCard, href: '/app/billing', color: 'var(--red)' },
            ].map(a => (
              <a key={a.label} href={a.href} className="card" style={{ 
                display: 'flex', alignItems: 'center', gap: 12, padding: '16px', 
                textDecoration: 'none', transition: 'transform 0.15s, border-color 0.15s',
                cursor: 'pointer'
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
                (e.currentTarget as HTMLElement).style.borderColor = a.color;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
              }}
              >
                <div style={{ 
                  width: 32, height: 32, borderRadius: 8, background: 'var(--bg3)', 
                  display: 'flex', alignItems: 'center', justifyContent: 'center' 
                }}>
                  <a.icon size={16} color={a.color} />
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{a.label}</div>
              </a>
            ))}
          </div>

          {/* New Recent Activity Section */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontWeight: 600 }}>Recent Activity</div>
              <button className="btn btn-ghost btn-sm">Refresh</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {recentCalls.length > 0 ? recentCalls.map((c, i) => (
                <div key={c.id} style={{ 
                  display: 'flex', alignItems: 'center', gap: 16, padding: '12px 0',
                  borderBottom: i === recentCalls.length - 1 ? 'none' : '1px solid var(--border)' 
                }}>
                  <div style={{ 
                    width: 36, height: 36, borderRadius: '50%', 
                    background: c.converted ? 'var(--green-soft)' : 'var(--bg3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    {c.converted ? <TrendingUp size={16} color="var(--green)" /> : <User size={16} color="var(--text3)" />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>
                      Call with <span style={{ fontWeight: 600 }}>{c.contactName}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                      {c.campaignName} · Agent: {c.agentName}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: c.converted ? 'var(--green)' : 'var(--text)' }}>
                      {c.converted ? 'Converted' : c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                      {c.duration > 0 ? formatDuration(c.duration) : 'Just now'}
                    </div>
                  </div>
                  <ChevronRight size={16} color="var(--text3)" />
                </div>
              )) : (
                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text3)', fontSize: 13 }}>No recent activity</div>
              )}
            </div>
          </div>

        </main>
    </>
  );
}
