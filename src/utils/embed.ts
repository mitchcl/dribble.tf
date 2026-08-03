import axios from 'axios'

import { addDownloadAction, updateDownloadAction, parseDemoAction } from '@zus/actions'

//
// ─── EMBED (tf2esports.com fork) ────────────────────────────────────────────────
//
// Upstream dribble.tf only loads a demo the user drags in. tf2esports.com embeds this
// build in an <iframe> on its match pages, so it needs to say WHICH demo to open:
//
//   /dribble/?demo=693769                          demos.tf id (resolved via their API)
//   /dribble/?demoUrl=https://…/foo.dem            direct .dem URL
//   …&tick=1000                                    optional starting tick
//
// Everything runs in the visitor's own browser — the .dem is fetched straight from
// demos.tf (which serves `access-control-allow-origin: *`), never proxied through us.
//

const DEMOS_TF_API = 'https://api.demos.tf/demos'

// A demo URL comes off a query string, so it is attacker-controllable. Nothing here can
// reach a private network (it's a browser fetch, not server-side), but restricting the
// hosts keeps this page from being used as a generic "load anything from our domain"
// surface, and keeps the referrer we leak predictable.
const ALLOWED_DEMO_HOSTS = [/(^|\.)demos\.tf$/i, /(^|\.)tf2esports\.com$/i]

const isAllowedDemoUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url, window.location.origin)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
    if (parsed.origin === window.location.origin) return true
    return ALLOWED_DEMO_HOSTS.some(pattern => pattern.test(parsed.hostname))
  } catch {
    return false
  }
}

export type EmbedStatus =
  | { state: 'idle' }
  | { state: 'resolving' }
  | { state: 'error'; message: string; link?: { href: string; label: string } }

type EmbedStatusListener = (status: EmbedStatus) => void

let embedStatus: EmbedStatus = { state: 'idle' }
const listeners = new Set<EmbedStatusListener>()

export const getEmbedStatus = () => embedStatus

export const subscribeToEmbedStatus = (listener: EmbedStatusListener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const setEmbedStatus = (status: EmbedStatus) => {
  embedStatus = status
  listeners.forEach(listener => listener(status))
}

export interface EmbeddedDemoRequest {
  url: string
  name: string
  /** Map the demo was played on, when known up front — see resolveEmbeddedDemoAction. */
  map?: string
  tick: number
  demoId?: string
}

const reportEmbedError = (error: unknown, demoId?: string) => {
  console.error('[embed] failed to load demo', error)

  setEmbedStatus({
    state: 'error',
    message:
      error instanceof Error && error.message
        ? error.message
        : 'Could not load this demo. It may have been removed.',
    link: demoId ? { href: `https://demos.tf/${demoId}`, label: 'View on demos.tf' } : undefined,
  })
}

/**
 * Phase 1 — work out WHAT to load, without downloading it yet.
 *
 * Split from the download deliberately: the demos.tf record names the map, and knowing it
 * before the scene boots lets App load that map's geometry straight away. Otherwise the
 * viewer downloads the default map's (multi-MB) model first and throws it away the moment
 * the demo finishes parsing.
 *
 * Resolves to null when no demo was requested — i.e. somebody opened the viewer directly,
 * in which case it behaves exactly like upstream (drag a file in).
 */
export const resolveEmbeddedDemoAction = async (): Promise<EmbeddedDemoRequest | null> => {
  const params = new URLSearchParams(window.location.search)
  const demoId = params.get('demo')
  const explicitUrl = params.get('demoUrl')

  if (!demoId && !explicitUrl) return null

  const tick = Number(params.get('tick')) || 0

  try {
    setEmbedStatus({ state: 'resolving' })

    let request: EmbeddedDemoRequest

    if (demoId) {
      // demos.tf's API is public, keyless and CORS-open. The record also carries the
      // original filename, which reads better in the download overlay than the hashed
      // storage path, plus the map name we want for the head start above.
      const { data } = await axios.get(`${DEMOS_TF_API}/${encodeURIComponent(demoId)}`, {
        responseType: 'json',
      })

      if (!data?.url) throw new Error(`demos.tf ${demoId} has no downloadable file`)

      request = { url: data.url, name: data.name ?? `${demoId}.dem`, map: data.map, tick, demoId }
    } else {
      const url = explicitUrl as string
      request = { url, name: decodeURIComponent(url.split('/').pop() ?? 'demo.dem'), tick }
    }

    if (!isAllowedDemoUrl(request.url)) throw new Error('That demo host is not allowed')

    setEmbedStatus({ state: 'idle' })

    return request
  } catch (error) {
    reportEmbedError(error, demoId ?? undefined)
    return null
  }
}

/**
 * Phase 2 — download and parse. Must run after the viewer has mounted, so that the
 * download progress overlay is on screen for what is often a 50MB+ transfer.
 *
 * Returns the tick to seek to, which the caller applies once the scene is up.
 */
export const loadEmbeddedDemoAction = async (
  request: EmbeddedDemoRequest
): Promise<{ tick: number } | null> => {
  try {
    // Reuse upstream's download overlay rather than inventing a second progress UI.
    await addDownloadAction({ type: 'demo', url: request.url, name: request.name })

    const fileBuffer = await axios
      .get(request.url, {
        responseType: 'arraybuffer',
        onDownloadProgress: event => {
          updateDownloadAction(request.url, {
            progress: event.progress ? event.progress * 100 : 0,
            size: event.total,
          })
        },
      })
      .then(res => res.data)

    await parseDemoAction(fileBuffer)

    return { tick: request.tick }
  } catch (error) {
    reportEmbedError(error, request.demoId)
    return null
  }
}
