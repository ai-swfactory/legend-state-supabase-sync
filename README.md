# @ai-swfactory/legend-state-supabase-sync

Legend State Supabase Sync utilities - enhanced sync primitives for @legendapp/state with Supabase.

## Installation

```bash
npm install @ai-swfactory/legend-state-supabase-sync
```

## Features

- **SupabaseQueryManager**: Typed CRUD operations wrapper for Supabase
- **ChannelMonitor**: Monitor Supabase realtime channel health
- **NetworkMonitor**: Track network connectivity state
- **Poller**: Configurable polling mechanism for fallback sync

## Usage

### SupabaseQueryManager

```typescript
import { createClient } from '@supabase/supabase-js'
import { DefaultSupabaseClient, SupabaseQueryManager } from '@ai-swfactory/legend-state-supabase-sync'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const client = new DefaultSupabaseClient(supabase)
const manager = new SupabaseQueryManager(client)

// Fetch records
const users = await manager.fetch<User>('users', 'public')

// Create record
const newUser = await manager.create('users', { name: 'Alice', email: 'alice@example.com' })

// Update record
const updated = await manager.update<User>('users', { id: '1', name: 'Alice Updated' }, 'id')

// Delete record
const deleted = await manager.delete<User>('users', '1', 'id')
```

### ChannelMonitor

```typescript
import { ChannelMonitor, ChannelStatus } from '@ai-swfactory/legend-state-supabase-sync'

const channel = supabase.channel('my-channel')
const monitor = new ChannelMonitor(channel)

monitor.startMonitoring()
monitor.state$.onChange(state => {
  console.log('Channel status:', state.status)
})
```

### NetworkMonitor

```typescript
import { NetworkMonitor } from '@ai-swfactory/legend-state-supabase-sync'
import NetInfo from '@react-native-community/netinfo'

const monitor = new NetworkMonitor(NetInfo)
await monitor.startMonitoring()

monitor.state$.onChange(state => {
  console.log('Connected:', state.isConnected)
})
```

### Poller

```typescript
import { Poller } from '@ai-swfactory/legend-state-supabase-sync'

const poller = new Poller({
  refreshFn: async () => {
    await fetchLatestData()
  },
  intervalMs: 10000,
  onError: error => console.error('Poll error:', error),
})

poller.start()
// ...
poller.stop()
```

## License

MIT
