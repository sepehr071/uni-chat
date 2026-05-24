import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'

import keycloakClient from '@/services/keycloakClient'
import { authService } from '@/services/authService'

export default function KeycloakCallbackPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useTranslation('auth')
  const ran = useRef(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    // StrictMode double-mounts effects in dev; the OIDC `code` is single-use
    // so re-running handleCallback would hit invalid_grant on the second pass.
    if (ran.current) return
    ran.current = true

    ;(async () => {
      try {
        await keycloakClient.init()
        const tokens = await keycloakClient.handleCallback()

        localStorage.setItem('accessToken', tokens.access_token)
        if (tokens.refresh_token) {
          localStorage.setItem('refreshToken', tokens.refresh_token)
        }
        if (tokens.id_token) {
          localStorage.setItem('kc_id_token', tokens.id_token)
        }
        localStorage.setItem('auth_kind', 'keycloak')

        const data = await authService.syncKeycloak(
          tokens.access_token,
          tokens.refresh_token,
          tokens.id_token,
        )

        queryClient.setQueryData(['authMe'], {
          ...data.user,
          features: data.features,
        })

        toast.success(t('sso.signedIn'))
        navigate('/chat', { replace: true })
      } catch (e) {
        console.error('Keycloak callback failed', e)
        setError(e?.message || t('sso.failed'))
        toast.error(t('sso.failed'))
        // Stay on this page — the OIDC state in sessionStorage is already
        // consumed, so bouncing the user straight to /login would just send
        // them back through a fresh round-trip with no explanation.
      }
    })()
  }, [navigate, queryClient, t])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8">
      <div className="text-fg-muted text-sm">
        {error ? error : t('ssoRedirecting', { defaultValue: 'Signing you in…' })}
      </div>
      {error && (
        <button
          onClick={() => navigate('/login', { replace: true })}
          className="px-4 py-2 rounded-md bg-background-elevated border border-border hover:bg-accent"
        >
          {t('backToLogin', { defaultValue: 'Back to login' })}
        </button>
      )}
    </div>
  )
}
