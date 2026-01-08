import { Poller, type TimerHandle, type TimerProvider } from '@ai-swfactory/legend-state-supabase-sync'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createMockTimerProvider = (): TimerProvider & {
  tick: () => void
  getScheduledCallbacks: () => (() => void)[]
} => {
  const scheduledCallbacks: (() => void)[] = []
  const activeHandles = new Set<TimerHandle>()

  return {
    setInterval: (callback: () => void, _intervalMs: number): TimerHandle => {
      scheduledCallbacks.push(callback)
      const handle = {
        cancel: () => {
          const index = scheduledCallbacks.indexOf(callback)
          if (index > -1) {
            scheduledCallbacks.splice(index, 1)
          }
          activeHandles.delete(handle)
        },
      }
      activeHandles.add(handle)
      return handle
    },
    clearInterval: (handle: TimerHandle) => {
      handle.cancel()
    },
    tick: () => {
      const callbacks = [...scheduledCallbacks]
      callbacks.forEach(cb => {
        cb()
      })
    },
    getScheduledCallbacks: () => [...scheduledCallbacks],
  }
}

describe('Poller', () => {
  let mockTimerProvider: ReturnType<typeof createMockTimerProvider>
  let refreshFn: ReturnType<typeof vi.fn>
  let onError: ReturnType<typeof vi.fn>
  let poller: Poller

  beforeEach(() => {
    mockTimerProvider = createMockTimerProvider()
    refreshFn = vi.fn()
    onError = vi.fn()

    poller = new Poller({
      refreshFn,
      intervalMs: 1000,
      timerProvider: mockTimerProvider,
      onError,
    })
  })

  afterEach(() => {
    poller.stop()
  })

  describe('start', () => {
    it('should start polling when not already running', () => {
      expect(poller.getIsRunning()).toBe(false)

      poller.start()

      expect(poller.getIsRunning()).toBe(true)
      expect(mockTimerProvider.getScheduledCallbacks()).toHaveLength(1)
    })

    it('should not start multiple timers when called multiple times', () => {
      poller.start()
      poller.start()
      poller.start()

      expect(mockTimerProvider.getScheduledCallbacks()).toHaveLength(1)
    })

    it('should execute refresh function on each tick', () => {
      poller.start()

      mockTimerProvider.tick()
      expect(refreshFn).toHaveBeenCalledTimes(1)

      mockTimerProvider.tick()
      expect(refreshFn).toHaveBeenCalledTimes(2)
    })
  })

  describe('stop', () => {
    it('should stop polling when running', () => {
      poller.start()
      expect(poller.getIsRunning()).toBe(true)

      poller.stop()

      expect(poller.getIsRunning()).toBe(false)
      expect(mockTimerProvider.getScheduledCallbacks()).toHaveLength(0)
    })

    it('should be safe to call stop multiple times', () => {
      poller.start()

      poller.stop()
      poller.stop()

      expect(poller.getIsRunning()).toBe(false)
      expect(mockTimerProvider.getScheduledCallbacks()).toHaveLength(0)
    })

    it('should not execute refresh function after stopping', () => {
      poller.start()
      mockTimerProvider.tick()
      expect(refreshFn).toHaveBeenCalledTimes(1)

      poller.stop()
      mockTimerProvider.tick()

      expect(refreshFn).toHaveBeenCalledTimes(1)
    })
  })

  describe('error handling', () => {
    it('should call onError when refresh function throws', async () => {
      const error = new Error('Test error')
      refreshFn.mockRejectedValue(error)

      poller.start()
      mockTimerProvider.tick()

      await new Promise(resolve => setTimeout(resolve, 0))

      expect(onError).toHaveBeenCalledWith(error)
    })

    it('should continue polling after errors', async () => {
      refreshFn.mockRejectedValueOnce(new Error('Test error'))
      refreshFn.mockResolvedValueOnce(undefined)

      poller.start()
      mockTimerProvider.tick()
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(onError).toHaveBeenCalledTimes(1)
      expect(poller.getIsRunning()).toBe(true)

      mockTimerProvider.tick()
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(refreshFn).toHaveBeenCalledTimes(2)
    })

    it('should convert non-Error objects to Error', async () => {
      refreshFn.mockRejectedValue('string error')

      poller.start()
      mockTimerProvider.tick()

      await new Promise(resolve => setTimeout(resolve, 0))

      expect(onError).toHaveBeenCalledWith(expect.any(Error))
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(onError.mock.calls[0]?.[0]?.message).toBe('string error')
    })
  })

  describe('async refresh function', () => {
    it('should handle async refresh functions', async () => {
      const asyncRefreshFn = vi.fn().mockResolvedValue(undefined)

      const asyncPoller = new Poller({
        refreshFn: asyncRefreshFn,
        intervalMs: 1000,
        timerProvider: mockTimerProvider,
        onError,
      })

      asyncPoller.start()
      mockTimerProvider.tick()

      await new Promise(resolve => setTimeout(resolve, 0))

      expect(asyncRefreshFn).toHaveBeenCalledTimes(1)

      asyncPoller.stop()
    })
  })
})
