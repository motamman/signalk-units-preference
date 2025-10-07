/* eslint-disable no-unused-vars, @typescript-eslint/no-unused-vars */

/**
 * app-metadata.js
 *
 * SignalK Metadata Tab
 * Functions for viewing and editing SignalK path metadata
 */

// ============================================================================
// PATTERN MATCHING HELPERS
// ============================================================================

// Check if a path matches a pattern (supports wildcards)
function matchesPattern(path, pattern) {
  // Convert wildcard pattern to regex
  // * matches any characters except dots
  // ** matches any characters including dots
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '___DOUBLE_STAR___')
    .replace(/\*/g, '[^.]+')
    .replace(/___DOUBLE_STAR___/g, '.*')

  const regex = new RegExp(`^${regexPattern}$`)
  return regex.test(path)
}

// Find matching pattern for a path
function findMatchingPattern(path) {
  if (!preferences.pathPatterns || preferences.pathPatterns.length === 0) {
    return null
  }

  // Sort by priority (highest first)
  const sorted = [...preferences.pathPatterns].sort((a, b) => (b.priority || 0) - (a.priority || 0))

  for (const pattern of sorted) {
    if (matchesPattern(path, pattern.pattern)) {
      return pattern
    }
  }

  return null
}

// ============================================================================
// METADATA STATE & TEMPLATES
// ============================================================================

// Metadata editing
let currentMetadataConversions = {}

// Conversion templates for common conversions
const conversionTemplates = {
  'm/s': [
    { unit: 'knots', formula: 'value * 1.94384', inverseFormula: 'value * 0.514444', symbol: 'kn' },
    { unit: 'km/h', formula: 'value * 3.6', inverseFormula: 'value * 0.277778', symbol: 'km/h' },
    { unit: 'mph', formula: 'value * 2.23694', inverseFormula: 'value * 0.44704', symbol: 'mph' }
  ],
  K: [
    { unit: 'celsius', formula: 'value - 273.15', inverseFormula: 'value + 273.15', symbol: '°C' },
    {
      unit: 'fahrenheit',
      formula: '(value - 273.15) * 9/5 + 32',
      inverseFormula: '(value - 32) * 5/9 + 273.15',
      symbol: '°F'
    }
  ],
  Pa: [
    { unit: 'hPa', formula: 'value * 0.01', inverseFormula: 'value * 100', symbol: 'hPa' },
    { unit: 'mbar', formula: 'value * 0.01', inverseFormula: 'value * 100', symbol: 'mbar' },
    {
      unit: 'inHg',
      formula: 'value * 0.0002953',
      inverseFormula: 'value * 3386.39',
      symbol: 'inHg'
    },
    {
      unit: 'psi',
      formula: 'value * 0.000145038',
      inverseFormula: 'value * 6894.76',
      symbol: 'psi'
    }
  ],
  m: [
    { unit: 'ft', formula: 'value * 3.28084', inverseFormula: 'value * 0.3048', symbol: 'ft' },
    { unit: 'km', formula: 'value * 0.001', inverseFormula: 'value * 1000', symbol: 'km' },
    { unit: 'nm', formula: 'value * 0.000539957', inverseFormula: 'value * 1852', symbol: 'nm' },
    { unit: 'mi', formula: 'value * 0.000621371', inverseFormula: 'value * 1609.34', symbol: 'mi' },
    {
      unit: 'fathom',
      formula: 'value * 0.546807',
      inverseFormula: 'value * 1.8288',
      symbol: 'fathom'
    }
  ],
  rad: [
    { unit: 'deg', formula: 'value * 57.2958', inverseFormula: 'value * 0.0174533', symbol: '°' }
  ],
  m3: [
    { unit: 'L', formula: 'value * 1000', inverseFormula: 'value * 0.001', symbol: 'L' },
    {
      unit: 'gal',
      formula: 'value * 264.172',
      inverseFormula: 'value * 0.00378541',
      symbol: 'gal'
    },
    {
      unit: 'gal(UK)',
      formula: 'value * 219.969',
      inverseFormula: 'value * 0.00454609',
      symbol: 'gal(UK)'
    }
  ],
  V: [{ unit: 'mV', formula: 'value * 1000', inverseFormula: 'value * 0.001', symbol: 'mV' }],
  A: [{ unit: 'mA', formula: 'value * 1000', inverseFormula: 'value * 0.001', symbol: 'mA' }],
  W: [
    { unit: 'kW', formula: 'value * 0.001', inverseFormula: 'value * 1000', symbol: 'kW' },
    { unit: 'hp', formula: 'value * 0.00134102', inverseFormula: 'value * 745.7', symbol: 'hp' }
  ],
  Hz: [{ unit: 'rpm', formula: 'value * 60', inverseFormula: 'value / 60', symbol: 'rpm' }],
  ratio: [{ unit: 'percent', formula: 'value * 100', inverseFormula: 'value * 0.01', symbol: '%' }],
  s: [
    { unit: 'min', formula: 'value / 60', inverseFormula: 'value * 60', symbol: 'min' },
    { unit: 'h', formula: 'value / 3600', inverseFormula: 'value * 3600', symbol: 'h' },
    { unit: 'days', formula: 'value / 86400', inverseFormula: 'value * 86400', symbol: 'd' }
  ],
  C: [
    { unit: 'Ah', formula: 'value / 3600', inverseFormula: 'value * 3600', symbol: 'Ah' },
    { unit: 'mAh', formula: 'value / 3.6', inverseFormula: 'value * 3.6', symbol: 'mAh' }
  ],
  deg: [
    { unit: 'rad', formula: 'value * 0.0174533', inverseFormula: 'value * 57.2958', symbol: 'rad' }
  ]
}

