# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.3-beta.1] - 2025-10-20

### Added ⭐ Zones API
- **Zones API Implementation**: New REST endpoints for fetching gauge zone/notification ranges with unit conversion
  - **Discovery Endpoint**: `GET /signalk/v1/zones` - Returns all paths that have zones defined
  - **Single Path Endpoint**: `GET /signalk/v1/zones/:path` - Returns zones for a specific path with converted bounds
  - **Bulk Query Endpoint**: `POST /signalk/v1/zones/bulk` - Query zones for multiple paths in a single request
  - **Location**: Registered at `/signalk/v1/zones` (public routes, like history API)
  - **Implementation**: `src/ZonesManager.ts` - New module managing zone conversions and caching

- **Zone Bounds Conversion**: Automatic conversion of zone bounds to user-preferred units
  - **Feature**: Takes zone definitions from SignalK metadata and converts lower/upper bounds to target units
  - **Example**: Power zones defined as 25-50W automatically converted to 0.025-0.05kW when user preference is kW
  - **Metadata Source**: Fetches zones from SignalK's internal metadata using `app.getMetadata()`
  - **Supported States**: Handles standard states (normal, nominal, alert, warn, alarm, emergency) plus custom states
  - **Location**: `src/ZonesManager.ts:160-209`

- **Zones Caching**: TTL-based caching for improved performance
  - **Cache Strategy**: Caches converted zones per path with configurable TTL
  - **Configuration**: `zonesCacheTTLMinutes` plugin setting (default: 5 minutes)
  - **Invalidation**: Cache automatically cleared when preferences change
  - **Location**: `src/ZonesManager.ts:212-249`
  - **Impact**: Reduces metadata lookups and conversion overhead for frequently accessed paths

- **MetadataManager Enhancement**: Added zone fetching capability
  - **Method**: `getPathZones(path)` - Retrieves zone definitions from SignalK metadata
  - **Fallback Logic**: Tries cached metadata first, then fetches from `app.getMetadata()` if needed
  - **Location**: `src/MetadataManager.ts` (new `getPathZones()` method)
  - **Integration**: ZonesManager depends on MetadataManager for zone data access

### Changed
- **Route Registration Pattern**: Zones API follows signalk-parquet history API pattern
  - **Architecture**: Routes registered directly on app object cast to Router (not via plugin router)
  - **Authentication**: Public routes at `/signalk/v1/` level bypass plugin authentication
  - **Bearer Token Support**: Works with Bearer tokens like history API (no auth required)
  - **Location**: `src/index.ts:76-131`
  - **Rationale**: Matches SignalK convention for public API endpoints, ensures compatibility with external clients

### Technical
- **New Modules**:
  - `src/ZonesManager.ts` - Zone conversion and caching logic
  - `src/types.ts` - Added zone-related TypeScript interfaces:
    - `SignalKZone` - Raw zone from SignalK metadata
    - `ZoneDefinition` - Converted zone with target units
    - `PathZones` - Single path zones response
    - `BulkZonesResponse` - Bulk query response
    - `BulkZonesRequest` - Bulk query request
    - `ZonesDiscoveryResponse` - Discovery endpoint response

- **Zones API Features**:
  - Handles unbounded zones (null lower/upper bounds)
  - Preserves zone messages and custom states
  - Returns timestamp with each response
  - Graceful error handling with fallback to empty zones
  - Debug logging for troubleshooting

- **Plugin Configuration**:
  - Added `zonesCacheTTLMinutes` schema property (default: 5, minimum: 1)
  - Cache TTL configurable via plugin settings UI
  - UnitsManager getter added: `getMetadataManager()` for ZonesManager access

### Documentation
- **API Endpoints**:
  - `/signalk/v1/zones` - Discover all paths with zones
  - `/signalk/v1/zones/:path` - Get zones for specific path
  - `/signalk/v1/zones/bulk` - Query multiple paths (POST with `{ paths: [...] }`)
  - All endpoints return zones with bounds converted to user's preferred units

## [0.7.2-beta.1] - 2025-10-18

