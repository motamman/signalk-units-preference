/**
 * Conversion definition for a specific target unit
 */
export interface ConversionDefinition {
  /** Formula to convert from base unit to target unit (e.g., "value * 1.94384" or "value - 273.15") */
  formula: string
  /** Formula to convert back from target unit to base unit */
  inverseFormula: string
  /** Symbol to display for this unit (e.g., "kn", "°C", "mph") */
  symbol: string
  /** Human-readable name for this unit (e.g., "knots", "celsius", "miles per hour") */
  longName?: string
  /** Optional: ASCII-safe key for symbols with extended characters (e.g., "deg" for "°", "deg_s" for "°/s"). If not provided, defaults to symbol value. */
  key?: string
  /** Optional: Named date format for date/time conversions */
  dateFormat?: string
  /** Optional: Whether to render using local time zone */
  useLocalTime?: boolean
  /** Legacy: Multiplication factor (deprecated, use formula instead) */
  factor?: number
  /** Legacy: Inverse factor (deprecated, use inverseFormula instead) */
  inverseFactor?: number
}

/**
 * Base unit definition (pure conversion math, no category)
 */
export interface BaseUnitDefinition {
  /** Base unit symbol (e.g., "m/s", "Pa", "K") */
  baseUnit: string
  /** Human-readable name for this base unit (e.g., "meters per second", "pascal", "kelvin") */
  longName?: string
  /** Human-readable description (e.g., "speed", "temperature", "date/time format") */
  description?: string
  /** Available conversions for this unit */
  conversions: Record<string, ConversionDefinition>
  /** Whether this is a custom (user-defined) unit */
  isCustom?: boolean
  /** List of conversion names that are custom (user-added) */
  customConversions?: string[]
}

/**
 * Unit metadata for a specific path
 */
export interface UnitMetadata {
  /** Base unit from SignalK schema (e.g., "m/s", "Pa", "K") or custom unit */
  baseUnit: string | null
  /** Category of measurement (e.g., "speed", "temperature", "pressure") */
  category: string
  /** Available conversions for this unit */
  conversions: Record<string, ConversionDefinition>
  /** Optional: User-defined unit for paths without schema definition */
  userDefinedUnit?: string
}

/**
 * Category-level preference for unit display
 */
export interface CategoryPreference {
  /** Target unit to display (e.g., "knots", "celsius") */
  targetUnit: string
  /** Display format (e.g., "0.0", "0.00", "0") */
  displayFormat: string
  /** Base unit for custom categories (optional, only for user-created categories) */
  baseUnit?: string
  /** Category name (optional, for path overrides to specify which category they belong to) */
  category?: string
}

/**
 * Path-specific preference override
 */
export interface PathPreference extends CategoryPreference {
  /** Override the category-level preference for this specific path */
  path: string
}

/**
 * Path pattern rule for matching paths
 */
export interface PathPatternRule {
  /** Pattern to match (e.g., "*.temperature", "environment.*", "*.speed*") */
  pattern: string
  /** Category to assign to matching paths */
  category: string
  /** Base unit (optional, required only for custom categories not in schema) */
  baseUnit?: string
  /** Target unit preference (optional, uses category default if not specified) */
  targetUnit?: string
  /** Display format (optional, uses category default if not specified) */
  displayFormat?: string
  /** Priority (higher = checked first) */
  priority?: number
}

/**
 * User preferences structure
 */
export interface UnitsPreferences {
  /** Category-level preferences (e.g., speed, temperature) */
  categories: Record<string, CategoryPreference>
  /** Path-specific overrides */
  pathOverrides: Record<string, PathPreference>
  /** Path pattern rules for automatic categorization */
  pathPatterns?: PathPatternRule[]
  /** Currently applied preset system (metric, imperial-us, imperial-uk, or custom) */
  currentPreset?: {
    type: string
    name: string
    version: string
    appliedDate: string
  }
}

/**
 * Complete metadata store
 */
export interface UnitsMetadataStore {
  [path: string]: UnitMetadata
}

/**
 * Path value type
 */
export type PathValueType = 'number' | 'boolean' | 'string' | 'date' | 'object' | 'unknown'

/**
 * SignalK metadata received from server
 */
export interface SignalKPathMetadata {
  /** Units from SignalK specification */
  units?: string
  /** Description */
  description?: string
  /** Whether the path supports PUT operations */
  supportsPut?: boolean
  /** Current value (for type detection) */
  value?: any
  /** Additional metadata fields */
  [key: string]: any
}

/**
 * API response for conversion query
 */
export interface ConversionResponse {
  /** SignalK path */
  path: string
  /** Base unit (SI or custom) */
  baseUnit: string | null
  /** Target unit for display */
  targetUnit: string
  /** Conversion formula from base to target */
  formula: string
  /** Inverse formula from target to base */
  inverseFormula: string
  /** Display format */
  displayFormat: string
  /** Symbol for target unit */
  symbol: string
  /** Category */
  category: string
  /** Value type (number, boolean, string, date) */
  valueType: PathValueType
  /** Optional: Named date format when category is date/time */
  dateFormat?: string
  /** Optional: Whether to render using local time zone */
  useLocalTime?: boolean
  /** Whether this path supports PUT operations */
  supportsPut?: boolean
  /** Latest SignalK timestamp, if available */
  signalkTimestamp?: string
  /** Latest SignalK source, if available */
  signalkSource?: string
}

/**
 * API response for value conversion
 */
export interface ConvertValueResponse {
  /** Original value in base units */
  originalValue: number
  /** Converted value in target units */
  convertedValue: number
  /** Target unit symbol */
  symbol: string
  /** Formatted display string */
  formatted: string
  /** Display format used */
  displayFormat: string
  /** Latest SignalK timestamp, if available */
  signalkTimestamp?: string
  /** Latest SignalK source, if available */
  signalkSource?: string
}

/**
 * SignalK-compliant converted value structure
 */
export interface ConversionDeltaValue {
  /** Converted value in target units */
  converted: any
  /** Formatted display string */
  formatted: string
  /** Original value in base/SI units */
  original: any
}

/**
 * Metadata for a converted path (SignalK meta format)
 */
export interface ConversionMetadata {
  /** Target unit symbol (e.g., "kn", "°C") */
  units: string
  /** Display format pattern (e.g., "0.0", "0.00") */
  displayFormat: string
  /** Human-readable description */
  description?: string
  /** Original base unit (e.g., "m/s", "K") */
  originalUnits: string
  /** Display name for UI */
  displayName?: string
}

/**
 * SignalK delta value entry
 */
export interface DeltaValueEntry {
  path: string
  value: ConversionDeltaValue
}

/**
 * SignalK delta metadata entry
 */
export interface DeltaMetaEntry {
  path: string
  value: ConversionMetadata
}

/**
 * SignalK delta update block
 */
export interface DeltaUpdate {
  $source?: string
  timestamp?: string
  values: DeltaValueEntry[]
  /** Optional metadata array (SignalK spec) */
  meta?: DeltaMetaEntry[]
}

/**
 * SignalK delta envelope
 */
export interface DeltaResponse {
  context?: string
  updates: DeltaUpdate[]
}

/**
 * Plugin configuration schema
 */
export interface PluginConfig {
  /** Enable debug logging */
  debug?: boolean
  /** Enable delta stream injection (legacy feature, deprecated) */
  enableDeltaInjection?: boolean
  /** Include metadata in every delta message (default: true). Set to false for optimization if metadata rarely changes. */
  sendMeta?: boolean
}