// ============================================================================
// METADATA LOADING & RENDERING
// ============================================================================

// Extract all SignalK metadata at once
async function getAllSignalKMetadata() {
  try {
    const data = await apiLoadSignalKMetadata()

    const metadataMap = {}

    const extractMeta = (obj, prefix = '') => {
      if (!obj || typeof obj !== 'object') return

      for (const key in obj) {
        if (
          key === 'meta' ||
          key === 'timestamp' ||
          key === 'source' ||
          key === '$source' ||
          key === 'values' ||
          key === 'sentence'
        )
          continue

        const currentPath = prefix ? `${prefix}.${key}` : key

        if (obj[key] && typeof obj[key] === 'object') {
          // Check if this object has meta (capture all metadata, not just those with units)
          if (obj[key].meta) {
            metadataMap[currentPath] = {
              ...obj[key].meta,
              value: obj[key].value,
              $source: obj[key].$source || obj[key].source,
              timestamp: obj[key].timestamp
            }
          }
          extractMeta(obj[key], currentPath)
        }
      }
    }

    const selfId = data.self?.replace('vessels.', '')
    if (data.vessels && selfId && data.vessels[selfId]) {
      extractMeta(data.vessels[selfId])
    }

    signalKValueDetails = {}
    signalKValues = {}

    // Flatten metadataMap into signalKValueDetails with context path keys
    Object.entries(metadataMap).forEach(([path, meta]) => {
      signalKValueDetails[path] = {
        value: meta.value,
        source: meta.$source || meta.source,
        timestamp: meta.timestamp
      }

      if (meta.value !== undefined) {
        signalKValues[path] = meta.value
      }
    })

    // Send metadata to backend for type detection and supportsPut tracking
    if (Object.keys(metadataMap).length > 0) {
      try {
        await apiSendSignalKMetadata(metadataMap)
        console.log(`Sent ${Object.keys(metadataMap).length} metadata entries to backend`)
      } catch (err) {
        console.error('Failed to send metadata to backend:', err)
      }
    }

    return metadataMap
  } catch (error) {
    console.error('Failed to load SignalK metadata:', error)
    return {}
  }
}

