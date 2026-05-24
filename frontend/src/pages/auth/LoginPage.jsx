import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { Eye, EyeOff, ArrowRight, Loader2, KeyRound, ChevronDown } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useLanguage } from '../../context/LanguageContext'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { useTranslation } from 'react-i18next'

export default function LoginPage() {
  const navigate = useNavigate()
  const { login, loginKeycloak } = useAuth()
  const { isRTL } = useLanguage()
  const { t } = useTranslation('auth')

  // KC enablement: lazy-init, undefined while checking, true/false once known.
  const [kcEnabled, setKcEnabled] = useState(undefined)
  const [ssoLoading, setSsoLoading] = useState(false)
  const [operatorOpen, setOperatorOpen] = useState(false)

  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  })
  const [errors, setErrors] = useState({})

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const keycloakClient = (await import('../../services/keycloakClient')).default
        await keycloakClient.init()
        if (cancelled) return
        const enabled = keycloakClient.isEnabled()
        setKcEnabled(enabled)
        // When SSO is disabled, default the operator form to expanded for graceful degradation.
        if (!enabled) setOperatorOpen(true)
      } catch {
        if (cancelled) return
        setKcEnabled(false)
        setOperatorOpen(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }))
    }
  }

  const validate = () => {
    const newErrors = {}

    if (!formData.email) {
      newErrors.email = t('login.errors.email_required')
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = t('login.errors.email_invalid')
    }

    if (!formData.password) {
      newErrors.password = t('login.errors.password_required')
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!validate()) return

    setIsLoading(true)
    try {
      const data = await login(formData.email, formData.password)
      navigate(data?.user?.role === 'platform_admin' ? '/platform/holding' : '/chat')
    } catch (error) {
      // Error is handled by the login function
    } finally {
      setIsLoading(false)
    }
  }

  const handleSso = async () => {
    setSsoLoading(true)
    try {
      await loginKeycloak()
      // loginKeycloak triggers a full navigation; if we end up here, it returned without redirect.
    } catch {
      // toast surfaced inside loginKeycloak
    } finally {
      setSsoLoading(false)
    }
  }

  const showSso = kcEnabled === true

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
          {t('login.title')}
        </motion.h2>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-foreground-secondary mt-2"
        >
          {t('login.subtitle')}
        </motion.p>
      </div>

      {/* Skeleton while KC enablement is unknown */}
      {kcEnabled === undefined && (
        <div className="space-y-3" aria-hidden="true">
          <div className="h-11 w-full rounded-md bg-background-elevated animate-pulse" />
          <div className="h-4 w-32 mx-auto rounded bg-background-elevated animate-pulse" />
        </div>
      )}

      {/* SSO primary CTA */}
      {showSso && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Button
            type="button"
            onClick={handleSso}
            disabled={ssoLoading}
            className="w-full h-11 text-base shadow-lg shadow-accent/25"
          >
            {ssoLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin me-2" />
                {t('sso.redirecting')}
              </>
            ) : (
              <>
                <KeyRound className="h-4 w-4 me-2" />
                {t('sso.signInWithKeycloak')}
              </>
            )}
          </Button>
        </motion.div>
      )}

      {/* Operator login disclosure */}
      {kcEnabled !== undefined && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className={showSso ? 'mt-6' : ''}
        >
          {showSso && (
            <button
              type="button"
              onClick={() => setOperatorOpen((v) => !v)}
              aria-expanded={operatorOpen}
              aria-controls="operator-login-panel"
              className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm text-foreground-secondary hover:text-foreground hover:bg-background-elevated transition-colors"
            >
              <span className="font-medium">{t('operator.toggle')}</span>
              <ChevronDown
                className={`h-4 w-4 transition-transform ${operatorOpen ? 'rotate-180' : ''}`}
              />
            </button>
          )}

          {(operatorOpen || !showSso) && (
            <div id="operator-login-panel" className={showSso ? 'mt-4' : ''}>
              {showSso && (
                <p className="text-xs text-foreground-secondary mb-4">
                  {t('operator.description')}
                </p>
              )}
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Email field */}
                <motion.div
                  initial={{ opacity: 0, x: isRTL ? 20 : -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 }}
                  className="space-y-2"
                >
                  <Label htmlFor="email">{t('login.email_label')}</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    dir="ltr"
                    value={formData.email}
                    onChange={handleChange}
                    variant={errors.email ? 'error' : 'default'}
                    placeholder={t('login.email_placeholder')}
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
                  initial={{ opacity: 0, x: isRTL ? 20 : -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 }}
                  className="space-y-2"
                >
                  <Label htmlFor="password">{t('login.password_label')}</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={formData.password}
                      onChange={handleChange}
                      variant={errors.password ? 'error' : 'default'}
                      className="pe-10"
                      placeholder={t('login.password_placeholder')}
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
                </motion.div>

                {/* Submit button */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                >
                  <Button
                    type="submit"
                    variant={showSso ? 'outline' : 'default'}
                    disabled={isLoading}
                    className={`w-full h-11 text-base ${showSso ? '' : 'shadow-lg shadow-accent/25'}`}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin me-2" />
                        {t('login.submitting')}
                      </>
                    ) : (
                      <>
                        {t('login.submit')}
                        <ArrowRight className="h-4 w-4 ms-2" />
                      </>
                    )}
                  </Button>
                </motion.div>
              </form>
            </div>
          )}
        </motion.div>
      )}
    </motion.div>
  )
}
