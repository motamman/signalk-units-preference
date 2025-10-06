# SignalK Units Preference Manager

A SignalK server for managing unit conversions and display preferences across all data paths. Convert any SignalK data point to your preferred units with flexible pattern matching, custom formulas, and a full-featured web interface and REST API.

> **Important:** This plugin only changes how conversions are managed inside the tool and its REST endpoints. It doesn’t modify existing SignalK applications yet—we’re trialing it as a possible built-in conversion manager for future apps.

## Overview

This plugin provides a complete unit conversion system for SignalK, allowing you to:
- Apply unit system presets (Metric, Imperial US, Imperial UK) with one click
- Create and save custom preset configurations
- Define custom units and conversion formulas
- Set default units for entire categories (speed, temperature, etc.)
- Use wildcard patterns to apply conversions to multiple paths
- Override specific paths with custom units
- View comprehensive metadata for all paths
- Access conversions via REST API for integration with other apps

## Key Features

### 1. **Unit System Presets**
Quick configuration with built-in and custom unit system presets.

- **Three Built-In Presets**: Metric, Imperial (US), Imperial (UK)
- **One-Click Application**: Apply presets to all categories instantly
- **Custom Preset Backup**: Save modified configurations as custom presets
- **Dirty State Tracking**: Visual indicator when preset is modified
- **Default Configuration**: Imperial (US) applied on fresh install

### 2. **Unit Definitions**
Define base units and conversion formulas globally. Add new units or extend existing ones with custom conversion formulas.

- **Base Units**: Define the fundamental unit (e.g., "m/s", "K", "Pa")
- **Conversion Formulas**: JavaScript expressions for flexible conversions (e.g., `value * 1.94384`)
- **Inverse Formulas**: Bidirectional conversion support
- **Symbols**: Display symbols for each unit (e.g., "kn", "°C", "mph")

### 3. **Category Preferences**
Set default target units for entire categories. All paths in a category will use these defaults unless overridden.

- **Built-in Categories**: speed, temperature, pressure, distance, depth, angle, voltage, current, power, and more
- **Custom Categories**: Create your own categories with custom base units
- **Display Formats**: Control decimal precision (e.g., "0.0", "0.00", "0")

### 4. **Path Patterns**
Use wildcard patterns to apply conversions to multiple paths at once.

- **Wildcards**: `*` (single segment), `**` (multiple segments)
- **Priority System**: Higher priority patterns override lower priority ones
- **Pattern Examples**:
  - `**.temperature` - All temperature paths
  - `propulsion.*.temperature` - Engine temperatures only
  - `electrical.batteries.*.voltage` - All battery voltages

### 5. **Path Overrides**
Override specific paths with custom units, taking highest priority over patterns and categories.

- **Full Control**: Set exact base unit, target unit, and display format
- **Path Search**: Searchable dropdown to find and select paths
- **Per-Path Customization**: Different units for similar data (e.g., mm for rainfall vs km for distance)

### 6. **Metadata Reference**
Read-only view of all SignalK paths with comprehensive metadata and conversion information.

- **Filterable & Sortable**: Search across all columns, click headers to sort
- **Status Indicators**:
  - Green: Path Override
  - Yellow: Pattern Match
  - Blue: SignalK Metadata Only
  - Gray: No Metadata
- **Quick Testing**: Direct links to test conversions with live data
- **Live Values**: Shows current SignalK values for each path

### 7. **Formula-Based Conversions**
Use JavaScript expressions for ultimate flexibility in unit conversions.

- **Complex Formulas**: Support for any mathematical expression
- **Built-in Math**: Access to JavaScript Math functions
- **Examples**:
  - `value * 1.94384` - m/s to knots
  - `value - 273.15` - Kelvin to Celsius
  - `(value - 273.15) * 9/5 + 32` - Kelvin to Fahrenheit
  - `value / (1024 ** 2)` - bytes to megabytes

### 8. **Pass-Through Conversions**
Paths without conversions automatically return their original values with SignalK metadata units.

- **Graceful Fallback**: No errors for unconfigured paths
- **Preserves Units**: Returns base unit from SignalK specification
- **Formula**: `value` (no conversion)

### 9. **Date/Time Formatting**
Render ISO-8601 SignalK timestamps in human-friendly formats.

- **Multiple Presets**: Short & long dates, regional formats, time-of-day, epoch seconds
- **Local vs UTC**: Target units with `-local` suffix render in the vessel's local timezone
- **Category-Aware**: New `dateTime` category ties into presets, patterns, and overrides
- **Drop-In**: Select the desired target unit (e.g., `short-date`, `time-24hrs`, `epoch-seconds`)—no custom code required

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

Enable the plugin in SignalK Server Admin UI.

## Web UI Guide

Access the web interface at: `http://localhost.com:3000/signalk-units-preference`

### Tab Overview

#### **Settings**
Manage unit system presets for quick configuration of all categories at once.

**Unit System Presets**:
- **Reset to Metric**: Apply metric units (km/h, celsius, meters, etc.)
- **Reset to Imperial (US)**: Apply US units (mph, fahrenheit, feet, US gallons, etc.)
- **Reset to Imperial (UK)**: Apply UK units (mph, celsius, meters, UK gallons, etc.)
- Applying a preset updates all category preferences
- Default on fresh install: Imperial (US)

**Custom Presets**:
- View and manage your saved custom presets
- Apply any custom preset with one click
- Delete custom presets you no longer need
- Each preset shows: name, version, date, and category count
- Create custom presets from the Categories tab when you modify a preset

#### **Category Preferences**
Set default units for categories like speed, temperature, pressure.

**Current Unit System** (Top Banner):
- Shows currently applied preset (Metric, Imperial US, Imperial UK, or custom)
- Displays preset version and date applied
- **Orange "Modified" indicator**: Appears when you edit categories after applying a preset
- **Backup Preset Section** (when modified):
  - Name field: Enter a name for your custom preset
  - Backup Preset button: Save current category settings as a custom preset
  - Saved presets appear in the Settings tab under "Custom Presets"

