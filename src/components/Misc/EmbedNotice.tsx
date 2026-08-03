import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

import { EmbedStatus, getEmbedStatus, subscribeToEmbedStatus } from '@utils/embed'

/**
 * Status overlay for a demo requested via the URL (tf2esports.com fork).
 *
 * Deliberately kept out of the zustand store: this is fork-local state, and keeping it
 * self-contained means upstream changes to the store/reducer can't conflict with it.
 */
export const EmbedNotice = () => {
  const [status, setStatus] = useState<EmbedStatus>(getEmbedStatus)

  useEffect(() => subscribeToEmbedStatus(setStatus), [])

  if (status.state === 'idle') return null

  return (
    <div className="ui-layer top-20 items-start justify-center">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="max-w-md rounded-lg bg-pp-panel/90 px-5 py-3 text-center"
      >
        {status.state === 'resolving' && <div>Looking up demo ...</div>}

        {status.state === 'error' && (
          <>
            <div className="font-bold">Couldn't load this demo</div>
            <div className="mt-1 text-sm opacity-70">{status.message}</div>
            {status.link && (
              <a
                href={status.link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-sm underline opacity-90 hover:opacity-100"
              >
                {status.link.label}
              </a>
            )}
            <div className="mt-2 text-xs opacity-50">
              You can still drag a <code>.dem</code> file in to watch it.
            </div>
          </>
        )}
      </motion.div>
    </div>
  )
}