### Fixed
- **WebSocket Stream Performance**: Eliminated redundant `getConversion()` calls in conversion processing
  - **Root Cause**: `convertPathValue()` was called to get converted values, but then `getConversion()` was called again separately to get metadata when `sendMeta` was enabled
  - **Solution**:
    - Modified `convertValue()` method to return full result including metadata from `convertPathValue()`
    - Reuse metadata already computed during conversion instead of making second expensive call
    - Removed now-unused `buildMetadata()` helper method
  - **Location**: `src/ConversionStreamServer.ts:376-412, 453-481`
  - **Impact**: ~50% reduction in conversion CPU time when `sendMeta=true`, eliminating duplicate metadata resolution for every value in every delta
  - **Technical Details**: Each `getConversion()` call involves preference lookups, pattern matching, metadata resolution with multiple fallbacks, and conversion definition lookups - eliminating the duplicate call provides significant CPU savings

- **WebSocket Stream Performance**: Added conversion metadata caching for repeated paths
  - **Root Cause**: Same SignalK paths appear repeatedly in deltas (e.g., navigation.speedOverGround updates at 5Hz), but metadata was recomputed each time
  - **Solution**:
    - Added `conversionCache` Map to cache conversion metadata per path
    - Registered callback with `UnitsManager` to clear cache when preferences change
    - Cache automatically invalidated when user modifies preferences
  - **Location**: `src/ConversionStreamServer.ts:43, 98-104, 462-500`
  - **Impact**: Reduces CPU overhead for repeated path conversions across multiple deltas
  - **Cache Strategy**: Caches metadata (which rarely changes), not converted values (which change frequently)
  - **Cache Invalidation**: Automatically cleared when preferences updated to ensure fresh conversion rules

### Changed
- **WebSocket Stream Default Behavior**: Changed `sendMeta` constructor default from `true` to `false`
  - **Rationale**: Metadata (units, displayFormat, description) rarely changes and doesn't need to be sent with every delta message
  - **Location**: `src/ConversionStreamServer.ts:45`
  - **Impact**: Reduces bandwidth usage and CPU overhead for metadata transmission on WebSocket stream by default
  - **Consistency**: Now matches the plugin configuration schema default (which was already `false`)
  - **User Control**: Users can still enable metadata transmission via plugin settings if needed
  - **Note**: This change only affects the WebSocket stream (`/plugins/signalk-units-preference/stream`), not REST API endpoints which always include metadata

## [0.7.1-beta.4] - 2025-10-17

### Fixed
- **WebSocket Server Lifecycle Race Condition**: Fixed `TypeError: Cannot read properties of null (reading 'handleUpgrade')` crash
  - **Root Cause**: HTTP server's `upgrade` event handler was never removed when plugin stopped, causing it to fire with null `wss` reference during restart
  - **Solution**:
    - Store references to `httpServer` and `upgradeHandler` for proper cleanup
    - Added `removeListener('upgrade')` call in `stop()` method to cleanly detach the handler
    - Added defensive null checks in handler to gracefully reject connections during shutdown
  - **Location**: `src/ConversionStreamServer.ts:32-113`
  - **Impact**: Plugin now properly cleans up event handlers on stop, preventing crashes during restarts or lifecycle changes
  - **Symptoms Fixed**: Eliminates crashes when clients connect during/after plugin restart, particularly critical on embedded systems (Raspberry Pi)

- **WebSocket Stream CPU Performance**: Optimized conversion processing to reduce CPU usage
  - **Root Cause 1**: Plugin processed ALL incoming deltas before checking if any client wanted them
  - **Solution 1**: Added early context filtering in `handleSignalKDelta()` to skip processing unwanted vessel data
  - **Location**: `src/ConversionStreamServer.ts:337-345`
  - **Impact**: Prevents wasting CPU on AIS targets when clients only want vessels.self

  - **Root Cause 2**: Duplicate `getConversion()` calls - once unnecessarily before conversion, once inside `convertPathValue()`
  - **Solution 2**: Removed unnecessary `getConversion()` call, only calling it when metadata is actually needed (when `sendMeta` is enabled)
  - **Location**: `src/ConversionStreamServer.ts:376-405`
  - **Impact**: Cuts conversion CPU usage in half by eliminating duplicate lookups