// Render metadata with all available paths color-coded
async function renderMetadata() {
  const container = document.getElementById('metadataList')

  if (!availablePaths || availablePaths.length === 0) {
    container.innerHTML = '<div class="empty-state">Loading paths...</div>'
    return
  }

  container.innerHTML = '<div style="padding: 20px;">Analyzing paths...</div>'

  // Get all SignalK metadata at once
  const signalKMetadata = await getAllSignalKMetadata()

  // Get resolved metadata from backend (includes path inference)
  const backendMetadata = await apiLoadMetadata()

  // Build path info with metadata status
  const pathInfo = []

  for (const path of availablePaths) {
    const skMeta = signalKMetadata[path]
    const backendMeta = backendMetadata[path]
    const valueDetails = getCurrentValueDetails(path)
    const hasSignalKMetadata = skMeta && skMeta.units
    const hasBackendMetadata = backendMeta && backendMeta.baseUnit && backendMeta.baseUnit !== 'none'
    const matchingPattern = findMatchingPattern(path)
    const pathOverride = preferences?.pathOverrides?.[path]

    let color, status, baseUnit, category, displayUnit

    if (pathOverride) {
      // Green: Has explicit path override
      color = '#d4edda'
      status = 'Path Override'
      baseUnit = pathOverride.baseUnit || matchingPattern?.baseUnit || skMeta?.units || '-'
      category = pathOverride.category || matchingPattern?.category || '-'
      displayUnit = pathOverride.targetUnit
    } else if (matchingPattern) {
      // Yellow: Matches a pattern rule
      color = '#fff3cd'
      status = `Pattern: ${matchingPattern.pattern}`
      baseUnit =
        matchingPattern.baseUnit ||
        unitSchema?.categoryToBaseUnit?.[matchingPattern.category] ||
        '-'
      category = matchingPattern.category
      const categoryTarget = preferences?.categories?.[matchingPattern.category]?.targetUnit
      displayUnit = matchingPattern.targetUnit || categoryTarget || baseUnit || '-'
    } else if (hasSignalKMetadata) {
      // Try to auto-assign category from SignalK base unit
      baseUnit = skMeta.units

      // Find category for this base unit
      category = unitSchema?.categoryToBaseUnit
        ? Object.entries(unitSchema.categoryToBaseUnit).find(([, unit]) => unit === baseUnit)?.[0]
        : null

      // Check if this category has a preference
      const categoryPref = category ? preferences?.categories?.[category] : null

      if (categoryPref && categoryPref.targetUnit) {
        // Darker blue: Auto-assigned to category
        color = '#b3d9ff'
        status = 'SignalK Auto'
        displayUnit = categoryPref.targetUnit
      } else {
        // Light blue: Has only SignalK metadata (no category mapping)
        color = '#cfe2ff'
        status = 'SignalK Only'
        category = '-'
        displayUnit = baseUnit
      }
    } else if (hasBackendMetadata) {
      // Backend has resolved metadata (e.g., from path inference)
      baseUnit = backendMeta.baseUnit
      category = backendMeta.category || '-'

      // Check if this category has a preference
      const categoryPref = category !== '-' ? preferences?.categories?.[category] : null

      if (categoryPref && categoryPref.targetUnit) {
        // Darker blue: Auto-assigned to category via backend inference
        color = '#b3d9ff'
        status = 'SignalK Auto'
        displayUnit = categoryPref.targetUnit
      } else {
        // Light blue: Has backend metadata but no category preference
        color = '#cfe2ff'
        status = 'SignalK Only'
        displayUnit = baseUnit
      }
    } else {
      // Light purple: Has neither
      color = '#f3e8ff'
      status = 'None'
      baseUnit = '-'
      category = '-'
      displayUnit = '-'
    }

    // Add type and supportsPut from SignalK metadata
    const valueType =
      skMeta?.units === 'RFC 3339 (UTC)' || skMeta?.units === 'ISO-8601 (UTC)'
        ? 'date'
        : skMeta?.units
          ? 'number'
          : typeof valueDetails?.value === 'boolean'
            ? 'boolean'
            : typeof valueDetails?.value === 'string'
              ? 'string'
              : typeof valueDetails?.value === 'object' && valueDetails?.value !== null
                ? 'object'
                : 'unknown'

    const supportsPut = skMeta?.supportsPut || false
    const signalkSource = valueDetails?.source || skMeta?.$source || skMeta?.source || null
    const signalkTimestamp = valueDetails?.timestamp || skMeta?.timestamp || null

    pathInfo.push({
      path,
      color,
      status,
      baseUnit,
      category,
      displayUnit,
      valueType,
      supportsPut,
      signalkSource,
      signalkTimestamp
    })
  }

  // Store for filtering/sorting
  window.metadataPathInfo = pathInfo
  window.metadataSortColumn = 'path'
  window.metadataSortDirection = 'asc'

  // Check if this is initial render
  const isInitialRender = !document.getElementById('metadataTableBody')

  // Render controls and table
  renderMetadataTable(pathInfo)

  // Setup event listeners only on initial render
  if (isInitialRender) {
    document.getElementById('metadataSearchFilter').addEventListener('input', filterAndSortMetadata)

    // Setup column header click handlers
    document.querySelectorAll('.metadata-sortable-header').forEach(header => {
      header.addEventListener('click', () => {
        const column = header.dataset.column
        if (window.metadataSortColumn === column) {
          window.metadataSortDirection = window.metadataSortDirection === 'asc' ? 'desc' : 'asc'
        } else {
          window.metadataSortColumn = column
          window.metadataSortDirection = 'asc'
        }
        filterAndSortMetadata()
      })
    })
  }
}