**Add Custom Category** (Collapsible - Default: Closed):
- Create custom categories with their own base unit and target unit
- Category Name: Unique identifier (e.g., "fuelConsumption")
- Base Unit: Select or create base unit
- Target Unit: Select target unit for conversions
- Display Format: Decimal precision (e.g., "0.0")

**Category List** (Collapsible Items):
- Each category is collapsible - click to expand/collapse details
- View/edit target unit and display format
- **CUSTOM badge**: User-created categories (editable and deletable)
- **CORE badge**: Built-in SignalK categories (editable only)
- Edit button: Modify custom category settings
- Delete button: Remove custom categories

#### **Unit Definitions**
Create and manage base units and conversion formulas.

**Add Unit Definitions** (Collapsible - Default: Closed):
- Combined section for adding base units and conversions

**Add Base Unit:**
- Symbol: Base unit symbol (e.g., "m/s", "K")
- Description: Human-readable name

**Add Conversion Formula:**
- Base Unit: Select the base unit
- Target Unit: Symbol for converted unit
- Formula: JavaScript expression (use `value` variable)
- Inverse Formula: Conversion back to base unit
- Symbol: Display symbol (e.g., "kn", "mph")

**All Unit Definitions** (Collapsible Items):
- Each unit is collapsible - click to expand/collapse conversions
- **CUSTOM badge**: User-created units (fully editable and deletable)
- **CORE badge**: Built-in units from SignalK (editable, creates override)
- Edit button: Modify base unit description
- Edit conversions: Modify formulas, inverse formulas, and symbols inline
- Delete warning: Shows impact (number of conversions, affected categories)

#### **Path Patterns**
Create wildcard patterns to apply conversions to multiple paths.

**Add Path Pattern** (Collapsible - Default: Closed):
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

**Path Patterns List** (Accordion - Default: All Closed):
- Each pattern is collapsible - click to expand/collapse details
- **Accordion behavior**: Opening one pattern closes all others
- Shows pattern, category, and priority in header
- Edit button: Modify all pattern settings with dropdowns
- Delete button: Remove pattern with confirmation

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

### UI Features

#### **Collapsible Sections**
Most sections are collapsible to keep the interface clean:
- Click section headers to expand/collapse
- Arrow icons (▼) indicate current state
- "Add" sections default to closed
- List sections default to open

#### **Edit Mode**
Custom items (categories, units, patterns) can be edited:
- Edit button opens a yellow-highlighted form
- All fields are editable with smart dropdowns
- Save/Cancel buttons for confirmation
- Auto-expands collapsed items when editing

#### **Core vs Custom Labels**
- **CORE**: Built-in items from SignalK (editable, not deletable)
- **CUSTOM**: User-created items (fully editable and deletable)
- Editing a core unit creates a custom override

#### **Delete Warnings**
Enhanced warnings when deleting critical items:
- Shows impact (affected conversions, categories, etc.)
- "Cannot be undone" warning
- Confirmation required

## REST API Reference

### Conversion Endpoints

#### Get Conversion Information / Convert a Value
```http
GET /plugins/signalk-units-preference/conversions/:path
GET /plugins/signalk-units-preference/conversions/:path?value=X
```

Returns conversion metadata for a path. If the `value` query parameter is provided, returns the conversion result instead.

**Example (metadata only):**
```http
GET /plugins/signalk-units-preference/conversions/navigation.speedOverGround
```

**Example (convert value):**
```http
GET /plugins/signalk-units-preference/conversions/navigation.speedOverGround?value=5.14
```

**Response (with value):**
```json
{
  "context": "vessels.self",
  "updates": [
    {
      "$source": "navigation",
      "timestamp": "2025-10-03T13:56:37.000Z",
      "values": [
        {
          "path": "navigation.speedOverGround",
          "value": {
            "value": 10,
            "formatted": "10.0 kn",
            "symbol": "kn",
            "displayFormat": "0.0",
            "original": 5.14
          }
        }
      ]
    }
  ]
}
```

Optional query parameters:
- `value` – the value to convert
- `type` – type hint: `number`, `boolean`, `string`, `date`, `object`

#### Convert a Value (POST - All Types)
```http
POST /plugins/signalk-units-preference/conversions
```

Converts any value type (number, boolean, string, date). Accepts both JSON and form data.

**Request Body (JSON):**
```json
{
  "path": "commands.captureAnchor",
  "value": true
}
```

**Example Response:**
```json
{
  "context": "vessels.self",
  "updates": [
    {
      "$source": "derived-data",
      "timestamp": "2025-10-03T16:08:07.985Z",
      "values": [
        {
          "path": "environment.inside.temperature",
          "value": {
            "value": 19.2,
            "formatted": "19.2 °C",
            "symbol": "°C",
            "displayFormat": "0.0",
            "original": 292.35
          }
        }
      ]
    }
  ]
}
```

#### Convert by Base Unit
```http
GET /plugins/signalk-units-preference/units/conversions?baseUnit=X&targetUnit=Y&value=Z
POST /plugins/signalk-units-preference/units/conversions
```

Convert a single value directly from a base unit to a target unit without referencing a SignalK path.

**GET Request:**
```http
GET /plugins/signalk-units-preference/units/conversions?baseUnit=m/s&targetUnit=knots&value=5.14
```

**POST Request Body:**
```json
{
  "baseUnit": "m/s",
  "targetUnit": "knots",
  "value": 5.14
}
```

**Example Response:**
```json
{
  "baseUnit": "m/s",
  "targetUnit": "knots",
  "original": 5.14,
  "result": {
    "convertedValue": 9.999,
    "formatted": "10.0 kn",
    "symbol": "kn",
    "displayFormat": "0.0",
    "valueType": "number"
  }
}
```

Date/time conversions use ISO-8601 strings and support the same formats as the `dateTime` category:
```json
{
  "baseUnit": "RFC 3339 (UTC)",
  "targetUnit": "time-am/pm-local",
  "value": "2025-10-04T00:17:48.000Z"
}
```

```json
{
  "baseUnit": "RFC 3339 (UTC)",
  "targetUnit": "time-am/pm-local",
  "original": "2025-10-04T00:17:48.000Z",
  "result": {
    "convertedValue": "07:17:48 PM",
    "formatted": "07:17:48 PM",
    "symbol": "",
    "displayFormat": "time-am/pm",
    "valueType": "date",
    "dateFormat": "time-am/pm",
    "useLocalTime": true
  }
}
```

