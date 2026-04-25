'use client'

import { useSyncExternalStore } from 'react'

/**
 * Render a meal's logged-at time.
 *
 * The server has no idea what timezone the user is in, so we feed
 * `useSyncExternalStore` a deterministic UTC `HH:MM` server snapshot and a
 * locale-formatted client snapshot. React swaps from server → client snapshot
 * automatically on mount, with no setState-in-effect (which the new
 * react-hooks lint rules flag).
 */
const subscribe = () => () => {}

export default function LoggedTime({ iso }: { iso: string }) {
  const time = useSyncExternalStore(
    subscribe,
    () =>
      new Date(iso).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
    () => {
      const d = new Date(iso)
      const hh = String(d.getUTCHours()).padStart(2, '0')
      const mm = String(d.getUTCMinutes()).padStart(2, '0')
      return `${hh}:${mm}`
    }
  )
  return <span>{time}</span>
}