function renderMetadataTable(pathInfo) {
  const container = document.getElementById('metadataList')

  // Check if we're doing initial render or update
  const isInitialRender = !document.getElementById('metadataTableBody')

  if (isInitialRender) {
    const totalPaths = window.metadataPathInfo.length
    container.innerHTML = `
      <div style="margin-bottom: 15px;">
        <div style="display: flex; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; align-items: center;">
          <input type="text" id="metadataSearchFilter" placeholder="Search all columns..." style="padding: 6px 10px; flex: 1; min-width: 200px; border: 1px solid #dee2e6; border-radius: 4px;">
          <span id="metadataResultCount" style="padding: 6px 10px; font-size: 13px; color: #6c757d;">Showing ${totalPaths} paths</span>
        </div>
        <div style="display: flex; gap: 20px; font-size: 13px; flex-wrap: wrap; align-items: center;">
          <div class="metadata-filter-label" onclick="filterMetadataByStatus('Path Override', event)" style="cursor: pointer; padding-bottom: 4px; border-bottom: 3px solid transparent;" title="Click to filter by Path Override"><span style="display: inline-block; width: 15px; height: 15px; background: #d4edda; border: 1px solid #c3e6cb; margin-right: 5px;"></span> Path Override (<span id="overrideCount">${window.metadataPathInfo.filter(p => p.status === 'Path Override').length}</span>)</div>
          <div class="metadata-filter-label" onclick="filterMetadataByStatus('Pattern', event)" style="cursor: pointer; padding-bottom: 4px; border-bottom: 3px solid transparent;" title="Click to filter by Pattern"><span style="display: inline-block; width: 15px; height: 15px; background: #fff3cd; border: 1px solid #ffc107; margin-right: 5px;"></span> Pattern Match (<span id="patternCount">${window.metadataPathInfo.filter(p => p.status.startsWith('Pattern:')).length}</span>)</div>
          <div class="metadata-filter-label" onclick="filterMetadataByStatus('SignalK Auto', event)" style="cursor: pointer; padding-bottom: 4px; border-bottom: 3px solid transparent;" title="Click to filter by SignalK Auto"><span style="display: inline-block; width: 15px; height: 15px; background: #b3d9ff; border: 1px solid #9ec5fe; margin-right: 5px;"></span> SignalK Auto (<span id="autoCount">${window.metadataPathInfo.filter(p => p.status === 'SignalK Auto').length}</span>)</div>
          <div class="metadata-filter-label" onclick="filterMetadataByStatus('SignalK Only', event)" style="cursor: pointer; padding-bottom: 4px; border-bottom: 3px solid transparent;" title="Click to filter by SignalK Only"><span style="display: inline-block; width: 15px; height: 15px; background: #cfe2ff; border: 1px solid #9ec5fe; margin-right: 5px;"></span> SignalK Only (<span id="signalkCount">${window.metadataPathInfo.filter(p => p.status === 'SignalK Only').length}</span>)</div>
          <div class="metadata-filter-label" onclick="filterMetadataByStatus('None', event)" style="cursor: pointer; padding-bottom: 4px; border-bottom: 3px solid transparent;" title="Click to filter by None"><span style="display: inline-block; width: 15px; height: 15px; background: #f3e8ff; border: 1px solid #e0ccff; margin-right: 5px;"></span> No Metadata (<span id="noneCount">${window.metadataPathInfo.filter(p => p.status === 'None').length}</span>)</div>
          <div class="metadata-filter-label" onclick="filterMetadataByStatus('boolean', event)" style="cursor: pointer; padding-bottom: 4px; border-bottom: 3px solid transparent;" title="Click to filter by Boolean type"><span style="display: inline-block; width: 15px; height: 15px; background: #f3e8ff; border: 1px solid #e0ccff; margin-right: 5px;"></span> Boolean (<span id="booleanCount">${window.metadataPathInfo.filter(p => p.valueType === 'boolean').length}</span>)</div>
          <button onclick="clearMetadataFilter()" style="padding: 4px 12px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; margin-left: 10px;">Clear</button>
        </div>
      </div>
      <div style="max-height: 600px; overflow-x: auto; overflow-y: auto;">
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
          <thead>
            <tr style="background: #f8f9fa; border-bottom: 2px solid #dee2e6;">
              <th class="metadata-sortable-header" data-column="path" style="padding: 8px; text-align: left; min-width: 200px; cursor: pointer; user-select: none;">Path<span class="sort-arrow"> ▲</span></th>
              <th class="metadata-sortable-header" data-column="status" style="padding: 8px; text-align: center; width: 150px; cursor: pointer; user-select: none;">Status<span class="sort-arrow"></span></th>
              <th class="metadata-sortable-header" data-column="valueType" style="padding: 8px; text-align: center; width: 70px; cursor: pointer; user-select: none;">Type<span class="sort-arrow"></span></th>
              <th class="metadata-sortable-header" data-column="supportsPut" style="padding: 8px; text-align: center; width: 60px; cursor: pointer; user-select: none;">PUT<span class="sort-arrow"></span></th>
              <th class="metadata-sortable-header" data-column="base" style="padding: 8px; text-align: left; width: 80px; cursor: pointer; user-select: none;">Base<span class="sort-arrow"></span></th>
              <th class="metadata-sortable-header" data-column="category" style="padding: 8px; text-align: left; width: 100px; cursor: pointer; user-select: none;">Category<span class="sort-arrow"></span></th>
              <th class="metadata-sortable-header" data-column="display" style="padding: 8px; text-align: left; width: 80px; cursor: pointer; user-select: none;">Display<span class="sort-arrow"></span></th>
            </tr>
          </thead>
          <tbody id="metadataTableBody"></tbody>
        </table>
      </div>
    `
  }

  // Update table body
  const tbody = document.getElementById('metadataTableBody')
  tbody.innerHTML = pathInfo
    .map(info => {
      const conversionUrl = `${API_BASE}/conversions/${info.path}`
      const details = getCurrentValueDetails(info.path)
      const currentValue = details?.value

      // For numbers: use GET link. For others: use POST form with target="_blank"
      let testLink = ''
      if (currentValue !== undefined && currentValue !== null) {
        if (info.valueType === 'number') {
          const convertUrl = `${API_BASE}/conversions/${info.path}?value=${encodeURIComponent(currentValue)}`
          testLink = `<a href="${convertUrl}" target="_blank" title="Run conversion test - convert current value (${currentValue}) and see result in new tab" style="color: #2ecc71; margin-left: 4px; text-decoration: none; font-size: 14px;">▶️</a>`
        } else {
          const formId = `convert-form-${info.path.replace(/\./g, '-')}`
          const serializedValue =
            typeof currentValue === 'object'
              ? JSON.stringify(currentValue)
              : typeof currentValue === 'string'
                ? currentValue
                : JSON.stringify(currentValue)

          testLink = `<form id="${formId}" method="POST" action="${API_BASE}/conversions" target="_blank" style="display: inline; margin: 0;">
        <input type="hidden" name="path" value="${info.path}">
        <input type="hidden" name="value" value="${serializedValue.replace(/"/g, '&quot;')}">
        <input type="hidden" name="type" value="${info.valueType}">
        <button type="submit" title="Run conversion test - convert current value and see result in new tab" style="color: #2ecc71; margin-left: 4px; background: none; border: none; cursor: pointer; font-size: 14px; padding: 0;">▶️</button>
      </form>`
        }
      }

      // Add pattern icon if not already a pattern or auto-assigned
      const hasPattern = info.status.startsWith('Pattern:')
      const hasAuto = info.status === 'SignalK Auto'
      const patternIcon =
        !hasPattern && !hasAuto
          ? `<button onclick="createPatternFromPath('${info.path.replace(/'/g, "\\'")}', '${info.category}')" title="Create pattern rule - define a wildcard pattern based on this path to match similar paths" style="color: #f39c12; margin-left: 4px; background: none; border: none; cursor: pointer; font-size: 14px; padding: 0;">📋</button>`
          : ''

      // Add override icon if not already an override
      const hasOverride = info.status === 'Path Override'
      const overrideIcon = !hasOverride
        ? `<button onclick="createOverrideFromPath('${info.path.replace(/'/g, "\\'")}')" title="Create path override - set specific units for this exact path (highest priority)" style="color: #27ae60; margin-left: 4px; background: none; border: none; cursor: pointer; font-size: 14px; padding: 0;">📌</button>`
        : ''

      const sourceLine = details?.source || info.signalkSource
      const timestampLine = details?.timestamp || info.signalkTimestamp
      const metadataLine =
        sourceLine || timestampLine
          ? `<div style="margin-top: 4px; font-size: 10px; color: #6c757d;">
        ${sourceLine ? `<span style="margin-right: 8px;">$source: ${sourceLine}</span>` : ''}
        ${timestampLine ? `<span>timestamp: ${new Date(timestampLine).toLocaleString()}</span>` : ''}
      </div>`
          : ''

      return `
      <tr style="border-bottom: 1px solid ${metadataLine ? '#dee2e6' : '#f1f3f5'}; background: ${info.color};">
        <td style="padding: 8px; font-family: monospace; font-size: 11px; word-break: break-all; text-align: left;">
          ${info.path}
          <a href="${conversionUrl}" target="_blank" title="View conversion details - shows base unit, target unit, formula, symbol, and metadata" style="color: #3498db; margin-left: 6px; text-decoration: none; font-size: 14px;">🔧</a>
          ${testLink}
          ${patternIcon}
          ${overrideIcon}
          ${metadataLine}
        </td>
        <td style="padding: 8px; text-align: center; font-size: 11px;">${info.status}</td>
        <td style="padding: 8px; text-align: center; font-size: 11px;">${info.valueType}</td>
        <td style="padding: 8px; text-align: center;">
          <span class="${info.supportsPut ? 'supports-put-true' : 'supports-put-false'}">${info.supportsPut ? '✓' : ''}</span>
        </td>
        <td style="padding: 8px;">${info.baseUnit}</td>
        <td style="padding: 8px;">${info.category}</td>
        <td style="padding: 8px; font-weight: bold;">${info.displayUnit}</td>
      </tr>
    `
    })
    .join('')
}

