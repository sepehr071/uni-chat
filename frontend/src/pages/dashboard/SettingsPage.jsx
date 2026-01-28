import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { User, Lock, Palette, Save, Loader2, DollarSign, Brain } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts'
import { userService } from '../../services/userService'
import { authService } from '../../services/authService'
import { aiPreferencesService } from '../../services/aiPreferencesService'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import { cn } from '../../utils/cn'
import toast from 'react-hot-toast'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Textarea } from '../../components/ui/textarea'
import { Switch } from '../../components/ui/switch'
import { Label } from '../../components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select'
import { Separator } from '../../components/ui/separator'
import { Badge } from '../../components/ui/badge'

export default function SettingsPage() {
  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-foreground-secondary mt-1">Manage your account and preferences</p>
        </div>

        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className="w-full justify-start bg-background-secondary p-1 h-auto flex-wrap">
            <TabsTrigger value="profile" className="gap-2 data-[state=active]:bg-accent data-[state=active]:text-white">
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">Profile</span>
            </TabsTrigger>
            <TabsTrigger value="security" className="gap-2 data-[state=active]:bg-accent data-[state=active]:text-white">
              <Lock className="h-4 w-4" />
              <span className="hidden sm:inline">Security</span>
            </TabsTrigger>
            <TabsTrigger value="usage" className="gap-2 data-[state=active]:bg-accent data-[state=active]:text-white">
              <DollarSign className="h-4 w-4" />
              <span className="hidden sm:inline">Usage</span>
            </TabsTrigger>
            <TabsTrigger value="preferences" className="gap-2 data-[state=active]:bg-accent data-[state=active]:text-white">
              <Palette className="h-4 w-4" />
              <span className="hidden sm:inline">Preferences</span>
            </TabsTrigger>
            <TabsTrigger value="ai-preferences" className="gap-2 data-[state=active]:bg-accent data-[state=active]:text-white">
              <Brain className="h-4 w-4" />
              <span className="hidden sm:inline">AI</span>
            </TabsTrigger>
          </TabsList>

          <Card>
            <CardContent className="pt-6">
              <TabsContent value="profile" className="mt-0">
                <ProfileSettings />
              </TabsContent>
              <TabsContent value="security" className="mt-0">
                <SecuritySettings />
              </TabsContent>
              <TabsContent value="usage" className="mt-0">
                <UsageSettings />
              </TabsContent>
              <TabsContent value="preferences" className="mt-0">
                <PreferencesSettings />
              </TabsContent>
              <TabsContent value="ai-preferences" className="mt-0">
                <AIPreferencesSettings />
              </TabsContent>
            </CardContent>
          </Card>
        </Tabs>
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
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" value={user?.email || ''} disabled className="bg-background-tertiary" />
        <p className="text-xs text-foreground-tertiary">Email cannot be changed</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="display_name">Display Name</Label>
        <Input
          id="display_name"
          type="text"
          value={formData.display_name}
          onChange={(e) => setFormData(prev => ({ ...prev, display_name: e.target.value }))}
          placeholder="Your name"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="bio">Bio</Label>
        <Textarea
          id="bio"
          value={formData.bio}
          onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))}
          rows={3}
          placeholder="Tell us about yourself..."
          maxLength={500}
        />
        <p className="text-xs text-foreground-tertiary text-right">{formData.bio.length}/500</p>
      </div>
      <Button type="submit" disabled={updateMutation.isPending}>
        {updateMutation.isPending ? (
          <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving...</>
        ) : (
          <><Save className="h-4 w-4 mr-2" />Save Changes</>
        )}
      </Button>
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
        <Label htmlFor="current_password">Current Password</Label>
        <Input
          id="current_password"
          type="password"
          value={formData.current_password}
          onChange={(e) => setFormData(prev => ({ ...prev, current_password: e.target.value }))}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="new_password">New Password</Label>
        <Input
          id="new_password"
          type="password"
          value={formData.new_password}
          onChange={(e) => setFormData(prev => ({ ...prev, new_password: e.target.value }))}
          required
          minLength={8}
        />
        <p className="text-xs text-foreground-tertiary">Minimum 8 characters</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm_password">Confirm New Password</Label>
        <Input
          id="confirm_password"
          type="password"
          value={formData.confirm_password}
          onChange={(e) => setFormData(prev => ({ ...prev, confirm_password: e.target.value }))}
          required
        />
      </div>
      <Button type="submit" disabled={changeMutation.isPending}>
        {changeMutation.isPending ? (
          <><Loader2 className="h-4 w-4 animate-spin mr-2" />Changing...</>
        ) : (
          'Change Password'
        )}
      </Button>
    </form>
  )
}