If the base unit, target unit, or value is invalid, the API responds with a `400` error describing the mismatch.

Optional parameters (GET query params or POST body):
- `displayFormat` – override numeric formatting (e.g., `0.00`)
- `useLocalTime` – optional override for date/time conversions (defaults to the target unit suffix, e.g. `*-local`)

```bash
curl "http://localhost:3000/plugins/signalk-units-preference/units/conversions?baseUnit=RFC%203339%20(UTC)&targetUnit=time-am/pm-local&value=2025-10-04T00:17:48.000Z"
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

#### Get All Paths with Configuration
```http
GET /plugins/signalk-units-preference/paths
```

Returns a JSON object where each SignalK path maps to its unit metadata (base unit, category, and available conversions). Live values are intentionally excluded so other applications can focus purely on conversion rules.

Paths are discovered by crawling the SignalK data model and are merged with any configured path overrides or custom unit definitions. Metadata is resolved from the following sources in priority order:
1. Path-specific overrides (base unit + conversions)
2. User-defined path patterns
3. SignalK metadata / schema information
4. Comprehensive default unit definitions bundled with the plugin

**Example Response:**
```json
{
  "propulsion.engine.perkins4236.1.frequency": {
    "baseUnit": "Hz",
    "category": "frequency",
    "conversions": {
      "rpm": {
        "formula": "value * 60",
        "inverseFormula": "value / 60",
        "symbol": "rpm"
      }
    }
  },
  "navigation.speedOverGround": {
    "baseUnit": "m/s",
    "category": "speed",
    "conversions": {
      "knots": {
        "formula": "value * 1.94384",
        "inverseFormula": "value * 0.514444",
        "symbol": "kn"
      },
      "km/h": {
        "formula": "value * 3.6",
        "inverseFormula": "value * 0.277778",
        "symbol": "km/h"
      },
      "mph": {
        "formula": "value * 2.23694",
        "inverseFormula": "value * 0.44704",
        "symbol": "mph"
      }
    }
  }
}
```

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

### Unit System Presets

#### Apply Built-In Preset
```http
POST /plugins/signalk-units-preference/presets/:presetType
```

Apply a built-in preset: `metric`, `imperial-us`, or `imperial-uk`.

**Example Response:**
```json
{
  "success": true,
  "presetType": "imperial-us",
  "presetName": "Imperial (US)",
  "version": "1.0.0",
  "categoriesUpdated": 12
}
```

#### Get Current Preset
```http
GET /plugins/signalk-units-preference/presets/current
```

Returns the currently applied preset information or `null` if none.

**Example Response:**
```json
{
  "type": "imperial-us",
  "name": "Imperial (US)",
  "version": "1.0.0",
  "appliedDate": "2025-10-03T22:21:55.055Z"
}
```

### Custom Presets

#### Save Custom Preset
```http
POST /plugins/signalk-units-preference/presets/custom/:name
```

Save current category preferences as a custom preset.

**Body:**
```json
{
  "name": "My Boat Config",
  "categories": {
    "speed": { "targetUnit": "knots", "displayFormat": "0.0" },
    "temperature": { "targetUnit": "fahrenheit", "displayFormat": "0" }
  }
}
```

**Example Response:**
```json
{
  "success": true,
  "presetName": "my-boat-config",
  "path": "/path/to/presets/custom/my-boat-config.json"
}
```

#### List Custom Presets
```http
GET /plugins/signalk-units-preference/presets/custom
```

**Example Response:**
```json
[
  {
    "id": "my-boat-config",
    "name": "My Boat Config",
    "version": "1.0.0",
    "date": "2025-10-03",
    "description": "Custom user preset",
    "categoriesCount": 12
  }
]
```

#### Apply Custom Preset
```http
POST /plugins/signalk-units-preference/presets/custom/:name/apply
```

**Example Response:**
```json
{
  "success": true,
  "presetName": "my-boat-config",
  "displayName": "My Boat Config",
  "version": "1.0.0",
  "categoriesUpdated": 12
}
```

#### Delete Custom Preset
```http
DELETE /plugins/signalk-units-preference/presets/custom/:name
```

**Example Response:**
```json
{
  "success": true,
  "presetName": "my-boat-config"
}
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

## Integration Guide for App Developers

This plugin provides a centralized unit conversion service that other SignalK applications can use to display data in user-preferred units. Instead of each app implementing its own conversion logic, apps can query this plugin's REST API.

### Why Use This Plugin?

**Benefits for App Developers:**
- **User Preference Respect**: Automatically use the units the user has configured globally
- **No Conversion Logic**: No need to write or maintain conversion formulas
- **Centralized Configuration**: Users configure units once, all apps honor those preferences
- **Flexible Patterns**: Automatically handles new paths via wildcard patterns
- **Type Detection**: Get value type information (number, boolean, string, date) for proper display
- **PUT Support**: Discover which paths are writable

### Integration Approaches

#### 1. Simple Conversion Display

**Use Case**: Display a single SignalK value in user's preferred units

```javascript
// Get conversion info for a path
const response = await fetch('/plugins/signalk-units-preference/conversions/navigation.speedOverGround')
const conversion = await response.json()

// conversion contains:
// {
//   "path": "navigation.speedOverGround",
//   "baseUnit": "m/s",
//   "targetUnit": "knots",
//   "formula": "value * 1.94384",
//   "inverseFormula": "value * 0.514444",
//   "displayFormat": "0.0",
//   "symbol": "kn",
//   "category": "speed",
//   "valueType": "number",
//   "supportsPut": false
// }

// Display to user
console.log(`Speed: ${conversion.formatted}`)
// Output: "Speed: 10.0 kn"
```

#### 2. Real-Time Value Conversion

**Use Case**: Subscribe to SignalK delta stream and convert values on-the-fly

