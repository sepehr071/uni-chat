import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { authService } from '../services/authService'
import toast from 'react-hot-toast'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [accessToken, setAccessToken] = useState(localStorage.getItem('accessToken'))

  // Check auth status on mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('accessToken')
      if (!token) {
        setIsLoading(false)
        return
      }

      try {
        const userData = await authService.getMe()
        setUser(userData)
      } catch (error) {
        // Token might be expired, try to refresh
        try {
          const refreshToken = localStorage.getItem('refreshToken')
          if (refreshToken) {
            const { access_token } = await authService.refresh()
            localStorage.setItem('accessToken', access_token)
            setAccessToken(access_token)
            const userData = await authService.getMe()
            setUser(userData)
          }
        } catch (refreshError) {
          // Clear invalid tokens
          localStorage.removeItem('accessToken')
          localStorage.removeItem('refreshToken')
          setAccessToken(null)
        }
      } finally {
        setIsLoading(false)
      }
    }

    checkAuth()
  }, [])

  const login = useCallback(async (email, password) => {
    try {
      const data = await authService.login(email, password)
      localStorage.setItem('accessToken', data.access_token)
      localStorage.setItem('refreshToken', data.refresh_token)
      setAccessToken(data.access_token)
      setUser(data.user)
      toast.success('Welcome back!')
      return data
    } catch (error) {
      const message = error.response?.data?.error || 'Login failed'
      toast.error(message)
      throw error
    }
  }, [])

  const register = useCallback(async (email, password, displayName) => {
    try {
      const data = await authService.register(email, password, displayName)
      toast.success('Account created! Please login.')
      return data
    } catch (error) {
      const message = error.response?.data?.error || 'Registration failed'
      toast.error(message)
      throw error
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await authService.logout()
    } catch (error) {
      // Ignore logout errors
    } finally {
      localStorage.removeItem('accessToken')
      localStorage.removeItem('refreshToken')
      setAccessToken(null)
      setUser(null)
      toast.success('Logged out')
    }
  }, [])

  const updateUser = useCallback((updates) => {
    setUser(prev => ({ ...prev, ...updates }))
  }, [])

  const value = {
    user,
    isLoading,
    isAuthenticated: !!user,
    accessToken,
    login,
    register,
    logout,
    updateUser,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