function filterAndSortMetadata() {
  const searchTerm = document.getElementById('metadataSearchFilter').value.toLowerCase()

  let filtered = window.metadataPathInfo.filter(info => {
    // Search across all columns
    if (searchTerm) {
      const searchableText = [
        info.path,
        info.status,
        info.valueType,
        info.supportsPut ? 'yes' : 'no',
        info.baseUnit,
        info.category,
        info.displayUnit
      ]
        .join(' ')
        .toLowerCase()

      if (!searchableText.includes(searchTerm)) {
        return false
      }
    }

    return true
  })

  // Sort
  filtered.sort((a, b) => {
    let aVal, bVal
    switch (window.metadataSortColumn) {
      case 'path':
        aVal = a.path
        bVal = b.path
        break
      case 'status':
        aVal = a.status
        bVal = b.status
        break
      case 'valueType':
        aVal = a.valueType
        bVal = b.valueType
        break
      case 'supportsPut': {
        // Boolean comparison: true > false
        aVal = a.supportsPut ? 1 : 0
        bVal = b.supportsPut ? 1 : 0
        const boolComparison = aVal - bVal
        return window.metadataSortDirection === 'asc' ? boolComparison : -boolComparison
      }
      case 'base':
        aVal = a.baseUnit
        bVal = b.baseUnit
        break
      case 'category':
        aVal = a.category
        bVal = b.category
        break
      case 'display':
        aVal = a.displayUnit
        bVal = b.displayUnit
        break
      default:
        return 0
    }

    const comparison = aVal.localeCompare(bVal)
    return window.metadataSortDirection === 'asc' ? comparison : -comparison
  })

  renderMetadataTable(filtered)

  // Get current search term to determine active filter
  const activeFilterTerm = document.getElementById('metadataSearchFilter')?.value || ''
  const isFiltered = filtered.length < window.metadataPathInfo.length

  // Calculate total counts (from all data)
  const totalCounts = {
    override: window.metadataPathInfo.filter(p => p.status === 'Path Override').length,
    pattern: window.metadataPathInfo.filter(p => p.status.startsWith('Pattern:')).length,
    auto: window.metadataPathInfo.filter(p => p.status === 'SignalK Auto').length,
    signalk: window.metadataPathInfo.filter(p => p.status === 'SignalK Only').length,
    none: window.metadataPathInfo.filter(p => p.status === 'None').length,
    boolean: window.metadataPathInfo.filter(p => p.valueType === 'boolean').length
  }

  // Calculate visible counts (from filtered data)
  const visibleCounts = {
    override: filtered.filter(p => p.status === 'Path Override').length,
    pattern: filtered.filter(p => p.status.startsWith('Pattern:')).length,
    auto: filtered.filter(p => p.status === 'SignalK Auto').length,
    signalk: filtered.filter(p => p.status === 'SignalK Only').length,
    none: filtered.filter(p => p.status === 'None').length,
    boolean: filtered.filter(p => p.valueType === 'boolean').length
  }

  // Update counts with "0 of X" format for unselected filters
  const formatCount = (visible, total, isActive) => {
    if (!isFiltered || isActive) {
      return visible.toString()
    }
    return visible === 0 ? `0 of ${total}` : visible.toString()
  }

  document.getElementById('overrideCount').textContent = formatCount(
    visibleCounts.override,
    totalCounts.override,
    activeFilterTerm === 'Path Override'
  )
  document.getElementById('patternCount').textContent = formatCount(
    visibleCounts.pattern,
    totalCounts.pattern,
    activeFilterTerm === 'Pattern'
  )
  document.getElementById('autoCount').textContent = formatCount(
    visibleCounts.auto,
    totalCounts.auto,
    activeFilterTerm === 'SignalK Auto'
  )
  document.getElementById('signalkCount').textContent = formatCount(
    visibleCounts.signalk,
    totalCounts.signalk,
    activeFilterTerm === 'SignalK Only'
  )
  document.getElementById('noneCount').textContent = formatCount(
    visibleCounts.none,
    totalCounts.none,
    activeFilterTerm === 'None'
  )
  document.getElementById('booleanCount').textContent = formatCount(
    visibleCounts.boolean,
    totalCounts.boolean,
    activeFilterTerm === 'boolean'
  )

  // Update result count
  const totalPaths = window.metadataPathInfo.length
  const resultCountEl = document.getElementById('metadataResultCount')
  if (filtered.length === totalPaths) {
    resultCountEl.textContent = `Showing ${totalPaths} paths`
  } else {
    resultCountEl.textContent = `Showing ${filtered.length} of ${totalPaths} paths`
  }

  // Update sort indicators
  document.querySelectorAll('.metadata-sortable-header').forEach(header => {
    const arrow = header.querySelector('.sort-arrow')
    if (header.dataset.column === window.metadataSortColumn) {
      arrow.textContent = window.metadataSortDirection === 'asc' ? ' ▲' : ' ▼'
    } else {
      arrow.textContent = ''
    }
  })
}

