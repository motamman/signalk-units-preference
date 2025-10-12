# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
