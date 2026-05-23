import { lazy } from 'react'

const RETRY_KEY = 'lazy-retry-attempted'

function isChunkLoadError(err) {
  if (!err) return false
  const msg = String(err.message || err)
  return (
    err.name === 'ChunkLoadError' ||
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Loading chunk') ||
    msg.includes('Importing a module script failed')
  )
}

export default function lazyWithRetry(importer) {
  return lazy(() =>
    importer().catch((err) => {
      if (!isChunkLoadError(err)) throw err
      const alreadyRetried = sessionStorage.getItem(RETRY_KEY) === '1'
      if (alreadyRetried) {
        sessionStorage.removeItem(RETRY_KEY)
        throw err
      }
      sessionStorage.setItem(RETRY_KEY, '1')
      window.location.reload()
      return new Promise(() => {})
    })
  )
}
