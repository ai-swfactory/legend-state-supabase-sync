import {
  ChannelMonitor,
  type ChannelMonitorState,
  ChannelStatus,
  computeChannelHealth,
  type IRealtimeChannel,
  type LastMessageInfo,
  NetworkConnectionType,
  type NetworkState,
  type RealtimePayload,
} from '@ai-swfactory/legend-state-supabase-sync'
import type { Observable } from '@legendapp/state'
import { observable } from '@legendapp/state'
import { beforeEach, describe, expect, it } from 'vitest'

// Test implementation for IRealtimeChannel
class TestRealtimeChannel implements IRealtimeChannel {
  public state: ChannelStatus = ChannelStatus.INITIAL

  private onCallbacks = new Map<string, (payload: RealtimePayload) => void>()
  private subscribeCallback?: (status: ChannelStatus) => void
  private unsubscribed = false

  on(event: string, callback: (payload: RealtimePayload) => void): IRealtimeChannel {
    this.onCallbacks.set(event, callback)
    return this
  }

  subscribe(callback?: (status: ChannelStatus) => void): IRealtimeChannel {
    this.subscribeCallback = callback
    return this
  }

  unsubscribe(): Promise<string> {
    this.unsubscribed = true
    return Promise.resolve('unsubscribed')
  }

  // Test control methods
  triggerStatus(status: ChannelStatus): void {
    this.state = status
    if (this.subscribeCallback) {
      this.subscribeCallback(status)
    }
  }

  triggerEvent(event: string, payload: RealtimePayload): void {
    const callback = this.onCallbacks.get(event)
    if (callback) {
      callback(payload)
    }
  }

  isUnsubscribed(): boolean {
    return this.unsubscribed
  }
}

// Test implementation for INetworkMonitor
interface INetworkMonitor {
  state$: Observable<NetworkState>
}

class TestNetworkMonitor implements INetworkMonitor {
  public state$ = observable<NetworkState>({
    isConnected: true,
    connectionType: NetworkConnectionType.unknown,
    isInternetReachable: true,
  })

  setNetworkState(state: Partial<NetworkState>): void {
    this.state$.assign(state)
  }
}

// Test suite
describe('ChannelMonitor', () => {
  let testChannel: TestRealtimeChannel
  let monitor: ChannelMonitor

  beforeEach(() => {
    testChannel = new TestRealtimeChannel()
    monitor = new ChannelMonitor(testChannel)
  })

  it('should initialize with INITIAL status', () => {
    const state = monitor.state$.get()
    expect(state).toEqual({
      status: ChannelStatus.INITIAL,
      lastMessage: null,
      error: null,
    })
  })

  describe('startMonitoring', () => {
    it('should set initial status if non-error', () => {
      testChannel.state = ChannelStatus.INITIAL
      monitor.startMonitoring()
      const state = monitor.state$.get()
      expect(state.status).toBe(ChannelStatus.INITIAL)
      expect(state.lastMessage).toBeNull()
      expect(state.error).toBeNull()
    })

    it('should set initial status with error if error status', () => {
      testChannel.state = ChannelStatus.CHANNEL_ERROR
      monitor.startMonitoring()
      const state = monitor.state$.get()
      expect(state.status).toBe(ChannelStatus.CHANNEL_ERROR)
      expect(state.lastMessage).toBeNull()
      expect(state.error).toBeInstanceOf(Error)
      expect(state.error?.message).toBe(`Initial channel status: ${ChannelStatus.CHANNEL_ERROR}`)
    })

    it('should update status on subscribe callback if non-error', () => {
      monitor.startMonitoring()
      testChannel.triggerStatus(ChannelStatus.SUBSCRIBED)
      const state = monitor.state$.get()
      expect(state.status).toBe(ChannelStatus.SUBSCRIBED)
      expect(state.lastMessage).toBeNull()
      expect(state.error).toBeNull()
    })

    it('should update status on subscribe callback with error if error status', () => {
      monitor.startMonitoring()
      testChannel.triggerStatus(ChannelStatus.TIMED_OUT)
      const state = monitor.state$.get()
      expect(state.status).toBe(ChannelStatus.TIMED_OUT)
      expect(state.lastMessage).toBeNull()
      expect(state.error).toBeInstanceOf(Error)
      expect(state.error?.message).toBe(`Channel status: ${ChannelStatus.TIMED_OUT}`)
    })

    it('should update lastMessage on postgres_changes event', () => {
      monitor.startMonitoring()
      const mockPayload: RealtimePayload = {
        commit_timestamp: '2023-01-01T00:00:00Z',
        eventType: 'INSERT',
        schema: 'public',
        table: 'test',
      }
      testChannel.triggerEvent('postgres_changes', mockPayload)
      const state = monitor.state$.get()
      expect(state.lastMessage).not.toBeNull()
      expect((state.lastMessage as LastMessageInfo).message).toEqual(mockPayload)
      expect((state.lastMessage as LastMessageInfo).receivedAt).toBeGreaterThan(0)
      expect(state.error).toBeNull()
    })
  })

  describe('stopMonitoring', () => {
    it('should call unsubscribe on the channel', () => {
      monitor.startMonitoring()
      monitor.stopMonitoring()
      expect(testChannel.isUnsubscribed()).toBe(true)
    })
  })
})

describe('computeChannelHealth', () => {
  let channelState$: Observable<ChannelMonitorState>
  let networkMonitor: TestNetworkMonitor
  let health$: Observable<boolean>

  beforeEach(() => {
    channelState$ = observable<ChannelMonitorState>({
      status: ChannelStatus.INITIAL,
      lastMessage: null,
      error: null,
    })
    networkMonitor = new TestNetworkMonitor()
    health$ = computeChannelHealth(channelState$, networkMonitor.state$)
  })

  it('should return false if not subscribed', () => {
    channelState$.set({
      status: ChannelStatus.INITIAL,
      lastMessage: null,
      error: null,
    })
    expect(health$.get()).toBe(false)
  })

  it('should return false if no recent activity', () => {
    channelState$.set({
      status: ChannelStatus.SUBSCRIBED,
      lastMessage: null,
      error: null,
    })
    expect(health$.get()).toBe(false)
  })

  it('should return false if recent activity but network not connected and reachable false', () => {
    channelState$.set({
      status: ChannelStatus.SUBSCRIBED,
      lastMessage: { message: {} as RealtimePayload, receivedAt: Date.now() },
      error: null,
    })
    networkMonitor.setNetworkState({ isConnected: false, isInternetReachable: false })
    expect(health$.get()).toBe(false)
  })

  it('should return true if subscribed, recent activity, and network connected', () => {
    channelState$.set({
      status: ChannelStatus.SUBSCRIBED,
      lastMessage: { message: {} as RealtimePayload, receivedAt: Date.now() },
      error: null,
    })
    networkMonitor.setNetworkState({ isConnected: true, isInternetReachable: true })
    expect(health$.get()).toBe(true)
  })

  it('should return true if subscribed, recent activity, and network not connected but reachable null', () => {
    channelState$.set({
      status: ChannelStatus.SUBSCRIBED,
      lastMessage: { message: {} as RealtimePayload, receivedAt: Date.now() },
      error: null,
    })
    networkMonitor.setNetworkState({ isConnected: false, isInternetReachable: null })
    expect(health$.get()).toBe(true)
  })

  it('should return false if recent activity is older than 30 seconds', () => {
    channelState$.set({
      status: ChannelStatus.SUBSCRIBED,
      lastMessage: { message: {} as RealtimePayload, receivedAt: Date.now() - 31000 },
      error: null,
    })
    expect(health$.get()).toBe(false)
  })
})
