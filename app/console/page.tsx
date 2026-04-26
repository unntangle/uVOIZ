"use client";
import { useEffect, useState } from 'react';
import { Building2, Phone, Bot, IndianRupee, Activity, Plus, Search, Users, ArrowRight, Loader2 } from 'lucide-react';
import Link from 'next/link';
import ConsoleTopbar from './ConsoleTopbar';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';

interface GlobalStats {
  totalBPOs: number;
  totalActiveCalls: number;
  totalAgents: number;
  totalMinutesUsed: number;
  revenueEstimate: number;
}

interface BPOClient {
  id: string;
  name: string;
  plan: string;
  minutes_used: number;
  minutes_limit: number;
  user_count?: number;
  created_at: string;
}

const PLAN_BADGE: Record<string, string> = {
  starter: 'badge-gray',
  pro:     'badge-gray',
  agency:  'badge-gray',
};

export default function ConsoleDashboard() {
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [orgs, setOrgs] = useState<BPOClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [statsRes, orgsRes] = await Promise.all([
          fetch('/api/admin/stats'),
          fetch('/api/admin/orgs'),
        ]);
        if (!cancelled && statsRes.ok) setStats(await statsRes.json());
        if (!cancelled && orgsRes.ok) {
          const data = await orgsRes.json();
          setOrgs(data.orgs || []);
        }
      } catch (err) {
        console.error('Failed to load console data:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filteredOrgs = orgs.filter(o =>
    o.name.toLowerCase().includes(query.toLowerCase())
  );

  // Format INR money — used for MRR card
  const inr = (n: number) => `₹${(n || 0).toLocaleString('en-IN')}`;

  return (
    <>
      <ConsoleTopbar crumbs={[{ label: 'Global Overview' }]} />

      <PageHeader
        title="Global Overview"
        subtitle="Operator view across every BPO on the Unntangle platform"
        actions={
          <button className="btn btn-primary btn-sm">
            <Plus size={14} /> Add BPO Client
          </button>
        }
      />

      <main style={{
        flex: 1, padding: 24, overflowY: 'auto',
        display: 'flex', flexDirection: 'column', gap: 20,
        background: 'var(--bg)',
      }}>

        {/* Stat cards row — monochrome icons in console (operator mode) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          <StatCard
            label="Total BPOs"
            value={(stats?.totalBPOs || 0).toString()}
            icon={<Building2 size={18} color="var(--text)" />}
            iconBg="var(--bg3)"
            sub="Active workspaces"
          />
          <StatCard
            label="Estimated MRR"
            value={inr(stats?.revenueEstimate || 0)}
            icon={<IndianRupee size={18} color="var(--text)" />}
            iconBg="var(--bg3)"
            sub="Based on active plans"
          />
          <StatCard
            label="Minutes Consumed"
            value={(stats?.totalMinutesUsed || 0).toLocaleString('en-IN')}
            icon={<Activity size={18} color="var(--text)" />}
            iconBg="var(--bg3)"
            sub="Across all BPOs this month"
          />
          <StatCard
            label="AI Agents Deployed"
            value={(stats?.totalAgents || 0).toString()}
            icon={<Bot size={18} color="var(--text)" />}
            iconBg="var(--bg3)"
            sub="Live across the platform"
          />
        </div>

        {/* Active BPO Clients */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '16px 20px', borderBottom: '1px solid var(--border)',
            gap: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>Active BPO Clients</div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                  {orgs.length} total · {filteredOrgs.length} shown
                </div>
              </div>
            </div>

            <div style={{ position: 'relative' }}>
              <Search
                size={13}
                style={{
                  position: 'absolute', left: 11, top: '50%',
                  transform: 'translateY(-50%)', color: 'var(--text3)',
                }}
              />
              <input
                className="input"
                placeholder="Search clients..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                style={{ width: 240, paddingLeft: 32, height: 36, fontSize: 13 }}
              />
            </div>
          </div>

          {loading ? (
            <div style={{
              padding: '60px 20px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text3)', fontSize: 13,
            }}>
              <Loader2 size={18} style={{ animation: 'spin 0.8s linear infinite', marginRight: 10 }} />
              Loading clients...
            </div>
          ) : filteredOrgs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text3)' }}>
              <Users size={28} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text2)' }}>
                {query ? 'No matches found' : 'No BPO clients yet'}
              </div>
              <div style={{ fontSize: 12, marginTop: 4 }}>
                {query ? 'Try a different search' : 'Clients will appear here once they sign up'}
              </div>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Plan</th>
                  <th>Minutes Usage</th>
                  <th>Status</th>
                  <th style={{ width: 120 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrgs.map(org => {
                  const limitDisplay = org.minutes_limit === 999999
                    ? '∞'
                    : org.minutes_limit.toLocaleString('en-IN');
                  const pct = org.minutes_limit === 999999
                    ? 0
                    : Math.min(100, Math.round(((org.minutes_used || 0) / org.minutes_limit) * 100));
                  const planClass = PLAN_BADGE[org.plan] || 'badge-gray';

                  return (
                    <tr key={org.id}>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--text)' }}>{org.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, fontFamily: 'monospace' }}>
                          {org.id.slice(0, 8)}…
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${planClass}`} style={{ textTransform: 'capitalize' }}>
                          {org.plan}
                        </span>
                      </td>
                      <td style={{ width: 240 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div className="progress" style={{ flex: 1 }}>
                            <div
                              className="progress-fill"
                              style={{
                                width: `${pct}%`,
                                /* In monochrome console, only flag overruns —
                                   normal usage stays neutral grey. */
                                background: pct > 90 ? 'var(--red)'
                                          : pct > 70 ? 'var(--amber)'
                                          : 'var(--text2)',
                              }}
                            />
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap' }}>
                            {(org.minutes_used || 0).toLocaleString('en-IN')} / {limitDisplay}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          fontSize: 12, fontWeight: 600, color: 'var(--green)',
                        }}>
                          <div className="live-dot" />
                          Active
                        </span>
                      </td>
                      <td>
                        <Link
                          href={`/console/clients/${org.id}`}
                          className="btn btn-ghost btn-sm"
                          style={{ textDecoration: 'none' }}
                        >
                          Manage <ArrowRight size={12} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Quick links — monochrome to match the rest of the operator surface */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {[
            { label: 'BPO Clients',      href: '/console/clients', icon: Users },
            { label: 'Platform Billing', href: '/console/billing', icon: IndianRupee },
            { label: 'System Health',    href: '/console/health',  icon: Activity },
            { label: 'Active Calls',     href: '/console/clients', icon: Phone },
          ].map(q => {
            const QIcon = q.icon;
            return (
              <Link
                key={q.label}
                href={q.href}
                className="card"
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '16px',
                  textDecoration: 'none',
                  cursor: 'pointer',
                  transition: 'transform 0.15s, border-color 0.15s',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
                  (e.currentTarget as HTMLElement).style.borderColor = 'var(--border2)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                  (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
                }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: 'var(--bg3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <QIcon size={16} color="var(--text)" />
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                  {q.label}
                </div>
              </Link>
            );
          })}
        </div>

      </main>
    </>
  );
}