### Changed
- **Metadata Transmission Default**: Changed `sendMeta` default from `true` to `false`
  - **Rationale**: Metadata rarely changes and doesn't need to be sent with every delta
  - **Location**: `src/index.ts:27-33`
  - **Impact**: Reduces bandwidth and eliminates unnecessary `getConversion()` calls per delta, improving performance on resource-constrained devices
  - **Note**: Users can re-enable in plugin settings if needed

## [0.7.1-beta.3] - 2025-10-16

### Fixed
- **GET Endpoint Query Parameter Parsing**: Fixed numeric values in query strings not being converted properly
  - **Root Cause**: Query parameters always come through as strings from URLs, but conversion logic expected numeric types for numeric paths
  - **Solution**: Added value parsing logic to GET `/conversions/:path` endpoint that parses strings to numbers before conversion
  - **Location**: `src/index.ts:299-315`
  - **Impact**: Endpoints like `/conversions/electrical.batteries.512.voltage?value=13.3` now work correctly instead of throwing "Expected numeric value, got string" error
  - **Consistency**: GET endpoint now parses values the same way as POST `/conversions` endpoint (lines 182-188)
  - **Parsing Strategy**:
    1. First attempts to parse as number using `Number()`
    2. Falls back to JSON parsing for objects, arrays, booleans
    3. Keeps as string if both parsing methods fail
  - **Why WebSocket Works**: WebSocket receives JSON-parsed deltas where numbers are already numeric types, while HTTP query params are always strings

## [0.7.1-beta.2] - 2025-10-12

### Added
- **Base Unit Self-Conversion**: Base units now always appear in their own target unit dropdowns
  - **Feature**: Can now select base unit as target (e.g., select "lx" for "lx" base unit)
  - **Implementation**: Automatically adds pass-through conversion (formula: "value") for each base unit
  - **Location**: `src/UnitsManager.ts:1231-1237`, `src/UnitsManager.ts:1297-1309`
  - **Impact**: Enables "no conversion" option by selecting the base unit itself

### Fixed
- **Custom Base Unit Descriptions in Dropdowns**: Fixed custom base unit descriptions not appearing in target unit dropdowns
  - **Root Cause**: Self-conversion for base units didn't include the `longName` field
  - **Solution**: Pass-through conversions now include `longName` from base unit's description
  - **Location**: `src/UnitsManager.ts:1297-1309`
  - **Impact**: Custom base units like "lx" now show as "lumen per square meter (lx)" in target dropdowns
  - **Example**: Custom "W/m²" base unit now displays as "watts per square meter (W/m²)"

- **Custom Base Unit Naming Mismatch**: Fixed frontend/backend inconsistency in custom base unit field names
  - **Root Cause**: Frontend sent `description`, backend expected `longName` to match standard base units
  - **Solution**: Frontend now sends `longName`, backend accepts both `longName` and `description` for backwards compatibility
  - **Locations**: `public/js/app-unit-definitions.js:69-82`, `src/index.ts:553-565`, `src/UnitsManager.ts:1314-1320`
  - **Impact**: New custom base units properly save and display descriptions; existing units with `description` still work

- **Schema Cache Not Invalidating**: Fixed category/pattern dropdowns not updating after preference changes
  - **Root Cause**: Schema cache used 15-second TTL but wasn't invalidated on preference changes
  - **Solution**: Added cache invalidation callback that clears schema cache when preferences are saved
  - **Location**: `src/UnitsManager.ts:190-205`
  - **Impact**: New categories immediately appear in pattern form dropdowns without page refresh

- **Pattern List Overflow**: Fixed pattern list being cut off when exceeding max-height
  - **Root Cause**: Collapsible content had `overflow: hidden` with 2000px max-height
  - **Solution**: Changed to `overflow-y: auto` to enable scrolling when content exceeds max-height
  - **Location**: `public/index.html:589-600`
  - **Impact**: Can now scroll through large pattern lists instead of content being cut off

### Technical
- **Schema Cache Management**: Enhanced cache invalidation strategy
  - Added `clearSchemaCache()` method to force schema rebuild
  - Integrated with preferences change callback
  - Maintains 15-second TTL while supporting immediate invalidation
