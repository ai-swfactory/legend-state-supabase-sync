export interface TimerHandle {
  cancel: () => void
}

export interface TimerProvider {
  setInterval: (callback: () => void, intervalMs: number) => TimerHandle
  clearInterval: (handle: TimerHandle) => void
}

const DEFAULT_INTERVAL_MS = 10000

export interface PollerConfig {
  refreshFn: () => void | Promise<void>
  intervalMs?: number
  timerProvider?: TimerProvider
  onError?: (error: Error) => void
}

export class Poller {
  private timer: TimerHandle | null = null
  private isRunning = false
  private readonly refreshFn: () => void | Promise<void>
  private readonly intervalMs: number
  private readonly timerProvider: TimerProvider
  private readonly onError?: (error: Error) => void

  constructor(config: PollerConfig) {
    this.refreshFn = config.refreshFn
    this.intervalMs = config.intervalMs ?? DEFAULT_INTERVAL_MS
    this.timerProvider = config.timerProvider ?? DEFAULT_TIMER_PROVIDER
    this.onError = config.onError
  }

  start(): void {
    if (!this.isRunning) {
      this.isRunning = true
      this.scheduleNext()
    }
  }

  stop(): void {
    if (this.timer) {
      this.timerProvider.clearInterval(this.timer)
      this.timer = null
      this.isRunning = false
    }
  }

  getIsRunning(): boolean {
    return this.isRunning
  }

  private scheduleNext(): void {
    if (!this.isRunning) {
      return
    }

    this.timer = this.timerProvider.setInterval(() => {
      void (async () => {
        try {
          await this.refreshFn()
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error))
          this.onError?.(err)
        }
      })()
    }, this.intervalMs)
  }
}

const createTimerProvider = <T>(
  setIntervalFn: (callback: () => void, ms: number) => T,
  clearIntervalFn: (id: T) => void,
): TimerProvider => ({
  setInterval: (callback: () => void, intervalMs: number): TimerHandle => {
    const id = setIntervalFn(callback, intervalMs)
    return {
      cancel: () => {
        clearIntervalFn(id)
      },
    }
  },
  clearInterval: (handle: TimerHandle) => {
    handle.cancel()
  },
})

export const DEFAULT_TIMER_PROVIDER: TimerProvider = (() => {
  if (typeof setInterval !== 'undefined' && typeof clearInterval !== 'undefined') {
    return createTimerProvider(setInterval, clearInterval)
  } else {
    throw new Error('No timer implementation available')
  }
})()