// ============================================================================
// METADATA EDITING
// ============================================================================

// Handle base unit change
function handleBaseUnitChange() {
  const select = document.getElementById('metadataBaseUnit')
  const customInput = document.getElementById('metadataBaseUnitCustom')
  const templateSelect = document.getElementById('conversionTemplate')

  if (select.value === 'custom') {
    customInput.style.display = 'block'
    templateSelect.innerHTML =
      '<option value="">-- Select Conversion --</option><option value="custom">✏️ Custom Conversion...</option>'
  } else {
    customInput.style.display = 'none'
    // Populate conversion templates based on base unit
    const templates = conversionTemplates[select.value] || []
    templateSelect.innerHTML =
      '<option value="">-- Select Conversion --</option>' +
      templates
        .map((t, i) => `<option value="${i}">${select.value} → ${t.unit} (${t.symbol})</option>`)
        .join('') +
      '<option value="custom">✏️ Custom Conversion...</option>'
  }
}

// Handle conversion template change
function handleConversionTemplateChange() {
  const select = document.getElementById('conversionTemplate')
  const customInputs = document.getElementById('customConversionInputs')
  const baseUnit = document.getElementById('metadataBaseUnit').value

  if (select.value === 'custom') {
    customInputs.style.display = 'grid'
    // Clear inputs
    document.getElementById('newConversionUnit').value = ''
    document.getElementById('newConversionFormula').value = ''
    document.getElementById('newConversionInverseFormula').value = ''
    document.getElementById('newConversionSymbol').value = ''
  } else if (select.value !== '') {
    customInputs.style.display = 'grid'
    // Populate from template
    const templates = conversionTemplates[baseUnit] || []
    const template = templates[parseInt(select.value)]
    if (template) {
      document.getElementById('newConversionUnit').value = template.unit
      document.getElementById('newConversionFormula').value = template.formula
      document.getElementById('newConversionInverseFormula').value = template.inverseFormula
      document.getElementById('newConversionSymbol').value = template.symbol
    }
  } else {
    customInputs.style.display = 'none'
  }
}