- **Backwards Compatibility**: Dual-field support for base unit descriptions
  - Frontend sends `longName`, backend stores as `longName`
  - Backend reads `longName` first, falls back to `description` for old data
  - Schema builder checks both fields when building labels

## [0.7.1-beta.1] - 2025-10-10

### Added
- **Self Vessel ID Endpoint**: New REST endpoint to retrieve the self vessel ID
  - **Endpoint**: `GET /plugins/signalk-units-preference/self`
  - **Returns**: `{ selfId, selfContext, selfType }`
  - **Impact**: Improves multi-vessel context handling in stream viewer
  - **Location**: `src/index.ts:711-725`

### Fixed
- **Path Discovery**: Fixed `/paths` endpoint returning limited paths on remote servers
  - **Root Cause**: `getPathsMetadata()` relied on `getAllSignalKMetadata()` which was empty if frontend hadn't called `POST /signalk-metadata`
  - **Solution**: Changed to use `collectSignalKPaths()` which directly fetches from SignalK API
  - **Impact**: Stream viewer now subscribes to all available paths consistently. Fixed a multitude of responsive issues in the stream viewer
  - **Location**: `src/UnitsManager.ts:772`

- **Epoch Timestamp Conversion in WebSocket Stream**: Fixed Epoch timestamps not converting to formatted dates
  - **Root Cause**: `detectValueType()` didn't recognize `'Epoch Seconds'` as a date type, causing API and WebSocket to behave differently
  - **Solution**: Added `'Epoch Seconds'` to date detection logic in `detectValueType()`
  - **Impact**: Single source of truth for date detection - both API and WebSocket now use same logic
  - **Location**: `src/MetadataManager.ts:66`
  - **Example**: `1760101789` now displays as `9:09:49 AM` in stream viewer

- **Stream Viewer Context Switching**: Fixed subscription mode not resetting when switching vessel contexts
  - **Root Cause**: Subscription mode persisted across context changes, causing incorrect data filtering
  - **Solution**: Reset subscription mode to 'all paths' mode on context change
  - **Impact**: Stream viewer now properly displays all paths when switching between vessels
  - **Location**: `public/js/app-stream-viewer.js`

- **Unified Conversion Pathway**: Eliminated duplicate conversion logic between API and WebSocket
  - **Root Cause**: Two separate conversion implementations caused inconsistent behavior between API and WebSocket endpoints
  - **Solution**: Created single `convertPathValue()` method in `UnitsManager` that handles ALL value types (number, date, boolean, string, object)
  - **Impact**: Reduced code duplication by 220+ lines, ensures consistent conversion behavior across all endpoints
  - **Location**: `src/UnitsManager.ts:501-619`, `src/index.ts:320`, `src/ConversionStreamServer.ts:398`
  - **Benefits**: Single source of truth for conversions, easier maintenance, consistent behavior

- **Object Value Passthrough**: Fixed objects being converted to `[object Object]` string
  - **Root Cause**: Type detection used metadata instead of runtime value, causing objects to hit default case with `String(value)`
  - **Solution**: Added runtime check for object values that bypasses metadata-based type detection
  - **Impact**: Objects now consistently pass through with proper JSON formatting regardless of metadata
  - **Location**: `src/UnitsManager.ts:519-535`
  - **Example**: `{"distance":80.066,"timeTo":-327.81}` now displays correctly instead of `[object Object]`

### Changed
- **Conversion Architecture Refactor**: Unified conversion logic across all endpoints
  - API `buildDeltaResponse()` simplified from 150+ lines to ~50 lines
  - WebSocket `convertValue()` simplified from 70+ lines to ~15 lines
  - Both now delegate to single `UnitsManager.convertPathValue()` method
  - Guarantees consistent behavior between API and WebSocket conversions

- **Stream Display Improvements**: Enhanced data handling in stream viewer and conversion server
  - Improved data processing reliability in `app-stream-viewer.js`
  - Enhanced conversion logic in `ConversionStreamServer.ts`
  - Better error handling and state management

- **Category Preference Updates**: Streamlined category preference update logic
  - Simplified API endpoint interaction
  - Removed 20+ lines of redundant code
  - Improved maintainability of preference handling

