"use client";
import { useEffect, useState } from 'react';
import { Building2, PhoneCall, Bot, DollarSign, Activity } from 'lucide-react';

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

export default function AdminDashboard() {
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [orgs, setOrgs] = useState<BPOClient[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [statsRes, orgsRes] = await Promise.all([
          fetch('/api/admin/stats'),
          fetch('/api/admin/orgs')
        ]);
        
        if (statsRes.ok) {
          setStats(await statsRes.json());
        }
        if (orgsRes.ok) {
          const data = await orgsRes.json();
          setOrgs(data.orgs || []);
        }
      } catch (err) {
        console.error("Failed to load admin data", err);
      } finally {
        setLoading(false);
      }
    }
    
    loadData();
  }, []);

  if (loading) {
    return <div style={{ padding: 40, color: '#64748b' }}>Loading master dashboard...</div>;
  }

  return (
    <main style={{ padding: '32px 40px', overflowY: 'auto', flex: 1 }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>Global Overview</h1>
        <p style={{ color: '#64748b', fontSize: 14 }}>Welcome back to the Unntangle Master Dashboard.</p>
      </div>

      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20, marginBottom: 40 }}>
        <div style={{ background: '#fff', padding: 24, borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ width: 40, height: 40, borderRadius: 8, background: '#eff6ff', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Building2 size={20} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Total BPOs</div>
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#0f172a' }}>{stats?.totalBPOs || 0}</div>
        </div>

        <div style={{ background: '#fff', padding: 24, borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ width: 40, height: 40, borderRadius: 8, background: '#f0fdf4', color: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <DollarSign size={20} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Est. Monthly MRR</div>
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#0f172a' }}>${stats?.revenueEstimate?.toLocaleString() || 0}</div>
        </div>

        <div style={{ background: '#fff', padding: 24, borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ width: 40, height: 40, borderRadius: 8, background: '#fef2f2', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Activity size={20} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Total Minutes Consumed</div>
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#0f172a' }}>{stats?.totalMinutesUsed?.toLocaleString() || 0}</div>
        </div>

        <div style={{ background: '#fff', padding: 24, borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ width: 40, height: 40, borderRadius: 8, background: '#fdf4ff', color: '#d946ef', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Bot size={20} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Total Global Agents</div>
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#0f172a' }}>{stats?.totalAgents || 0}</div>
        </div>
      </div>

      {/* Orgs Table */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a' }}>Active BPO Clients</h2>
          <button style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            + Add Client
          </button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f8fafc', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '16px 24px', fontWeight: 500 }}>Client Name</th>
                <th style={{ padding: '16px 24px', fontWeight: 500 }}>Plan</th>
                <th style={{ padding: '16px 24px', fontWeight: 500 }}>Minutes Used</th>
                <th style={{ padding: '16px 24px', fontWeight: 500 }}>Status</th>
                <th style={{ padding: '16px 24px', fontWeight: 500 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((org) => {
                const limit = org.minutes_limit === 999999 ? '∞' : org.minutes_limit.toLocaleString();
                const usagePercent = org.minutes_limit === 999999 ? 0 : Math.min(100, Math.round(((org.minutes_used || 0) / org.minutes_limit) * 100));
                
                return (
                  <tr key={org.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '16px 24px' }}>
                      <div style={{ fontWeight: 500, color: '#0f172a' }}>{org.name}</div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>ID: {org.id.slice(0, 8)}...</div>
                    </td>
                    <td style={{ padding: '16px 24px' }}>
                      <span style={{ 
                        background: '#f1f5f9', color: '#475569', padding: '4px 10px', 
                        borderRadius: 999, fontSize: 12, fontWeight: 500, textTransform: 'capitalize' 
                      }}>
                        {org.plan}
                      </span>
                    </td>
                    <td style={{ padding: '16px 24px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ flex: 1, height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${usagePercent}%`, height: '100%', background: usagePercent > 90 ? '#ef4444' : '#3b82f6' }} />
                        </div>
                        <div style={{ fontSize: 13, color: '#475569', minWidth: 60 }}>
                          {org.minutes_used?.toLocaleString() || 0} / {limit}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '16px 24px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#16a34a', fontSize: 13, fontWeight: 500 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a' }} />
                        Active
                      </span>
                    </td>
                    <td style={{ padding: '16px 24px' }}>
                      <button style={{ background: 'none', border: '1px solid #e2e8f0', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 13, color: '#475569', fontWeight: 500 }}>
                        Manage
                      </button>
                    </td>
                  </tr>
                );
              })}
              {orgs.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
                    No BPO clients found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
