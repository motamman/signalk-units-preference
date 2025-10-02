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
  /** Legacy: Multiplication factor (deprecated, use formula instead) */
  factor?: number
  /** Legacy: Inverse factor (deprecated, use inverseFormula instead) */
  inverseFactor?: number
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
}

/**
 * Complete metadata store
 */
export interface UnitsMetadataStore {
  [path: string]: UnitMetadata
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
}

/**
 * Plugin configuration schema
 */
export interface PluginConfig {
  /** Enable debug logging */
  debug?: boolean
}
