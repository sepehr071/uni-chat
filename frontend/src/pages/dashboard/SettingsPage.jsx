import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { User, Lock, Bell, Palette, Save, Loader2 } from 'lucide-react'
import { userService } from '../../services/userService'
import { authService } from '../../services/authService'
import { useAuth } from '../../context/AuthContext'
import { cn } from '../../utils/cn'
import toast from 'react-hot-toast'

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('profile')

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'security', label: 'Security', icon: Lock },
    { id: 'preferences', label: 'Preferences', icon: Palette },
  ]

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-foreground-secondary mt-1">
            Manage your account and preferences
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-background-secondary rounded-lg w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
                activeTab === tab.id
                  ? 'bg-accent text-white'
                  : 'text-foreground-secondary hover:text-foreground'
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="card">
          {activeTab === 'profile' && <ProfileSettings />}
          {activeTab === 'security' && <SecuritySettings />}
          {activeTab === 'preferences' && <PreferencesSettings />}
        </div>
      </div>
    </div>
  )
}

function ProfileSettings() {
  const { user, updateUser } = useAuth()
  const queryClient = useQueryClient()

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
    onError: () => {
      toast.error('Failed to update profile')
    },
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    updateMutation.mutate(formData)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <label className="block text-sm font-medium text-foreground">Email</label>
        <input
          type="email"
          value={user?.email || ''}
          disabled
          className="input bg-background-tertiary text-foreground-secondary"
        />
        <p className="text-xs text-foreground-tertiary">Email cannot be changed</p>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-foreground">Display Name</label>
        <input
          type="text"
          value={formData.display_name}
          onChange={(e) => setFormData(prev => ({ ...prev, display_name: e.target.value }))}
          className="input"
          placeholder="Your name"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-foreground">Bio</label>
        <textarea
          value={formData.bio}
          onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))}
          className="input resize-none"
          rows={3}
          placeholder="Tell us about yourself..."
          maxLength={500}
        />
        <p className="text-xs text-foreground-tertiary">{formData.bio.length}/500</p>
      </div>

      <button
        type="submit"
        disabled={updateMutation.isPending}
        className="btn btn-primary"
      >
        {updateMutation.isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Saving...
          </>
        ) : (
          <>
            <Save className="h-4 w-4" />
            Save Changes
          </>
        )}
      </button>
    </form>
  )
}

function SecuritySettings() {
  const [formData, setFormData] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  })

  const changeMutation = useMutation({
    mutationFn: ({ currentPassword, newPassword }) =>
      authService.changePassword(currentPassword, newPassword),
    onSuccess: () => {
      toast.success('Password changed successfully')
      setFormData({ current_password: '', new_password: '', confirm_password: '' })
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to change password')
    },
  })

  const handleSubmit = (e) => {
    e.preventDefault()

    if (formData.new_password !== formData.confirm_password) {
      toast.error('Passwords do not match')
      return
    }

    if (formData.new_password.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }

    changeMutation.mutate({
      currentPassword: formData.current_password,
      newPassword: formData.new_password,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <label className="block text-sm font-medium text-foreground">Current Password</label>
        <input
          type="password"
          value={formData.current_password}
          onChange={(e) => setFormData(prev => ({ ...prev, current_password: e.target.value }))}
          className="input"
          required
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-foreground">New Password</label>
        <input
          type="password"
          value={formData.new_password}
          onChange={(e) => setFormData(prev => ({ ...prev, new_password: e.target.value }))}
          className="input"
          required
          minLength={8}
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-foreground">Confirm New Password</label>
        <input
          type="password"
          value={formData.confirm_password}
          onChange={(e) => setFormData(prev => ({ ...prev, confirm_password: e.target.value }))}
          className="input"
          required
        />
      </div>

      <button
        type="submit"
        disabled={changeMutation.isPending}
        className="btn btn-primary"
      >
        {changeMutation.isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Changing...
          </>
        ) : (
          'Change Password'
        )}
      </button>
    </form>
  )
}

function PreferencesSettings() {
  const queryClient = useQueryClient()

  const { data: settingsData, isLoading } = useQuery({
    queryKey: ['user-settings'],
    queryFn: () => userService.getSettings(),
  })

  const settings = settingsData?.settings || {}

  const updateMutation = useMutation({
    mutationFn: userService.updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-settings'] })
      toast.success('Preferences updated')
    },
    onError: () => {
      toast.error('Failed to update preferences')
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-foreground">Theme</p>
          <p className="text-sm text-foreground-secondary">Choose your preferred theme</p>
        </div>
        <select
          value={settings.theme || 'dark'}
          onChange={(e) => updateMutation.mutate({ theme: e.target.value })}
          className="input w-auto"
        >
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-foreground">Notifications</p>
          <p className="text-sm text-foreground-secondary">Receive notifications about updates</p>
        </div>
        <button
          onClick={() => updateMutation.mutate({ notifications_enabled: !settings.notifications_enabled })}
          className={cn(
            'relative w-12 h-6 rounded-full transition-colors',
            settings.notifications_enabled ? 'bg-accent' : 'bg-background-tertiary'
          )}
        >
          <span
            className={cn(
              'absolute top-1 w-4 h-4 bg-white rounded-full transition-transform',
              settings.notifications_enabled ? 'left-7' : 'left-1'
            )}
          />
        </button>
      </div>
    </div>
  )
}