### Technical
- **Unified Conversion Architecture**: Single method for all conversion operations
  - `UnitsManager.convertPathValue()` - One method to rule them all
  - Handles all value types: number, date, boolean, string, object
  - Runtime type detection with fallback to metadata
  - Both API (`buildDeltaResponse`) and WebSocket (`ConversionStreamServer.convertValue`) now call this single method
  - Eliminated 220+ lines of duplicate conversion code
- **Code Consistency**: Unified date type detection logic across API and WebSocket paths
- **Reliability**: Path discovery now works consistently regardless of frontend metadata cache state
- **Subscription Handling**: Improved multi-vessel subscription logic in stream viewer

## [0.7.0-beta.2] - 2025-10-09

### Added ⭐ Major Architecture Overhaul
- **Dedicated Conversion Stream Server**: Clean separation from SignalK data tree
  - **New WebSocket Endpoint**: `ws://host/plugins/signalk-units-preference/stream` for streaming converted values
  - **Zero Pollution**: No longer injects `.unitsConverted` paths into SignalK data tree (disabled by default)
  - **Internal Subscription**: Plugin subscribes to SignalK internally and converts on-the-fly
  - **Client Streaming**: Broadcasts converted values directly to clients without modifying SignalK
  - **Module**: `ConversionStreamServer.ts` handles dedicated WebSocket server and conversion streaming
  - **Dependencies**: Added `ws` and `@types/ws` for WebSocket server implementation

- **Multi-Vessel Context Support**: Stream conversions from any vessel, not just vessels.self
  - **Context Switching**: Select any vessel (self, AIS targets, buddy boats) from dropdown
  - **Dynamic Discovery**: Auto-detects new vessels every 30 seconds
  - **Manual Refresh**: Refresh button with visual feedback for immediate vessel list update
  - **Context-Aware Subscriptions**: Plugin subscribes to SignalK for selected vessel context
  - **REST API Enhancement**: Conversion endpoints accept optional `context` parameter

- **Live Delta Stream Viewer**: Real-time conversion monitoring in web UI
  - **New Tab Section**: "Live Delta Stream Viewer" at bottom of Metadata tab
  - **WebSocket Connection**: Connect/disconnect controls with status indicator
  - **Vessel Selector**: Dropdown with all available vessels and vessel names
  - **Real-Time Display**: Shows original and converted values side-by-side
  - **Detailed Info**: Displays baseUnit, targetUnit, timestamp, and $source for each path
  - **Auto-Scroll**: Smart scrolling when near bottom of data stream
  - **Visual Status**: Color-coded connection status (green=connected, gray=disconnected, yellow=connecting)

- **Path Discovery Enhancement**: Discovers paths from ALL vessels
  - **Multi-Vessel Scanning**: MetadataManager now scans all vessels, not just vessels.self
  - **AIS Target Paths**: Discovers paths like `navigation.distanceToSelf` that only exist on other vessels
  - **Debug Logging**: Added logging to show path count per vessel during discovery

### Changed
- **Delta Injection Disabled by Default**: Changed `enableDeltaInjection` default from `true` to `false`
  - **Legacy Mode**: Old `.unitsConverted` injection available but deprecated
  - **Migration**: Users should migrate to new dedicated WebSocket endpoint
  - **Cleaner Architecture**: Recommended approach no longer pollutes SignalK data tree

- **Stream Viewer Architecture**: Updated to use plugin's dedicated endpoint
  - **Connection URL**: Changed from SignalK's WebSocket to plugin's dedicated endpoint
  - **Subscription Format**: Simplified subscription message with context and paths
  - **Data Format**: Receives converted values directly without `.unitsConverted` suffix

- **Context Parameter**: REST API endpoints enhanced with optional context support
  - **buildDeltaResponse()**: Accepts `context` parameter (defaults to vessels.self)
  - **Envelope Format**: Context included in delta envelope
  - **Multi-Vessel API**: Apps can query conversions for any vessel

### Fixed
- **Path Discovery Bug**: Fixed MetadataManager only scanning vessels.self
  - **Root Cause**: `collectSignalKPaths()` was hardcoded to only scan vessels.self
  - **Solution**: Now iterates through all vessel IDs from `/signalk/v1/api/vessels`
  - **Impact**: Patterns like `**.distanceToSelf` now properly discovered and converted

