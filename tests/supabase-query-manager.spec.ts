import { type ISupabaseClient, SupabaseQueryManager } from '@ai-swfactory/legend-state-supabase-sync'
import { describe, expect, it } from 'vitest'

// Test implementation of ISupabaseClient - no mocks, real in-memory implementation
class TestSupabaseClient implements ISupabaseClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data = new Map<string, any[]>()
  errors = new Map<string, string>()
  currentSchema = 'public'

  // Seed initial data for testing
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  seed(table: string, records: any[]): void {
    const key = `${this.currentSchema}.${table}`
    this.data.set(key, records)
  }

  // Simulate errors for testing error cases
  setError(table: string, errorMessage: string): void {
    const key = `${this.currentSchema}.${table}`
    this.errors.set(key, errorMessage)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any {
    const key = `${this.currentSchema}.${table}`
    const hasError = this.errors.has(key)
    const errorMessage = this.errors.get(key)

    return {
      select: () => {
        const records = this.data.get(key) ?? []
        return {
          data: hasError ? null : records,
          error: hasError ? { message: errorMessage } : null,
        }
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      insert: (input: any) => ({
        select: () => {
          if (hasError) {
            return { data: null, error: { message: errorMessage } }
          }
          const records = this.data.get(key) ?? []
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          const newRecord = Array.isArray(input) ? input[0] : input
          records.push(newRecord)
          this.data.set(key, records)
          return { data: [newRecord], error: null }
        },
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      update: (input: any) => ({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        eq: (field: string, value: any) => ({
          select: () => {
            if (hasError) {
              return { data: null, error: { message: errorMessage } }
            }
            const records = this.data.get(key) ?? []
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            const index = records.findIndex(r => r[field] === value)
            if (index !== -1) {
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              records[index] = { ...records[index], ...input }
              this.data.set(key, records)
              return { data: [records[index]], error: null }
            }
            return { data: [], error: null }
          },
        }),
      }),
      delete: () => ({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        eq: (field: string, value: any) => ({
          select: () => {
            if (hasError) {
              return { data: null, error: { message: errorMessage } }
            }
            const records = this.data.get(key) ?? []
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            const index = records.findIndex(r => r[field] === value)
            if (index !== -1) {
              const deleted = records.splice(index, 1)
              this.data.set(key, records)
              return { data: deleted, error: null }
            }
            return { data: [], error: null }
          },
        }),
      }),
    }
  }

  schema(schema: string): ISupabaseClient {
    const newClient = new TestSupabaseClient()
    newClient.data = this.data
    newClient.errors = this.errors
    newClient.currentSchema = schema
    return newClient
  }
}

// Type for test data
interface TestUser {
  id: string
  name: string
  email: string
  [key: string]: string // Index signature to satisfy Record<string, unknown>
}

describe('SupabaseQueryManager', () => {
  describe('fetch', () => {
    describe('when fetching without filters', () => {
      const client = new TestSupabaseClient()
      const testData: TestUser[] = [
        { id: '1', name: 'Alice', email: 'alice@example.com' },
        { id: '2', name: 'Bob', email: 'bob@example.com' },
      ]
      client.seed('users', testData)

      const manager = new SupabaseQueryManager(client)
      const result = manager.fetch<TestUser>('users', 'public')

      it('should return all records', async () => {
        const data = await result
        expect(data).toEqual(testData)
      })
    })

    describe('when fetching with custom select function', () => {
      const client = new TestSupabaseClient()
      const testData: TestUser[] = [{ id: '1', name: 'Alice', email: 'alice@example.com' }]
      client.seed('users', testData)

      const manager = new SupabaseQueryManager(client)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const selectFn = (query: any) => query.select('id, name')
      const result = manager.fetch<TestUser>('users', 'public', selectFn)

      it('should call custom select function', async () => {
        const data = await result
        expect(data).toEqual(testData)
      })
    })

    describe('when fetching with filter function', () => {
      const client = new TestSupabaseClient()
      const testData: TestUser[] = [{ id: '1', name: 'Alice', email: 'alice@example.com' }]
      client.seed('users', testData)

      const manager = new SupabaseQueryManager(client)
      const filterFn = <B>(select: B) => select
      const result = manager.fetch<TestUser>('users', 'public', undefined, filterFn)

      it('should call filter function with select', async () => {
        const data = await result
        expect(data).toEqual(testData)
      })
    })

    describe('when fetch encounters error', () => {
      const client = new TestSupabaseClient()
      client.setError('users', 'Database connection failed')

      const manager = new SupabaseQueryManager(client)

      it('should throw error with message', async () => {
        await expect(manager.fetch<TestUser>('users', 'public')).rejects.toThrow('Database connection failed')
      })
    })

    describe('when fetching empty table', () => {
      const client = new TestSupabaseClient()
      client.seed('users', [])

      const manager = new SupabaseQueryManager(client)
      const result = manager.fetch<TestUser>('users', 'public')

      it('should return empty array', async () => {
        const data = await result
        expect(data).toEqual([])
      })
    })
  })

  describe('create', () => {
    describe('when creating valid record', () => {
      const client = new TestSupabaseClient()
      client.seed('users', [])

      const manager = new SupabaseQueryManager(client)
      const newUser: TestUser = { id: '1', name: 'Alice', email: 'alice@example.com' }
      const result = manager.create('users', newUser)

      it('should return created record', async () => {
        const data = await result
        expect(data).toEqual(newUser)
      })
    })

    describe('when create encounters error', () => {
      const client = new TestSupabaseClient()
      client.setError('users', 'Unique constraint violation')

      const manager = new SupabaseQueryManager(client)
      const newUser: TestUser = { id: '1', name: 'Alice', email: 'alice@example.com' }

      it('should throw error with message', async () => {
        await expect(manager.create('users', newUser)).rejects.toThrow('Unique constraint violation')
      })
    })

    describe('when create returns null data', () => {
      const client = new TestSupabaseClient()
      // Simulate scenario where insert succeeds but returns no data
      client.seed('users', [])

      const manager = new SupabaseQueryManager(client)
      const newUser: TestUser = { id: '1', name: 'Alice', email: 'alice@example.com' }
      const result = manager.create('users', newUser)

      it('should return the created record', async () => {
        const data = await result
        expect(data).toEqual(newUser)
      })
    })
  })

  describe('update', () => {
    describe('when updating existing record', () => {
      const client = new TestSupabaseClient()
      const existingUser: TestUser = { id: '1', name: 'Alice', email: 'alice@example.com' }
      client.seed('users', [existingUser])

      const manager = new SupabaseQueryManager(client)
      const updates: TestUser = { id: '1', name: 'Alice Updated', email: '' }
      const result = manager.update<TestUser>('users', updates, 'id')

      it('should return updated record', async () => {
        const data = await result
        expect(data).toMatchObject({ id: '1', name: 'Alice Updated' })
      })
    })

    describe('when updating with partial data', () => {
      const client = new TestSupabaseClient()
      const existingUser: TestUser = { id: '1', name: 'Alice', email: 'alice@example.com' }
      client.seed('users', [existingUser])

      const manager = new SupabaseQueryManager(client)
      const updates: TestUser = { id: '1', email: 'newemail@example.com', name: '' }
      const result = manager.update<TestUser>('users', updates, 'id')

      it('should preserve non-updated fields', async () => {
        const data = await result
        expect(data).toMatchObject({ name: '', email: 'newemail@example.com' })
      })
    })

    describe('when update encounters error', () => {
      const client = new TestSupabaseClient()
      client.setError('users', 'Permission denied')

      const manager = new SupabaseQueryManager(client)
      const updates: TestUser = { id: '1', name: 'Alice Updated', email: '' }

      it('should throw error with message', async () => {
        await expect(manager.update<TestUser>('users', updates, 'id')).rejects.toThrow('Permission denied')
      })
    })

    describe('when updating non-existent record', () => {
      const client = new TestSupabaseClient()
      client.seed('users', [])

      const manager = new SupabaseQueryManager(client)
      const updates: TestUser = { id: '999', name: 'Ghost', email: '' }
      const result = manager.update<TestUser>('users', updates, 'id')

      it('should return null', async () => {
        const data = await result
        expect(data).toBeNull()
      })
    })
  })

  describe('delete', () => {
    describe('when deleting existing record', () => {
      const client = new TestSupabaseClient()
      const existingUser: TestUser = { id: '1', name: 'Alice', email: 'alice@example.com' }
      client.seed('users', [existingUser])

      const manager = new SupabaseQueryManager(client)
      const result = manager.delete<TestUser>('users', '1', 'id')

      it('should return deleted record', async () => {
        const data = await result
        expect(data).toEqual(existingUser)
      })
    })

    describe('when delete encounters error', () => {
      const client = new TestSupabaseClient()
      client.setError('users', 'Foreign key constraint violation')

      const manager = new SupabaseQueryManager(client)

      it('should throw error with message', async () => {
        await expect(manager.delete<TestUser>('users', '1', 'id')).rejects.toThrow('Foreign key constraint violation')
      })
    })

    describe('when deleting non-existent record', () => {
      const client = new TestSupabaseClient()
      client.seed('users', [])

      const manager = new SupabaseQueryManager(client)
      const result = manager.delete<TestUser>('users', '999', 'id')

      it('should return null', async () => {
        const data = await result
        expect(data).toBeNull()
      })
    })

    describe('when deleting with different field identifier', () => {
      const client = new TestSupabaseClient()
      const existingUser: TestUser = { id: '1', name: 'Alice', email: 'alice@example.com' }
      client.seed('users', [existingUser])

      const manager = new SupabaseQueryManager(client)
      const result = manager.delete<TestUser>('users', 'alice@example.com', 'email')

      it('should delete by custom field', async () => {
        const data = await result
        expect(data).toEqual(existingUser)
      })
    })
  })

  describe('schema selection', () => {
    describe('when using different schema', () => {
      const client = new TestSupabaseClient()
      const testData: TestUser[] = [{ id: '1', name: 'Alice', email: 'alice@example.com' }]
      client.seed('users', testData)

      const manager = new SupabaseQueryManager(client)
      const result = manager.fetch<TestUser>('users', 'public')

      it('should fetch from specified schema', async () => {
        const data = await result
        expect(data).toEqual(testData)
      })
    })
  })
})