```javascript
// Cache conversion info for paths you're monitoring
const conversionCache = {}

async function getConversion(path) {
  if (!conversionCache[path]) {
    const response = await fetch(`/plugins/signalk-units-preference/conversions/${path}`)
    conversionCache[path] = await response.json()
  }
  return conversionCache[path]
}

// When receiving SignalK delta
ws.onmessage = async (event) => {
  const delta = JSON.parse(event.data)

  for (const update of delta.updates) {
    for (const value of update.values) {
      const path = value.path
      const rawValue = value.value

      // Get conversion for this path
      const conversion = await getConversion(path)

      // Convert the value using POST endpoint (supports all types)
      const response = await fetch('/plugins/signalk-units-preference/conversions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, value: rawValue })
      })
      const result = await response.json()
      displayValue(path, result.formatted)

      // Alternative: Use GET endpoint for numbers only
      // if (conversion.valueType === 'number' && typeof rawValue === 'number') {
      //   const response = await fetch(`/plugins/signalk-units-preference/conversions/${path}?value=${encodeURIComponent(rawValue)}`)
      //   const result = await response.json()
      //   displayValue(path, result.formatted)
      // }
    }
  }
}
```

#### 3. Bulk Path Analysis

**Use Case**: Analyze multiple paths at startup to determine types and units

**Option A: Using the `/paths` endpoint (recommended)**
```javascript
// Get all paths with their configuration in one call
const response = await fetch('/plugins/signalk-units-preference/paths')
const pathsInfo = await response.json()

// Filter and process paths
const speedPaths = pathsInfo.filter(p => p.category === 'speed')
const writablePaths = pathsInfo.filter(p => p.supportsPut)
const overriddenPaths = pathsInfo.filter(p => p.status === 'override')

// Each path has all the info you need:
pathsInfo.forEach(pathInfo => {
  console.log(`${pathInfo.path}: ${pathInfo.value} ${pathInfo.displayUnit}`)
  // path: navigation.speedOverGround: 5.14 knots

  // Access all properties:
  // - pathInfo.status → "override", "pattern", "signalk", "none"
  // - pathInfo.baseUnit → "m/s"
  // - pathInfo.displayUnit → "knots"
  // - pathInfo.targetUnit → "knots"
  // - pathInfo.valueType → "number", "boolean", etc.
  // - pathInfo.supportsPut → true/false
  // - pathInfo.value → current value
})
```

**Option B: Individual conversion queries (slower)**
```javascript
// Get all available paths from SignalK
const apiResponse = await fetch('/signalk/v1/api/')
const data = await apiResponse.json()

// Extract paths
const paths = extractPaths(data.vessels[data.self])

// Get conversion info for all paths
const conversions = {}
for (const path of paths) {
  try {
    const response = await fetch(`/plugins/signalk-units-preference/conversions/${path}`)
    conversions[path] = await response.json()
  } catch (e) {
    console.warn(`No conversion for ${path}`)
  }
}

// Now you have:
// - conversions[path].valueType → for input validation
// - conversions[path].supportsPut → for showing edit controls
// - conversions[path].symbol → for display labels
// - conversions[path].displayFormat → for formatting
```

#### 4. User Input Conversion (Reverse Conversion)

**Use Case**: User enters a value in their preferred units, convert back to SI for PUT

```javascript
// User enters "20" knots for navigation.speedOverGround
const userInput = 20
const path = 'navigation.speedOverGround'

// Get conversion info
const response = await fetch(`/plugins/signalk-units-preference/conversions/${path}`)
const conversion = await response.json()

// conversion.inverseFormula = "value * 0.514444"
// Use eval or a safer evaluator
const baseValue = eval(conversion.inverseFormula.replace('value', userInput))
// baseValue = 10.288 m/s

// Send PUT request with SI value
await fetch(`/signalk/v1/api/vessels/self/${path.replace(/\./g, '/')}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ value: baseValue })
})
```

#### 5. Dynamic Form Generation

**Use Case**: Build a settings form that adapts to value types

```javascript
async function createInputForPath(path) {
  const response = await fetch(`/plugins/signalk-units-preference/conversions/${path}`)
  const conversion = await response.json()

  let input

  if (conversion.valueType === 'number') {
    input = document.createElement('input')
    input.type = 'number'
    input.step = conversion.displayFormat === '0' ? '1' : '0.1'

    // Add unit label
    const label = document.createElement('span')
    label.textContent = conversion.symbol

    return { input, label }
  }
  else if (conversion.valueType === 'boolean') {
    input = document.createElement('input')
    input.type = 'checkbox'
    return { input }
  }
  else if (conversion.valueType === 'date') {
    input = document.createElement('input')
    input.type = 'datetime-local'
    return { input }
  }
  else {
    input = document.createElement('input')
    input.type = 'text'
    return { input }
  }
}
```

### API Response Types

#### Conversion Response
```typescript
{
  path: string              // SignalK path
  baseUnit: string          // SI or base unit (e.g., "m/s", "K")
  targetUnit: string        // User's preferred unit (e.g., "knots", "celsius")
  formula: string           // Conversion formula (e.g., "value * 1.94384")
  inverseFormula: string    // Reverse formula (e.g., "value * 0.514444")
  displayFormat: string     // Number format (e.g., "0.0", "0.00") or "boolean", "ISO-8601", "string"
  symbol: string            // Display symbol (e.g., "kn", "°C")
  category: string          // Category name (e.g., "speed", "temperature")
  valueType: string         // "number" | "boolean" | "string" | "date" | "object" | "unknown"
  supportsPut?: boolean     // Whether path supports PUT operations
}
```

#### Convert Value Response
```typescript
{
  originalValue: number     // Input value in base units
  convertedValue: number    // Output value in target units
  symbol: string            // Display symbol
  formatted: string         // Ready-to-display string (e.g., "10.0 kn")
  displayFormat: string     // Format used
}
```

### Best Practices

1. **Cache Conversion Info**: Conversion metadata rarely changes, cache it per session
2. **Handle Pass-Through**: Paths without conversions return `formula: "value"` - handle gracefully
3. **Type Checking**: Always check `valueType` before attempting numeric conversion
4. **Error Handling**: Some paths may not have conversion info - provide fallbacks
5. **Respect displayFormat**: Use the provided format for consistent UX across apps
6. **Batch Requests**: If possible, cache conversions for all paths at startup
7. **Listen for Changes**: Consider polling `/categories` or `/patterns` if you want to detect user preference changes

### Example: Complete Widget Implementation

```javascript
class SignalKValueWidget {
  constructor(path) {
    this.path = path
    this.conversion = null
    this.value = null
    this.init()
  }

