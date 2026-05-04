// App: design canvas with all surfaces × variants.

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "view": "grid",
  "showAnnotations": false
}/*EDITMODE-END*/;

function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const view = tweaks.view || 'grid';

  // Each surface rendered as Refined + Bold artboard.
  // Sized to feel like a real product window.
  const W = 1280, H = 820;
  const SW_W = 900, SW_H = 700; // switcher narrower
  return (
    <>
      <DesignCanvas title="Workspace & Projects · Enterprise redesign">
        <DCSection id="overview" title="1. Workspace overview" subtitle="Admin landing — health, usage, members, groups">
          <DCArtboard id="overview-refined" label="Refined" width={W} height={H}>
            <WorkspaceOverview variant="refined"/>
          </DCArtboard>
          <DCArtboard id="overview-bold" label="Bold" width={W} height={H}>
            <WorkspaceOverview variant="bold"/>
          </DCArtboard>
        </DCSection>

        <DCSection id="projects" title="2. Projects index" subtitle="Filter, group, view-switch — designed for 10s to 100s of projects">
          <DCArtboard id="projects-grid-refined" label="Refined · Grid" width={W} height={H}>
            <ProjectsIndex variant="refined" view="grid"/>
          </DCArtboard>
          <DCArtboard id="projects-grid-bold" label="Bold · Grid" width={W} height={H}>
            <ProjectsIndex variant="bold" view="grid"/>
          </DCArtboard>
          <DCArtboard id="projects-list-refined" label="Refined · List" width={W} height={H}>
            <ProjectsIndex variant="refined" view="list"/>
          </DCArtboard>
          <DCArtboard id="projects-list-bold" label="Bold · List" width={W} height={H}>
            <ProjectsIndex variant="bold" view="list"/>
          </DCArtboard>
        </DCSection>

        <DCSection id="ws-settings" title="3. Workspace settings · Members" subtitle="Members, groups, roles, SSO/SCIM hints — all in one place">
          <DCArtboard id="ws-members-refined" label="Refined" width={W} height={H}>
            <WorkspaceSettings variant="refined" tab="members"/>
          </DCArtboard>
          <DCArtboard id="ws-members-bold" label="Bold" width={W} height={H}>
            <WorkspaceSettings variant="bold" tab="members"/>
          </DCArtboard>
        </DCSection>

        <DCSection id="ws-billing" title="4. Workspace settings · Billing & usage" subtitle="Per-workspace seats, spend, model limits">
          <DCArtboard id="ws-billing-refined" label="Refined" width={W} height={H}>
            <WorkspaceSettings variant="refined" tab="billing"/>
          </DCArtboard>
          <DCArtboard id="ws-billing-bold" label="Bold" width={W} height={H}>
            <WorkspaceSettings variant="bold" tab="billing"/>
          </DCArtboard>
        </DCSection>

        <DCSection id="proj-settings" title="5. Project settings · Members & access" subtitle="Group-based access + direct members + sharing policy">
          <DCArtboard id="proj-access-refined" label="Refined" width={W} height={H}>
            <ProjectSettings variant="refined"/>
          </DCArtboard>
          <DCArtboard id="proj-access-bold" label="Bold" width={W} height={H}>
            <ProjectSettings variant="bold"/>
          </DCArtboard>
        </DCSection>

        <DCSection id="switcher" title="6. Workspace switcher" subtitle="Sidebar popover — combined workspace + project + actions">
          <DCArtboard id="switcher-refined" label="Refined" width={SW_W} height={SW_H}>
            <WorkspaceSwitcher variant="refined"/>
          </DCArtboard>
          <DCArtboard id="switcher-bold" label="Bold" width={SW_W} height={SW_H}>
            <WorkspaceSwitcher variant="bold"/>
          </DCArtboard>
        </DCSection>
      </DesignCanvas>

      <TweaksPanel title="Tweaks">
        <TweakSection title="View">
          <TweakRadio
            label="Projects view"
            value={view}
            onChange={v => setTweak('view', v)}
            options={[
              { value: 'grid', label: 'Grid' },
              { value: 'list', label: 'List' },
            ]}
          />
        </TweakSection>
      </TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
