/**
 * Internal types for PostgREST queries
 *
 * These types help with proper type narrowing when working with
 * generic wrappers around Postgrest methods.
 */

/**
 * Generic schema type that mirrors Supabase's schema structure
 */
export interface GenericSchema {
  Tables: Record<string, GenericTable>
  Views: Record<string, GenericView>
  Functions: Record<string, GenericFunction>
}

/**
 * Generic table structure
 */
export interface GenericTable {
  Row: Record<string, unknown>
  Insert: Record<string, unknown>
  Update: Record<string, unknown>
  Relationships: GenericRelationship[]
}

/**
 * Generic view structure
 */
export interface GenericView {
  Row: Record<string, unknown>
  Relationships: GenericRelationship[]
}

/**
 * Generic function structure
 */
export interface GenericFunction {
  Args: Record<string, unknown>
  Returns: unknown
}

/**
 * Generic relationship
 */
export interface GenericRelationship {
  foreignKeyName: string
  columns: string[]
  isOneToOne?: boolean
  referencedRelation: string
  referencedColumns: string[]
}

/**
 * Checks if a path string contains the JSON string operator (-->>)
 * Used to determine if a column name represents a JSON path with string extraction
 */
export type IsStringOperator<Path extends string> = Path extends `${string}->>${string}` ? true : false

/**
 * Converts JSON path syntax (using -> and ->>) to dot notation accessor
 * Example: "data->field->>value" becomes "data.field.value"
 */
export type JsonPathToAccessor<Path extends string> = Path extends `${infer P1}->${infer P2}`
  ? P2 extends `>${infer Rest}` // Handle ->> operator
    ? JsonPathToAccessor<`${P1}.${Rest}`>
    : P2 extends string // Handle -> operator
      ? JsonPathToAccessor<`${P1}.${P2}`>
      : Path
  : Path extends `>${infer Rest}` // Clean up any remaining > characters
    ? JsonPathToAccessor<Rest>
    : Path extends `${infer P1}::${infer _}` // Handle type casting
      ? JsonPathToAccessor<P1>
      : Path extends `${infer P1}${')' | ','}${infer _}` // Handle closing parenthesis and comma
        ? P1
        : Path

/**
 * Helper to check if a type can contain null values
 */
export type ContainsNull<T> = null extends T ? true : false

/**
 * Traverses a type using a dot-notation path to extract the nested type
 * Example: JsonPathToType<{ user: { name: string } }, "user.name"> = string
 */
export type JsonPathToType<T, Path extends string> = Path extends ''
  ? T
  : ContainsNull<T> extends true
    ? JsonPathToType<Exclude<T, null>, Path>
    : Path extends `${infer Key}.${infer Rest}`
      ? Key extends keyof T
        ? JsonPathToType<T[Key], Rest>
        : never
      : Path extends keyof T
        ? T[Path]
        : never

/**
 * Resolves the type of a column accessed through a relationship
 * Handles patterns like "posts.author.name" by traversing Tables and Views
 */
export type ResolveFilterRelationshipValue<
  Schema extends GenericSchema,
  RelationshipTable extends string,
  RelationshipColumn extends string,
> = Schema['Tables'] & Schema['Views'] extends infer TablesAndViews
  ? RelationshipTable extends keyof TablesAndViews
    ? 'Row' extends keyof TablesAndViews[RelationshipTable]
      ? RelationshipColumn extends keyof TablesAndViews[RelationshipTable]['Row']
        ? TablesAndViews[RelationshipTable]['Row'][RelationshipColumn]
        : unknown
      : unknown
    : unknown
  : never

/**
 * Core type resolution for filter values in Postgrest queries
 *
 * This type handles multiple patterns:
 * 1. Nested relationship paths: "table.column" or "table.nested.column"
 * 2. Simple column access: direct keyof Row lookup
 * 3. JSON string operators: columns using ->> syntax
 * 4. JSON path access: columns using -> or other JSON operators
 *
 * This conditional type remains unevaluated when ColumnName is a generic type parameter,
 * which is the fundamental limitation requiring type assertions in generic wrappers.
 */
export type ResolveFilterValue<
  Schema extends GenericSchema,
  Row extends Record<string, unknown>,
  ColumnName extends string,
> = ColumnName extends `${infer RelationshipTable}.${infer Remainder}`
  ? Remainder extends `${infer _}.${infer _}`
    ? ResolveFilterValue<Schema, Row, Remainder>
    : ResolveFilterRelationshipValue<Schema, RelationshipTable, Remainder>
  : ColumnName extends keyof Row
    ? Row[ColumnName]
    : IsStringOperator<ColumnName> extends true
      ? string
      : JsonPathToType<Row, JsonPathToAccessor<ColumnName>> extends infer JsonPathValue
        ? JsonPathValue extends never
          ? never
          : JsonPathValue
        : never

/**
 * Helper type matching the exact pattern used by PostgrestFilterBuilder.eq()
 *
 * This wraps ResolveFilterValue with the same conditional logic that Postgrest uses
 * for its .eq() method, including:
 * - Handling the case where ResolveFilterValue returns never
 * - Wrapping the result in NonNullable to enforce non-null filter values
 */
export type EqFilterValue<Schema extends GenericSchema, Row extends Record<string, unknown>, ColumnName extends string> =
  ResolveFilterValue<Schema, Row, ColumnName> extends never
    ? NonNullable<unknown>
    : ResolveFilterValue<Schema, Row, ColumnName> extends infer ResolvedFilterValue
      ? NonNullable<ResolvedFilterValue>
      : never