function selectMetadataPath(path) {
  document.getElementById('selectedMetadataPath').value = path
  document.getElementById('selectedMetadataDisplay').textContent = path

  // Load existing metadata if available
  if (metadata[path]) {
    const baseUnit = metadata[path].baseUnit || ''
    const baseUnitSelect = document.getElementById('metadataBaseUnit')

    // Check if base unit is in dropdown options
    const option = Array.from(baseUnitSelect.options).find(opt => opt.value === baseUnit)
    if (option) {
      baseUnitSelect.value = baseUnit
    } else {
      // Custom base unit
      baseUnitSelect.value = 'custom'
      document.getElementById('metadataBaseUnitCustom').style.display = 'block'
      document.getElementById('metadataBaseUnitCustom').value = baseUnit
    }

    document.getElementById('metadataCategory').value = metadata[path].category || ''
    currentMetadataConversions = { ...metadata[path].conversions } || {}

    handleBaseUnitChange()
  } else {
    document.getElementById('metadataBaseUnit').value = ''
    document.getElementById('metadataCategory').value = ''
    document.getElementById('metadataBaseUnitCustom').style.display = 'none'
    document.getElementById('metadataBaseUnitCustom').value = ''
    currentMetadataConversions = {}
  }

  renderConversionsList()
}

