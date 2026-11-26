/**
 * useWebSocket: a self-reconnecting subscription to one server push channel.
 *
 * What: opens `/ws/<channel>` (authenticated with the session token) and exposes
 * the last message received and whether the socket is connected.
 *
 * Why: live feeds (alerts, flights, agents) arrive by push rather than polling;
 * pages only need the latest message, not the socket plumbing.
 *
 * How: messages are parsed as JSON when possible (raw text otherwise) and
 * ignored while the demo is paused; a closed socket reconnects after 3 seconds
 * until the component unmounts.
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { isDemoPaused } from './useDemoPause'

/**
 * Subscribe to a server WebSocket channel.
 * @param {string} channel channel name, e.g. 'alerts'
 * @returns {{lastMessage: any, connected: boolean}}
 */
export function useWebSocket(channel) {
  const [lastMessage, setLastMessage] = useState(null)
  const [connected, setConnected] = useState(false)
  const wsRef = useRef(null)
  const reconnectTimer = useRef(null)

  /** Open the socket and wire its handlers; schedules itself again on close. */
  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const token = localStorage.getItem('token') || ''
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/${channel}?token=${encodeURIComponent(token)}`)

    ws.onopen = () => setConnected(true)
    ws.onclose = () => {
      setConnected(false)
      reconnectTimer.current = setTimeout(connect, 3000)
    }
    ws.onmessage = (e) => {
      if (isDemoPaused()) return   // demo paused: hold the current picture
      try {
        setLastMessage(JSON.parse(e.data))
      } catch {   // not JSON: pass the raw text through
        setLastMessage(e.data)
      }
    }
    wsRef.current = ws
  }, [channel])

  useEffect(() => {
    connect()
    return () => {
      clearTimeout(reconnectTimer.current)
      // Detach first: otherwise the close event would schedule a reconnect after unmount.
      if (wsRef.current) wsRef.current.onclose = null
      wsRef.current?.close()
    }
  }, [connect])

  return { lastMessage, connected }
}
