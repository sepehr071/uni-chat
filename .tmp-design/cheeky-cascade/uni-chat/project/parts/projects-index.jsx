// Projects index page — refined + bold variants.
// Variant differences: bold uses larger ptiles, more saturated badges, bigger H1.

function ProjectsIndex({ variant = 'refined', view = 'grid' }) {
  const isBold = variant === 'bold';
  const projects = PROJECTS.filter(p => p.status === 'active');

  return (
    <div className={`surface ${isBold ? 'bold' : ''}`}>
      <Chrome url="acme.unichat.app/projects" />
      <div className="body">
        <Sidebar active="projects" />
        <div className="main">
          <PageHeader
            crumbs={['Acme HQ', 'Projects']}
            title="Projects"
            subtitle="9 active · 1 archived · 47 members across workspace"
            actions={
              <>
                <button className="btn btn-secondary"><Icon name="filter" className="ico-sm"/>Filter</button>
                <button className="btn btn-secondary"><Icon name="upload" className="ico-sm"/>Import</button>
                <button className="btn btn-primary"><Icon name="plus" className="ico-sm"/>New project</button>
              </>
            }
          />

          {/* Toolbar */}
          <div className="row items-center between" style={{
            padding: '12px 24px', borderBottom: '1px solid var(--line)',
            background: 'var(--bg-1)', flexShrink: 0,
          }}>
            <div className="row gap-2 items-center">
              <div className="row gap-1 items-center" style={{
                background: 'var(--bg-0)', border: '1px solid var(--line-2)',
                borderRadius: 7, padding: '4px 10px', height: 30, width: 280,
              }}>
                <Icon name="search" className="ico-sm" style={{ color: 'var(--fg-3)' }} />
                <input placeholder="Search projects, members, tags…" style={{
                  background: 'transparent', border: 'none', outline: 'none',
                  color: 'var(--fg-1)', fontSize: 12.5, flex: 1, fontFamily: 'inherit',
                }} />
              </div>
              <span className="seg">
                <span className="seg-item">All projects</span>
                <span className="seg-item active">Mine</span>
                <span className="seg-item">Pinned</span>
                <span className="seg-item">Archived</span>
              </span>
              <span className="badge badge-neutral"><Icon name="users" className="ico-sm"/>Group: any</span>
              <span className="badge badge-neutral"><Icon name="tag" className="ico-sm"/>Tag: any</span>
            </div>
            <div className="row gap-2 items-center">
              <span className="xs muted">Sort:</span>
              <span className="seg">
                <span className="seg-item active">Recent</span>
                <span className="seg-item">A–Z</span>
                <span className="seg-item">Members</span>
              </span>
              <span className="seg">
                <span className={`seg-item ${view === 'grid' ? 'active' : ''}`}><Icon name="grid" className="ico-sm"/></span>
                <span className={`seg-item ${view === 'list' ? 'active' : ''}`}><Icon name="list" className="ico-sm"/></span>
              </span>
            </div>
          </div>

          <div className="main-scroll" style={{ padding: 24, background: 'var(--bg-0)' }}>
            {view === 'grid' ? <GridView projects={projects} isBold={isBold} /> : <ListView projects={projects} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function GridView({ projects, isBold }) {
  const pinned = projects.filter(p => p.pinned);
  const rest = projects.filter(p => !p.pinned);

  // BOLD layout: hero featured row (1 large + 2 medium) + dense uniform grid below.
  if (isBold) {
    const hero = pinned[0];
    const secondary = pinned.slice(1, 3).concat(rest.slice(0, 2 - Math.max(0, pinned.length - 1))).slice(0, 2);
    const remaining = rest.filter(p => !secondary.includes(p));
    return (
      <>
        {/* Hero metric strip */}
        <div className="row gap-3 mb-4" style={{
          padding: 18, borderRadius: 14,
          background: 'linear-gradient(135deg, rgba(129,140,248,0.10), rgba(167,139,250,0.04) 60%, transparent)',
          border: '1px solid var(--accent-line)',
        }}>
          <BoldMetric value="9" label="Active projects" trend="+2 this week"/>
          <BoldDivider/>
          <BoldMetric value="47" label="Members" trend="13 seats free" accent/>
          <BoldDivider/>
          <BoldMetric value="142K" label="Messages this month" trend="+18%" />
          <BoldDivider/>
          <BoldMetric value="$3.8K" label="Spend MTD" trend="74% of budget" warn/>
        </div>

        {hero && (
          <>
            <SectionLabel icon="flame" tone="hot" label="Featured" hint="Most active this week"/>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 16, marginBottom: 28 }}>
              <BoldHeroCard p={hero}/>
              {secondary.map(p => <BoldFeatureCard key={p.id} p={p}/>)}
            </div>
          </>
        )}

        <SectionLabel icon="folder" label="All projects" hint={`${remaining.length} projects`}/>
        <div className="grid-3">
          {remaining.map(p => <ProjectCard key={p.id} p={p} isBold={true}/>)}
        </div>
      </>
    );
  }

  // REFINED — calm symmetric grid with a thin pinned row.
  return (
    <>
      {pinned.length > 0 && (
        <>
          <div className="row items-center gap-2 mb-3">
            <Icon name="star" className="ico-sm" style={{ color: 'var(--warn)' }}/>
            <span className="label-uc">Pinned</span>
            <div style={{ flex: 1, borderTop: '1px solid var(--line)' }} />
          </div>
          <div className="grid-3 mb-6">
            {pinned.map(p => <ProjectCard key={p.id} p={p} isBold={false}/>)}
          </div>
        </>
      )}
      <div className="row items-center gap-2 mb-3">
        <Icon name="folder" className="ico-sm" style={{ color: 'var(--fg-3)' }}/>
        <span className="label-uc">All projects</span>
        <span className="xs muted">· {rest.length}</span>
        <div style={{ flex: 1, borderTop: '1px solid var(--line)' }} />
      </div>
      <div className="grid-3">
        {rest.map(p => <ProjectCard key={p.id} p={p} isBold={false}/>)}
      </div>
    </>
  );
}

function BoldMetric({ value, label, trend, accent, warn }) {
  return (
    <div className="col grow" style={{ gap: 4 }}>
      <span style={{
        fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1,
        color: accent ? '#a78bfa' : warn ? '#fbbf24' : 'var(--fg-0)',
      }}>{value}</span>
      <span className="label-uc" style={{ fontSize: 10 }}>{label}</span>
      <span className="xs muted">{trend}</span>
    </div>
  );
}
function BoldDivider() {
  return <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--line-2)' }}/>;
}