function renderConversionsList() {
  const container = document.getElementById('conversionsList')

  if (Object.keys(currentMetadataConversions).length === 0) {
    container.innerHTML = '<p style="color: #999; font-style: italic;">No conversions added yet</p>'
    return
  }

  container.innerHTML = Object.entries(currentMetadataConversions)
    .map(
      ([unit, conv]) => `
    <div style="display: flex; gap: 10px; align-items: center; padding: 8px; background: #f8f9fa; border-radius: 4px; margin-bottom: 5px;">
      <span style="flex: 1;"><strong>${unit}</strong>: ${conv.formula} (${conv.symbol})</span>
      <button onclick="removeConversion('${unit}')" style="background: #e74c3c; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer;">Remove</button>
    </div>
  `
    )
    .join('')
}

function addConversionToMetadata() {
  const unit = document.getElementById('newConversionUnit').value.trim()
  const formula = document.getElementById('newConversionFormula').value.trim()
  const inverseFormula = document.getElementById('newConversionInverseFormula').value.trim()
  const symbol = document.getElementById('newConversionSymbol').value.trim()

  if (!unit || !formula || !inverseFormula || !symbol) {
    showStatus('Please fill in all conversion fields', 'error')
    return
  }

  currentMetadataConversions[unit] = {
    formula,
    inverseFormula,
    symbol
  }

  // Clear inputs
  document.getElementById('newConversionUnit').value = ''
  document.getElementById('newConversionFormula').value = ''
  document.getElementById('newConversionInverseFormula').value = ''
  document.getElementById('newConversionSymbol').value = ''

  renderConversionsList()
}

function removeConversion(unit) {
  delete currentMetadataConversions[unit]
  renderConversionsList()
}

async function saveMetadata() {
  const path = document.getElementById('selectedMetadataPath').value
  const baseUnitSelect = document.getElementById('metadataBaseUnit').value
  const baseUnit =
    baseUnitSelect === 'custom'
      ? document.getElementById('metadataBaseUnitCustom').value.trim()
      : baseUnitSelect.trim()
  const category = document.getElementById('metadataCategory').value.trim()

  if (!path) {
    showStatus('Please select a path', 'error')
    return
  }

  if (!baseUnit || !category) {
    showStatus('Please enter base unit and category', 'error')
    return
  }

  try {
    const metadataObj = {
      baseUnit,
      category,
      conversions: currentMetadataConversions
    }

    await apiSaveMetadata(path, metadataObj)

    // Reload data
    await loadData()
    showStatus(`Saved metadata for ${path}`, 'success')
  } catch (error) {
    showStatus('Failed to save metadata: ' + error.message, 'error')
  }
}

function clearMetadataForm() {
  document.getElementById('selectedMetadataPath').value = ''
  document.getElementById('selectedMetadataDisplay').textContent = 'None'
  document.getElementById('metadataBaseUnit').value = ''
  document.getElementById('metadataCategory').value = ''
  document.getElementById('metadataBaseUnitCustom').style.display = 'none'
  document.getElementById('metadataBaseUnitCustom').value = ''
  document.getElementById('conversionTemplate').value = ''
  document.getElementById('customConversionInputs').style.display = 'none'
  currentMetadataConversions = {}
  renderConversionsList()

  // Clear tree selection
  document.querySelectorAll('#metadataPathTree .path-tree-item.selected').forEach(el => {
    el.classList.remove('selected')
  })
}

// ============================================================================
// METADATA FILTERING
// ============================================================================

// Filter metadata table by status
function filterMetadataByStatus(statusTerm, evt) {
  const searchInput = document.getElementById('metadataSearchFilter')
  if (searchInput) {
    searchInput.value = statusTerm
    searchInput.dispatchEvent(new Event('input'))
    searchInput.focus()

    // Update selected state on labels
    document.querySelectorAll('.metadata-filter-label').forEach(label => {
      label.style.borderBottomColor = 'transparent'
      label.style.fontWeight = 'normal'
    })
    if (evt && evt.currentTarget) {
      evt.currentTarget.style.borderBottomColor = '#667eea'
      evt.currentTarget.style.fontWeight = '600'
    }
  }
}

// Clear metadata filter
function clearMetadataFilter() {
  const searchInput = document.getElementById('metadataSearchFilter')
  if (searchInput) {
    searchInput.value = ''
    searchInput.dispatchEvent(new Event('input'))

    // Remove selected state from all labels
    document.querySelectorAll('.metadata-filter-label').forEach(label => {
      label.style.borderBottomColor = 'transparent'
      label.style.fontWeight = 'normal'
    })
  }
}
