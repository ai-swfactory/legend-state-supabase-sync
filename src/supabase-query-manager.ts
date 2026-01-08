import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * A typed façade over SupabaseClient for query operations.
 * This interface allows for dependency injection and easier testing.
 */
export interface ISupabaseClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any
  schema(schema: string): ISupabaseClient
}

/**
 * Default implementation that wraps a real Supabase client.
 */
export class DefaultSupabaseClient implements ISupabaseClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly client: SupabaseClient<any, any, any>

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(client: SupabaseClient<any, any, any>) {
    this.client = client
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any {
    return this.client.from(table)
  }

  schema(schema: string): ISupabaseClient {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
    return new DefaultSupabaseClient(this.client.schema(schema) as any)
  }
}

/**
 * Type assertion helper for non-null values.
 * Note: Function declaration required for TypeScript assertion signatures
 */
// eslint-disable-next-line func-style
function assertNonNull<T>(value: T, fieldName: string): asserts value is NonNullable<T> {
  if (value === null || value === undefined) {
    throw new Error(`${fieldName} must be non-null`)
  }
}

/**
 * Query result type
 */
export type QueryResult<T> = T[] | null

/**
 * Query/mutation manager for Supabase operations.
 * Provides typed CRUD operations with error handling.
 */
export class SupabaseQueryManager {
  private readonly supabase: ISupabaseClient

  constructor(supabase: ISupabaseClient) {
    this.supabase = supabase
  }

  /**
   * Fetch records from a table with optional select and filter functions.
   */
  async fetch<T>(
    collection: string,
    schema: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    selectFn?: (query: any) => any,
    filterFn?: <B>(select: B) => B,
  ): Promise<T[] | null> {
    const clientSchema = this.supabase.schema(schema)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const query = clientSchema.from(collection)

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    let select = selectFn ? selectFn(query) : query.select()
    if (filterFn) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      select = filterFn(select)
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { data, error } = await select
    if (error) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
      throw new Error(error.message)
    }
    return data as T[] | null
  }

  /**
   * Create a new record in a table.
   */
  async create<T>(collection: string, input: T): Promise<T | null> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const { data, error } = await this.supabase.from(collection).insert(input).select()
    if (error) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
      throw new Error(error.message)
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return (data?.[0] as T) ?? null
  }

  /**
   * Update an existing record in a table.
   */
  async update<T extends Record<string, unknown>>(
    collection: string,
    input: Partial<T> & Record<string, unknown>,
    fieldId: string,
  ): Promise<T | null> {
    const idValue = input[fieldId]
    assertNonNull(idValue, `update(): '${fieldId}'`)

    /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
    const { data, error } = await this.supabase
      .from(collection)
      .update(input)
      .eq(fieldId, idValue as string | number)
      .select()
    /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

    if (error) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
      throw new Error(error.message)
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unnecessary-condition
    return (data?.[0] as T) ?? null
  }

  /**
   * Delete a record from a table.
   */
  async delete<T>(collection: string, id: string | number, fieldId: string): Promise<T | null> {
    assertNonNull(id, `delete(): '${fieldId}'`)

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const { data, error } = await this.supabase.from(collection).delete().eq(fieldId, id).select()

    if (error) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
      throw new Error(error.message)
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return (data?.[0] as T) ?? null
  }
}