function SectionLabel({ icon, label, hint, tone }) {
  return (
    <div className="row items-center gap-3 mb-3">
      <span className={`ptile ptile-sm`} style={{
        width: 22, height: 22, borderRadius: 6,
        background: tone === 'hot'
          ? 'linear-gradient(135deg, #f59e0b, #ec4899)'
          : 'var(--bg-3)',
      }}>
        <Icon name={icon} className="ico-sm" style={{ color: tone === 'hot' ? 'white' : 'var(--fg-2)' }}/>
      </span>
      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--fg-1)' }}>
        {label}
      </span>
      <span className="xs muted">· {hint}</span>
      <div style={{ flex: 1, borderTop: '1px solid var(--line-2)' }} />
    </div>
  );
}

function BoldHeroCard({ p }) {
  const members = USERS.slice(0, 6);
  return (
    <div className="card card-hover" style={{
      padding: 24,
      background: `linear-gradient(135deg, ${p.color}18, transparent 50%), var(--bg-1)`,
      border: `1px solid ${p.color}40`,
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', right: -40, top: -40, width: 200, height: 200,
        background: p.color, opacity: 0.18, filter: 'blur(60px)', borderRadius: '50%',
      }}/>
      <div className="row items-start gap-3 mb-3" style={{ position: 'relative' }}>
        <span className="ptile ptile-lg" style={{
          background: `linear-gradient(135deg, ${p.color}, ${p.color}cc)`,
        }}>
          <Icon name={p.icon} className="ico-lg" style={{ color: 'white' }}/>
        </span>
        <div className="grow col" style={{ gap: 4 }}>
          <span className="badge" style={{ alignSelf: 'flex-start', background: `${p.color}24`, color: p.color, border: `1px solid ${p.color}50`, fontSize: 9.5 }}>
            <Icon name="flame" className="ico-sm"/>HOT
          </span>
          <span style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--fg-0)' }}>{p.name}</span>
          <span className="small muted">{p.description}</span>
        </div>
        <Icon name="more" className="ico" style={{ color: 'var(--fg-3)', cursor: 'pointer' }}/>
      </div>
      <div className="row gap-4 mt-4 mb-3" style={{ position: 'relative' }}>
        <BoldStat label="MESSAGES" value={p.chats.toLocaleString()}/>
        <BoldStat label="DOCS" value={p.knowledge}/>
        <BoldStat label="MEMBERS" value={p.members}/>
        <BoldStat label="LAST EDIT" value={p.lastActivity} small/>
      </div>
      <div className="row items-center between" style={{
        position: 'relative', paddingTop: 14, borderTop: `1px solid ${p.color}30`,
      }}>
        <AvatarStack users={members} max={5} size="sm"/>
        <div className="row gap-2">
          <button className="btn btn-secondary btn-sm">Settings</button>
          <button className="btn btn-primary btn-sm"><Icon name="message" className="ico-sm"/>Open</button>
        </div>
      </div>
    </div>
  );
}

