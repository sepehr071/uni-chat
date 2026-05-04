// Shared shell pieces: window chrome, sidebar, page header, role badges, etc.

function Chrome({ url }) {
  return (
    <div className="chrome">
      <div className="dots">
        <span className="dot" style={{background:'#3a3a42'}} />
        <span className="dot" style={{background:'#3a3a42'}} />
        <span className="dot" style={{background:'#3a3a42'}} />
      </div>
      <div className="url mono truncate">{url}</div>
      <div style={{flex:1}} />
      <div className="row gap-2">
        <Icon name="bell"   className="ico" style={{color:'var(--fg-3)'}} />
        <Icon name="inbox"  className="ico" style={{color:'var(--fg-3)'}} />
      </div>
    </div>
  );
}

function Avatar({ user, size = 'md' }) {
  const cls = size === 'sm' ? 'avatar avatar-sm' : size === 'lg' ? 'avatar avatar-lg' : 'avatar';
  return (
    <span className={cls} style={{ background: avatarBg(user.hue), color: '#fff' }}>
      {initials(user.name)}
    </span>
  );
}

function AvatarStack({ users, max = 4, size = 'sm' }) {
  const shown = users.slice(0, max);
  const more = users.length - shown.length;
  return (
    <span className="avatar-stack">
      {shown.map(u => <Avatar key={u.id} user={u} size={size} />)}
      {more > 0 && (
        <span className={size === 'sm' ? 'avatar avatar-sm' : 'avatar'} style={{ background: 'var(--bg-3)', color: 'var(--fg-2)' }}>
          +{more}
        </span>
      )}
    </span>
  );
}

const ROLE_STYLES = {
  owner:           { cls: 'badge-violet',  label: 'Owner',         icon: 'shield' },
  admin:           { cls: 'badge-blue',    label: 'Admin',         icon: 'shieldCheck' },
  'billing-admin': { cls: 'badge-amber',   label: 'Billing admin', icon: 'creditCard' },
  editor:          { cls: 'badge-green',   label: 'Editor',        icon: 'pencil' },
  viewer:          { cls: 'badge-neutral', label: 'Viewer',        icon: 'eye' },
  guest:           { cls: 'badge-pink',    label: 'Guest',         icon: 'externalLink' },
};

function RoleBadge({ role }) {
  const s = ROLE_STYLES[role] || ROLE_STYLES.viewer;
  return (
    <span className={`badge ${s.cls}`}>
      <Icon name={s.icon} className="ico-sm" />
      {s.label}
    </span>
  );
}

