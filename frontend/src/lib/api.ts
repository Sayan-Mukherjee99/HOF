/**
 * SŪTRA Typed API Client
 * Connects to local supervisor backend at http://127.0.0.1:8000
 */

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "BLOCKED"
export type DecisionType = "ALLOW_ONCE" | "ALLOW_SESSION" | "DENY" | "ALLOW_AUTO" | "DENY_AUTO"

export interface ApprovalRequest {
  id: string
  command: string
  risk: RiskLevel
  reason: string
  created_at: number
  expires_at: number
  status: "PENDING" | "RESOLVED" | "EXPIRED"
  decision?: string | null
  decided_by?: string | null
}

export interface AgentState {
  status: "IDLE" | "RUNNING" | "PAUSED" | "STOPPED" | "COMPLETED"
  current_task: string | null
  pending_approvals: ApprovalRequest[]
  is_paired: boolean
  paired_chat_id: number | null
  paired_username: string | null
}

export interface AuditRecord {
  id: string
  timestamp: string
  type: string
  risk: RiskLevel | null
  command: string | null
  decision: string | null
  actor: string | null
  payload: string | null
}

export interface PolicyRules {
  risk_levels: Record<string, string>
  unknown_command_policy: string
  approval_timeout_seconds: number
  session_allow_allowed_for_high: boolean
}

export interface PairingResponse {
  pairing_code: string
  expires_in_seconds: number
  instruction: string
}

export interface SutraEvent {
  id: string
  timestamp: string
  type: string
  payload: Record<string, unknown>
}

const BASE_URL = "http://127.0.0.1:8000"

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path}`
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  })

  if (!response.ok) {
    let errorDetail = response.statusText
    try {
      const errJson = await response.json()
      if (errJson?.detail) errorDetail = errJson.detail
    } catch {
      // ignore
    }
    throw new Error(`API Error [${response.status}]: ${errorDetail}`)
  }

  return response.json() as Promise<T>
}

export const api = {
  getState: () => request<AgentState>("/api/state"),

  getAudit: (params?: { risk?: string; decision?: string; limit?: number; cursor?: string }) => {
    const query = new URLSearchParams()
    if (params?.risk) query.append("risk", params.risk)
    if (params?.decision) query.append("decision", params.decision)
    if (params?.limit) query.append("limit", params.limit.toString())
    if (params?.cursor) query.append("cursor", params.cursor)
    const qs = query.toString()
    return request<AuditRecord[]>(`/api/audit${qs ? `?${qs}` : ""}`)
  },

  getPolicy: () => request<PolicyRules>("/api/policy"),

  createPairingCode: () => request<PairingResponse>("/api/pairing/new", { method: "POST" }),

  unpair: () => request<{ success: boolean; message: string }>("/api/pairing/unpair", { method: "POST" }),

  submitDecision: (approvalId: string, decision: "ALLOW_ONCE" | "ALLOW_SESSION" | "DENY") =>
    request<{ success: boolean; approval_id: string; decision: string }>(
      `/api/decision/${approvalId}`,
      {
        method: "POST",
        body: JSON.stringify({ decision }),
      }
    ),

  controlAgent: (action: "start" | "pause" | "resume" | "stop") =>
    request<{ success: boolean; action: string; status: string }>(
      `/api/agent/${action}`,
      { method: "POST" }
    ),
}
