import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { User, Lock, Palette, Save, Loader2, DollarSign } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { userService } from '../../services/userService'
import { authService } from '../../services/authService'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import { cn } from '../../utils/cn'
import toast from 'react-hot-toast'

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('profile')

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'security', label: 'Security', icon: Lock },
    { id: 'usage', label: 'Usage & Costs', icon: DollarSign },
    { id: 'preferences', label: 'Preferences', icon: Palette },
  ]

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-foreground-secondary mt-1">Manage your account and preferences</p>
        </div>

        <div className="flex flex-wrap gap-1 p-1 bg-background-secondary rounded-lg">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                activeTab === tab.id ? 'bg-accent text-white' : 'text-foreground-secondary hover:text-foreground'
              )}
            >
              <tab.icon className="h-4 w-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="card">
          {activeTab === 'profile' && <ProfileSettings />}
          {activeTab === 'security' && <SecuritySettings />}
          {activeTab === 'usage' && <UsageSettings />}
          {activeTab === 'preferences' && <PreferencesSettings />}
        </div>
      </div>
    </div>
  )
}

function ProfileSettings() {
  const { user, updateUser } = useAuth()
  const [formData, setFormData] = useState({
    display_name: user?.profile?.display_name || '',
    bio: user?.profile?.bio || '',
  })

  const updateMutation = useMutation({
    mutationFn: userService.updateProfile,
    onSuccess: (data) => {
      updateUser({ profile: data.profile })
      toast.success('Profile updated')
    },
    onError: () => toast.error('Failed to update profile'),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    updateMutation.mutate(formData)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <label className="block text-sm font-medium text-foreground">Email</label>
        <input type="email" value={user?.email || ''} disabled className="input bg-background-tertiary text-foreground-secondary" />
        <p className="text-xs text-foreground-tertiary">Email cannot be changed</p>
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-foreground">Display Name</label>
        <input type="text" value={formData.display_name} onChange={(e) => setFormData(prev => ({ ...prev, display_name: e.target.value }))} className="input" placeholder="Your name" />
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-foreground">Bio</label>
        <textarea value={formData.bio} onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))} className="input resize-none" rows={3} placeholder="Tell us about yourself..." maxLength={500} />
        <p className="text-xs text-foreground-tertiary">{formData.bio.length}/500</p>
      </div>
      <button type="submit" disabled={updateMutation.isPending} className="btn btn-primary">
        {updateMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" />Saving...</> : <><Save className="h-4 w-4" />Save Changes</>}
      </button>
    </form>
  )
}