function BoldStat({ label, value, small }) {
  return (
    <div className="col" style={{ gap: 2 }}>
      <span className="label-uc" style={{ fontSize: 9 }}>{label}</span>
      <span style={{ fontSize: small ? 13 : 18, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--fg-0)' }}>{value}</span>
    </div>
  );
}

function BoldFeatureCard({ p }) {
  return (
    <div className="card card-hover" style={{ padding: 18, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: p.color }}/>
      <div className="row items-start gap-2 mb-3" style={{ marginTop: 4 }}>
        <span className="ptile" style={{ background: `linear-gradient(135deg, ${p.color}, ${p.color}cc)` }}>
          <Icon name={p.icon} className="ico" style={{ color: 'white' }}/>
        </span>
        <div className="grow col" style={{ gap: 2 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg-0)' }}>{p.name}</span>
          <span className="xs muted truncate">{p.group}</span>
        </div>
      </div>
      <div className="row gap-3 mb-3">
        <BoldStat label="CHATS" value={p.chats.toLocaleString()}/>
        <BoldStat label="DOCS" value={p.knowledge}/>
      </div>
      <div className="row items-center between" style={{ paddingTop: 10, borderTop: '1px solid var(--line)' }}>
        <AvatarStack users={USERS.slice(0, 3)} max={3} size="sm"/>
        <span className="xs muted">{p.lastActivity}</span>
      </div>
    </div>
  );
}

function ProjectCard({ p, isBold }) {
  const members = USERS.slice(0, Math.min(USERS.length, p.members > 4 ? 4 : p.members));
  return (
    <div className="card card-hover" style={{ padding: 18, position: 'relative' }}>
      {/* Top row */}
      <div className="row items-start gap-3 mb-3">
        <span className={`ptile ${isBold ? 'ptile-lg' : ''}`} style={{
          background: isBold
            ? `linear-gradient(135deg, ${p.color}, ${p.color}dd)`
            : p.color,
        }}>
          <Icon name={p.icon} className="ico" style={{ color: 'white' }}/>
        </span>
        <div className="grow col" style={{ gap: 2, minWidth: 0 }}>
          <div className="row items-center gap-2">
            <span className="h3 truncate" style={{ fontSize: 14 }}>{p.name}</span>
            {p.pinned && <Icon name="star" className="ico-sm" style={{ color: 'var(--warn)', fill: 'var(--warn)' }}/>}
          </div>
          <span className="xs muted truncate">{p.description}</span>
        </div>
        <Icon name="more" className="ico-sm" style={{ color: 'var(--fg-3)', cursor: 'pointer' }}/>
      </div>

      {/* Meta strip */}
      <div className="row items-center gap-3 mb-3 xs muted">
        <span className="row gap-1 items-center"><Icon name="message" className="ico-sm"/>{p.chats.toLocaleString()}</span>
        <span className="row gap-1 items-center"><Icon name="database" className="ico-sm"/>{p.knowledge}</span>
        <span style={{ flex: 1 }} />
        <span className="row gap-1 items-center"><Icon name="clock" className="ico-sm"/>{p.lastActivity}</span>
      </div>

      {/* Tags */}
      {p.tags?.length > 0 && (
        <div className="row gap-1 flex-wrap mb-3">
          {p.tags.map(t => (
            <span key={t} className="badge badge-neutral mono" style={{ fontSize: 9.5 }}>#{t}</span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="row items-center between" style={{
        paddingTop: 12, borderTop: '1px solid var(--line)',
      }}>
        <div className="row items-center gap-2">
          <AvatarStack users={members} max={4} size="sm"/>
          <span className="xs muted">{p.members}</span>
        </div>
        <span className="badge badge-neutral" style={{ background: 'transparent', border: '1px solid var(--line-2)' }}>
          <Icon name="users" className="ico-sm"/>{p.group}
        </span>
      </div>
    </div>
  );
}

function ListView({ projects }) {
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 30 }}></th>
            <th>Project</th>
            <th>Group</th>
            <th>Members</th>
            <th>Activity</th>
            <th>Last edit</th>
            <th>Your role</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {projects.map(p => (
            <tr key={p.id}>
              <td>{p.pinned
                ? <Icon name="star" className="ico-sm" style={{ color: 'var(--warn)', fill: 'var(--warn)' }}/>
                : <span style={{ display: 'inline-block', width: 12 }} />
              }</td>
              <td>
                <div className="row gap-2 items-center">
                  <span className="ptile ptile-sm" style={{ background: p.color }}>
                    <Icon name={p.icon} className="ico-sm" style={{ color: 'white' }}/>
                  </span>
                  <div className="col">
                    <span style={{ fontWeight: 500, color: 'var(--fg-0)' }}>{p.name}</span>
                    <span className="xs muted">{p.description}</span>
                  </div>
                </div>
              </td>
              <td><span className="badge badge-neutral"><Icon name="users" className="ico-sm"/>{p.group}</span></td>
              <td><AvatarStack users={USERS.slice(0, Math.min(4, p.members))} max={4} size="sm"/></td>
              <td><span className="xs muted">{p.chats.toLocaleString()} chats · {p.knowledge} docs</span></td>
              <td><span className="xs muted">{p.lastActivity}</span></td>
              <td><RoleBadge role="editor"/></td>
              <td><Icon name="more" className="ico-sm" style={{ color: 'var(--fg-3)' }}/></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

window.ProjectsIndex = ProjectsIndex;