function UsageSettings() {
  const [days, setDays] = useState('30')
  const { data: statsData, isLoading: statsLoading } = useQuery({ queryKey: ['user-stats'], queryFn: userService.getStats })
  const { data: costsData, isLoading: costsLoading } = useQuery({ queryKey: ['user-costs', days], queryFn: () => userService.getCosts(Number(days)) })

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

      <Separator />

      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium text-foreground">Cost History</h3>
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {costs.daily?.length > 0 ? (
          <div className="rounded-lg bg-background-secondary/50 p-4">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={costs.daily}>
                <defs><linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="hsl(var(--accent))" stopOpacity={0.3} /><stop offset="95%" stopColor="hsl(var(--accent))" stopOpacity={0} /></linearGradient></defs>
                <XAxis dataKey="date" stroke="hsl(var(--foreground-tertiary))" fontSize={11} tickFormatter={(v) => new Date(v).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })} />
                <YAxis stroke="hsl(var(--foreground-tertiary))" fontSize={11} tickFormatter={(v) => '$' + v.toFixed(3)} />
                <RechartsTooltip contentStyle={{ backgroundColor: 'hsl(var(--background-elevated))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} formatter={(v) => ['$' + v.toFixed(4), 'Cost']} />
                <Area type="monotone" dataKey="cost" stroke="hsl(var(--accent))" fillOpacity={1} fill="url(#costGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-foreground-secondary text-center py-8">No usage data yet</p>
        )}
      </div>

      {costs.period?.by_model?.length > 0 && (
        <>
          <Separator />
          <div>
            <h3 className="font-medium text-foreground mb-4">Cost by Model (Last {days} days)</h3>
            <div className="space-y-2">
              {costs.period.by_model.map((m, i) => (
                <div key={i} className="flex justify-between items-center py-3 px-4 rounded-lg bg-background-secondary/50 hover:bg-background-secondary transition-colors">
                  <Badge variant="secondary" className="font-mono text-xs">
                    {m._id?.split('/').pop() || 'Unknown'}
                  </Badge>
                  <span className="text-foreground font-semibold">{formatCost(m.total_cost)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function StatBox({ label, value, highlight }) {
  return (
    <Card className={cn(
      'transition-all hover:shadow-md',
      highlight && 'border-accent/30 bg-accent/5'
    )}>
      <CardContent className="p-4">
        <p className="text-xs text-foreground-secondary font-medium">{label}</p>
        <p className={cn('text-xl font-bold mt-1', highlight ? 'text-accent' : 'text-foreground')}>{value}</p>
      </CardContent>
    </Card>
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
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <Label className="text-base">Theme</Label>
          <p className="text-sm text-foreground-secondary">Choose your preferred theme</p>
        </div>
        <Select value={theme} onValueChange={handleThemeChange}>
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="dark">Dark</SelectItem>
            <SelectItem value="light">Light</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Separator />

      <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <Label className="text-base">Notifications</Label>
          <p className="text-sm text-foreground-secondary">Receive notifications about updates</p>
        </div>
        <Switch
          checked={settings.notifications_enabled}
          onCheckedChange={(checked) => updateMutation.mutate({ notifications_enabled: checked })}
        />
      </div>
    </div>
  )
}

const LANGUAGES = [
  'English', 'Spanish', 'French', 'German', 'Chinese', 'Arabic', 'Portuguese', 'Russian', 'Japanese', 'Korean', 'Italian', 'Dutch', 'Hindi'
]

const EXPERTISE_LEVELS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'expert', label: 'Expert' },
]

const TONES = [
  { value: 'professional', label: 'Professional' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'casual', label: 'Casual' },
]

const RESPONSE_STYLES = [
  { value: 'concise', label: 'Concise' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'detailed', label: 'Detailed' },
]

function AIPreferencesSettings() {
  const queryClient = useQueryClient()
  const [preferences, setPreferences] = useState({
    enabled: true,
    user_info: { name: '', language: 'English', expertise_level: 'intermediate' },
    behavior: { tone: 'professional', response_style: 'balanced' },
    custom_instructions: ''
  })

  const { data, isLoading } = useQuery({
    queryKey: ['ai-preferences'],
    queryFn: aiPreferencesService.get,
  })

  useEffect(() => {
    if (data?.preferences) {
      setPreferences({
        enabled: data.preferences.enabled ?? true,
        user_info: {
          name: data.preferences.user_info?.name || '',
          language: data.preferences.user_info?.language || 'English',
          expertise_level: data.preferences.user_info?.expertise_level || 'intermediate',
        },
        behavior: {
          tone: data.preferences.behavior?.tone || 'professional',
          response_style: data.preferences.behavior?.response_style || 'balanced',
        },
        custom_instructions: data.preferences.custom_instructions || ''
      })
    }
  }, [data])

  const updateMutation = useMutation({
    mutationFn: aiPreferencesService.update,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-preferences'] })
      toast.success('AI preferences updated')
    },
    onError: () => toast.error('Failed to update AI preferences'),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    updateMutation.mutate(preferences)
  }

  const updateUserInfo = (key, value) => {
    setPreferences(prev => ({
      ...prev,
      user_info: { ...prev.user_info, [key]: value }
    }))
  }

  const updateBehavior = (key, value) => {
    setPreferences(prev => ({
      ...prev,
      behavior: { ...prev.behavior, [key]: value }
    }))
  }

  if (isLoading) {
    return <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <Label className="text-base">Enable AI Preferences</Label>
          <p className="text-sm text-foreground-secondary">Apply these preferences to all AI conversations</p>
        </div>
        <Switch
          checked={preferences.enabled}
          onCheckedChange={(checked) => setPreferences(prev => ({ ...prev, enabled: checked }))}
        />
      </div>

      <div className={cn('space-y-6 transition-opacity', !preferences.enabled && 'opacity-50 pointer-events-none')}>
        <Separator />

        <div>
          <h3 className="font-semibold text-foreground mb-4">User Information</h3>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ai_name">Your Name</Label>
              <Input
                id="ai_name"
                type="text"
                value={preferences.user_info.name}
                onChange={(e) => updateUserInfo('name', e.target.value)}
                placeholder="How should the AI address you?"
              />
            </div>
            <div className="space-y-2">
              <Label>Preferred Language</Label>
              <Select value={preferences.user_info.language} onValueChange={(v) => updateUserInfo('language', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map(lang => (
                    <SelectItem key={lang} value={lang}>{lang}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Expertise Level</Label>
              <Select value={preferences.user_info.expertise_level} onValueChange={(v) => updateUserInfo('expertise_level', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPERTISE_LEVELS.map(level => (
                    <SelectItem key={level.value} value={level.value}>{level.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-foreground-tertiary">Helps the AI adjust technical depth of responses</p>
            </div>
          </div>
        </div>

        <Separator />

        <div>
          <h3 className="font-semibold text-foreground mb-4">AI Behavior</h3>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tone</Label>
              <Select value={preferences.behavior.tone} onValueChange={(v) => updateBehavior('tone', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TONES.map(tone => (
                    <SelectItem key={tone.value} value={tone.value}>{tone.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Response Style</Label>
              <Select value={preferences.behavior.response_style} onValueChange={(v) => updateBehavior('response_style', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RESPONSE_STYLES.map(style => (
                    <SelectItem key={style.value} value={style.value}>{style.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <Separator />

        <div>
          <h3 className="font-semibold text-foreground mb-4">Custom Instructions</h3>
          <div className="space-y-2">
            <Textarea
              value={preferences.custom_instructions}
              onChange={(e) => setPreferences(prev => ({ ...prev, custom_instructions: e.target.value.slice(0, 2000) }))}
              rows={5}
              placeholder="Add any specific instructions for the AI (e.g., 'Always provide code examples', 'Explain concepts step by step')..."
              maxLength={2000}
            />
            <p className="text-xs text-foreground-tertiary text-right">{preferences.custom_instructions.length}/2000</p>
          </div>
        </div>
      </div>

      <Button type="submit" disabled={updateMutation.isPending}>
        {updateMutation.isPending ? (
          <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving...</>
        ) : (
          <><Save className="h-4 w-4 mr-2" />Save AI Preferences</>
        )}
      </Button>
    </form>
  )
}