- **Context Mismatch**: Fixed stream viewer not receiving data when switching vessels
  - **Subscription Handling**: Plugin properly subscribes to SignalK for each client's context
  - **Broadcast Filtering**: Only sends deltas to clients subscribed to matching context
  - **Debug Logging**: Added extensive logging for diagnosing context issues

### Technical
- **New Modules**:
  - `ConversionStreamServer.ts` - Dedicated WebSocket server for conversion streaming
  - Enhanced `DeltaStreamHandler.ts` (legacy mode, disabled by default)

- **WebSocket Server**:
  - Listens on `/plugins/signalk-units-preference/stream`
  - Handles upgrade events on HTTP server
  - Manages client subscriptions and contexts
  - Internal SignalK WebSocket connection with auto-reconnect
  - Per-client subscription tracking

- **MetadataManager Enhancements**:
  - `collectSignalKPaths()` now scans all vessels
  - Added per-vessel debug logging
  - Total paths logged across all vessels

- **Stream Viewer Features**:
  - `app-stream-viewer.js` - Complete client implementation
  - `populateContexts()` - Fetches vessels from `/signalk/v1/api/vessels`
  - `startContextAutoRefresh()` - 30-second auto-refresh interval
  - `handleContextChange()` - Reconnects with new context on selection
  - `subscribeToConvertedPaths()` - Sends subscription with context

- **API Enhancements**:
  - Added `context` parameter to `buildDeltaResponse()`
  - Context defaults to `vessels.self` if not specified
  - Delta envelope includes context for all responses

### Documentation
- **README Updates**:
  - Updated Delta Stream Integration section with new architecture
  - Added multi-vessel context usage examples
  - Documented dedicated WebSocket endpoint
  - Updated integration guide with new connection method
  - Added migration notes for v0.7.0 architecture change

## [0.7.0-beta.1] - 2025-10-09

### Added
- **Comprehensive Test Suite**: Implemented Jest-based testing framework with 56+ passing tests
  - **Formula Evaluator Tests** (28 tests): Basic arithmetic, Math functions, edge cases, security validation, error handling
  - **Conversion Engine Tests** (19 tests): Conversion lookups, unit definition resolution, formula conversions, date/time formatting
  - **Error Handling Tests** (11 tests): ValidationError, NotFoundError, ConversionError, response formatting
  - **Test Commands**: `npm test`, `npm run test:watch`, `npm run test:coverage`
  - **Coverage**: 80%+ coverage on core conversion logic, 96%+ on error handling
- **MIT License File**: Added standard MIT license to project root
- **Contributors Metadata**: Added contributors field to package.json

### Changed
- **Package.json Improvements**:
  - **Version**: Bumped to 0.7.0-beta.1
  - **Dependencies Cleanup**: Moved `@types/adm-zip` and `@types/archiver` to devDependencies (reduces production package size)
  - **Node.js Requirement**: Added `engines` field requiring Node.js >= 18.0.0
  - **Files Whitelist**: Added explicit `files` field for safer npm publishing (dist/, public/, presets/, README.md, LICENSE)
  - **Contributors**: Added contributor information with email
- **Code Refactoring** (from recent commits):
  - **Modularization**: Split UnitsManager into focused classes:
    - `ConversionEngine.ts` - Conversion logic and formula evaluation
    - `MetadataManager.ts` - Path metadata resolution and management
    - `PreferencesStore.ts` - Preference persistence and loading
    - `PatternMatcher.ts` - Wildcard pattern matching logic
  - **Standardized Errors**: Introduced dedicated error classes (ValidationError, ConversionError, NotFoundError)
  - **Built-in Units**: Replaced comprehensiveDefaults.ts with builtInUnits.ts for clearer naming

### Fixed
- **Test Configuration**: Properly configured Jest with TypeScript support and coverage reporting
- **.gitignore**: Added coverage/ and *.tsbuildinfo to excluded files

### Technical Changes
- **Jest Configuration**: Added jest.config.js with ts-jest preset, coverage collection, and proper test matching
- **Test Infrastructure**: Created tests/ directory with organized test files by component
- **Package Metadata**: Enhanced package.json with all necessary fields for npm publication
- **Build Artifacts**: Updated .gitignore and .npmignore for cleaner repository

