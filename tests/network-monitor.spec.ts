import {
  type INetInfo,
  type NetInfoState,
  NetworkConnectionType,
  NetworkMonitor,
  type NetworkState,
} from '@ai-swfactory/legend-state-supabase-sync'
import { beforeEach, describe, expect, it } from 'vitest'

// Test implementation of INetInfo that provides controllable network state
class TestNetInfo implements INetInfo {
  private state: NetInfoState
  private listeners = new Set<(state: NetInfoState) => void>()

  constructor(initialState?: Partial<NetInfoState>) {
    this.state = {
      isConnected: false,
      type: NetworkConnectionType.unknown,
      isInternetReachable: null,
      ...initialState,
    }
  }

  async fetch(): Promise<NetInfoState> {
    return Promise.resolve(this.state)
  }

  addEventListener(listener: (state: NetInfoState) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  // Test helper methods to control state
  setState(state: Partial<NetInfoState>): void {
    this.state = { ...this.state, ...state }
    this.notifyListeners()
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      listener(this.state)
    })
  }
}

describe('NetworkMonitor', () => {
  describe('constructor', () => {
    it('should initialize with default network state', () => {
      const netInfo = new TestNetInfo()
      const monitor = new NetworkMonitor(netInfo)

      expect(monitor.state$.get()).toEqual({
        isConnected: false,
        connectionType: NetworkConnectionType.unknown,
        isInternetReachable: null,
      })
    })

    it('should accept custom NetInfo implementation', () => {
      const testNetInfo = new TestNetInfo()
      const monitor = new NetworkMonitor(testNetInfo)

      expect(monitor).toBeDefined()
    })
  })

  describe('startMonitoring', () => {
    describe('when starting monitoring for the first time', () => {
      let testNetInfo: TestNetInfo
      let monitor: NetworkMonitor

      beforeEach(() => {
        testNetInfo = new TestNetInfo({
          isConnected: true,
          type: NetworkConnectionType.wifi,
          isInternetReachable: true,
        })
        monitor = new NetworkMonitor(testNetInfo)
      })

      it('should fetch initial network state', async () => {
        await monitor.startMonitoring()

        expect(monitor.state$.get()).toEqual({
          isConnected: true,
          connectionType: NetworkConnectionType.wifi,
          isInternetReachable: true,
        })
      })

      it('should update state with fetched network information', async () => {
        await monitor.startMonitoring()

        expect(monitor.state$.get()).toEqual({
          isConnected: true,
          connectionType: NetworkConnectionType.wifi,
          isInternetReachable: true,
        })
      })

      it('should subscribe to network changes', async () => {
        await monitor.startMonitoring()

        // Change state and verify monitor reacts
        testNetInfo.setState({
          isConnected: false,
          type: NetworkConnectionType.none,
        })

        expect(monitor.state$.get().isConnected).toBe(false)
      })

      it('should handle null isConnected value', async () => {
        const netInfo = new TestNetInfo({
          isConnected: null,
          type: NetworkConnectionType.unknown,
          isInternetReachable: null,
        })
        const monitorWithNullState = new NetworkMonitor(netInfo)

        await monitorWithNullState.startMonitoring()

        expect(monitorWithNullState.state$.get().isConnected).toBe(false)
      })
    })

    describe('when already monitoring', () => {
      let testNetInfo: TestNetInfo
      let monitor: NetworkMonitor

      beforeEach(() => {
        testNetInfo = new TestNetInfo({
          isConnected: true,
          type: NetworkConnectionType.wifi,
          isInternetReachable: true,
        })
        monitor = new NetworkMonitor(testNetInfo)
      })

      it('should not start monitoring again', async () => {
        await monitor.startMonitoring()
        const initialState = monitor.state$.get()

        // Try to start monitoring again
        await monitor.startMonitoring()

        // State should remain unchanged
        expect(monitor.state$.get()).toEqual(initialState)
      })
    })
  })

  describe('network state changes', () => {
    let testNetInfo: TestNetInfo
    let monitor: NetworkMonitor

    beforeEach(() => {
      testNetInfo = new TestNetInfo({
        isConnected: false,
        type: NetworkConnectionType.none,
        isInternetReachable: false,
      })
      monitor = new NetworkMonitor(testNetInfo)
    })

    describe('when network state changes after monitoring starts', () => {
      it('should update state when connection becomes available', async () => {
        await monitor.startMonitoring()

        expect(monitor.state$.get().isConnected).toBe(false)

        testNetInfo.setState({
          isConnected: true,
          type: NetworkConnectionType.wifi,
          isInternetReachable: true,
        })

        expect(monitor.state$.get()).toEqual({
          isConnected: true,
          connectionType: NetworkConnectionType.wifi,
          isInternetReachable: true,
        })
      })

      it('should update state when connection is lost', async () => {
        await monitor.startMonitoring()

        testNetInfo.setState({
          isConnected: true,
          type: NetworkConnectionType.cellular,
          isInternetReachable: true,
        })

        expect(monitor.state$.get().isConnected).toBe(true)

        testNetInfo.setState({
          isConnected: false,
          type: NetworkConnectionType.none,
          isInternetReachable: false,
        })

        expect(monitor.state$.get()).toEqual({
          isConnected: false,
          connectionType: NetworkConnectionType.none,
          isInternetReachable: false,
        })
      })

      it('should update state when connection type changes', async () => {
        await monitor.startMonitoring()

        testNetInfo.setState({
          isConnected: true,
          type: NetworkConnectionType.wifi,
          isInternetReachable: true,
        })

        expect(monitor.state$.get().connectionType).toBe(NetworkConnectionType.wifi)

        testNetInfo.setState({
          isConnected: true,
          type: NetworkConnectionType.cellular,
          isInternetReachable: true,
        })

        expect(monitor.state$.get().connectionType).toBe(NetworkConnectionType.cellular)
      })

      it('should update state when internet reachability changes', async () => {
        await monitor.startMonitoring()

        testNetInfo.setState({
          isConnected: true,
          type: NetworkConnectionType.wifi,
          isInternetReachable: true,
        })

        expect(monitor.state$.get().isInternetReachable).toBe(true)

        testNetInfo.setState({
          isConnected: true,
          type: NetworkConnectionType.wifi,
          isInternetReachable: false,
        })

        expect(monitor.state$.get().isInternetReachable).toBe(false)
      })
    })
  })

  describe('stopMonitoring', () => {
    describe('when monitoring is active', () => {
      let testNetInfo: TestNetInfo
      let monitor: NetworkMonitor

      beforeEach(async () => {
        testNetInfo = new TestNetInfo({
          isConnected: true,
          type: NetworkConnectionType.wifi,
          isInternetReachable: true,
        })
        monitor = new NetworkMonitor(testNetInfo)
        await monitor.startMonitoring()
      })

      it('should stop reacting to state changes', () => {
        monitor.stopMonitoring()

        const stateBeforeChange = monitor.state$.get()

        // Try to change state after stopping
        testNetInfo.setState({
          isConnected: false,
          type: NetworkConnectionType.none,
        })

        // Monitor should not react to changes
        expect(monitor.state$.get()).toEqual(stateBeforeChange)
      })

      it('should allow restarting monitoring after stopping', async () => {
        monitor.stopMonitoring()

        // Change state while stopped
        testNetInfo.setState({
          isConnected: false,
          type: NetworkConnectionType.none,
          isInternetReachable: false,
        })

        // Restart monitoring
        await monitor.startMonitoring()

        // Should fetch current state
        expect(monitor.state$.get()).toEqual({
          isConnected: false,
          connectionType: NetworkConnectionType.none,
          isInternetReachable: false,
        })
      })
    })

    describe('when monitoring is not active', () => {
      it('should not throw when stopping non-active monitoring', () => {
        const netInfo = new TestNetInfo()
        const monitor = new NetworkMonitor(netInfo)

        expect(() => {
          monitor.stopMonitoring()
        }).not.toThrow()
      })
    })
  })

  describe('state observable reactivity', () => {
    it('should allow external subscribers to react to state changes', async () => {
      const testNetInfo = new TestNetInfo({
        isConnected: false,
        type: NetworkConnectionType.none,
        isInternetReachable: false,
      })

      const monitor = new NetworkMonitor(testNetInfo)
      const stateChanges: NetworkState[] = []

      // Subscribe to state changes
      monitor.state$.onChange(changeInfo => {
        stateChanges.push(changeInfo.value)
      })

      await monitor.startMonitoring()

      expect(stateChanges).toHaveLength(1)
      expect(stateChanges[0]).toEqual({
        isConnected: false,
        connectionType: NetworkConnectionType.none,
        isInternetReachable: false,
      })

      // Trigger another state change
      testNetInfo.setState({
        isConnected: true,
        type: NetworkConnectionType.wifi,
        isInternetReachable: true,
      })

      expect(stateChanges).toHaveLength(2)
      expect(stateChanges[1]).toEqual({
        isConnected: true,
        connectionType: NetworkConnectionType.wifi,
        isInternetReachable: true,
      })
    })
  })
})