  async init() {
    // Get conversion info
    const response = await fetch(`/plugins/signalk-units-preference/conversions/${this.path}`)
    this.conversion = await response.json()

    // Subscribe to SignalK updates
    this.subscribe()
  }

  subscribe() {
    const ws = new WebSocket('ws://localhost:3000/signalk/v1/stream?subscribe=self')

    ws.onopen = () => {
      ws.send(JSON.stringify({
        context: 'vessels.self',
        subscribe: [{ path: this.path }]
      }))
    }

    ws.onmessage = (event) => {
      const delta = JSON.parse(event.data)
      if (delta.updates) {
        for (const update of delta.updates) {
          for (const val of update.values) {
            if (val.path === this.path) {
              this.updateValue(val.value)
            }
          }
        }
      }
    }
  }

  async updateValue(rawValue) {
    this.value = rawValue

    // Use POST endpoint for all types
    try {
      const response = await fetch('/plugins/signalk-units-preference/conversions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: this.path, value: rawValue })
      })
      const result = await response.json()
      this.render(result.formatted)
    } catch (e) {
      console.error('Conversion failed:', e)
      this.render(String(rawValue))
    }
  }

  render(displayValue) {
    // Update your UI with the converted value
    document.getElementById(`widget-${this.path}`).textContent = displayValue
  }
}

// Usage
const speedWidget = new SignalKValueWidget('navigation.speedOverGround')
const tempWidget = new SignalKValueWidget('electrical.batteries.0.temperature')
```

### WebSocket Integration (Real-Time Updates)

The plugin provides REST endpoints, but you can integrate them with SignalK's WebSocket stream for real-time conversions:

```javascript
class SignalKConverter {
  constructor() {
    this.conversions = {}  // Cache conversion info
    this.ws = null
  }

  // Initialize: fetch conversions for paths you're interested in
  async init(paths) {
    // Pre-fetch conversion info for all paths
    for (const path of paths) {
      const response = await fetch(`/plugins/signalk-units-preference/conversions/${path}`)
      this.conversions[path] = await response.json()
    }

    this.connectWebSocket()
  }

  connectWebSocket() {
    // Connect to SignalK WebSocket
    this.ws = new WebSocket('ws://localhost:3000/signalk/v1/stream?subscribe=none')

    this.ws.onopen = () => {
      console.log('WebSocket connected')

      // Subscribe to specific paths
      const subscriptions = Object.keys(this.conversions).map(path => ({
        path: path,
        period: 1000,  // Update every 1 second
        format: 'delta',
        policy: 'instant'
      }))

      this.ws.send(JSON.stringify({
        context: 'vessels.self',
        subscribe: subscriptions
      }))
    }

    this.ws.onmessage = (event) => {
      this.handleDelta(JSON.parse(event.data))
    }

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error)
    }

    this.ws.onclose = () => {
      console.log('WebSocket closed, reconnecting...')
      setTimeout(() => this.connectWebSocket(), 5000)
    }
  }

  async handleDelta(delta) {
    if (!delta.updates) return

    for (const update of delta.updates) {
      for (const value of update.values) {
        const path = value.path
        const rawValue = value.value

        // Get cached conversion info
        const conversion = this.conversions[path]
        if (!conversion) continue

        // Convert based on type
        let displayValue

        if (conversion.valueType === 'number' && typeof rawValue === 'number') {
          // Option 1: Use the formula locally (faster, no network call)
          displayValue = this.evaluateFormula(conversion.formula, rawValue)
          const formatted = this.formatNumber(displayValue, conversion.displayFormat)
          this.onValueUpdate(path, `${formatted} ${conversion.symbol}`)

          // Option 2: Use REST API (simpler, slower)
          // const response = await fetch(`/plugins/signalk-units-preference/conversions/${path}?value=${encodeURIComponent(rawValue)}`)
          // const result = await response.json()
          // this.onValueUpdate(path, result.formatted)
        }
        else if (conversion.valueType === 'boolean') {
          displayValue = rawValue ? 'true' : 'false'
          this.onValueUpdate(path, displayValue)
        }
        else if (conversion.valueType === 'date') {
          displayValue = new Date(rawValue).toISOString()
          this.onValueUpdate(path, displayValue)
        }
        else {
          displayValue = String(rawValue)
          this.onValueUpdate(path, displayValue)
        }
      }
    }
  }

  // Local formula evaluation (faster than REST call)
  evaluateFormula(formula, value) {
    // Simple safe evaluator - replace with a proper parser for production
    try {
      return eval(formula.replace('value', value))
    } catch (e) {
      console.error('Formula evaluation error:', e)
      return value
    }
  }

  // Format number according to displayFormat
  formatNumber(value, format) {
    if (format === '0') {
      return Math.round(value).toString()
    }
    const decimals = (format.match(/\./g) || []).length > 0
      ? format.split('.')[1].length
      : 0
    return value.toFixed(decimals)
  }

  // Override this to handle updates
  onValueUpdate(path, formattedValue) {
    console.log(`${path}: ${formattedValue}`)
    // Update your UI here
  }

  // Clean up
  close() {
    if (this.ws) {
      this.ws.close()
    }
  }
}

// Usage
const converter = new SignalKConverter()
await converter.init([
  'navigation.speedOverGround',
  'navigation.courseOverGroundTrue',
  'environment.wind.speedApparent',
  'electrical.batteries.0.temperature'
])

// Override to update your UI
converter.onValueUpdate = (path, formattedValue) => {
  document.getElementById(`value-${path}`).textContent = formattedValue
}
```

### WebSocket + Conversion: Performance Considerations

**Two approaches for real-time conversion:**

#### Approach 1: Local Formula Evaluation (Recommended)
```javascript
// Fast - no network call per value
const convertedValue = eval(conversion.formula.replace('value', rawValue))
const formatted = formatNumber(convertedValue, conversion.displayFormat)
const display = `${formatted} ${conversion.symbol}`
```

**Pros:**
- Fast (no REST call per update)
- Works offline
- Lower server load

**Cons:**
- Need to implement formula evaluator
- Need to implement number formatter

#### Approach 2: REST API per Value
```javascript
// Slower - REST call per value