function SecuritySettings() {
  const [formData, setFormData] = useState({ current_password: '', new_password: '', confirm_password: '' })

  const changeMutation = useMutation({
    mutationFn: ({ currentPassword, newPassword }) => authService.changePassword(currentPassword, newPassword),
    onSuccess: () => {
      toast.success('Password changed successfully')
      setFormData({ current_password: '', new_password: '', confirm_password: '' })
    },
    onError: (error) => toast.error(error.response?.data?.error || 'Failed to change password'),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (formData.new_password !== formData.confirm_password) { toast.error('Passwords do not match'); return }
    if (formData.new_password.length < 8) { toast.error('Password must be at least 8 characters'); return }
    changeMutation.mutate({ currentPassword: formData.current_password, newPassword: formData.new_password })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <label className="block text-sm font-medium text-foreground">Current Password</label>
        <input type="password" value={formData.current_password} onChange={(e) => setFormData(prev => ({ ...prev, current_password: e.target.value }))} className="input" required />
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-foreground">New Password</label>
        <input type="password" value={formData.new_password} onChange={(e) => setFormData(prev => ({ ...prev, new_password: e.target.value }))} className="input" required minLength={8} />
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-foreground">Confirm New Password</label>
        <input type="password" value={formData.confirm_password} onChange={(e) => setFormData(prev => ({ ...prev, confirm_password: e.target.value }))} className="input" required />
      </div>
      <button type="submit" disabled={changeMutation.isPending} className="btn btn-primary">
        {changeMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" />Changing...</> : 'Change Password'}
      </button>
    </form>
  )
}

function UsageSettings() {
  const [days, setDays] = useState(30)
  const { data: statsData, isLoading: statsLoading } = useQuery({ queryKey: ['user-stats'], queryFn: userService.getStats })
  const { data: costsData, isLoading: costsLoading } = useQuery({ queryKey: ['user-costs', days], queryFn: () => userService.getCosts(days) })

  const stats = statsData?.stats || {}
  const costs = costsData?.costs || {}

  if (statsLoading || costsLoading) {
    return <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>
  }

  const formatCost = (cost) => '$' + (cost?.toFixed(4) || '0.00')

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatBox label="Messages Sent" value={stats.messages_sent?.toLocaleString() || 0} />
        <StatBox label="Tokens Used" value={stats.tokens_used?.toLocaleString() || 0} />
        <StatBox label="Conversations" value={stats.total_conversations || 0} />
        <StatBox label="Total Cost" value={formatCost(costs.total?.total_cost_usd)} highlight />
      </div>

      <div className="border-t border-border pt-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium text-foreground">Cost History</h3>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="input w-auto text-sm py-1">
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
          </select>
        </div>
        {costs.daily?.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={costs.daily}>
              <defs><linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} /><stop offset="95%" stopColor="#6366f1" stopOpacity={0} /></linearGradient></defs>
              <XAxis dataKey="date" stroke="#9ca3af" fontSize={11} tickFormatter={(v) => new Date(v).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })} />
              <YAxis stroke="#9ca3af" fontSize={11} tickFormatter={(v) => '$' + v.toFixed(3)} />
              <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }} formatter={(v) => ['$' + v.toFixed(4), 'Cost']} />
              <Area type="monotone" dataKey="cost" stroke="#6366f1" fillOpacity={1} fill="url(#costGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-foreground-secondary text-center py-8">No usage data yet</p>
        )}
      </div>

      {costs.period?.by_model?.length > 0 && (
        <div className="border-t border-border pt-6">
          <h3 className="font-medium text-foreground mb-4">Cost by Model (Last {days} days)</h3>
          <div className="space-y-2">
            {costs.period.by_model.map((m, i) => (
              <div key={i} className="flex justify-between items-center py-2 border-b border-border/50">
                <span className="text-foreground-secondary text-sm truncate">{m._id || 'Unknown'}</span>
                <span className="text-foreground font-medium">{formatCost(m.total_cost)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StatBox({ label, value, highlight }) {
  return (
    <div className={cn('p-4 rounded-lg', highlight ? 'bg-accent/10 border border-accent/20' : 'bg-background-secondary')}>
      <p className="text-xs text-foreground-secondary">{label}</p>
      <p className={cn('text-lg font-bold mt-1', highlight ? 'text-accent' : 'text-foreground')}>{value}</p>
    </div>
  )
}

function PreferencesSettings() {
  const queryClient = useQueryClient()
  const { theme, setTheme } = useTheme()
  const { data: settingsData, isLoading } = useQuery({ queryKey: ['user-settings'], queryFn: userService.getSettings })
  const settings = settingsData?.settings || {}

  const updateMutation = useMutation({
    mutationFn: userService.updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-settings'] })
      toast.success('Preferences updated')
    },
    onError: () => toast.error('Failed to update preferences'),
  })

  const handleThemeChange = (newTheme) => {
    setTheme(newTheme)
    updateMutation.mutate({ theme: newTheme })
  }

  if (isLoading) return <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><p className="font-medium text-foreground">Theme</p><p className="text-sm text-foreground-secondary">Choose your preferred theme</p></div>
        <select value={theme} onChange={(e) => handleThemeChange(e.target.value)} className="input w-auto"><option value="dark">Dark</option><option value="light">Light</option></select>
      </div>
      <div className="flex items-center justify-between">
        <div><p className="font-medium text-foreground">Notifications</p><p className="text-sm text-foreground-secondary">Receive notifications about updates</p></div>
        <button onClick={() => updateMutation.mutate({ notifications_enabled: !settings.notifications_enabled })} className={cn('relative w-12 h-6 rounded-full transition-colors', settings.notifications_enabled ? 'bg-accent' : 'bg-background-tertiary')}>
          <span className={cn('absolute top-1 w-4 h-4 bg-white rounded-full transition-transform', settings.notifications_enabled ? 'left-7' : 'left-1')} />
        </button>
      </div>
    </div>
  )
}