function Sidebar({ active = 'projects', workspaceName = 'Acme HQ', workspaceType = 'team' }) {
  const items = [
    { id: 'home', label: 'Home',     icon: 'sparkle' },
    { id: 'chat', label: 'Chat',     icon: 'message' },
    { id: 'projects', label: 'Projects', icon: 'folderOpen' },
    { id: 'knowledge', label: 'Knowledge', icon: 'database' },
    { id: 'arena', label: 'Arena',   icon: 'zap' },
    { id: 'workflow', label: 'Workflows', icon: 'gitBranch' },
  ];
  const admin = [
    { id: 'overview', label: 'Workspace', icon: 'building' },
    { id: 'members',  label: 'Members',   icon: 'users' },
    { id: 'usage',    label: 'Usage & billing', icon: 'creditCard' },
    { id: 'audit',    label: 'Audit log', icon: 'shield' },
  ];
  return (
    <div className="side">
      {/* workspace switcher */}
      <div className="side-pad" style={{ borderBottom: '1px solid var(--line)' }}>
        <div className="row gap-2 items-center" style={{
          padding: '6px 8px', borderRadius: 8, cursor: 'pointer',
          background: 'var(--bg-2)', border: '1px solid var(--line)',
        }}>
          <span className="ptile ptile-sm" style={{ background: 'linear-gradient(135deg,#5c9aed,#a78bfa)' }}>A</span>
          <div className="grow col" style={{ gap: 1 }}>
            <span className="small" style={{ fontWeight: 600, color: 'var(--fg-0)' }}>{workspaceName}</span>
            <span className="xs muted">{workspaceType === 'team' ? 'Team · 47 members' : 'Personal'}</span>
          </div>
          <Icon name="chevronsUpDown" className="ico-sm" style={{ color: 'var(--fg-3)' }} />
        </div>
        <div className="row gap-1 mt-2" style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 7, padding: '4px 9px', alignItems: 'center' }}>
          <Icon name="search" className="ico-sm" style={{ color: 'var(--fg-3)' }} />
          <input placeholder="Search…" style={{
            background: 'transparent', border: 'none', outline: 'none',
            color: 'var(--fg-1)', fontSize: 12, flex: 1, padding: 0, fontFamily: 'inherit',
          }} />
          <span className="xs mono muted">⌘K</span>
        </div>
      </div>

      <div className="side-pad" style={{ flex: 1, overflow: 'auto' }}>
        <div className="col gap-1">
          {items.map(it => (
            <div key={it.id} className={`nav-item ${active === it.id ? 'active' : ''}`}>
              <Icon name={it.icon} className="ico" />
              <span>{it.label}</span>
            </div>
          ))}
        </div>

        <div className="nav-section">Pinned projects</div>
        <div className="col gap-1">
          {PROJECTS.filter(p => p.pinned).map(p => (
            <div key={p.id} className="nav-item">
              <span className="pc" style={{ background: p.color }} />
              <span className="truncate">{p.name}</span>
            </div>
          ))}
        </div>

        <div className="nav-section">Admin</div>
        <div className="col gap-1">
          {admin.map(it => (
            <div key={it.id} className={`nav-item ${active === it.id ? 'active' : ''}`}>
              <Icon name={it.icon} className="ico" />
              <span>{it.label}</span>
              {it.id === 'audit' && <span className="badge badge-neutral" style={{ marginLeft: 'auto', fontSize: 9 }}>NEW</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="side-pad" style={{ borderTop: '1px solid var(--line)' }}>
        <div className="row gap-2 items-center">
          <Avatar user={USERS[0]} size="sm" />
          <div className="grow col">
            <span className="xs" style={{ color: 'var(--fg-1)', fontWeight: 500 }}>Ava Patel</span>
            <span className="xs muted">ava@acme.com</span>
          </div>
          <Icon name="settings" className="ico-sm" style={{ color: 'var(--fg-3)' }} />
        </div>
      </div>
    </div>
  );
}

function PageHeader({ crumbs = [], title, subtitle, actions }) {
  return (
    <div style={{
      borderBottom: '1px solid var(--line)',
      padding: '14px 24px',
      background: 'var(--bg-0)',
      flexShrink: 0,
    }}>
      <div className="row gap-2 items-center xs muted mb-2">
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <Icon name="chevronRight" className="ico-sm" />}
            <span style={{ color: i === crumbs.length - 1 ? 'var(--fg-1)' : 'var(--fg-3)' }}>{c}</span>
          </React.Fragment>
        ))}
      </div>
      <div className="row items-center between gap-4">
        <div>
          <h1 className="h1">{title}</h1>
          {subtitle && <p className="small muted mt-1" style={{margin:'4px 0 0'}}>{subtitle}</p>}
        </div>
        {actions && <div className="row gap-2">{actions}</div>}
      </div>
    </div>
  );
}

function Section({ title, hint, action, children, padded = true }) {
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div className="row items-center between" style={{
        padding: '12px 16px', borderBottom: '1px solid var(--line)',
      }}>
        <div className="col" style={{ gap: 2 }}>
          <h3 className="h3">{title}</h3>
          {hint && <span className="xs muted">{hint}</span>}
        </div>
        {action}
      </div>
      <div style={padded ? { padding: 16 } : {}}>{children}</div>
    </div>
  );
}

function StatTile({ label, value, hint, accent }) {
  return (
    <div className="card" style={{ padding: 16, position: 'relative', overflow: 'hidden' }}>
      <div className="xs label-uc">{label}</div>
      <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em', marginTop: 6, lineHeight: 1.1 }}>{value}</div>
      {hint && <div className="xs muted mt-2">{hint}</div>}
      {accent && (
        <div style={{
          position: 'absolute', right: -20, top: -20,
          width: 80, height: 80, borderRadius: '50%',
          background: accent, opacity: 0.08, filter: 'blur(20px)',
        }} />
      )}
    </div>
  );
}

window.Chrome = Chrome;
window.Avatar = Avatar;
window.AvatarStack = AvatarStack;
window.RoleBadge = RoleBadge;
window.Sidebar = Sidebar;
window.PageHeader = PageHeader;
window.Section = Section;
window.StatTile = StatTile;
