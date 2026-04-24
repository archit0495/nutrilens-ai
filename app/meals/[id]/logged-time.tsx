'use client'

import { useEffect, useState } from 'react'

/**
 * Render a meal's logged-at time.
 *
 * The server has no idea what timezone the user is in, so we seed the initial
 * render with a deterministic UTC `HH:MM` string (identical server + client
 * first render → no hydration mismatch) and then upgrade to the browser's
 * locale + timezone after mount.
 */
export default function LoggedTime({ iso }: { iso: string }) {
  const [time, setTime] = useState(() => {
    const d = new Date(iso)
    const hh = String(d.getUTCHours()).padStart(2, '0')
    const mm = String(d.getUTCMinutes()).padStart(2, '0')
    return `${hh}:${mm}`
  })
  useEffect(() => {
    setTime(
      new Date(iso).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    )
  }, [iso])
  return <span>{time}</span>
}