// For numbers (GET endpoint with query param):
const response = await fetch(`/plugins/signalk-units-preference/conversions/${path}?value=${encodeURIComponent(rawValue)}`)
const result = await response.json()
const display = result.formatted

// For all types (POST endpoint):
const response = await fetch('/plugins/signalk-units-preference/conversions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ path, value: rawValue })
})
const result = await response.json()
const display = result.formatted
```

**Pros:**
- Simple implementation
- Server handles all formatting
- POST endpoint supports all types (number, boolean, date, string)

**Cons:**
- Network latency (100-200ms per call)
- Higher server load
- Doesn't work offline

**Recommendation:** Use Approach 1 for high-frequency paths (10+ updates/sec), Approach 2 for low-frequency or initial loads.

### Common Patterns

#### Getting User's Speed Preference
```javascript
const response = await fetch('/plugins/signalk-units-preference/categories/speed')
const speedPref = await response.json()
// { targetUnit: "knots", displayFormat: "0.0" }
```

#### Checking All Temperature Paths
```javascript
const patterns = await fetch('/plugins/signalk-units-preference/patterns').then(r => r.json())
const tempPattern = patterns.find(p => p.category === 'temperature')
// { pattern: "**.temperature", category: "temperature", targetUnit: "celsius", ... }
```

#### Discovering Writable Paths
```javascript
const conversion = await fetch('/plugins/signalk-units-preference/conversions/some.path').then(r => r.json())
if (conversion.supportsPut) {
  // Show edit controls
}
```

#### Subscribe to All Paths Matching a Pattern
```javascript
// Get all paths from SignalK
const apiResponse = await fetch('/signalk/v1/api/')
const data = await apiResponse.json()
const allPaths = extractAllPaths(data.vessels[data.self])

// Filter paths matching your interest (e.g., all temperatures)
const tempPaths = allPaths.filter(path => path.includes('temperature'))

