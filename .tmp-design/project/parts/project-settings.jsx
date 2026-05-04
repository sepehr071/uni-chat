// Project settings — General, Members & access, Knowledge & defaults, Tags, Danger.

function ProjectSettings({ variant = 'refined' }) {
  const isBold = variant === 'bold';
  const project = PROJECTS[0]; // Q3 Launch Campaign

  const tabs = [
    { id: 'general',   label: 'General',           icon: 'settings' },
    { id: 'access',    label: 'Members & access',  icon: 'users', count: 14 },
    { id: 'defaults',  label: 'Defaults',          icon: 'cpu' },
    { id: 'knowledge', label: 'Knowledge',         icon: 'database', count: 48 },
    { id: 'webhooks',  label: 'Integrations',      icon: 'link' },
    { id: 'danger',    label: 'Danger',            icon: 'alert' },
  ];

  return (
    <div className={`surface ${isBold ? 'bold' : ''}`}>
      <Chrome url={`acme.unichat.app/projects/${project.id}/settings`} />
      <div className="body">
        <Sidebar active="projects" />
        <div className="main">
          <PageHeader
            crumbs={['Acme HQ', 'Projects', project.name, 'Settings']}
            title={
              <span className="row gap-3 items-center">
                <span className="ptile ptile-lg" style={{
                  background: isBold ? `linear-gradient(135deg,${project.color},${project.color}cc)` : project.color,
                }}>
                  <Icon name={project.icon} className="ico-lg" style={{ color: 'white' }}/>
                </span>
                {project.name}
                <span className="badge badge-pink"><Icon name="flame" className="ico-sm"/>Marketing</span>
                <span className="badge badge-green">Active</span>
              </span>
            }
            subtitle={project.description}
            actions={
              <>
                <button className="btn btn-secondary"><Icon name="star" className="ico-sm"/>Pinned</button>
                <button className="btn btn-secondary"><Icon name="share" className="ico-sm"/>Share</button>
                <button className="btn btn-primary"><Icon name="message" className="ico-sm"/>Open chat</button>
              </>
            }
          />

          <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
            <div style={{
              width: 220, background: 'var(--bg-1)',
              borderRight: '1px solid var(--line)', padding: '16px 12px',
              flexShrink: 0,
            }}>
              <div className="col gap-1">
                {tabs.map((t, i) => (
                  <div key={t.id} className={`nav-item ${i === 1 ? 'active' : ''}`}>
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
              <ProjectAccessTab isBold={isBold} project={project}/>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProjectAccessTab({ isBold, project }) {
  return (
    <div style={{ maxWidth: 920 }}>
      <Section
        title="Workspace access"
        hint="Who in the workspace can see and edit this project. Workspace owners always have full access."
      >
        <div className="col gap-3">
          <AccessRow
            icon="globe" iconBg="#5c9aed"
            title="Everyone in Acme HQ"
            sub="All 47 workspace members"
            value="No access"
          />
          <AccessRow
            icon="layers" iconBg="#ec4899"
            title="Marketing group"
            sub="12 members · Sara Cohen, Priya Iyer, +10"
            value="Editor"
            badge="default"
          />
          <AccessRow
            icon="layers" iconBg="#a78bfa"
            title="Design group"
            sub="8 members · Mei Tanaka, +7"
            value="Viewer"
          />
          <AccessRow
            icon="externalLink" iconBg="#71717a"
            title="External guests"
            sub="2 guests from vendor.io"
            value="Viewer · expires May 30"
          />
        </div>
      </Section>

      <div className="mt-4">
        <Section
          title="Direct members"
          hint="Individuals with explicit access on top of group permissions"
          padded={false}
          action={
            <button className="btn btn-secondary btn-sm"><Icon name="plus" className="ico-sm"/>Add member</button>
          }
        >
          <table className="table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Source</th>
                <th>Role on project</th>
                <th>Last active</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {USERS.slice(0, 6).map((u, i) => (
                <tr key={u.id}>
                  <td>
                    <div className="row gap-2 items-center">
                      <Avatar user={u} size="sm"/>
                      <div className="col">
                        <span style={{ fontWeight: 500, color: 'var(--fg-0)' }}>{u.name}</span>
                        <span className="xs muted">{u.email}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    {i === 0
                      ? <span className="badge badge-violet"><Icon name="user" className="ico-sm"/>Direct</span>
                      : i < 3
                        ? <span className="badge badge-pink"><Icon name="layers" className="ico-sm"/>via Marketing</span>
                        : <span className="badge badge-blue"><Icon name="layers" className="ico-sm"/>via Design</span>}
                  </td>
                  <td><RoleBadge role={i === 0 ? 'owner' : i === 1 ? 'admin' : i < 4 ? 'editor' : 'viewer'}/></td>
                  <td><span className="xs muted">{['2m','14m','1h','3h','5h','1d'][i]}</span></td>
                  <td><Icon name="more" className="ico-sm" style={{ color: 'var(--fg-3)', cursor: 'pointer' }}/></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      </div>

      <div className="mt-4">
        <Section title="Sharing"
          hint="Public sharing is disabled at workspace level. Request from an admin to enable."
        >
          <div className="row gap-3 items-center" style={{ opacity: 0.6 }}>
            <Icon name="lock" className="ico-lg" style={{ color: 'var(--fg-3)' }}/>
            <div className="grow col">
              <span className="small" style={{ fontWeight: 500 }}>Public link</span>
              <span className="xs muted">Disabled by Acme HQ workspace policy.</span>
            </div>
            <span className="switch" />
          </div>
        </Section>
      </div>
    </div>
  );
}

function AccessRow({ icon, iconBg, title, sub, value, badge }) {
  return (
    <div className="row items-center gap-3" style={{
      padding: '10px 12px', borderRadius: 8, background: 'var(--bg-2)',
      border: '1px solid var(--line)',
    }}>
      <span className="ptile ptile-sm" style={{ background: iconBg }}>
        <Icon name={icon} className="ico-sm" style={{ color: 'white' }}/>
      </span>
      <div className="grow col" style={{ gap: 2 }}>
        <div className="row gap-2 items-center">
          <span className="small" style={{ color: 'var(--fg-0)', fontWeight: 500 }}>{title}</span>
          {badge && <span className="badge badge-neutral xs">default</span>}
        </div>
        <span className="xs muted">{sub}</span>
      </div>
      <div className="row gap-1 items-center" style={{
        padding: '5px 11px', borderRadius: 7, background: 'var(--bg-3)',
        border: '1px solid var(--line-2)', cursor: 'pointer',
      }}>
        <span className="small" style={{ color: 'var(--fg-1)' }}>{value}</span>
        <Icon name="chevronDown" className="ico-sm" style={{ color: 'var(--fg-3)' }}/>
      </div>
    </div>
  );
}

window.ProjectSettings = ProjectSettings;
