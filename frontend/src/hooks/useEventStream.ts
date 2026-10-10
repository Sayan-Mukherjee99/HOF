import { useEffect, useRef, useState, useCallback } from "react"
import { type SutraEvent } from "@/lib/api"

export type ConnectionState = "connecting" | "connected" | "disconnected"

interface UseEventStreamOptions {
  url?: string
  maxHistory?: number
  autoReconnect?: boolean
  reconnectInterval?: number
}

export function useEventStream(options: UseEventStreamOptions = {}) {
  const {
    url = "ws://127.0.0.1:8000/ws/events",
    maxHistory = 100,
    autoReconnect = true,
    reconnectInterval = 3000,
  } = options

  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting")
  const [lastEvent, setLastEvent] = useState<SutraEvent | null>(null)
  const [events, setEvents] = useState<SutraEvent[]>([])
  
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<number | null>(null)
  const isMountedRef = useRef<boolean>(true)

  const connect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      window.clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    if (wsRef.current) {
      wsRef.current.close()
    }

    setConnectionState("connecting")

    try {
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        if (!isMountedRef.current) return
        setConnectionState("connected")
      }

      ws.onmessage = (event) => {
        if (!isMountedRef.current) return
        try {
          const parsed = JSON.parse(event.data) as SutraEvent
          setLastEvent(parsed)
          setEvents((prev) => {
            const next = [parsed, ...prev]
            return next.slice(0, maxHistory)
          })
        } catch (err) {
          console.error("[WS] Failed to parse event JSON:", err)
        }
      }

      ws.onerror = () => {
        if (!isMountedRef.current) return
        setConnectionState("disconnected")
      }

      ws.onclose = () => {
        if (!isMountedRef.current) return
        setConnectionState("disconnected")
        if (autoReconnect) {
          reconnectTimeoutRef.current = window.setTimeout(() => {
            if (isMountedRef.current) {
              connect()
            }
          }, reconnectInterval)
        }
      }
    } catch {
      setConnectionState("disconnected")
      if (autoReconnect) {
        reconnectTimeoutRef.current = window.setTimeout(() => {
          if (isMountedRef.current) {
            connect()
          }
        }, reconnectInterval)
      }
    }
  }, [url, autoReconnect, reconnectInterval, maxHistory])

  useEffect(() => {
    isMountedRef.current = true
    connect()

    return () => {
      isMountedRef.current = false
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [connect])

  return {
    connectionState,
    lastEvent,
    events,
    reconnect: connect,
  }
}