// Subscribe via WebSocket
ws.send(JSON.stringify({
  context: 'vessels.self',
  subscribe: tempPaths.map(path => ({ path, period: 1000 }))
}))
```

## Usage Examples

### Example 1: Apply Imperial US Preset
1. Go to **Settings** tab
2. Click "Reset to Imperial (US)"
3. Confirm the action

Result: All categories now use US imperial units (mph, fahrenheit, feet, US gallons, etc.)

### Example 2: Create a Custom Preset
1. Go to **Settings** tab and apply any preset (e.g., Imperial US)
2. Go to **Categories** tab
3. Edit some categories (e.g., change speed from mph to knots)
4. Notice the orange "Modified" banner appears
5. Enter a name in the "Preset Name" field (e.g., "my-sailing-config")
6. Click "Backup Preset"
7. Go to **Settings** tab
8. Your custom preset now appears under "Custom Presets"

Result: You can now quickly switch between standard presets and your custom configuration.

### Example 3: Set All Speeds to Knots
1. Go to **Category Preferences** tab
2. Select "speed" category
3. Choose "knots" as target unit
4. Set display format to "0.0"
5. Save

Result: All speed paths (SOG, STW, wind speed, etc.) display in knots.

### Example 4: Override Wind Speed to m/s
1. Go to **Path Overrides** tab
2. Search for "environment.wind.speedApparent"
3. Select "m/s" as target unit
4. Save

Result: Wind speed shows in m/s while other speeds remain in knots.

### Example 5: All Engine Temperatures in Fahrenheit
1. Go to **Path Patterns** tab
2. Add pattern: `propulsion.*.temperature`
3. Select category: "temperature"
4. Target unit: "fahrenheit"
5. Priority: 100
6. Save

Result: All engine temperatures display in °F.

### Example 6: Custom Data Rate Conversion
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
├── units-preferences.json    # Categories, overrides, patterns, current preset
└── units-definitions.json    # Custom unit definitions

presets/
├── metric.json               # Built-in Metric preset
├── imperial-us.json          # Built-in Imperial (US) preset
├── imperial-uk.json          # Built-in Imperial (UK) preset
└── custom/                   # User-created custom presets
    ├── my-boat-config.json
    └── racing-config.json
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

### [0.5.0-beta.5] - 2025-10-06

#### Added
- **Combined Date+Time Formats**: 16 new date/time conversion formats
  - `short-date-24hrs` / `short-date-24hrs-local` → "Jan 6, 2025 14:30:45"
  - `short-date-am/pm` / `short-date-am/pm-local` → "Jan 6, 2025 02:30:45 PM"
  - `long-date-24hrs` / `long-date-24hrs-local` → "Monday, January 6, 2025 14:30:45"
  - `long-date-am/pm` / `long-date-am/pm-local` → "Monday, January 6, 2025 02:30:45 PM"
  - `dd/mm/yyyy-24hrs` / `dd/mm/yyyy-24hrs-local` → "06/01/2025 14:30:45"
  - `dd/mm/yyyy-am/pm` / `dd/mm/yyyy-am/pm-local` → "06/01/2025 02:30:45 PM"
  - `mm/dd/yyyy-24hrs` / `mm/dd/yyyy-24hrs-local` → "01/06/2025 14:30:45"
  - `mm/dd/yyyy-am/pm` / `mm/dd/yyyy-am/pm-local` → "01/06/2025 02:30:45 PM"
  - All available for both dateTime (RFC 3339 UTC) and epoch (Epoch Seconds) categories

- **JSON-Based Unit System**: Refactored all conversions, categories, and date formats to JSON files
  - `presets/definitions/conversions.json` - All unit conversions by base unit
  - `presets/definitions/categories.json` - Category→baseUnit mappings and core categories list
  - `presets/definitions/date-formats.json` - Date/time format definitions with metadata
  - Automatic loading with TypeScript fallback if JSON files missing or corrupted
  - Users can now customize unit system by editing/uploading JSON files

#### Changed
- **Backup/Restore**: Updated to include definition files
  - Backup ZIP now includes `presets/definitions/*.json` files
  - Restore automatically applies uploaded definition files
  - Users can download, edit, and re-upload customized unit systems

- **Comprehensive File Management**: New UI in Settings tab for discrete file editing
  - **Definition Files**: conversions.json, categories.json, date-formats.json
  - **Built-in Presets**: imperial-us.json, imperial-uk.json, metric.json
  - **Runtime Data**: units-preferences.json, units-definitions.json
  - Download/upload any individual file without affecting others
  - Automatic JSON validation and reload after upload
  - Fine-grained control over every aspect of the unit system

#### Technical Changes
- Refactored `UnitsManager` to load JSON definitions at startup
- Added helper methods: `getCategoryToBaseUnitMap()`, `getCoreCategories()`, `getConversionsForBaseUnit()`
- Replaced all hardcoded TypeScript references with JSON-backed helpers
- Simplified lookup logic in `findUnitDefinition()`, `inferMetadataFromSignalK()`, etc.
- Clean separation of data (JSON) vs logic (TypeScript)
- Backward compatible with TypeScript fallback for missing JSON files

### [0.5.0-beta.4] - 2025-10-06

#### Fixed
- **Auto-Assigned Path Conversions**: Fixed conversion endpoints returning pass-through conversions instead of proper category-based conversions
  - Changed `resolveMetadataForPath()` to use `this.signalKMetadata[pathStr]` instead of `this.app.getMetadata(pathStr)`
  - Auto-assigned paths (SignalK Auto status) now show correct conversions with proper formulas
  - `/conversion/:path` endpoint now returns selected target conversion instead of identity pass-through
  - `/paths` endpoint now includes proper conversion data for auto-assigned paths
  - Examples: temperature (K → celsius), speed (m/s → knots), percentage (ratio → percent), angle (rad → deg)

#### Technical Changes
- Updated `resolveMetadataForPath()` to use frontend-provided SignalK metadata store
- Made metadata resolution consistent with other methods (`getConversion()`, `getPassThroughConversion()`, `getAllPathsInfo()`)
- Removed debug logging added during investigation

### [0.5.0-beta.3] - 2025-10-05

#### Added
- **Unitless Category**: New core category for dimensionless values
  - Base unit: `tr` (tabula rasa)
  - Default target unit: `tr` with symbol 'tr'
  - Identity conversion (tr → tr) for unitless/dimensionless data
  - Available in all category and pattern dropdowns
- **Core Categories List**: Schema API now includes `coreCategories` array
  - Distinguishes core categories from custom user-created categories
  - Frontend uses this list for proper CORE vs CUSTOM badge display
  - Prevents misidentification of custom categories as core

#### Fixed
- **Custom Category Detection Bug**: Custom categories were incorrectly showing as CORE
  - Fixed frontend detection logic to use `coreCategories` list from backend
  - Custom categories now properly show CUSTOM badge with Edit and Delete buttons
  - Core categories correctly show CORE badge with Edit button only
- **Dirty State Tracking**: Adding or deleting custom categories now marks preset as modified
  - `checkPresetDirty()` now detects when categories are added
  - `checkPresetDirty()` now detects when categories are removed
  - `addCustomCategory()` preserves dirty state instead of resetting it
  - `deleteCategory()` preserves dirty state instead of resetting it
  - Orange "Modified" banner correctly appears after category changes
- **Backend Category Pollution**: Core categories no longer get `baseUnit` saved to preferences
  - `ensureCategoryDefaults()` only adds `baseUnit` to custom categories
  - Core categories rely on static `categoryToBaseUnit` map
  - Prevents confusion between core and custom categories in preferences file

#### Changed
- **Category Detection Logic**: Simplified to check against static core categories list
  - Removed complex baseUnit comparison logic
  - More reliable and maintainable
  - Consistent behavior across frontend and backend

#### Technical Changes
- Added `coreCategories` field to `getUnitSchema()` return type
- Enhanced `ensureCategoryDefaults()` with core category check
- Updated frontend `unitSchema` initialization to include `coreCategories` array
- Improved dirty state detection in category add/delete operations

### [0.5.0-beta.2] - 2025-10-05

#### Added
- **SignalK Auto Category Assignment**: Automatic category and conversion assignment based on SignalK base units
  - Paths with SignalK units (K, V, ratio, etc.) automatically map to categories (temperature, voltage, percentage)
  - Category preferences automatically applied without manual pattern/override configuration
  - New "SignalK Auto" status (darker blue) in metadata table
  - Priority hierarchy: Path Override > Path Pattern > SignalK Auto > SignalK Only > None
- **Tabula Rasa Base Unit**: Special unitless base unit (`tr`) designed for custom transformations
  - Blank slate unit with no built-in conversions
  - Perfect for creating completely custom transformation workflows
  - Available in all base unit dropdowns
- **Backup & Restore System**: Complete configuration backup and restore functionality
  - **Download Backup**: Creates timestamped zip file with all configuration
  - **Restore Backup**: Upload zip to restore complete system state
  - **Backup Contents**: All presets (built-in + custom), preferences, and custom unit definitions
  - **Disaster Recovery**: Protects against corrupted files by backing up base presets
  - **Warning Dialog**: Confirms before overwriting existing configuration
  - **Auto-Reload**: Page refreshes after restore to load new configuration
- **Quick Action Icons in Metadata Tab**: Create patterns and overrides directly from metadata table
  - **Pattern Icon (📋)**: Pre-populates pattern form with path and category
  - **Override Icon (📌)**: Pre-populates override form with path
  - Icons only shown when applicable (not shown if pattern/override already exists)
  - Auto-expands collapsed forms and scrolls to input
  - Tab switching with pre-filled data
- **Enhanced Icon Tooltips**: Detailed explanations for all metadata table icons
  - 🔧 Conversion Details: "View conversion details - shows base unit, target unit, formula, symbol, and metadata"
  - 🔗 GET Endpoint: "Open conversion in new tab - test GET endpoint with current value"
  - ▶️ Run Test: "Run conversion test - convert current value and see result in new tab"
  - 📋 Create Pattern: "Create pattern rule - define a wildcard pattern based on this path to match similar paths"
  - 📌 Create Override: "Create path override - set specific units for this exact path (highest priority)"
- **Clickable Filter Labels**: Metadata legend labels now filter the table on click
  - Click any status label to search for that status
  - Click Boolean label to filter by boolean valueType
  - Visual feedback on hover with tooltips
- **Clear Filter Button**: Reset metadata table filter
  - Removes search text
  - Clears visual selection indicators
  - Resets to show all paths
- **Visual Selection Indicators**: Active filter shows visual feedback
  - Blue underline on selected filter label
  - Bold text for active filter
  - Clear visual state management
- **Alphabetical Sorting**: All dropdowns and lists sorted case-insensitive alphabetically
  - Categories sorted alphabetically
  - Base units sorted alphabetically
  - Target units sorted alphabetically
  - Unit definitions list sorted alphabetically
  - Conversion lists within each unit sorted alphabetically
- **Boolean Type Support**: Detection and filtering for boolean value types
  - Boolean valueType detection (true/false flags)
  - Purple filter label in metadata legend
  - Count of boolean-type paths
  - Proper handling without treating as unit category

#### Changed
- **Category Resolution in Pass-Through**: Pass-through conversions now resolve category from base unit
  - K → temperature category (not 'none')
  - V → voltage category (not 'none')
  - ratio → percentage category (not 'none')
  - Enables category preferences to work with SignalK metadata paths
- **Consistent Fallback Categories**:
  - Paths with no base unit → category: 'none'
  - Paths with unknown base unit → category: 'custom'
  - Removed inconsistent use of 'custom' for null base units
- **Header Logo Alignment**: SignalK Units Display Selector logo and text now left-aligned
  - Logo positioned on left with flexbox alignment
  - Text vertically centered with image
  - Cleaner visual hierarchy

#### Fixed
- **Category Resolution Bug**: Pass-through conversions were hardcoded to category: 'none'
  - Now correctly resolves category from base unit using `getCategoryFromBaseUnit()`
  - Fixes voltage (V), temperature (K), and other auto-assignments
- **Metadata Endpoint Category Bug**: `/paths` endpoint showing inconsistent categories
  - Changed fallback from 'custom' to 'none' for null base units
  - Consistent with pass-through conversion behavior
- **Formula Evaluator Math Functions**: Added support for Math functions in conversion formulas
  - Whitelisted: Math.pow, Math.sqrt, Math.abs, Math.round, Math.floor, Math.ceil, Math.min, Math.max
  - Fixes Beaufort wind speed conversions and other complex formulas
- **Inference Logic**: Removed inference that returned empty conversions
  - `inferMetadataFromSignalK()` now returns null instead of metadata with empty conversions
  - Allows fallback code to properly merge conversions from comprehensiveDefaultUnits

#### Technical Changes
- Added archiver and adm-zip dependencies for backup/restore
- Enhanced `resolveMetadataForPath()` to merge built-in and custom conversions
- Improved metadata resolution hierarchy with auto-category assignment
- Better error messages and user feedback in backup/restore operations
- Added `filterMetadataByStatus()` and `clearMetadataFilter()` functions
- Enhanced `createPatternFromPath()` and `createOverrideFromPath()` with form expansion
- Pattern icon hidden for SignalK Auto paths (already have category assignment)

### [0.5.0-beta.1] - 2025-10-03

#### Added
- **All Paths Endpoint**: New `/paths` endpoint returns all SignalK paths with their conversion configuration
  - Single API call to get complete configuration state
  - Includes path overrides, pattern matches, and SignalK metadata
  - Shows current values, status, and conversion settings for each path
  - Designed for external app integration and diagnostics
- **Unit System Presets**: Quick configuration with built-in unit system presets
  - **Settings Tab**: New tab for managing unit system presets
  - **Three Built-In Presets**: Metric, Imperial (US), and Imperial (UK)
  - **One-Click Application**: Apply any preset to all categories instantly
  - **Default Preset**: Imperial (US) applied automatically on virgin install
  - **Current Preset Display**: Shows active preset on Categories tab with version and date
- **Custom Preset Backup Feature**:
  - **Dirty State Tracking**: Detects when categories are modified after applying a preset
  - **Visual Indicator**: Orange "Modified" banner when preset is edited
  - **Backup UI**: Name field and "Backup Preset" button appear when preset is dirty
  - **Custom Presets Storage**: Saved to `presets/custom/` directory
  - **Custom Presets Management**: View, apply, and delete custom presets in Settings tab
- **Preset API Endpoints**:
  - `PUT /presets/current` - Apply any preset (built-in or custom)
  - `GET /presets/current` - Get currently applied preset
  - `POST /presets/custom/:name` - Save custom preset
  - `GET /presets/custom` - List all custom presets
  - `GET /presets/custom/:name` - Download custom preset
  - `PUT /presets/custom/:name` - Upload/update custom preset
  - `DELETE /presets/custom/:name` - Delete custom preset
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
  - Categories tab now shows current preset status
  - Settings tab moved to first position for easier access
- **Dropdown Synchronization**: All dropdowns update when base units or conversions are added/deleted
- **State Management**: Improved dirty state tracking to prevent false positives

#### Fixed
- Base unit dropdown synchronization across all tabs
- Path tree rendering for Override tab
- Path selection not working in Override tab
- Metadata table displaying "Extended" entries after removal
- Column header sort indicators
- Search filtering now works across all columns
- Dirty state persistence when editing path overrides, patterns, or categories
- Original preset state reset when applying presets

#### Technical Changes
- Separated global unit definitions from path-specific assignments
- Unified metadata handling between frontend and backend
- Improved TypeScript type safety with non-nullable return types
- Enhanced error handling with meaningful fallbacks
- Better separation of concerns across tabs
- Custom presets stored as JSON files in `presets/custom/` directory
- Preset validation: prevents overwriting built-in presets
- Name validation: alphanumeric, dashes, and underscores only

### [0.4.0] - Previous Version
- Initial category preferences
- Basic path overrides
- REST API endpoints
- Web UI foundation
