// Workspace settings page — General / Members / Groups / Invites / Billing / Security / Audit / Danger.

function WorkspaceSettings({ variant = 'refined', tab = 'members' }) {
  const isBold = variant === 'bold';
  const tabs = [
    { id: 'general',  label: 'General',   icon: 'settings' },
    { id: 'members',  label: 'Members',   icon: 'users', count: 47 },
    { id: 'groups',   label: 'Groups',    icon: 'layers', count: 5 },
    { id: 'invites',  label: 'Invites',   icon: 'send', count: 3 },
    { id: 'billing',  label: 'Billing',   icon: 'creditCard' },
    { id: 'security', label: 'Security',  icon: 'shield' },
    { id: 'audit',    label: 'Audit',     icon: 'eye' },
    { id: 'danger',   label: 'Danger',    icon: 'alert' },
  ];

  return (
    <div className={`surface ${isBold ? 'bold' : ''}`}>
      <Chrome url="acme.unichat.app/workspaces/acme-hq/settings" />
      <div className="body">
        <Sidebar active="members" />
        <div className="main">
          <PageHeader
            crumbs={['Acme HQ', 'Settings']}
            title="Workspace settings"
            subtitle="Manage members, groups, billing, and security policies"
            actions={
              <>
                <span className="badge badge-violet"><Icon name="shield" className="ico-sm"/>Owner</span>
              </>
            }
          />

          <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
            {/* Settings nav */}
            <div style={{
              width: 220, background: 'var(--bg-1)',
              borderRight: '1px solid var(--line)', padding: '16px 12px',
              flexShrink: 0,
            }}>
              <div className="col gap-1">
                {tabs.map(t => (
                  <div key={t.id} className={`nav-item ${tab === t.id ? 'active' : ''}`}>
                    <Icon name={t.icon} className="ico"/>
                    <span className="grow">{t.label}</span>
                    {t.count !== undefined && (
                      <span className="xs muted mono">{t.count}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="main-scroll" style={{ padding: 24, background: 'var(--bg-0)' }}>
              {tab === 'members' && <MembersTab isBold={isBold}/>}
              {tab === 'billing' && <BillingTab isBold={isBold}/>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MembersTab({ isBold }) {
  return (
    <div style={{ maxWidth: 920 }}>
      {/* Invite */}
      <Section
        title="Invite members"
        hint="Send invites by email or paste a list. New invites use SSO when enforced."
      >
        <div className="row gap-2">
          <input className="input" placeholder="Add by email — name@acme.com, name2@acme.com…" style={{ flex: 1 }}/>
          <select className="input" style={{ width: 140 }}>
            <option>Editor</option><option>Viewer</option><option>Admin</option>
            <option>Billing admin</option><option>Guest</option>
          </select>
          <select className="input" style={{ width: 180 }}>
            <option>No group</option>
            {GROUPS.map(g => <option key={g.id}>{g.name}</option>)}
          </select>
          <button className="btn btn-primary"><Icon name="send" className="ico-sm"/>Send invite</button>
        </div>
        <div className="row gap-2 items-center mt-3">
          <div className="row gap-1 items-center xs muted"><Icon name="link" className="ico-sm"/>Invite link</div>
          <code className="mono xs" style={{
            flex: 1, padding: '5px 9px', background: 'var(--bg-2)',
            border: '1px solid var(--line)', borderRadius: 6, color: 'var(--fg-2)',
          }}>https://acme.unichat.app/invite/4f2a-…-9c</code>
          <button className="btn btn-secondary btn-sm"><Icon name="copy" className="ico-sm"/>Copy</button>
          <button className="btn btn-ghost btn-sm"><Icon name="refresh" className="ico-sm"/>Rotate</button>
        </div>
      </Section>

      {/* Members */}
      <div className="mt-4">
        <Section
          title="Members"
          hint="47 active · 3 pending · 13 seats remaining"
          padded={false}
          action={
            <div className="row gap-2 items-center">
              <div className="row gap-1 items-center" style={{
                background: 'var(--bg-0)', border: '1px solid var(--line-2)',
                borderRadius: 7, padding: '4px 9px', height: 28, width: 220,
              }}>
                <Icon name="search" className="ico-sm" style={{ color: 'var(--fg-3)' }}/>
                <input placeholder="Search members…" style={{
                  background: 'transparent', border: 'none', outline: 'none',
                  color: 'var(--fg-1)', fontSize: 12, flex: 1, fontFamily: 'inherit',
                }}/>
              </div>
              <span className="seg">
                <span className="seg-item active">All</span>
                <span className="seg-item">Active</span>
                <span className="seg-item">Pending</span>
                <span className="seg-item">Suspended</span>
              </span>
            </div>
          }
        >
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 30 }}><input type="checkbox" /></th>
                <th>Name</th>
                <th>Role</th>
                <th>Groups</th>
                <th>Last active</th>
                <th>Joined</th>
                <th>Auth</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {USERS.map(u => (
                <tr key={u.id}>
                  <td><input type="checkbox"/></td>
                  <td>
                    <div className="row gap-2 items-center">
                      <Avatar user={u} size="sm"/>
                      <div className="col">
                        <span style={{ fontWeight: 500, color: 'var(--fg-0)' }}>{u.name}</span>
                        <span className="xs muted">{u.email}</span>
                      </div>
                    </div>
                  </td>
                  <td><RoleBadge role={u.role}/></td>
                  <td>
                    <div className="row gap-1 flex-wrap">
                      {u.role === 'owner' && <span className="badge badge-blue"><span className="pc" style={{background:'#5c9aed'}}/>Engineering</span>}
                      {u.role === 'admin' && <span className="badge badge-violet"><span className="pc" style={{background:'#a78bfa'}}/>Design</span>}
                      {u.role === 'editor' && <span className="badge badge-green"><span className="pc" style={{background:'#10b981'}}/>{u.id === 'u3' ? 'Customer Success' : u.id === 'u4' ? 'Engineering' : 'Marketing'}</span>}
                      {u.role === 'guest' && <span className="badge badge-pink">External</span>}
                    </div>
                  </td>
                  <td><span className="xs muted">{['2m','14m','1h','3h','5h','1d','2d','—','3d'][USERS.indexOf(u)]}</span></td>
                  <td><span className="xs muted">{['Jan 14','Feb 2','Feb 18','Mar 3','Mar 8','Mar 14','Apr 1','Apr 12','Apr 19'][USERS.indexOf(u)]}</span></td>
                  <td>
                    {u.role === 'guest'
                      ? <span className="badge badge-neutral"><Icon name="key" className="ico-sm"/>Password</span>
                      : <span className="badge badge-blue"><Icon name="shieldCheck" className="ico-sm"/>SSO</span>}
                  </td>
                  <td><Icon name="more" className="ico-sm" style={{ color: 'var(--fg-3)', cursor: 'pointer' }}/></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      </div>
    </div>
  );
}

function BillingTab({ isBold }) {
  return (
    <div style={{ maxWidth: 920 }}>
      <Section title="Plan" hint="Enterprise · billed annually">
        <div className="row gap-4 items-center">
          <div className="grow">
            <div className="row gap-2 items-center mb-1">
              <span style={{ fontSize: 18, fontWeight: 600 }}>Enterprise</span>
              <span className="badge badge-violet">Active</span>
            </div>
            <span className="small muted">60 seats · $25 per seat / month · renews Aug 14, 2026</span>
          </div>
          <button className="btn btn-secondary">Manage plan</button>
        </div>
      </Section>

      <div className="grid-3 mt-4">
        <StatTile label="Seats used" value="47 / 60" hint="13 available" accent="#5c9aed"/>
        <StatTile label="Spend MTD" value="$3,847" hint="of $5,200 budget" accent="#f59e0b"/>
        <StatTile label="Tokens this month" value="142.4M" hint="Reset May 1" accent="#10b981"/>
      </div>

      <div className="mt-4">
        <Section title="Model spend by project" hint="Top consumers, this billing cycle">
          <div className="col">
            {PROJECTS.slice(0, 5).map((p, i) => {
              const cost = [1240, 890, 612, 480, 290][i];
              const pct = [38, 27, 19, 11, 5][i];
              return (
                <div key={p.id} className="row items-center gap-3 py-2" style={{ borderBottom: i < 4 ? '1px solid var(--line)' : 'none' }}>
                  <span className="ptile ptile-sm" style={{ background: p.color }}>
                    <Icon name={p.icon} className="ico-sm" style={{ color: 'white' }}/>
                  </span>
                  <span className="small grow" style={{ color: 'var(--fg-1)' }}>{p.name}</span>
                  <div style={{ width: 200, height: 6, background: 'var(--bg-3)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${pct * 2.5}%`, height: '100%', background: p.color }}/>
                  </div>
                  <span className="xs mono muted-2" style={{ width: 70, textAlign: 'right', fontWeight: 500 }}>${cost.toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        </Section>
      </div>

      <div className="mt-4">
        <Section title="Spend limits" hint="Hard caps per scope. Workspace owners get notified at 80%.">
          <div className="col gap-3">
            <LimitRow label="Workspace monthly" used={3847} cap={5200} />
            <LimitRow label="Per-user daily"     used={42}  cap={100} unit="$"/>
            <LimitRow label="GPT-4o tokens / day" used={2.4} cap={5} unit="M"/>
          </div>
        </Section>
      </div>
    </div>
  );
}

function LimitRow({ label, used, cap, unit = '$' }) {
  const pct = Math.min(100, (used / cap) * 100);
  const color = pct > 80 ? 'var(--err)' : pct > 60 ? 'var(--warn)' : 'var(--ok)';
  return (
    <div>
      <div className="row items-center between mb-1">
        <span className="small" style={{ color: 'var(--fg-1)' }}>{label}</span>
        <span className="xs mono muted-2">{unit}{used.toLocaleString()} / {unit}{cap.toLocaleString()}</span>
      </div>
      <div style={{ height: 6, background: 'var(--bg-3)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color }}/>
      </div>
    </div>
  );
}

window.WorkspaceSettings = WorkspaceSettings;