### Documentation
- **README Updates**:
  - Added Development → Testing section with test commands and coverage summary
  - Added Development → Linting section
  - Updated Project Structure to reflect modular architecture
  - Corrected license from Apache-2.0 to MIT
  - Updated file structure documentation with tests/ directory
- **Changelog**: Added this entry documenting all changes for 0.7.0-beta.1

## [0.6.0-beta.2] - 2025-10-08

### Added
- **Duration Formatting**: 11 new duration formats for the `time` category (base unit: seconds)
  - `DD:HH:MM:SS` - Days:Hours:Minutes:Seconds format
  - `HH:MM:SS` - Hours:Minutes:Seconds format
  - `HH:MM:SS.mmm` - Hours:Minutes:Seconds with milliseconds
  - `MM:SS` - Minutes:Seconds format
  - `MM:SS.mmm` - Minutes:Seconds with milliseconds
  - `MM.xx` - Decimal minutes (e.g., 150.75 min)
  - `HH.xx` - Decimal hours (e.g., 2.51 hr)
  - `DD.xx` - Decimal days (e.g., 0.10 days)
  - `duration-verbose` - Human-readable (e.g., "2 hours 30 minutes 45 seconds")
  - `duration-compact` - Compact format (e.g., "2h 30m")
  - Perfect for `navigation.course.calcValues.timeToGo`, `propulsion.*.runtime`, timers, etc.

### Changed
- **Security Hardening**: Replaced unsafe `Function` constructor with **mathjs** library
  - Eliminated code injection vulnerabilities in formula evaluation
  - Sandboxed mathematical expression evaluation
  - No access to JavaScript runtime or global scope
  - Validated input/output types with proper error handling
- **Date/Time Security**: Replaced manual date parsing with **date-fns** library
  - Safe ISO-8601 date parsing and formatting
  - Proper timezone support using date-fns-tz
  - Removed 100+ lines of custom date manipulation code
  - All 28+ date formats now use date-fns format patterns
- **Dynamic Date Format Loading**: Date formats now generated from `date-formats.json`
  - Date format conversions created dynamically at runtime
  - Centralized format metadata in one location
  - No duplication between definitions and conversion logic
- **Type Safety Improvements**: Enhanced type handling for formulas
  - Formulas return `number` for numeric conversions
  - Formulas return `string` for duration/date formatting
  - Proper type checking throughout conversion pipeline
  - Consistent handling of numeric vs formatted string results
- **Cleaned Time Conversions**: Simplified seconds (s) base unit conversions
  - Removed confusing numeric-only conversions (old min, hr, day)
  - Kept only useful duration formats
  - Better organized with clear purpose for each format

### Security
- **No Code Injection**: mathjs prevents all code injection attacks
  - `constructor.constructor("malicious")()` ❌ Blocked
  - `process.exit()` ❌ Blocked
  - `eval("malicious")` ❌ Blocked
- **Input Validation**: Strict validation of all formula inputs
  - Rejects NaN, Infinity, non-numeric values
  - Type-safe evaluation with error handling
- **Safe Dependencies**: Industry-standard libraries with millions of downloads
  - mathjs: 14.8.2 - Mathematical expression parser
  - date-fns: 4.1.0 - Modern date utility library
  - date-fns-tz: 3.2.0 - Timezone support for date-fns

### Technical Changes
- Refactored `formulaEvaluator.ts` with mathjs and date-fns
- Added duration formatting functions (formatDurationHMS, formatDurationMS, etc.)
- Updated `evaluateFormula()` to handle special duration format functions
- Enhanced `UnitsManager.convertValue()` to handle string results from duration formatting
- Enhanced `UnitsManager.convertUnitValue()` to handle string results
- Simplified `UnitsManager.formatDateValue()` using date-fns patterns
- Removed manual date manipulation code (MONTH_NAMES, WEEKDAY_NAMES, pad2, getDateParts)
- Updated `getConversionsForBaseUnit()` to dynamically generate date format conversions
- Cleaned up `standard-units-definitions.json` seconds (s) conversions

## [Older Versions]

For changelog entries prior to 0.6.0-beta.2, please see the full changelog history in the git repository or previous releases.
