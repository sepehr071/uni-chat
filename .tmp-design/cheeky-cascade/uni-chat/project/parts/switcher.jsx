// Workspace switcher popover — shown as an open popover on top of a faded shell.

function WorkspaceSwitcher({ variant = 'refined' }) {
  const isBold = variant === 'bold';
  return (
    <div className={`surface ${isBold ? 'bold' : ''}`} style={{ background: 'var(--bg-0)' }}>
      <Chrome url="acme.unichat.app/chat" />
      <div className="body">
        <div style={{ position: 'relative', display: 'flex', flex: 1 }}>
          {/* faded sidebar behind */}
          <div style={{ filter: 'blur(0.5px) brightness(0.55)', display: 'flex', flex: 1 }}>
            <Sidebar active="chat" />
            <div style={{ flex: 1, background: 'var(--bg-0)' }}/>
          </div>

          {/* popover */}
          <div style={{
            position: 'absolute',
            top: 70, left: 16,
            width: 380,
            background: 'var(--bg-1)',
            border: '1px solid var(--line-2)',
            borderRadius: 12,
            boxShadow: 'var(--shadow-lg)',
            overflow: 'hidden',
            zIndex: 10,
          }}>
            {/* search */}
            <div style={{
              padding: '10px 12px', borderBottom: '1px solid var(--line)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <Icon name="search" className="ico-sm" style={{ color: 'var(--fg-3)' }}/>
              <input placeholder="Switch workspace, project, or recent…" style={{
                background: 'transparent', border: 'none', outline: 'none',
                color: 'var(--fg-0)', fontSize: 13, flex: 1, fontFamily: 'inherit',
              }} autoFocus />
              <span className="xs mono muted">esc</span>
            </div>

            {/* current workspace */}
            <div style={{ padding: '12px 12px 8px' }}>
              <div className="label-uc mb-2" style={{ paddingLeft: 6 }}>Current workspace</div>
              <div className="row gap-3 items-center" style={{
                padding: '10px', borderRadius: 9,
                background: 'var(--accent-soft)', border: '1px solid var(--accent-line)',
              }}>
                <span className="ptile" style={{
                  background: isBold
                    ? 'linear-gradient(135deg,#6366f1,#a78bfa)'
                    : 'linear-gradient(135deg,#5c9aed,#a78bfa)',
                }}>A</span>
                <div className="grow col" style={{ gap: 2 }}>
                  <div className="row gap-2 items-center">
                    <span className="small" style={{ fontWeight: 600 }}>Acme HQ</span>
                    <span className="badge badge-violet xs">Enterprise</span>
                  </div>
                  <span className="xs muted">acme.com · 47 members · you are owner</span>
                </div>
                <Icon name="check" className="ico" style={{ color: 'var(--accent)' }}/>
              </div>
            </div>

            {/* projects in this workspace */}
            <div style={{ padding: '4px 6px 10px' }}>
              <div className="row items-center between" style={{ padding: '6px 8px' }}>
                <span className="label-uc">Projects in Acme HQ</span>
                <span className="xs muted">{PROJECTS.filter(p => !p.archived && p.status === 'active').length}</span>
              </div>
              <div className="col" style={{ gap: 1 }}>
                <SwitcherRow
                  icon={<span style={{ width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-3)' }}><Icon name="inbox" className="ico-sm"/></span>}
                  label="Unfiled chats"
                  meta="34"
                  italic
                />
                {PROJECTS.filter(p => p.status === 'active').slice(0, 5).map(p => (
                  <SwitcherRow
                    key={p.id}
                    icon={<span className="ptile ptile-sm" style={{ background: p.color, width: 22, height: 22, fontSize: 10 }}>
                      <Icon name={p.icon} className="ico-sm" style={{ color: 'white' }}/>
                    </span>}
                    label={p.name}
                    meta={p.lastActivity}
                    pinned={p.pinned}
                    selected={p.id === 'p2'}
                  />
                ))}
                <div style={{ padding: '6px 8px' }}>
                  <span className="xs muted" style={{ cursor: 'pointer' }}>Show all 9 →</span>
                </div>
              </div>
            </div>

            {/* other workspaces */}
            <div style={{ padding: '4px 6px 10px', borderTop: '1px solid var(--line)' }}>
              <div className="label-uc" style={{ padding: '8px 8px 4px' }}>Other workspaces</div>
              <div className="col" style={{ gap: 1 }}>
                <SwitcherRow
                  icon={<span className="ptile ptile-sm" style={{ background: '#10b981', width: 22, height: 22 }}>P</span>}
                  label="Personal"
                  meta="just you"
                />
                <SwitcherRow
                  icon={<span className="ptile ptile-sm" style={{ background: '#f59e0b', width: 22, height: 22 }}>S</span>}
                  label="Acme — Sales"
                  meta="22 members"
                />
                <SwitcherRow
                  icon={<span className="ptile ptile-sm" style={{ background: '#a78bfa', width: 22, height: 22 }}>L</span>}
                  label="Acme — Legal (restricted)"
                  meta="4 members"
                  badge={<span className="badge badge-amber xs"><Icon name="lock" className="ico-sm"/>SSO</span>}
                />
              </div>
            </div>

            {/* footer actions */}
            <div style={{
              padding: 8, borderTop: '1px solid var(--line)',
              background: 'var(--bg-2)', display: 'grid',
              gridTemplateColumns: '1fr 1fr', gap: 4,
            }}>
              <SwitcherAction icon="plus" label="New project" hotkey="N"/>
              <SwitcherAction icon="building" label="New workspace" hotkey="W"/>
              <SwitcherAction icon="settings" label="Workspace settings"/>
              <SwitcherAction icon="users" label="Invite members"/>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SwitcherRow({ icon, label, meta, italic, selected, pinned, badge }) {
  return (
    <div className="row gap-2 items-center" style={{
      padding: '7px 9px', borderRadius: 7, cursor: 'pointer',
      background: selected ? 'var(--bg-3)' : 'transparent',
    }}>
      {icon}
      <span className="small grow truncate" style={{
        color: italic ? 'var(--fg-3)' : 'var(--fg-1)',
        fontStyle: italic ? 'italic' : 'normal',
        fontWeight: selected ? 500 : 400,
      }}>{label}</span>
      {pinned && <Icon name="star" className="ico-sm" style={{ color: 'var(--warn)', fill: 'var(--warn)' }}/>}
      {badge}
      {meta && <span className="xs muted mono">{meta}</span>}
      {selected && <Icon name="check" className="ico-sm" style={{ color: 'var(--accent)' }}/>}
    </div>
  );
}

function SwitcherAction({ icon, label, hotkey }) {
  return (
    <div className="row gap-2 items-center" style={{
      padding: '6px 9px', borderRadius: 6, cursor: 'pointer',
      color: 'var(--fg-2)', fontSize: 12.5,
    }}>
      <Icon name={icon} className="ico-sm"/>
      <span className="grow">{label}</span>
      {hotkey && <span className="xs mono muted" style={{
        padding: '1px 5px', background: 'var(--bg-3)', border: '1px solid var(--line)', borderRadius: 4,
      }}>{hotkey}</span>}
    </div>
  );
}

window.WorkspaceSwitcher = WorkspaceSwitcher;
