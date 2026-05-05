import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { Eye, EyeOff, ArrowRight, Loader2, Check } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Progress } from '../../components/ui/progress'
import { useTranslation } from 'react-i18next'

export default function RegisterPage() {
  const navigate = useNavigate()
  const { register } = useAuth()
  const { t } = useTranslation('auth')
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
  const passwordStrengthVariants = ['error', 'warning', 'warning', 'success']
  const passwordStrengthLabels = [
    t('register.strength.weak'),
    t('register.strength.fair'),
    t('register.strength.good'),
    t('register.strength.strong'),
  ]

  const validate = () => {
    const newErrors = {}

    if (!formData.displayName) {
      newErrors.displayName = t('register.errors.name_required')
    } else if (formData.displayName.length < 2) {
      newErrors.displayName = t('register.errors.name_min')
    }

    if (!formData.email) {
      newErrors.email = t('register.errors.email_required')
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = t('register.errors.email_invalid')
    }

    if (!formData.password) {
      newErrors.password = t('register.errors.password_required')
    } else if (formData.password.length < 8) {
      newErrors.password = t('register.errors.password_min')
    } else if (!/\d/.test(formData.password)) {
      newErrors.password = t('register.errors.password_number')
    }

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = t('register.errors.confirm_mismatch')
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
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="text-center mb-8">
        <motion.h2
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-2xl font-bold text-foreground"
        >
          {t('register.title')}
        </motion.h2>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-foreground-secondary mt-2"
        >
          {t('register.subtitle')}
        </motion.p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Display Name field */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.15 }}
          className="space-y-2"
        >
          <Label htmlFor="displayName">{t('register.name_label')}</Label>
          <Input
            id="displayName"
            name="displayName"
            type="text"
            autoComplete="name"
            value={formData.displayName}
            onChange={handleChange}
            variant={errors.displayName ? 'error' : 'default'}
            placeholder={t('register.name_placeholder')}
          />
          {errors.displayName && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="text-sm text-error"
            >
              {errors.displayName}
            </motion.p>
          )}
        </motion.div>

        {/* Email field */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-2"
        >
          <Label htmlFor="email">{t('register.email_label')}</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            dir="ltr"
            value={formData.email}
            onChange={handleChange}
            variant={errors.email ? 'error' : 'default'}
            placeholder={t('register.email_placeholder')}
          />
          {errors.email && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="text-sm text-error"
            >
              {errors.email}
            </motion.p>
          )}
        </motion.div>

        {/* Password field */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.25 }}
          className="space-y-2"
        >
          <Label htmlFor="password">{t('register.password_label')}</Label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={formData.password}
              onChange={handleChange}
              variant={errors.password ? 'error' : 'default'}
              className="pe-10"
              placeholder={t('register.password_placeholder')}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute end-1 top-1/2 -translate-y-1/2 h-8 w-8"
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
          </div>
          {errors.password && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="text-sm text-error"
            >
              {errors.password}
            </motion.p>
          )}

          {/* Password strength indicator */}
          {formData.password && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="space-y-2"
            >
              <Progress
                value={passwordStrength * 25}
                variant={passwordStrengthVariants[passwordStrength - 1] || 'error'}
                size="sm"
              />
              <p className="text-xs text-foreground-secondary">
                {t('register.password_strength')}:{' '}
                <span className="font-medium">
                  {passwordStrengthLabels[passwordStrength - 1] || t('register.strength.very_weak')}
                </span>
              </p>
            </motion.div>
          )}
        </motion.div>

        {/* Confirm Password field */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="space-y-2"
        >
          <Label htmlFor="confirmPassword">{t('register.confirm_label')}</Label>
          <div className="relative">
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={formData.confirmPassword}
              onChange={handleChange}
              variant={errors.confirmPassword ? 'error' : 'default'}
              className="pe-10"
              placeholder={t('register.confirm_placeholder')}
            />
            {formData.confirmPassword && formData.password === formData.confirmPassword && (
              <div className="absolute end-3 top-1/2 -translate-y-1/2 text-success">
                <Check className="h-4 w-4" />
              </div>
            )}
          </div>
          {errors.confirmPassword && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="text-sm text-error"
            >
              {errors.confirmPassword}
            </motion.p>
          )}
        </motion.div>

        {/* Submit button */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
        >
          <Button
            type="submit"
            disabled={isLoading}
            className="w-full h-11 text-base shadow-lg shadow-accent/25"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin me-2" />
                {t('register.submitting')}
              </>
            ) : (
              <>
                {t('register.submit')}
                <ArrowRight className="h-4 w-4 ms-2" />
              </>
            )}
          </Button>
        </motion.div>
      </form>

      {/* Login link */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="text-center text-sm text-foreground-secondary mt-6"
      >
        {t('register.have_account')}{' '}
        <Link
          to="/login"
          className="text-accent hover:text-accent-hover font-medium transition-colors"
        >
          {t('register.sign_in')}
        </Link>
      </motion.p>
    </motion.div>
  )
}
