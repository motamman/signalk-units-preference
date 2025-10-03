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

Enable the plugin in SignalK Server Admin UI.

## Web UI Guide

Access the web interface at: `http://localhost.com:3000/signalk-units-preference`

### Tab Overview

#### **Category Preferences**
Set default units for categories like speed, temperature, pressure.

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

#### Convert a Value (GET)
```http
GET /plugins/signalk-units-preference/convert/:path/:value
```

Converts a value for a path. URL-encode reserved characters (quotes, braces, commas, etc.).

**Example Request:**
```http
GET /plugins/signalk-units-preference/convert/navigation.speedOverGround/5.14
```

**Example Response:**
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

#### Convert a Value (POST - All Types)
```http
POST /plugins/signalk-units-preference/convert
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
const response = await fetch('/plugins/signalk-units-preference/conversion/navigation.speedOverGround')
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
    const response = await fetch(`/plugins/signalk-units-preference/conversion/${path}`)
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
      const response = await fetch('/plugins/signalk-units-preference/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, value: rawValue })
      })
      const result = await response.json()
      displayValue(path, result.formatted)

      // Alternative: Use GET endpoint for numbers only
      // if (conversion.valueType === 'number' && typeof rawValue === 'number') {
      //   const response = await fetch(`/plugins/signalk-units-preference/convert/${path}/${rawValue}`)
      //   const result = await response.json()
      //   displayValue(path, result.formatted)
      // }
    }
  }
}
```

#### 3. Bulk Path Analysis

**Use Case**: Analyze multiple paths at startup to determine types and units

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
    const response = await fetch(`/plugins/signalk-units-preference/conversion/${path}`)
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
const response = await fetch(`/plugins/signalk-units-preference/conversion/${path}`)
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
  const response = await fetch(`/plugins/signalk-units-preference/conversion/${path}`)
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
    const response = await fetch(`/plugins/signalk-units-preference/conversion/${this.path}`)
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
      const response = await fetch('/plugins/signalk-units-preference/convert', {
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
      const response = await fetch(`/plugins/signalk-units-preference/conversion/${path}`)
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
          // const response = await fetch(`/plugins/signalk-units-preference/convert/${path}/${rawValue}`)
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

// For numbers (GET endpoint):
const response = await fetch(`/plugins/signalk-units-preference/convert/${path}/${rawValue}`)
const result = await response.json()
const display = result.formatted

// For all types (POST endpoint):
const response = await fetch('/plugins/signalk-units-preference/convert', {
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
const conversion = await fetch('/plugins/signalk-units-preference/conversion/some.path').then(r => r.json())
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
