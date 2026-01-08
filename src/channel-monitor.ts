import type { Observable } from '@legendapp/state'
import { computed, observable } from '@legendapp/state'

import type { NetworkState } from './network-monitor'

// Enum for Supabase channel statuses (based on Realtime docs)
export enum ChannelStatus {
  INITIAL = 'INITIAL',
  SUBSCRIBED = 'SUBSCRIBED',
  CLOSED = 'CLOSED',
  CHANNEL_ERROR = 'CHANNEL_ERROR',
  TIMED_OUT = 'TIMED_OUT',
}

// Type for Supabase realtime payload (from 'postgres_changes' event)
export interface RealtimePayload<T = Record<string, unknown>> {
  commit_timestamp: string
  errors?: string[]
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  new?: T
  old?: T
  schema: string
  table: string
}

// Grouped message info
export interface LastMessageInfo {
  message: RealtimePayload
  receivedAt: number
}

// Custom error type for channel issues
export class ChannelError extends Error {
  constructor(
    message: string,
    public code: ChannelStatus.CHANNEL_ERROR | ChannelStatus.TIMED_OUT | 'UNKNOWN' = 'UNKNOWN',
  ) {
    super(message)
    this.name = 'ChannelError'
  }
}

// Discriminated union for ChannelMonitorState (ensures incompatible fields aren't combined)
export type ChannelMonitorState =
  | { status: ChannelStatus.INITIAL; lastMessage: null; error: null }
  | { status: ChannelStatus.SUBSCRIBED; lastMessage: LastMessageInfo | null; error: null }
  | { status: ChannelStatus.CLOSED; lastMessage: null; error: null }
  | { status: ChannelStatus.CHANNEL_ERROR | ChannelStatus.TIMED_OUT; lastMessage: null; error: ChannelError }

// Interface for the RealtimeChannel dependency (for DI and mocking)
export interface IRealtimeChannel {
  on(event: string, callback: (payload: RealtimePayload) => void): IRealtimeChannel
  subscribe(callback?: (status: ChannelStatus) => void): IRealtimeChannel
  unsubscribe(): Promise<string>
  state: ChannelStatus // For initial status
}

// Interface for the NetworkMonitor dependency (inject its state$ observable)
export interface INetworkMonitor {
  state$: Observable<NetworkState>
}

// The ChannelMonitor class with DI
export class ChannelMonitor {
  private channel: IRealtimeChannel

  public state$ = observable<ChannelMonitorState>({
    status: ChannelStatus.INITIAL,
    lastMessage: null,
    error: null,
  })

  constructor(channel: IRealtimeChannel) {
    this.channel = channel
  }

  startMonitoring() {
    // Monitor status changes via subscribe callback
    this.channel.subscribe(status => {
      if (status === ChannelStatus.CHANNEL_ERROR || status === ChannelStatus.TIMED_OUT) {
        this.state$.assign({
          status,
          lastMessage: null,
          error: new ChannelError(`Channel status: ${status}`, status),
        })
      } else {
        this.state$.assign({
          status,
          lastMessage: null,
          error: null,
        })
      }
    })

    // Monitor postgres_changes events for lastMessage
    this.channel.on('postgres_changes', payload => {
      this.state$.assign({
        lastMessage: { message: payload, receivedAt: Date.now() },
        error: null,
      })
    })

    // Initial status
    const status = this.channel.state
    if (status === ChannelStatus.CHANNEL_ERROR || status === ChannelStatus.TIMED_OUT) {
      this.state$.assign({
        status,
        lastMessage: null,
        error: new ChannelError(`Initial channel status: ${status}`, status),
      })
    } else {
      this.state$.assign({
        status,
        lastMessage: null,
        error: null,
      })
    }
  }

  stopMonitoring() {
    void this.channel.unsubscribe()
  }
}

// Computed health as a separate observable (combine network + channel states)
export const computeChannelHealth = (
  channelState: Observable<ChannelMonitorState>,
  networkState: Observable<NetworkState>,
): Observable<boolean> => {
  return computed(() => {
    const { status, lastMessage } = channelState.get()
    const { isConnected, isInternetReachable } = networkState.get()
    const isSubscribed = status === ChannelStatus.SUBSCRIBED
    const hasRecentActivity = lastMessage ? Date.now() - lastMessage.receivedAt < 30000 : false // 30s threshold
    return isSubscribed && (isConnected || isInternetReachable !== false) && hasRecentActivity
  })
}
