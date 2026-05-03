"use client";
import { useState } from 'react';
import Topbar from '@/components/Topbar';
import PageHeader from '@/components/PageHeader';
import { Plus, MoreVertical, Mail, Shield, ShieldCheck, UserPlus } from 'lucide-react';

const MOCK_MEMBERS = [
  { id: 1, name: 'Gokul Sridharan', email: 'gokul@uvoiz.com', role: 'admin',   status: 'Active',  lastSeen: '2 hours ago' },
  { id: 2, name: 'Sarah Chen',      email: 'sarah@uvoiz.com', role: 'admin',   status: 'Active',  lastSeen: '5 minutes ago' },
  { id: 3, name: 'Alex Kumar',      email: 'alex@uvoiz.com',  role: 'manager', status: 'Active',  lastSeen: '1 day ago' },
  { id: 4, name: 'Priya Sharma',    email: 'priya@uvoiz.com', role: 'manager', status: 'Invited', lastSeen: '—' },
];

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  manager: 'Manager',
};

const ROLE_DESC: Record<string, string> = {
  admin: 'Full access including billing, team, and settings',
  manager: 'Run campaigns and view analytics. No billing or team access.',
};

export default function TeamPage() {
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'manager'>('manager');

  return (
    <>
      <Topbar crumbs={[{ label: 'Dashboard', href: '/app/dashboard' }, { label: 'Team' }]} />

        <PageHeader
          title="Team"
          subtitle="Manage who can access your uVOiZ workspace"
          actions={
            <button className="btn btn-primary btn-sm" onClick={() => setShowInvite(true)}>
              <UserPlus size={14} /> Invite Member
            </button>
          }
        />

        <main style={{ flex: 1, padding: 24, overflowY: 'auto', background: 'var(--bg)' }}>
          {/* Role explainer */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
            <div className="card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <ShieldCheck size={18} color="var(--accent)" />
                <div style={{ fontWeight: 600 }}>{ROLE_LABEL.admin}</div>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text3)' }}>{ROLE_DESC.admin}</div>
            </div>
            <div className="card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <Shield size={18} color="var(--text3)" />
                <div style={{ fontWeight: 600 }}>{ROLE_LABEL.manager}</div>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text3)' }}>{ROLE_DESC.manager}</div>
            </div>
          </div>

          {/* Members table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 600 }}>Workspace Members ({MOCK_MEMBERS.length})</div>
            </div>
            <table className="table" style={{ marginBottom: 0 }}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Last seen</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {MOCK_MEMBERS.map(m => (
                  <tr key={m.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: 8,
                          background: 'linear-gradient(135deg, var(--accent), var(--accent2))',
                          color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 12, fontWeight: 700,
                        }}>{m.name.charAt(0)}</div>
                        <div style={{ fontWeight: 500 }}>{m.name}</div>
                      </div>
                    </td>
                    <td style={{ color: 'var(--text2)' }}>{m.email}</td>
                    <td>
                      <span className={`badge ${m.role === 'admin' ? 'badge-purple' : 'badge-green'}`}>
                        {ROLE_LABEL[m.role]}
                      </span>
                    </td>
                    <td>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        fontSize: 12, fontWeight: 500,
                        color: m.status === 'Active' ? 'var(--green)' : 'var(--amber)',
                      }}>
                        <div style={{
                          width: 6, height: 6, borderRadius: '50%',
                          background: m.status === 'Active' ? 'var(--green)' : 'var(--amber)',
                        }} />
                        {m.status}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text3)', fontSize: 13 }}>{m.lastSeen}</td>
                    <td>
                      <button className="btn btn-ghost btn-sm">
                        <MoreVertical size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>

      {/* Invite modal */}
      {showInvite && (
        <div
          onClick={() => setShowInvite(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="card"
            style={{ width: 440, padding: 24 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <Mail size={18} color="var(--accent)" />
              <div style={{ fontWeight: 600, fontSize: 16 }}>Invite a team member</div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 500, display: 'block', marginBottom: 6 }}>
                Email address
              </label>
              <input
                className="input"
                type="email"
                placeholder="teammate@yourbpo.com"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 500, display: 'block', marginBottom: 6 }}>
                Role
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {(['admin', 'manager'] as const).map(r => (
                  <button
                    key={r}
                    onClick={() => setInviteRole(r)}
                    style={{
                      padding: 12, borderRadius: 8,
                      border: `1.5px solid ${inviteRole === r ? 'var(--accent)' : 'var(--border)'}`,
                      background: inviteRole === r ? 'var(--accent-soft)' : 'var(--bg2)',
                      cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: 2 }}>{ROLE_LABEL[r]}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>{ROLE_DESC[r]}</div>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowInvite(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" disabled={!inviteEmail}>
                <Plus size={14} /> Send Invite
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
