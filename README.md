# SignalK Units Preference Manager

A comprehensive SignalK server plugin for managing unit conversions and display preferences across all data paths. Convert any SignalK data point to your preferred units with flexible pattern matching, custom formulas, and a full-featured web interface.

## Overview

This plugin provides a complete unit conversion system for SignalK, allowing you to:
- Define custom units and conversion formulas
- Set default units for entire categories (speed, temperature, etc.)
- Use wildcard patterns to apply conversions to multiple paths
- Override specific paths with custom units
- View comprehensive metadata for all paths
- Access conversions via REST API for integration with other apps

## Key Features

### 1. **Unit Definitions**
Define base units and conversion formulas globally. Add new units or extend existing ones with custom conversion formulas.

- **Base Units**: Define the fundamental unit (e.g., "m/s", "K", "Pa")
- **Conversion Formulas**: JavaScript expressions for flexible conversions (e.g., `value * 1.94384`)
- **Inverse Formulas**: Bidirectional conversion support
- **Symbols**: Display symbols for each unit (e.g., "kn", "°C", "mph")

### 2. **Category Preferences**
Set default target units for entire categories. All paths in a category will use these defaults unless overridden.

- **Built-in Categories**: speed, temperature, pressure, distance, depth, angle, voltage, current, power, and more
- **Custom Categories**: Create your own categories with custom base units
- **Display Formats**: Control decimal precision (e.g., "0.0", "0.00", "0")

### 3. **Path Patterns**
Use wildcard patterns to apply conversions to multiple paths at once.

- **Wildcards**: `*` (single segment), `**` (multiple segments)
- **Priority System**: Higher priority patterns override lower priority ones
- **Pattern Examples**:
  - `**.temperature` - All temperature paths
  - `propulsion.*.temperature` - Engine temperatures only
  - `electrical.batteries.*.voltage` - All battery voltages

### 4. **Path Overrides**
Override specific paths with custom units, taking highest priority over patterns and categories.

- **Full Control**: Set exact base unit, target unit, and display format
- **Path Search**: Searchable dropdown to find and select paths
- **Per-Path Customization**: Different units for similar data (e.g., mm for rainfall vs km for distance)

### 5. **Metadata Reference**
Read-only view of all SignalK paths with comprehensive metadata and conversion information.

- **Filterable & Sortable**: Search across all columns, click headers to sort
- **Status Indicators**:
  - Green: Path Override
  - Yellow: Pattern Match
  - Blue: SignalK Metadata Only
  - Gray: No Metadata
- **Quick Testing**: Direct links to test conversions with live data
- **Live Values**: Shows current SignalK values for each path

### 6. **Formula-Based Conversions**
Use JavaScript expressions for ultimate flexibility in unit conversions.

- **Complex Formulas**: Support for any mathematical expression
- **Built-in Math**: Access to JavaScript Math functions
- **Examples**:
  - `value * 1.94384` - m/s to knots
  - `value - 273.15` - Kelvin to Celsius
  - `(value - 273.15) * 9/5 + 32` - Kelvin to Fahrenheit
  - `value / (1024 ** 2)` - bytes to megabytes

### 7. **Pass-Through Conversions**
Paths without conversions automatically return their original values with SignalK metadata units.

- **Graceful Fallback**: No errors for unconfigured paths
- **Preserves Units**: Returns base unit from SignalK specification
- **Formula**: `value` (no conversion)

## How It Works

The plugin uses a **priority hierarchy** to determine which conversion to apply:

1. **Path Override** (Highest Priority) - Exact path match
2. **Path Pattern** - Wildcard pattern match (sorted by priority)
3. **Category Preference** - Default for the category
4. **SignalK Metadata** - Uses SignalK specification units (pass-through)
5. **None** (Lowest Priority) - Returns `baseUnit: "none"`, `targetUnit: "none"`

## Installation

### From npm (when published)
```bash
npm install signalk-units-preference
```

### From source
```bash
cd signalk-units-preference
npm install
npm run build
```

Enable the plugin in SignalK Server Admin UI.

## Web UI Guide

Access the web interface at: `http://your-signalk-server:3000/signalk-units-preference`

### Tab Overview

#### **Unit Definitions**
Create and manage base units and conversion formulas.

**Add Base Unit:**
- Symbol: Base unit symbol (e.g., "m/s", "K")
- Description: Human-readable name

**Add Conversion Formula:**
- Base Unit: Select the base unit
- Target Unit: Symbol for converted unit
- Formula: JavaScript expression (use `value` variable)
- Inverse Formula: Conversion back to base unit
- Symbol: Display symbol (e.g., "kn", "mph")

#### **Category Preferences**
Set default units for categories like speed, temperature, pressure.

