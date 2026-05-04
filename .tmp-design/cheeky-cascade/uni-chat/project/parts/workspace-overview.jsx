// Workspace overview — new dashboard summarising health for admins.

function WorkspaceOverview({ variant = 'refined' }) {
  const isBold = variant === 'bold';
  return (
    <div className={`surface ${isBold ? 'bold' : ''}`}>
      <Chrome url="acme.unichat.app/workspaces/acme-hq" />
      <div className="body">
        <Sidebar active="overview" />
        <div className="main">
          <PageHeader
            crumbs={['Acme HQ']}
            title="Workspace overview"
            subtitle="Health, usage, and recent activity at a glance"
            actions={
              <>
                <button className="btn btn-secondary"><Icon name="download" className="ico-sm"/>Export report</button>
                <button className="btn btn-secondary"><Icon name="settings" className="ico-sm"/>Settings</button>
                <button className="btn btn-primary"><Icon name="plus" className="ico-sm"/>Invite</button>
              </>
            }
          />

          <div className="main-scroll" style={{ padding: 24, background: 'var(--bg-0)' }}>
            {isBold ? <BoldHero/> : (
              <>
                {/* Plan banner */}
                <div className="card mb-4" style={{
                  padding: 18, display: 'flex', alignItems: 'center', gap: 16,
                  background: 'linear-gradient(135deg, rgba(92,154,237,0.08), rgba(167,139,250,0.04))',
                  border: '1px solid var(--accent-line)',
                }}>
                  <span className="ptile ptile-lg" style={{
                    background: 'linear-gradient(135deg,#5c9aed,#a78bfa)',
                  }}>
                    <Icon name="building" className="ico-lg" style={{ color: 'white' }}/>
                  </span>
                  <div className="grow col" style={{ gap: 4 }}>
                    <div className="row gap-2 items-center">
                      <span style={{ fontSize: 16, fontWeight: 600 }}>Acme HQ</span>
                      <span className="badge badge-violet">Enterprise</span>
                      <span className="badge badge-green"><Icon name="shieldCheck" className="ico-sm"/>SSO enforced</span>
                      <span className="badge badge-blue"><Icon name="key" className="ico-sm"/>SCIM</span>
                    </div>
                    <span className="xs muted">acme.com · created Jan 14, 2025 · 47 members · 9 active projects</span>
                  </div>
                  <div className="col" style={{ alignItems: 'flex-end', gap: 4 }}>
                    <span className="xs muted">Renews</span>
                    <span className="small" style={{ fontWeight: 600 }}>Aug 14, 2026</span>
                  </div>
                </div>

                <div className="grid-4 mb-4">
                  <StatTile label="Active members" value="47 / 60" hint="13 seats available" accent="#5c9aed"/>
                  <StatTile label="Messages this month" value="142,389" hint="+18% vs last month" accent="#10b981"/>
                  <StatTile label="Spend (MTD)" value="$3,847" hint="$5,200 budget · 74%" accent="#f59e0b"/>
                  <StatTile label="Active projects" value="9" hint="2 created this week" accent="#a78bfa"/>
                </div>
              </>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
              {/* Usage chart */}
              <Section title="Usage" hint="Daily messages across all projects, last 30 days"
                action={
                  <span className="seg">
                    <span className="seg-item">7d</span>
                    <span className="seg-item active">30d</span>
                    <span className="seg-item">90d</span>
                  </span>
                }
              >
                <UsageChart isBold={isBold}/>
                <div className="row gap-4 mt-4">
                  <LegendDot color={isBold ? '#6366f1' : '#5c9aed'} label="GPT-4o" value="62%"/>
                  <LegendDot color="#10b981" label="Claude Sonnet" value="24%"/>
                  <LegendDot color="#a78bfa" label="Gemini" value="9%"/>
                  <LegendDot color="#f59e0b" label="Other" value="5%"/>
                </div>
              </Section>

              {/* Activity */}
              <Section title="Recent activity" hint="Audit feed">
                <div className="col gap-3">
                  {ACTIVITY.map((a, i) => (
                    <div key={i} className="row gap-3 items-start">
                      <span className="avatar avatar-sm" style={{ background: 'var(--bg-3)' }}>
                        <Icon name={a.icon} className="ico-sm" style={{ color: 'var(--fg-2)' }}/>
                      </span>
                      <div className="grow col" style={{ gap: 1 }}>
                        <div className="small">
                          <span style={{ color: 'var(--fg-0)', fontWeight: 500 }}>{a.who}</span>
                          <span className="muted"> {a.verb} </span>
                          <span style={{ color: 'var(--fg-1)' }}>{a.what}</span>
                        </div>
                        <span className="xs muted">{a.when}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            </div>

            {/* Top projects + Groups */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
              <Section title="Top projects this week" hint="By message volume">
                <div className="col" style={{ gap: 0 }}>
                  {PROJECTS.slice(0, 5).map((p, i) => {
                    const pct = [92, 71, 58, 38, 22][i];
                    return (
                      <div key={p.id} className="row items-center gap-3 py-2" style={{ borderBottom: i < 4 ? '1px solid var(--line)' : 'none' }}>
                        <span style={{ width: 14, fontSize: 11, color: 'var(--fg-4)', fontFamily: 'var(--font-mono)' }}>#{i+1}</span>
                        <span className="ptile ptile-sm" style={{ background: p.color }}>
                          <Icon name={p.icon} className="ico-sm" style={{ color: 'white' }}/>
                        </span>
                        <span className="small grow truncate" style={{ color: 'var(--fg-1)' }}>{p.name}</span>
                        <div style={{
                          width: 80, height: 4, background: 'var(--bg-3)', borderRadius: 2, overflow: 'hidden',
                        }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: p.color }}/>
                        </div>
                        <span className="xs mono muted" style={{ width: 50, textAlign: 'right' }}>{p.chats.toLocaleString()}</span>
                      </div>
                    );
                  })}
                </div>
              </Section>

              <Section title="Groups" hint="Permission groups in this workspace"
                action={<button className="btn btn-ghost btn-sm"><Icon name="plus" className="ico-sm"/>New group</button>}
              >
                <div className="col gap-2">
                  {GROUPS.map(g => (
                    <div key={g.id} className="row items-center gap-3" style={{
                      padding: '8px 10px', borderRadius: 8, background: 'var(--bg-2)',
                      border: '1px solid var(--line)',
                    }}>
                      <span className="ptile ptile-sm" style={{ background: g.color }}>
                        <Icon name={g.icon} className="ico-sm" style={{ color: 'white' }}/>
                      </span>
                      <span className="small grow" style={{ color: 'var(--fg-1)', fontWeight: 500 }}>{g.name}</span>
                      <span className="xs muted">{g.members} members</span>
                      <Icon name="chevronRight" className="ico-sm" style={{ color: 'var(--fg-4)' }}/>
                    </div>
                  ))}
                </div>
              </Section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BoldHero() {
  return (
    <div style={{
      borderRadius: 18, padding: 28, marginBottom: 20,
      background: 'radial-gradient(800px 300px at 100% 0%, rgba(167,139,250,0.18), transparent 60%), radial-gradient(600px 240px at 0% 100%, rgba(129,140,248,0.14), transparent 50%), var(--bg-1)',
      border: '1px solid var(--line-2)',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 32, alignItems: 'center' }}>
        <div>
          <div className="row gap-2 items-center mb-3">
            <span className="badge badge-violet">ENTERPRISE</span>
            <span className="badge badge-green"><Icon name="shieldCheck" className="ico-sm"/>SSO</span>
            <span className="badge badge-blue"><Icon name="key" className="ico-sm"/>SCIM</span>
            <span className="badge badge-neutral"><Icon name="globe" className="ico-sm"/>acme.com</span>
          </div>
          <div className="row gap-3 items-center mb-3">
            <span className="ptile ptile-lg" style={{
              width: 64, height: 64, borderRadius: 18, fontSize: 26,
              background: 'linear-gradient(135deg,#818cf8,#a78bfa,#ec4899)',
            }}>A</span>
            <div className="col">
              <span style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1 }}>Acme HQ</span>
              <span className="small muted mt-1">47 members · 9 projects · renews Aug 14, 2026</span>
            </div>
          </div>
          <div className="row gap-2 mt-4">
            <button className="btn btn-primary"><Icon name="users" className="ico-sm"/>Invite people</button>
            <button className="btn btn-secondary"><Icon name="layers" className="ico-sm"/>New group</button>
            <button className="btn btn-secondary"><Icon name="plus" className="ico-sm"/>New project</button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <BoldOverviewStat value="47/60" label="SEATS" sub="13 free" tone="#818cf8"/>
          <BoldOverviewStat value="142K" label="MESSAGES MTD" sub="+18%" tone="#10b981"/>
          <BoldOverviewStat value="$3.8K" label="SPEND MTD" sub="74% of budget" tone="#fbbf24"/>
          <BoldOverviewStat value="9" label="PROJECTS" sub="+2 this wk" tone="#ec4899"/>
        </div>
      </div>
    </div>
  );
}

function BoldOverviewStat({ value, label, sub, tone }) {
  return (
    <div style={{
      padding: 16, borderRadius: 12, background: 'var(--bg-2)',
      border: '1px solid var(--line-2)', position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: tone }}/>
      <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1, color: 'var(--fg-0)' }}>{value}</div>
      <div className="label-uc mt-2" style={{ fontSize: 9.5, color: tone }}>{label}</div>
      <div className="xs muted mt-1">{sub}</div>
    </div>
  );
}

function LegendDot({ color, label, value }) {
  return (
    <div className="row gap-2 items-center small">
      <span style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
      <span className="muted-2">{label}</span>
      <span className="muted xs">{value}</span>
    </div>
  );
}

function UsageChart({ isBold }) {
  // 30 bars, simulated.
  const data = [
    32, 28, 41, 38, 45, 50, 48, 62, 58, 72,
    68, 80, 75, 82, 78, 90, 88, 95, 92, 105,
    98, 110, 102, 118, 122, 115, 128, 132, 125, 140,
  ];
  const max = 140;
  const accent = isBold ? '#6366f1' : '#5c9aed';
  return (
    <div style={{ height: 140, display: 'flex', alignItems: 'flex-end', gap: 4 }}>
      {data.map((v, i) => {
        const h = (v / max) * 100;
        const isLast = i === data.length - 1;
        return (
          <div key={i} style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            <div style={{
              height: `${h * 0.6}%`,
              background: isLast ? accent : 'var(--bg-3)',
              borderRadius: '2px 2px 0 0',
              transition: 'background .2s',
            }} />
            <div style={{
              height: `${h * 0.4}%`,
              background: isLast ? accent : 'var(--bg-4)',
              opacity: isLast ? 1 : 0.6,
              borderRadius: '0 0 2px 2px',
            }} />
          </div>
        );
      })}
    </div>
  );
}

window.WorkspaceOverview = WorkspaceOverview;
