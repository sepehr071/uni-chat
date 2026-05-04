// Realistic enterprise demo data.

const PROJECT_COLORS = {
  blue: '#5c9aed', violet: '#a78bfa', green: '#10b981', amber: '#f59e0b',
  red: '#ef4444', pink: '#ec4899', cyan: '#06b6d4', lime: '#84cc16',
  indigo: '#6366f1', teal: '#14b8a6',
};

const USERS = [
  { id: 'u1', name: 'Ava Patel',    email: 'ava@acme.com',     role: 'owner',         hue: 220 },
  { id: 'u2', name: 'Leo Schmidt',  email: 'leo@acme.com',     role: 'admin',         hue: 280 },
  { id: 'u3', name: 'Mei Tanaka',   email: 'mei@acme.com',     role: 'editor',        hue: 160 },
  { id: 'u4', name: 'Jonas Berg',   email: 'jonas@acme.com',   role: 'editor',        hue: 30 },
  { id: 'u5', name: 'Sara Cohen',   email: 'sara@acme.com',    role: 'billing-admin', hue: 340 },
  { id: 'u6', name: 'Diego Ruiz',   email: 'diego@acme.com',   role: 'viewer',        hue: 180 },
  { id: 'u7', name: 'Priya Iyer',   email: 'priya@acme.com',   role: 'editor',        hue: 60 },
  { id: 'u8', name: 'Tom Wilkins',  email: 'tom@vendor.io',    role: 'guest',         hue: 0 },
  { id: 'u9', name: 'Yuki Sato',    email: 'yuki@acme.com',    role: 'editor',        hue: 100 },
];

function initials(name) {
  return name.split(' ').map(p => p[0]).slice(0,2).join('').toUpperCase();
}

function avatarBg(hue, dark = true) {
  return `hsl(${hue}, ${dark ? '40%' : '55%'}, ${dark ? '32%' : '48%'})`;
}

const GROUPS = [
  { id: 'g1', name: 'Engineering',     members: 24, color: '#5c9aed', icon: 'cpu' },
  { id: 'g2', name: 'Design',          members: 8,  color: '#a78bfa', icon: 'sparkle' },
  { id: 'g3', name: 'Marketing',       members: 12, color: '#ec4899', icon: 'flame' },
  { id: 'g4', name: 'Customer Success',members: 6,  color: '#10b981', icon: 'message' },
  { id: 'g5', name: 'Leadership',      members: 5,  color: '#f59e0b', icon: 'shield' },
];

const PROJECTS = [
  { id: 'p1', name: 'Q3 Launch Campaign',     description: 'Cross-team campaign for Helios v4', color: '#ec4899', icon: 'flame',    members: 14, chats: 312, knowledge: 48, lastActivity: '2m ago',  status: 'active', pinned: true,  group: 'Marketing',         tags: ['campaign','helios'] },
  { id: 'p2', name: 'Sales Enablement Bot',   description: 'GPT-4o agent for AE objection handling', color: '#5c9aed', icon: 'bot',  members: 8,  chats: 1240,knowledge: 167,lastActivity: '14m ago', status: 'active', pinned: true,  group: 'Sales',             tags: ['production','agent'] },
  { id: 'p3', name: 'Internal Knowledge Hub', description: 'RAG over Confluence + Notion',      color: '#10b981', icon: 'database', members: 22, chats: 4820,knowledge: 1240,lastActivity: '1h ago',  status: 'active', pinned: false, group: 'Engineering',       tags: ['rag','prod'] },
  { id: 'p4', name: 'Brand Guidelines v2',    description: 'Voice + tone reference + asset gen', color: '#a78bfa', icon: 'package',  members: 5,  chats: 87,  knowledge: 24, lastActivity: '3h ago',  status: 'active', pinned: false, group: 'Design',           tags: ['brand'] },
  { id: 'p5', name: 'Legal — Contracts',      description: 'Restricted. NDA + MSA review agent', color: '#f59e0b', icon: 'shield',  members: 4,  chats: 56,  knowledge: 312, lastActivity: '5h ago',  status: 'active', pinned: false, group: 'Legal',             tags: ['restricted'] },
  { id: 'p6', name: 'Onboarding Playbook',    description: 'New-hire q&a + day-one checklist',  color: '#06b6d4', icon: 'flag',     members: 11, chats: 188, knowledge: 64, lastActivity: '1d ago',  status: 'active', pinned: false, group: 'People Ops',        tags: ['hr'] },
  { id: 'p7', name: 'Engineering RFCs',       description: 'Design doc reviewer + arch debates', color: '#6366f1', icon: 'gitBranch',members: 18, chats: 421, knowledge: 95, lastActivity: '2d ago',  status: 'active', pinned: false, group: 'Engineering',       tags: ['rfc','arch'] },
  { id: 'p8', name: 'Customer Research',      description: 'Interview synthesis + insights',     color: '#84cc16', icon: 'users',   members: 6,  chats: 142, knowledge: 88, lastActivity: '3d ago',  status: 'active', pinned: false, group: 'Research',          tags: [] },
  { id: 'p9', name: 'Helios v3 (archived)',   description: 'Last cycle — kept for reference',   color: '#71717a', icon: 'archive', members: 12, chats: 980, knowledge: 220, lastActivity: '32d ago', status: 'archived', pinned: false, group: 'Engineering',  tags: ['archive'] },
];

const ACTIVITY = [
  { who: 'Ava Patel',   verb: 'invited',   what: 'sara@acme.com to Acme HQ', when: '12m ago', icon: 'users' },
  { who: 'Mei Tanaka',  verb: 'updated',   what: 'system prompt in Sales Enablement Bot', when: '34m ago', icon: 'pencil' },
  { who: 'Leo Schmidt', verb: 'archived',  what: 'project Helios v3', when: '2h ago', icon: 'archive' },
  { who: 'Priya Iyer',  verb: 'created',   what: 'Q3 Launch Campaign', when: '5h ago', icon: 'plus' },
  { who: 'Jonas Berg',  verb: 'shared',    what: 'Brand Guidelines v2 with Design group', when: '1d ago', icon: 'share' },
];

window.PROJECT_COLORS = PROJECT_COLORS;
window.USERS = USERS;
window.GROUPS = GROUPS;
window.PROJECTS = PROJECTS;
window.ACTIVITY = ACTIVITY;
window.initials = initials;
window.avatarBg = avatarBg;