- Select category from dropdown
- Choose target unit (filtered by category's base unit)
- Set display format (e.g., "0.0" for one decimal place)

#### **Path Patterns**
Create wildcard patterns to apply conversions to multiple paths.

- **Pattern**: Wildcard expression (e.g., `**.temperature`)
- **Category**: Assign to a category
- **Priority**: Higher numbers take precedence (default: 100)
- **Base Unit**: Optional override of category's base unit
- **Target Unit**: Override category's target unit
- **Display Format**: Override category's display format

**Pattern Examples:**
```
**.temperature        → All temperature paths
**.airTemperature.*   → All air temperature sub-paths
propulsion.*.rpm      → All engine RPM paths
electrical.**.voltage → All voltage paths under electrical
```

#### **Path Overrides**
Assign specific units to individual paths.

- **Path**: Search and select from dropdown
- **Base Unit**: Select base unit (or auto-detect from SignalK)
- **Target Unit**: Select target unit
- **Display Format**: Decimal precision

#### **Metadata Reference**
Browse all SignalK paths with their conversion settings.

- **Search**: Filter across all columns (path, status, units, category)
- **Sort**: Click column headers to sort
- **Icons**:
  - 🔧 View conversion details
  - ▶️ Test conversion with current value
- **Color Coding**: Green (override), Yellow (pattern), Blue (SignalK), Gray (none)

## REST API Reference

### Conversion Endpoints

#### Get Conversion Information
```http
GET /plugins/signalk-units-preference/conversion/:path
```

Returns conversion metadata for a path.

**Example Response:**
```json
{
  "path": "navigation.speedOverGround",
  "baseUnit": "m/s",
  "targetUnit": "knots",
  "formula": "value * 1.94384",
  "inverseFormula": "value * 0.514444",
  "displayFormat": "0.0",
  "symbol": "kn",
  "category": "speed"
}
```

#### Convert a Value
```http
GET /plugins/signalk-units-preference/convert/:path/:value
```

Converts a specific value for a path.

**Example Response:**
```json
{
  "originalValue": 5.14,
  "convertedValue": 10.0,
  "symbol": "kn",
  "formatted": "10.0 kn",
  "displayFormat": "0.0"
}
```

### Schema & Metadata

#### Get Unit Schema
```http
GET /plugins/signalk-units-preference/schema
```

Returns available base units, categories, and target units.

#### Get All Metadata
```http
GET /plugins/signalk-units-preference/metadata
```

Returns all path metadata (built-in defaults only).

### Category Preferences

#### Get All Categories
```http
GET /plugins/signalk-units-preference/categories
```

#### Get Category
```http
GET /plugins/signalk-units-preference/categories/:category
```

#### Update Category
```http
PUT /plugins/signalk-units-preference/categories/:category
```

**Body:**
```json
{
  "targetUnit": "knots",
  "displayFormat": "0.0"
}
```

#### Delete Category
```http
DELETE /plugins/signalk-units-preference/categories/:category
```

### Path Overrides

#### Get All Overrides
```http
GET /plugins/signalk-units-preference/overrides
```

#### Get Override
```http
GET /plugins/signalk-units-preference/overrides/:path
```

#### Update Override
```http
PUT /plugins/signalk-units-preference/overrides/:path
```

**Body:**
```json
{
  "targetUnit": "km/h",
  "displayFormat": "0.0"
}
```

#### Delete Override
```http
DELETE /plugins/signalk-units-preference/overrides/:path
```

### Path Patterns

#### Get All Patterns
```http
GET /plugins/signalk-units-preference/patterns
```

#### Create Pattern
```http
POST /plugins/signalk-units-preference/patterns
```

**Body:**
```json
{
  "pattern": "**.temperature",
  "category": "temperature",
  "targetUnit": "celsius",
  "displayFormat": "0.0",
  "priority": 100
}
```

#### Update Pattern
```http
PUT /plugins/signalk-units-preference/patterns/:index
```

#### Delete Pattern
```http
DELETE /plugins/signalk-units-preference/patterns/:index
```

### Unit Definitions

#### Get All Unit Definitions
```http
GET /plugins/signalk-units-preference/unit-definitions
```

#### Add Base Unit
```http
POST /plugins/signalk-units-preference/unit-definitions
```

**Body:**
```json
{
  "baseUnit": "m/s",
  "description": "Speed in meters per second",
  "conversions": {}
}
```

#### Delete Base Unit
```http
DELETE /plugins/signalk-units-preference/unit-definitions/:baseUnit
```

#### Add Conversion
```http
POST /plugins/signalk-units-preference/unit-definitions/:baseUnit/conversions
```

**Body:**
```json
{
  "targetUnit": "knots",
  "formula": "value * 1.94384",
  "inverseFormula": "value * 0.514444",
  "symbol": "kn"
}
```

#### Delete Conversion
```http
DELETE /plugins/signalk-units-preference/unit-definitions/:baseUnit/conversions/:targetUnit
```

## Usage Examples

### Example 1: Set All Speeds to Knots
1. Go to **Category Preferences** tab
2. Select "speed" category
3. Choose "knots" as target unit
4. Set display format to "0.0"
5. Save

Result: All speed paths (SOG, STW, wind speed, etc.) display in knots.

### Example 2: Override Wind Speed to m/s
1. Go to **Path Overrides** tab
2. Search for "environment.wind.speedApparent"
3. Select "m/s" as target unit
4. Save

Result: Wind speed shows in m/s while other speeds remain in knots.

### Example 3: All Engine Temperatures in Fahrenheit
1. Go to **Path Patterns** tab
2. Add pattern: `propulsion.*.temperature`
3. Select category: "temperature"
4. Target unit: "fahrenheit"
5. Priority: 100
6. Save

Result: All engine temperatures display in °F.

### Example 4: Custom Data Rate Conversion
1. Go to **Unit Definitions** tab
2. Add base unit: "B" (bytes)
3. Add conversion:
   - Target: "MB"
   - Formula: `value / (1024 ** 2)`
   - Inverse: `value * (1024 ** 2)`
   - Symbol: "MB"
4. Use in overrides or patterns

## Supported Units

### Speed
- m/s, knots, km/h, mph, ft/s

### Temperature
- K (Kelvin), celsius, fahrenheit

### Pressure
- Pa, hPa, mbar, bar, inHg, mmHg, psi, atm

### Distance
- m, km, nm (nautical miles), mi (statute miles), ft, yd

### Depth
- m, ft, fathom

### Angle
- rad (radians), deg (degrees)

### Volume
- m³, L (liters), gal (US gallons), gal(UK), qt, pt

### Electrical
- V (voltage), A (current), W (power), kW, hp, Ah (charge)

### Frequency
- Hz, rpm, kHz, MHz

### And more...

All conversions are extensible - add your own!

## Files & Storage

Configuration is stored in:
```
~/.signalk/plugin-config-data/signalk-units-preference/
├── units-preferences.json    # Categories, overrides, patterns
└── units-definitions.json    # Custom unit definitions
```

## Development

### Build
```bash
npm run build
```

### Watch Mode
```bash
npm run watch
```

### Project Structure
```
signalk-units-preference/
├── src/
│   ├── index.ts              # Plugin entry point & REST API
│   ├── UnitsManager.ts       # Core conversion logic
│   ├── types.ts              # TypeScript interfaces
│   ├── defaultUnits.ts       # Built-in unit definitions
│   ├── comprehensiveDefaults.ts  # Extended units
│   └── formulaEvaluator.ts  # Safe formula evaluation
├── public/
│   ├── index.html            # Web UI structure
│   ├── app.js                # UI logic
│   └── pathTree.js           # Path navigation
└── dist/                     # Compiled output
```

## License

Apache-2.0

---

## Changelog

### [0.5.0-beta.1] - 2025-01-XX

#### Added
- **Unit Definitions Tab**: Create custom base units and conversion formulas globally
- **Path Patterns**: Wildcard pattern matching with priority system
  - Support for `*` (single segment) and `**` (multi-segment) wildcards
  - Pattern priority ordering for conflict resolution
- **Pass-Through Conversions**: Graceful handling of unconfigured paths
  - Returns SignalK metadata units when available
  - No errors for missing conversions
- **Enhanced Metadata Tab**: Read-only reference view with filtering and sorting
  - Search across all columns
  - Clickable column headers for sorting
  - Color-coded status indicators
  - Quick links to test conversions with live values
- **Formula-Based Conversions**: JavaScript expression support
  - Complex mathematical expressions
  - Access to Math functions
  - Bidirectional conversion formulas
- **Path Override UI Improvements**:
  - Searchable path dropdown with tree navigation
  - Only selectable paths with actual values
  - Click-to-close dropdown behavior
- **SignalK Metadata Integration**:
  - Automatic extraction of units from SignalK API
  - Frontend sends metadata to backend for consistent access
  - Metadata used in pass-through conversions

#### Changed
- **Removed Extended Metadata**: Simplified to patterns, categories, overrides, and unit definitions
- **Conversion API**: Now always returns a conversion (pass-through if no match)
  - Changed from `ConversionResponse | null` to `ConversionResponse`
  - Removed 404 errors for missing conversions
- **UI Refinements**:
  - Cleaner Path Override form styling with proper layout
  - Compact metadata table with better column sizing
  - Improved tooltips with wrapping and positioning
- **Dropdown Synchronization**: All dropdowns update when base units or conversions are added/deleted

#### Fixed
- Base unit dropdown synchronization across all tabs
- Path tree rendering for Override tab
- Path selection not working in Override tab
- Metadata table displaying "Extended" entries after removal
- Column header sort indicators
- Search filtering now works across all columns

#### Technical Changes
- Separated global unit definitions from path-specific assignments
- Unified metadata handling between frontend and backend
- Improved TypeScript type safety with non-nullable return types
- Enhanced error handling with meaningful fallbacks
- Better separation of concerns across tabs

### [0.4.0] - Previous Version
- Initial category preferences
- Basic path overrides
- REST API endpoints
- Web UI foundation
