import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, ArrowRight, Loader2, Check } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

export default function RegisterPage() {
  const navigate = useNavigate()
  const { register } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [formData, setFormData] = useState({
    displayName: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [errors, setErrors] = useState({})

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }))
    }
  }

  const getPasswordStrength = (password) => {
    let strength = 0
    if (password.length >= 8) strength++
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++
    if (/\d/.test(password)) strength++
    if (/[^a-zA-Z0-9]/.test(password)) strength++
    return strength
  }

  const passwordStrength = getPasswordStrength(formData.password)
  const passwordStrengthColors = ['bg-error', 'bg-warning', 'bg-warning', 'bg-success']
  const passwordStrengthLabels = ['Weak', 'Fair', 'Good', 'Strong']

  const validate = () => {
    const newErrors = {}

    if (!formData.displayName) {
      newErrors.displayName = 'Name is required'
    } else if (formData.displayName.length < 2) {
      newErrors.displayName = 'Name must be at least 2 characters'
    }

    if (!formData.email) {
      newErrors.email = 'Email is required'
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email'
    }

    if (!formData.password) {
      newErrors.password = 'Password is required'
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters'
    } else if (!/\d/.test(formData.password)) {
      newErrors.password = 'Password must contain at least one number'
    }

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!validate()) return

    setIsLoading(true)
    try {
      await register(formData.email, formData.password, formData.displayName)
      navigate('/login')
    } catch (error) {
      // Error is handled by the register function
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="animate-fade-in">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-foreground">Create your account</h2>
        <p className="text-foreground-secondary mt-2">
          Start chatting with custom AI assistants
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Display Name field */}
        <div className="space-y-2">
          <label htmlFor="displayName" className="block text-sm font-medium text-foreground">
            Display name
          </label>
          <input
            id="displayName"
            name="displayName"
            type="text"
            autoComplete="name"
            value={formData.displayName}
            onChange={handleChange}
            className={`input ${errors.displayName ? 'input-error' : ''}`}
            placeholder="John Doe"
          />
          {errors.displayName && (
            <p className="text-sm text-error">{errors.displayName}</p>
          )}
        </div>

        {/* Email field */}
        <div className="space-y-2">
          <label htmlFor="email" className="block text-sm font-medium text-foreground">
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={formData.email}
            onChange={handleChange}
            className={`input ${errors.email ? 'input-error' : ''}`}
            placeholder="you@example.com"
          />
          {errors.email && (
            <p className="text-sm text-error">{errors.email}</p>
          )}
        </div>

        {/* Password field */}
        <div className="space-y-2">
          <label htmlFor="password" className="block text-sm font-medium text-foreground">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={formData.password}
              onChange={handleChange}
              className={`input pr-10 ${errors.password ? 'input-error' : ''}`}
              placeholder="Create a password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-tertiary hover:text-foreground"
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          {errors.password && (
            <p className="text-sm text-error">{errors.password}</p>
          )}

          {/* Password strength indicator */}
          {formData.password && (
            <div className="space-y-1">
              <div className="flex gap-1">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full transition-colors ${
                      i < passwordStrength
                        ? passwordStrengthColors[passwordStrength - 1]
                        : 'bg-border'
                    }`}
                  />
                ))}
              </div>
              <p className="text-xs text-foreground-secondary">
                Password strength: {passwordStrengthLabels[passwordStrength - 1] || 'Very weak'}
              </p>
            </div>
          )}
        </div>

        {/* Confirm Password field */}
        <div className="space-y-2">
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-foreground">
            Confirm password
          </label>
          <div className="relative">
            <input
              id="confirmPassword"
              name="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={formData.confirmPassword}
              onChange={handleChange}
              className={`input pr-10 ${errors.confirmPassword ? 'input-error' : ''}`}
              placeholder="Confirm your password"
            />
            {formData.confirmPassword && formData.password === formData.confirmPassword && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-success">
                <Check className="h-4 w-4" />
              </div>
            )}
          </div>
          {errors.confirmPassword && (
            <p className="text-sm text-error">{errors.confirmPassword}</p>
          )}
        </div>

        {/* Submit button */}
        <button
          type="submit"
          disabled={isLoading}
          className="btn btn-primary w-full py-2.5"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Creating account...
            </>
          ) : (
            <>
              Create account
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </form>

      {/* Login link */}
      <p className="text-center text-sm text-foreground-secondary mt-6">
        Already have an account?{' '}
        <Link
          to="/login"
          className="text-accent hover:text-accent-hover font-medium"
        >
          Sign in
        </Link>
      </p>
    </div>
  )
}
