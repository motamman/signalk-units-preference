/* global loadPaths */
/* eslint-disable no-unused-vars, @typescript-eslint/no-unused-vars */

const API_BASE = '/plugins/signalk-units-preference'

let preferences = null
let metadata = null
let availablePaths = []
let signalKValues = {}
let signalKValueDetails = {}

const BUILT_IN_PRESETS = ['metric', 'imperial-us', 'imperial-uk']
let lastAppliedPresetId = ''

// Unit schema data (loaded from server)
let unitSchema = {
  baseUnits: [],
  categories: [],
  targetUnitsByBase: {},
  categoryToBaseUnit: {},
  coreCategories: []
}

function sanitizeIdSegment(value) {
  return String(value)
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function buildConversionId(prefix, baseUnit, targetUnit) {
  return `${prefix}-${sanitizeIdSegment(baseUnit)}-${sanitizeIdSegment(targetUnit)}`
}

// Preset dirty state tracking
let originalPresetState = null

// Get current value for a path from SignalK
function getCurrentValue(pathStr) {
  return signalKValues[pathStr]
}

function getCurrentValueDetails(pathStr) {
  return signalKValueDetails[pathStr]
}

// Create base unit dropdown HTML
function createBaseUnitDropdown(id, selectedValue = '', includeCustom = true) {
  const options = unitSchema.baseUnits
    .map(
      opt =>
        `<option value="${opt.value}" ${opt.value === selectedValue ? 'selected' : ''}>${opt.label}</option>`
    )
    .join('')
  const customOption = includeCustom
    ? `<option value="custom" ${selectedValue === 'custom' ? 'selected' : ''}>✏️ Custom...</option>`
    : ''
  return `
    <select id="${id}">
      <option value="">-- Select Base Unit --</option>
      ${options}
      ${customOption}
    </select>
  `
}

// Create category dropdown HTML
function createCategoryDropdown(id, selectedValue = '', includeCustom = true) {
  const options = unitSchema.categories
    .map(cat => `<option value="${cat}" ${cat === selectedValue ? 'selected' : ''}>${cat}</option>`)
    .join('')
  const customOption = includeCustom
    ? `<option value="custom" ${selectedValue === 'custom' ? 'selected' : ''}>✏️ Custom...</option>`
    : ''
  return `
    <select id="${id}">
      <option value="">-- Select Category --</option>
      ${options}
      ${customOption}
    </select>
  `
}

// Create target unit dropdown HTML based on base unit
function createTargetUnitDropdown(id, baseUnit = '', selectedValue = '', includeCustom = true) {
  const units = unitSchema.targetUnitsByBase[baseUnit] || []
  const options = units
    .map(
      unit => `<option value="${unit}" ${unit === selectedValue ? 'selected' : ''}>${unit}</option>`
    )
    .join('')
  const customOption = includeCustom
    ? `<option value="custom" ${selectedValue === 'custom' ? 'selected' : ''}>✏️ Custom...</option>`
    : ''
  return `
    <select id="${id}">
      <option value="">-- Select Target Unit --</option>
      ${options}
      ${customOption}
    </select>
  `
}

// Load unit schema from server
async function loadSchema() {
  try {
    const res = await fetch(`${API_BASE}/schema`)
    if (!res.ok) throw new Error('Failed to load schema')
    unitSchema = await res.json()
  } catch (error) {
    showStatus('Failed to load unit schema: ' + error.message, 'error')
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  setupTabs()
  await loadSchema()
  await loadData()
  await loadPaths()
  await loadUnitDefinitions()
  initializePatternDropdowns()
  initializeCustomCategoryDropdowns()
  initializeUnitDefinitionsDropdowns()
  initializePathOverridesDropdowns()
  renderUnitDefinitions()
  renderPathOverrides()
})

// Initialize pattern form dropdowns
function initializePatternDropdowns() {
  // Render category dropdown (with custom option)
  document.getElementById('newPatternCategoryContainer').innerHTML = createCategoryDropdown(
    'newPatternCategory',
    '',
    true
  )

  // Initialize base unit dropdown (hidden by default)
  document.getElementById('newPatternBaseContainer').innerHTML = createBaseUnitDropdown(
    'newPatternBase',
    '',
    true
  )

  // Target unit starts disabled until category is selected
  document.getElementById('newPatternTargetContainer').innerHTML = `
    <select id="newPatternTarget" disabled>
      <option value="">Select category first</option>
    </select>
  `

  // Handle category change
  document.getElementById('newPatternCategory').addEventListener('change', function () {
    const targetContainer = document.getElementById('newPatternTargetContainer')
    const baseGroup = document.getElementById('newPatternBaseGroup')
    const categoryCustomInput = document.getElementById('newPatternCategoryCustom')
    const targetLabel = document.getElementById('targetUnitLabel')
    const targetHelp = document.getElementById('targetUnitHelp')

    if (this.value === 'custom') {
      // Custom category - show custom category input and base unit field
      categoryCustomInput.style.display = 'block'
      baseGroup.style.display = 'block'
      targetLabel.textContent = '(required for custom category)'
      targetHelp.textContent = 'Required when using custom category'

      // Enable target dropdown with custom option
      targetContainer.innerHTML = `
        <select id="newPatternTarget">
          <option value="">-- Select Target Unit --</option>
          <option value="custom">✏️ Custom...</option>
        </select>
      `
      attachTargetUnitHandler()
      attachBaseUnitHandler()
    } else if (this.value === '' || !this.value) {
      // No category selected
      categoryCustomInput.style.display = 'none'
      baseGroup.style.display = 'none'
      targetContainer.innerHTML = `
        <select id="newPatternTarget" disabled>
          <option value="">Select category first</option>
        </select>
      `
      targetLabel.textContent = '(optional)'
      targetHelp.textContent = 'Leave empty to use category default'
    } else {
      // Known category
      categoryCustomInput.style.display = 'none'
      baseGroup.style.display = 'none'
      targetLabel.textContent = '(optional)'
      targetHelp.textContent = 'Leave empty to use category default'

      // Get base unit for this category
      const baseUnit = unitSchema.categoryToBaseUnit[this.value]
      if (baseUnit) {
        // Populate target units based on category's base unit
        const dropdown = createTargetUnitDropdown('newPatternTarget', baseUnit, '', true)
        targetContainer.innerHTML = dropdown.replace(
          '<option value="">-- Select Target Unit --</option>',
          '<option value="">-- Use Category Default --</option>'
        )
        attachTargetUnitHandler()
      } else {
        // Category exists but has no base unit
        targetContainer.innerHTML = `
          <select id="newPatternTarget">
            <option value="">-- Use category default --</option>
            <option value="custom">✏️ Custom...</option>
          </select>
        `
        attachTargetUnitHandler()
      }
    }
  })

  // Attach handlers initially
  attachTargetUnitHandler()
  attachBaseUnitHandler()
}

// Helper to attach base unit custom input handler
function attachBaseUnitHandler() {
  const baseSelect = document.getElementById('newPatternBase')
  const targetContainer = document.getElementById('newPatternTargetContainer')

  if (baseSelect) {
    baseSelect.addEventListener('change', function () {
      const customInput = document.getElementById('newPatternBaseCustom')

      if (this.value === 'custom') {
        customInput.style.display = 'block'
        // When custom base unit, also enable custom target
        targetContainer.innerHTML = `
          <select id="newPatternTarget">
            <option value="">-- Select Target Unit --</option>
            <option value="custom">✏️ Custom...</option>
          </select>
        `
        attachTargetUnitHandler()
      } else if (this.value) {
        customInput.style.display = 'none'
        // Populate target units based on selected base unit
        targetContainer.innerHTML = createTargetUnitDropdown(
          'newPatternTarget',
          this.value,
          '',
          true
        )
        attachTargetUnitHandler()
      }
    })
  }
}

// Helper to attach target unit custom input handler
function attachTargetUnitHandler() {
  const targetSelect = document.getElementById('newPatternTarget')
  if (targetSelect) {
    targetSelect.addEventListener('change', function () {
      const customInput = document.getElementById('newPatternTargetCustom')
      if (this.value === 'custom') {
        customInput.style.display = 'block'
      } else {
        customInput.style.display = 'none'
      }
    })
  }
}

// Tab switching
function setupTabs() {
  const tabs = document.querySelectorAll('.tab')
  tabs.forEach(tab => {
    tab.addEventListener('click', async () => {
      const tabName = tab.dataset.tab

      // Update active tab
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
      tab.classList.add('active')

      // Show content
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'))
      document.getElementById(tabName).classList.add('active')

      // Re-render metadata when tab is clicked
      if (tabName === 'metadata') {
        await renderMetadata()
      }

      // Load custom presets when settings tab is clicked
      if (tabName === 'settings') {
        await loadCustomPresets()
      }
    })
  })
}

// Load all data
async function loadData() {
  try {
    // Load categories, overrides, patterns, metadata, and current preset separately
    const [categoriesRes, overridesRes, patternsRes, metaRes, presetRes] = await Promise.all([
      fetch(`${API_BASE}/categories`),
      fetch(`${API_BASE}/overrides`),
      fetch(`${API_BASE}/patterns`),
      fetch(`${API_BASE}/metadata`),
      fetch(`${API_BASE}/current-preset`)
    ])

    if (!categoriesRes.ok || !overridesRes.ok || !patternsRes.ok || !metaRes.ok || !presetRes.ok) {
      throw new Error('Failed to load data')
    }

    // Reconstruct preferences object
    preferences = {
      categories: await categoriesRes.json(),
      pathOverrides: await overridesRes.json(),
      pathPatterns: await patternsRes.json(),
      currentPreset: await presetRes.json()
    }
    metadata = await metaRes.json()

    const presetType = preferences.currentPreset?.type
    if (presetType && !BUILT_IN_PRESETS.includes(presetType.toLowerCase())) {
      lastAppliedPresetId = presetType
    } else {
      lastAppliedPresetId = ''
    }

    // Save original preset state BEFORE rendering (so dirty check works correctly)
    saveOriginalPresetState()

    renderCategories()
    renderPatterns()
    // renderMetadata() is now called on tab click to ensure paths are loaded
  } catch (error) {
    showStatus('Failed to load data: ' + error.message, 'error')
  }
}

// Save original preset state for dirty tracking
function saveOriginalPresetState() {
  if (preferences?.currentPreset && preferences?.categories) {
    originalPresetState = JSON.parse(JSON.stringify(preferences.categories))
  } else {
    originalPresetState = null
  }
}

// Check if current categories differ from original preset
function checkPresetDirty() {
  if (!originalPresetState || !preferences?.categories) {
    return false
  }

  const currentCategories = Object.keys(preferences.categories)
  const originalCategories = Object.keys(originalPresetState)

  // Check if any categories were added or removed
  if (currentCategories.length !== originalCategories.length) {
    return true
  }

  // Check if a category exists in current but not in original (added)
  for (const category of currentCategories) {
    if (!originalPresetState[category]) {
      return true
    }
  }

  // Check if a category exists in original but not in current (removed)
  for (const category of originalCategories) {
    if (!preferences.categories[category]) {
      return true
    }
  }

  // Compare current categories with original state
  for (const [category, current] of Object.entries(preferences.categories)) {
    const original = originalPresetState[category]
    if (!original) continue

    if (
      current.targetUnit !== original.targetUnit ||
      current.displayFormat !== original.displayFormat
    ) {
      return true
    }
  }

  return false
}

// Render category preferences
function renderCurrentPreset() {
  const container = document.getElementById('currentPreset')

  if (!preferences?.currentPreset) {
    // Show "Custom" when no preset has been applied
    container.innerHTML = `
      <div style="background: linear-gradient(135deg, #95a5a6 0%, #7f8c8d 100%); color: white; padding: 16px 20px; border-radius: 8px; box-shadow: 0 2px 8px rgba(149, 165, 166, 0.3);">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <div>
            <div style="font-size: 13px; opacity: 0.9; margin-bottom: 4px;">Current Unit System</div>
            <div style="font-size: 18px; font-weight: 600;">Custom Configuration</div>
          </div>
          <div style="text-align: right; font-size: 12px; opacity: 0.85;">
            <div>No preset applied</div>
          </div>
        </div>
      </div>
    `
    return
  }

  const preset = preferences.currentPreset
  const date = new Date(preset.appliedDate).toLocaleDateString()
  const isDirty = checkPresetDirty()

  let html = `
    <div style="background: linear-gradient(135deg, ${isDirty ? '#f39c12 0%, #e67e22' : '#667eea 0%, #764ba2'} 100%); color: white; padding: 16px 20px; border-radius: 8px; box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);">
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <div>
          <div style="font-size: 13px; opacity: 0.9; margin-bottom: 4px;">Current Unit System ${isDirty ? '(Modified)' : ''}</div>
          <div style="font-size: 18px; font-weight: 600;">${preset.name}</div>
        </div>
        <div style="text-align: right; font-size: 12px; opacity: 0.85;">
          <div>Version ${preset.version}</div>
          <div>Applied ${date}</div>
        </div>
      </div>
    </div>
  `

  // Show backup UI if preset is dirty
  if (isDirty) {
    html += `
      <div style="background: #fff3cd; padding: 16px 20px; border-radius: 8px; margin-top: 15px; border: 2px dashed #ffc107;">
        <div style="margin-bottom: 12px;">
          <h3 style="color: #856404; margin: 0 0 8px 0; font-size: 16px;">Save Modified Preset</h3>
          <p style="color: #856404; margin: 0; font-size: 13px;">You've modified the "${preset.name}" preset. Save your changes as a custom preset.</p>
        </div>
        <div style="display: flex; gap: 10px; align-items: flex-end;">
          <div style="flex: 1;">
            <label style="display: block; font-size: 13px; color: #856404; margin-bottom: 5px; font-weight: 500;">Preset Name</label>
            <input type="text" id="backupPresetName" placeholder="e.g., my-custom-preset" style="width: 100%; padding: 10px; border: 2px solid #ffc107; border-radius: 5px; font-size: 14px;">
            <small style="display: block; margin-top: 4px; color: #856404; font-size: 12px;">Only letters, numbers, dashes, and underscores allowed</small>
          </div>
          <button class="btn-success" onclick="saveCustomPreset()" style="padding: 10px 24px; white-space: nowrap;">
            Backup Preset
          </button>
        </div>
      </div>
    `
  }

  container.innerHTML = html

  const backupInput = document.getElementById('backupPresetName')
  if (backupInput) {
    backupInput.value = lastAppliedPresetId || ''
  }
}

function renderCategories() {
  renderCurrentPreset()
  const container = document.getElementById('categoryList')

  if (!unitSchema.categories || unitSchema.categories.length === 0) {
    container.innerHTML = '<div class="empty-state">Loading categories...</div>'
    return
  }

  // Show all categories from schema, use preferences if they exist
  container.innerHTML = unitSchema.categories
    .map(category => {
      const pref = preferences?.categories?.[category] || { targetUnit: '', displayFormat: '0.0' }
      const schemaBaseUnit = unitSchema.categoryToBaseUnit[category] || ''
      const prefBaseUnit = pref.baseUnit
      // A category is core if it's in the coreCategories list from the backend
      const isCustom = !unitSchema.coreCategories?.includes(category)
      const baseUnit = prefBaseUnit || schemaBaseUnit
      const targetUnit = pref.targetUnit || 'none'
      const displayFormat = pref.displayFormat || '0.0'
      const badge = isCustom
        ? '<span style="background: #667eea; color: white; padding: 2px 8px; border-radius: 3px; font-size: 11px; margin-left: 8px;">CUSTOM</span>'
        : '<span style="background: #6c757d; color: white; padding: 2px 8px; border-radius: 3px; font-size: 11px; margin-left: 8px;">CORE</span>'

      return `
        <div class="category-item" style="padding: 12px 16px; background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 6px; margin-bottom: 8px;">
          <div id="category-view-${category}" style="display: flex; align-items: center; justify-content: space-between; gap: 16px;">
            <div style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0;">
              <span style="font-weight: 500; flex-shrink: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${category}${badge}</span>
              <span style="color: #7f8c8d; font-size: 13px; white-space: nowrap;">→</span>
              <span style="color: #667eea; font-weight: 500; font-size: 13px; white-space: nowrap;">${baseUnit} → ${targetUnit}</span>
              <span style="color: #95a5a6; font-size: 13px; white-space: nowrap;">(${displayFormat})</span>
            </div>
            <div style="display: flex; gap: 8px;">
              <button class="btn-primary btn-edit" onclick="editCategory('${category}')">Edit</button>
              ${isCustom ? `<button class="btn-danger btn-delete" onclick="deleteCategory('${category}')">Delete</button>` : ''}
            </div>
          </div>
          <div id="category-edit-${category}" style="display: none;"></div>
        </div>
      `
    })
    .join('')
}

// Extract all SignalK metadata at once
async function getAllSignalKMetadata() {
  try {
    const res = await fetch('/signalk/v1/api/')
    if (!res.ok) return {}
    const data = await res.json()

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
        await fetch(`${API_BASE}/signalk-metadata`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(metadataMap)
        })
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

  // Build path info with metadata status
  const pathInfo = []

  for (const path of availablePaths) {
    const skMeta = signalKMetadata[path]
    const valueDetails = getCurrentValueDetails(path)
    const hasSignalKMetadata = skMeta && skMeta.units
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
      <div style="overflow-x: auto;">
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
      const conversionUrl = `${API_BASE}/conversion/${info.path}`
      const details = getCurrentValueDetails(info.path)
      const currentValue = details?.value

      // For numbers: use GET link. For others: use POST form with target="_blank"
      let testLink = ''
      if (currentValue !== undefined && currentValue !== null) {
        if (info.valueType === 'number') {
          const convertUrl = `${API_BASE}/convert/${info.path}/${currentValue}`
          testLink = `<a href="${convertUrl}" target="_blank" title="Run conversion test - convert current value (${currentValue}) and see result in new tab" style="color: #2ecc71; margin-left: 4px; text-decoration: none; font-size: 14px;">▶️</a>`
        } else {
          const formId = `convert-form-${info.path.replace(/\./g, '-')}`
          const serializedValue =
            typeof currentValue === 'object'
              ? JSON.stringify(currentValue)
              : typeof currentValue === 'string'
                ? currentValue
                : JSON.stringify(currentValue)

          testLink = `<form id="${formId}" method="POST" action="${API_BASE}/convert" target="_blank" style="display: inline; margin: 0;">
        <input type="hidden" name="path" value="${info.path}">
        <input type="hidden" name="value" value="${serializedValue.replace(/"/g, '&quot;')}">
        <input type="hidden" name="type" value="${info.valueType}">
        <button type="submit" title="Run conversion test - convert current value and see result in new tab" style="color: #2ecc71; margin-left: 4px; background: none; border: none; cursor: pointer; font-size: 14px; padding: 0;">▶️</button>
      </form>`
        }
      }

      const canUseGetLink =
        currentValue !== undefined && currentValue !== null && typeof currentValue !== 'object'

      const encodedCurrentValue = canUseGetLink ? encodeURIComponent(String(currentValue)) : null

      const getLink = canUseGetLink
        ? `<a href="${API_BASE}/convert/${info.path}/${encodedCurrentValue}" target="_blank" title="Open conversion in new tab - test GET endpoint with current value (${currentValue})" style="color: #e67e22; margin-left: 4px; text-decoration: none; font-size: 14px;">🔗</a>`
        : ''

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
          ${getLink}
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

// Update category preference
async function updateCategory(category, field, value) {
  try {
    const currentPref = preferences.categories?.[category] || {
      targetUnit: '',
      displayFormat: '0.0'
    }
    const updatedPref = { ...currentPref, [field]: value }

    const res = await fetch(`${API_BASE}/categories/${category}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedPref)
    })

    if (!res.ok) throw new Error('Failed to update')

    if (!preferences.categories) {
      preferences.categories = {}
    }
    preferences.categories[category] = updatedPref

    // Check if preset is now dirty and update UI
    checkPresetDirty()
    renderCurrentPreset()

    showStatus(`Updated ${category} preference`, 'success')
  } catch (error) {
    showStatus('Failed to update: ' + error.message, 'error')
  }
}

// Add custom category
async function addCustomCategory() {
  const categoryName = document.getElementById('newCategoryName').value.trim()
  const baseSelect = document.getElementById('newCategoryBase')
  const targetSelect = document.getElementById('newCategoryTarget')
  const displayFormat = document.getElementById('newCategoryFormat').value.trim()

  // Get base unit (from dropdown or custom input)
  const baseUnit =
    baseSelect.value === 'custom'
      ? document.getElementById('newCategoryBaseCustom').value.trim()
      : baseSelect.value.trim()

  // Get target unit (from dropdown or custom input)
  const targetUnit =
    targetSelect.value === 'custom'
      ? document.getElementById('newCategoryTargetCustom').value.trim()
      : targetSelect.value.trim()

  // Validation
  if (!categoryName || !baseUnit || !targetUnit || !displayFormat) {
    showStatus('Please fill in all fields', 'error')
    return
  }

  try {
    const categoryPref = {
      baseUnit,
      targetUnit,
      displayFormat
    }

    const res = await fetch(`${API_BASE}/categories/${categoryName}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(categoryPref)
    })

    if (!res.ok) throw new Error('Failed to create category')

    showStatus(`Created custom category: ${categoryName}`, 'success')

    // Update local preferences (don't reload data to preserve dirty state)
    if (!preferences.categories) {
      preferences.categories = {}
    }
    preferences.categories[categoryName] = categoryPref

    // Clear form
    document.getElementById('newCategoryName').value = ''
    document.getElementById('newCategoryFormat').value = '0.0'

    // Reload schema to pick up new category
    await loadSchema()

    // Re-render UI with updated state (without resetting dirty tracking)
    renderCategories()
    renderCurrentPreset()

    // Reinitialize dropdowns to include new category
    initializePatternDropdowns()
    initializeCustomCategoryDropdowns()
  } catch (error) {
    showStatus('Failed to create category: ' + error.message, 'error')
  }
}

// Delete custom category
async function deleteCategory(category) {
  if (!confirm(`Are you sure you want to delete the custom category "${category}"?`)) {
    return
  }

  try {
    const res = await fetch(`${API_BASE}/categories/${category}`, {
      method: 'DELETE'
    })

    if (!res.ok) throw new Error('Failed to delete')

    showStatus(`Deleted category: ${category}`, 'success')

    // Remove from local preferences (don't reload data to preserve dirty state)
    if (preferences.categories && preferences.categories[category]) {
      delete preferences.categories[category]
    }

    // Reload schema to remove deleted category
    await loadSchema()

    // Re-render UI with updated state (without resetting dirty tracking)
    renderCategories()
    renderCurrentPreset()

    // Reinitialize dropdowns to remove deleted category
    initializePatternDropdowns()
    initializeCustomCategoryDropdowns()
  } catch (error) {
    showStatus('Failed to delete category: ' + error.message, 'error')
  }
}

// Save current categories as a custom preset
async function saveCustomPreset() {
  const nameInput = document.getElementById('backupPresetName')
  const presetName = nameInput?.value.trim()

  // Validation
  if (!presetName) {
    showStatus('Please enter a preset name', 'error')
    return
  }

  // Validate name format (alphanumeric, dashes, underscores only)
  if (!/^[a-zA-Z0-9_-]+$/.test(presetName)) {
    showStatus('Preset name can only contain letters, numbers, dashes, and underscores', 'error')
    return
  }

  // Prevent overwriting built-in presets
  if (BUILT_IN_PRESETS.includes(presetName.toLowerCase())) {
    showStatus('Cannot overwrite built-in presets. Please choose a different name.', 'error')
    return
  }

  try {
    // Create preset data
    const presetData = {
      name: presetName,
      categories: preferences.categories
    }

    const res = await fetch(`${API_BASE}/presets/custom/${presetName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(presetData)
    })

    if (!res.ok) {
      const error = await res.json()
      throw new Error(error.error || 'Failed to save preset')
    }

    const result = await res.json()

    if (result?.version) {
      showStatus(
        `Custom preset "${presetName}" saved successfully (version ${result.version}).`,
        'success'
      )
    } else {
      showStatus(`Custom preset "${presetName}" saved successfully!`, 'success')
    }

    lastAppliedPresetId = presetName

    // Reload data so dirty state resets and current preset reflects saved version if applicable
    await loadData()

    // Restore input with preset name
    const backupInput = document.getElementById('backupPresetName')
    if (backupInput) {
      backupInput.value = presetName
    }

    // Reload custom presets in settings tab to refresh metadata/version
    await loadCustomPresets()
  } catch (error) {
    showStatus('Failed to save preset: ' + error.message, 'error')
  }
}

// Load custom presets
async function loadCustomPresets() {
  try {
    const res = await fetch(`${API_BASE}/presets/custom`)
    if (!res.ok) throw new Error('Failed to load custom presets')

    const customPresets = await res.json()
    renderCustomPresets(customPresets)
  } catch (error) {
    showStatus('Failed to load custom presets: ' + error.message, 'error')
  }
}

// Apply a custom preset
async function applyCustomPreset(presetId, presetName) {
  if (!confirm(`Apply custom preset "${presetName}" to all category preferences?`)) {
    return
  }

  try {
    const res = await fetch(`${API_BASE}/presets/custom/${presetId}/apply`, {
      method: 'POST'
    })

    if (!res.ok) throw new Error('Failed to apply custom preset')

    const result = await res.json()
    showStatus(
      `Applied custom preset "${presetName}" to ${result.categoriesUpdated} categories`,
      'success'
    )

    // Reload data to show updated preferences and reset dirty state
    await loadData()
    saveOriginalPresetState() // Reset the original state after applying preset

    lastAppliedPresetId = presetId
    const backupInput = document.getElementById('backupPresetName')
    if (backupInput) {
      backupInput.value = presetId
    }
  } catch (error) {
    showStatus('Failed to apply custom preset: ' + error.message, 'error')
  }
}

// Delete a custom preset
async function deleteCustomPreset(presetId, presetName) {
  if (!confirm(`Are you sure you want to delete the custom preset "${presetName}"?`)) {
    return
  }

  try {
    const res = await fetch(`${API_BASE}/presets/custom/${presetId}`, {
      method: 'DELETE'
    })

    if (!res.ok) throw new Error('Failed to delete custom preset')

    showStatus(`Deleted custom preset "${presetName}"`, 'success')

    // Reload custom presets list
    await loadCustomPresets()
  } catch (error) {
    showStatus('Failed to delete custom preset: ' + error.message, 'error')
  }
}

// Render custom presets in Settings tab
function renderCustomPresets(customPresets) {
  const container = document.getElementById('customPresetsList')

  if (!container) return

  if (customPresets.length === 0) {
    container.innerHTML =
      '<div class="empty-state">No custom presets yet. Modify a preset and save it from the Categories tab.</div>'
    return
  }

  container.innerHTML = customPresets
    .map(
      preset => `
    <div style="background: #f8f9fa; padding: 16px; border-radius: 6px; border: 1px solid #e9ecef;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
        <div>
          <h3 style="margin: 0 0 4px 0; font-size: 16px; color: #2c3e50;">${preset.name}</h3>
          <p style="margin: 0; font-size: 13px; color: #7f8c8d;">${preset.description || 'Custom preset'}</p>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 12px; color: #7f8c8d;">Version ${preset.version}</div>
          <div style="font-size: 12px; color: #7f8c8d;">${preset.categoriesCount} categories</div>
        </div>
      </div>
      <div style="display: flex; gap: 8px;">
        <button class="btn-primary" onclick="applyCustomPreset('${preset.id}', '${preset.name}')" style="flex: 1; padding: 8px 16px;">
          Apply Preset
        </button>
        <button class="btn-danger" onclick="deleteCustomPreset('${preset.id}', '${preset.name}')" style="padding: 8px 16px;">
          Delete
        </button>
      </div>
    </div>
  `
    )
    .join('')
}

// Apply unit system preset
async function applyUnitPreset(presetType) {
  const presetNames = {
    metric: 'Metric',
    'imperial-us': 'Imperial (US)',
    'imperial-uk': 'Imperial (UK)'
  }

  if (!confirm(`Apply ${presetNames[presetType]} preset to all category preferences?`)) {
    return
  }

  try {
    const res = await fetch(`${API_BASE}/presets/${presetType}`, {
      method: 'POST'
    })

    if (!res.ok) throw new Error('Failed to apply preset')

    const result = await res.json()
    showStatus(
      `Applied ${presetNames[presetType]} preset to ${result.categoriesUpdated} categories`,
      'success'
    )

    // Reload data to show updated preferences and reset dirty state
    await loadData()
    saveOriginalPresetState() // Reset the original state after applying preset

    lastAppliedPresetId = ''
    const backupInput = document.getElementById('backupPresetName')
    if (backupInput) {
      backupInput.value = ''
    }
  } catch (error) {
    showStatus('Failed to apply preset: ' + error.message, 'error')
  }
}

// Edit custom category
function editCategory(category) {
  const pref = preferences?.categories?.[category] || {}
  const schemaBaseUnit = unitSchema.categoryToBaseUnit[category] || ''
  const prefBaseUnit = pref.baseUnit
  // A category is core if it's in the coreCategories list from the backend
  const isCustom = !unitSchema.coreCategories?.includes(category)
  const baseUnit = prefBaseUnit || schemaBaseUnit
  const targetUnit = pref.targetUnit || ''
  const displayFormat = pref.displayFormat || '0.0'

  const viewDiv = document.getElementById(`category-view-${category}`)
  const editDiv = document.getElementById(`category-edit-${category}`)

  // Create unique IDs for this edit form
  const baseSelectId = `edit-base-${category}`
  const targetSelectId = `edit-target-${category}`
  const formatInputId = `edit-format-${category}`

  // Build edit form
  editDiv.innerHTML = `
    <div style="background: #fff3cd; padding: 15px; border-radius: 4px; border: 1px dashed #ffc107;">
      <h4 style="margin: 0 0 15px 0; color: #856404; font-size: 14px;">Edit Category: ${category}</h4>
      <div class="form-group" style="margin-bottom: 15px;">
        <div class="input-group">
          <label>Base Unit ${isCustom ? '' : '(read-only for core categories)'}</label>
          <div id="${baseSelectId}-container"></div>
        </div>
        <div class="input-group">
          <label>Target Unit</label>
          <div id="${targetSelectId}-container"></div>
        </div>
        <div class="input-group">
          <label>Display Format</label>
          <input type="text" id="${formatInputId}" value="${displayFormat}" placeholder="e.g., 0.0">
        </div>
      </div>
      <div style="display: flex; gap: 10px;">
        <button class="btn-success" onclick="saveEditCategory('${category}')" style="padding: 8px 16px;">Save Changes</button>
        <button class="btn-secondary" onclick="cancelEditCategory('${category}')" style="padding: 8px 16px;">Cancel</button>
      </div>
    </div>
  `

  // Populate dropdowns
  if (isCustom) {
    document.getElementById(`${baseSelectId}-container`).innerHTML = createBaseUnitDropdown(
      baseSelectId,
      baseUnit,
      false
    )
  } else {
    // For core categories, show base unit as disabled/readonly
    document.getElementById(`${baseSelectId}-container`).innerHTML = `
      <select id="${baseSelectId}" disabled>
        <option value="${baseUnit}" selected>${baseUnit}</option>
      </select>
    `
  }
  document.getElementById(`${targetSelectId}-container`).innerHTML = createTargetUnitDropdown(
    targetSelectId,
    baseUnit,
    targetUnit,
    false
  )

  // Handle base unit change to update target units
  document.getElementById(baseSelectId).addEventListener('change', e => {
    const newBaseUnit = e.target.value
    document.getElementById(`${targetSelectId}-container`).innerHTML = createTargetUnitDropdown(
      targetSelectId,
      newBaseUnit,
      '',
      false
    )
  })

  // Show edit form, hide view
  viewDiv.style.display = 'none'
  editDiv.style.display = 'block'
}

// Save edited category
async function saveEditCategory(category) {
  const baseSelectId = `edit-base-${category}`
  const targetSelectId = `edit-target-${category}`
  const formatInputId = `edit-format-${category}`

  const baseUnit = document.getElementById(baseSelectId).value
  const targetUnit = document.getElementById(targetSelectId).value
  const displayFormat = document.getElementById(formatInputId).value

  const schemaBaseUnit = unitSchema.categoryToBaseUnit[category] || ''
  const newIsCustom = baseUnit && baseUnit !== '' && baseUnit !== schemaBaseUnit

  if (!targetUnit || !displayFormat) {
    showStatus('Please fill in all fields', 'error')
    return
  }

  try {
    const categoryPref = {
      targetUnit,
      displayFormat
    }

    if (newIsCustom) {
      categoryPref.baseUnit = baseUnit
    }

    const res = await fetch(`${API_BASE}/categories/${category}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(categoryPref)
    })

    if (!res.ok) throw new Error('Failed to update category')

    // Update local preferences
    if (!preferences.categories) {
      preferences.categories = {}
    }
    preferences.categories[category] = categoryPref

    showStatus(`Updated category: ${category}`, 'success')

    // Check if preset is now dirty and re-render
    checkPresetDirty()
    renderCurrentPreset()
    renderCategories()

    if (newIsCustom) {
      await loadSchema()
      initializePatternDropdowns()
      initializeCustomCategoryDropdowns()
    }
  } catch (error) {
    showStatus('Failed to update category: ' + error.message, 'error')
  }
}

// Cancel editing category
function cancelEditCategory(category) {
  const viewDiv = document.getElementById(`category-view-${category}`)
  const editDiv = document.getElementById(`category-edit-${category}`)

  // Show view, hide edit form
  viewDiv.style.display = 'flex'
  editDiv.style.display = 'none'
}

// Initialize custom category form dropdowns
function initializeCustomCategoryDropdowns() {
  // Render base unit dropdown
  document.getElementById('newCategoryBaseContainer').innerHTML = createBaseUnitDropdown(
    'newCategoryBase',
    '',
    true
  )

  // Initialize target unit dropdown (disabled until base is selected)
  document.getElementById('newCategoryTargetContainer').innerHTML = `
    <select id="newCategoryTarget" disabled>
      <option value="">-- Select Base Unit First --</option>
    </select>
  `

  // Handle base unit change
  document.getElementById('newCategoryBase').addEventListener('change', function () {
    const customInput = document.getElementById('newCategoryBaseCustom')
    const targetContainer = document.getElementById('newCategoryTargetContainer')

    if (this.value === 'custom') {
      customInput.style.display = 'block'
      // For custom base unit, also enable custom target
      targetContainer.innerHTML = `
        <select id="newCategoryTarget">
          <option value="">-- Select Target Unit --</option>
          <option value="custom">✏️ Custom...</option>
        </select>
      `
      attachNewCategoryTargetHandler()
    } else if (this.value) {
      customInput.style.display = 'none'
      // Populate target units based on selected base unit
      targetContainer.innerHTML = createTargetUnitDropdown(
        'newCategoryTarget',
        this.value,
        '',
        true
      )
      attachNewCategoryTargetHandler()
    } else {
      customInput.style.display = 'none'
      targetContainer.innerHTML = `
        <select id="newCategoryTarget" disabled>
          <option value="">-- Select Base Unit First --</option>
        </select>
      `
    }
  })
}

// Attach handler for new category target unit dropdown
function attachNewCategoryTargetHandler() {
  const targetSelect = document.getElementById('newCategoryTarget')
  if (targetSelect) {
    targetSelect.addEventListener('change', function () {
      const customInput = document.getElementById('newCategoryTargetCustom')
      customInput.style.display = this.value === 'custom' ? 'block' : 'none'
    })
  }
}

// Render path patterns
function renderPatterns() {
  const container = document.getElementById('patternList')

  if (!preferences || !preferences.pathPatterns || preferences.pathPatterns.length === 0) {
    container.innerHTML = '<div class="empty-state">No path patterns configured</div>'
    return
  }

  // Sort by priority while keeping the original array index for editing/deleting
  const sorted = preferences.pathPatterns
    .map((pattern, originalIndex) => ({ pattern, originalIndex }))
    .sort((a, b) => (b.pattern.priority || 0) - (a.pattern.priority || 0))

  container.innerHTML = sorted
    .map(({ pattern, originalIndex }) => {
      // Derive base unit: use pattern's baseUnit if present, otherwise from category
      const baseUnit =
        pattern.baseUnit ||
        unitSchema.categoryToBaseUnit[pattern.category] ||
        '(derived from category)'

      // Get category defaults for display
      const categoryDefault = preferences.categories?.[pattern.category]
      const targetUnit = pattern.targetUnit || categoryDefault?.targetUnit || '(category default)'
      const displayFormat =
        pattern.displayFormat || categoryDefault?.displayFormat || '(category default)'

      return `
    <div class="pattern-item" style="padding: 12px 16px; background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 6px; margin-bottom: 8px;">
      <div id="pattern-view-${originalIndex}" style="display: flex; align-items: center; justify-content: space-between; gap: 16px;">
        <div style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0;">
          <span style="font-weight: 500; flex-shrink: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${pattern.pattern}</span>
          <span style="color: #7f8c8d; font-size: 13px; white-space: nowrap;">→</span>
          <span style="color: #667eea; font-weight: 500; font-size: 13px; white-space: nowrap;">${baseUnit} → ${targetUnit}</span>
          <span style="color: #95a5a6; font-size: 13px; white-space: nowrap;">(${displayFormat})</span>
          <span style="color: #7f8c8d; font-size: 12px; white-space: nowrap;">Priority: ${pattern.priority || 0}</span>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="btn-primary btn-edit" onclick="editPattern(${originalIndex})">Edit</button>
          <button class="btn-danger btn-delete" onclick="deletePattern(${originalIndex})">Delete</button>
        </div>
      </div>
      <div id="pattern-edit-${originalIndex}" style="display: none;"></div>
    </div>
  `
    })
    .join('')
}

// Add new pattern
async function addPattern() {
  const pattern = document.getElementById('newPatternPattern').value.trim()

  // Get category (from dropdown or custom input)
  const categorySelect = document.getElementById('newPatternCategory')
  const category =
    categorySelect.value === 'custom'
      ? document.getElementById('newPatternCategoryCustom').value.trim()
      : categorySelect.value.trim()

  // Get base unit (optional for known categories, required for custom)
  const baseSelect = document.getElementById('newPatternBase')
  let baseUnit = ''
  if (categorySelect.value === 'custom') {
    baseUnit =
      baseSelect.value === 'custom'
        ? document.getElementById('newPatternBaseCustom').value.trim()
        : baseSelect.value.trim()
  }

  // Get target unit (optional for known categories, required for custom)
  const targetSelect = document.getElementById('newPatternTarget')
  const targetUnit =
    targetSelect.value === 'custom'
      ? document.getElementById('newPatternTargetCustom').value.trim()
      : targetSelect.value.trim()

  // Get display format (optional)
  const displayFormat = document.getElementById('newPatternFormat').value.trim()

  const priority = parseInt(document.getElementById('newPatternPriority').value) || 100

  // Validation
  if (!pattern || !category) {
    showStatus('Please fill in pattern and category', 'error')
    return
  }

  if (categorySelect.value === 'custom' && (!baseUnit || !targetUnit)) {
    showStatus('Base unit and target unit are required for custom categories', 'error')
    return
  }

  try {
    // Build request body - only include optional fields if they have values
    const body = { pattern, category, priority }
    if (baseUnit) body.baseUnit = baseUnit
    if (targetUnit) body.targetUnit = targetUnit
    if (displayFormat) body.displayFormat = displayFormat

    const res = await fetch(`${API_BASE}/patterns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })

    if (!res.ok) throw new Error('Failed to add pattern')

    // Clear inputs
    document.getElementById('newPatternPattern').value = ''
    document.getElementById('newPatternCategory').value = ''
    document.getElementById('newPatternCategoryCustom').value = ''
    document.getElementById('newPatternCategoryCustom').style.display = 'none'
    document.getElementById('newPatternBase').value = ''
    document.getElementById('newPatternBaseCustom').value = ''
    document.getElementById('newPatternBaseCustom').style.display = 'none'
    document.getElementById('newPatternBaseGroup').style.display = 'none'
    document.getElementById('newPatternTarget').value = ''
    document.getElementById('newPatternTargetCustom').value = ''
    document.getElementById('newPatternTargetCustom').style.display = 'none'
    document.getElementById('newPatternFormat').value = ''
    document.getElementById('newPatternPriority').value = '100'

    // Reset target dropdown to disabled
    document.getElementById('newPatternTargetContainer').innerHTML = `
      <select id="newPatternTarget" disabled>
        <option value="">Select category first</option>
      </select>
    `

    // Reload data
    await loadData()
    showStatus(`Added pattern ${pattern}`, 'success')
  } catch (error) {
    showStatus('Failed to add pattern: ' + error.message, 'error')
  }
}

// Delete pattern
// Edit pattern
function editPattern(index) {
  const pattern = preferences.pathPatterns[index]
  const viewDiv = document.getElementById(`pattern-view-${index}`)
  const editDiv = document.getElementById(`pattern-edit-${index}`)

  // Determine base unit to use for target units
  const baseUnitForTargets =
    pattern.baseUnit || unitSchema.categoryToBaseUnit[pattern.category] || ''

  // Build edit form
  editDiv.innerHTML = `
    <div style="background: #fff3cd; padding: 15px; border-radius: 4px; border: 1px dashed #ffc107;">
      <h4 style="margin: 0 0 15px 0; color: #856404; font-size: 14px;">Edit Pattern</h4>
      <div class="form-group" style="margin-bottom: 15px;">
        <div class="input-group">
          <label>Pattern</label>
          <input type="text" id="edit-pattern-pattern-${index}" value="${pattern.pattern}" placeholder="e.g., **.temperature">
        </div>
        <div class="input-group">
          <label>Category</label>
          <input type="text" id="edit-pattern-category-${index}" value="${pattern.category}" placeholder="Category name">
        </div>
        <div class="input-group">
          <label>Base Unit (optional)</label>
          <div id="edit-pattern-base-container-${index}"></div>
        </div>
        <div class="input-group">
          <label>Target Unit (optional)</label>
          <div id="edit-pattern-target-container-${index}"></div>
        </div>
        <div class="input-group">
          <label>Display Format (optional)</label>
          <input type="text" id="edit-pattern-format-${index}" value="${pattern.displayFormat || ''}" placeholder="e.g., 0.0">
        </div>
        <div class="input-group">
          <label>Priority</label>
          <input type="number" id="edit-pattern-priority-${index}" value="${pattern.priority || 100}" placeholder="100">
        </div>
      </div>
      <div style="display: flex; gap: 10px;">
        <button class="btn-success" onclick="saveEditPattern(${index})" style="padding: 8px 16px;">Save Changes</button>
        <button class="btn-secondary" onclick="cancelEditPattern(${index})" style="padding: 8px 16px;">Cancel</button>
      </div>
    </div>
  `

  // Populate base unit dropdown
  const baseOptions = unitSchema.baseUnits
    .map(
      opt =>
        `<option value="${opt.value}" ${opt.value === pattern.baseUnit ? 'selected' : ''}>${opt.label}</option>`
    )
    .join('')
  document.getElementById(`edit-pattern-base-container-${index}`).innerHTML = `
    <select id="edit-pattern-base-${index}">
      <option value="">-- Use Category Default --</option>
      ${baseOptions}
    </select>
  `

  // Populate target unit dropdown
  const targetUnits = unitSchema.targetUnitsByBase[baseUnitForTargets] || []
  const targetOptions = targetUnits
    .map(
      unit =>
        `<option value="${unit}" ${unit === pattern.targetUnit ? 'selected' : ''}>${unit}</option>`
    )
    .join('')
  document.getElementById(`edit-pattern-target-container-${index}`).innerHTML = `
    <select id="edit-pattern-target-${index}">
      <option value="">-- Use Category Default --</option>
      ${targetOptions}
    </select>
  `

  // Handle base unit change to update target units
  document.getElementById(`edit-pattern-base-${index}`).addEventListener('change', e => {
    const selectedBase = e.target.value
    const baseForTargets = selectedBase || unitSchema.categoryToBaseUnit[pattern.category] || ''
    const units = unitSchema.targetUnitsByBase[baseForTargets] || []
    const options = units.map(unit => `<option value="${unit}">${unit}</option>`).join('')
    document.getElementById(`edit-pattern-target-container-${index}`).innerHTML = `
      <select id="edit-pattern-target-${index}">
        <option value="">-- Use Category Default --</option>
        ${options}
      </select>
    `
  })

  // Show edit form, hide view
  viewDiv.style.display = 'none'
  editDiv.style.display = 'block'
}

// Save edited pattern
async function saveEditPattern(index) {
  const patternStr = document.getElementById(`edit-pattern-pattern-${index}`).value.trim()
  const category = document.getElementById(`edit-pattern-category-${index}`).value.trim()
  const baseUnit = document.getElementById(`edit-pattern-base-${index}`).value
  const targetUnit = document.getElementById(`edit-pattern-target-${index}`).value
  const displayFormat = document.getElementById(`edit-pattern-format-${index}`).value.trim()
  const priority = parseInt(document.getElementById(`edit-pattern-priority-${index}`).value) || 100

  if (!patternStr || !category) {
    showStatus('Pattern and Category are required', 'error')
    return
  }

  try {
    const updatedPattern = {
      pattern: patternStr,
      category,
      baseUnit: baseUnit || undefined,
      targetUnit: targetUnit || undefined,
      displayFormat: displayFormat || undefined,
      priority
    }

    const res = await fetch(`${API_BASE}/patterns/${index}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedPattern)
    })

    if (!res.ok) throw new Error('Failed to update pattern')

    showStatus(`Updated pattern: ${patternStr}`, 'success')

    // Reload data and re-render
    await loadData()
    renderPatterns()
  } catch (error) {
    showStatus('Failed to update pattern: ' + error.message, 'error')
  }
}

// Cancel editing pattern
function cancelEditPattern(index) {
  const viewDiv = document.getElementById(`pattern-view-${index}`)
  const editDiv = document.getElementById(`pattern-edit-${index}`)

  viewDiv.style.display = 'flex'
  editDiv.style.display = 'none'
}

async function deletePattern(index) {
  const pattern = preferences.pathPatterns[index]
  if (!confirm(`Delete pattern ${pattern.pattern}?`)) return

  try {
    const res = await fetch(`${API_BASE}/patterns/${index}`, {
      method: 'DELETE'
    })

    if (!res.ok) throw new Error('Failed to delete')

    await loadData()
    showStatus(`Deleted pattern ${pattern.pattern}`, 'success')
  } catch (error) {
    showStatus('Failed to delete: ' + error.message, 'error')
  }
}

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

    const res = await fetch(`${API_BASE}/metadata/${encodeURIComponent(path)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metadataObj)
    })

    if (!res.ok) throw new Error('Failed to save metadata')

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

// Show status message
function showStatus(message, type) {
  const statusEl = document.getElementById('statusMessage')
  statusEl.textContent = message
  statusEl.className = `status-message ${type} show`

  setTimeout(() => {
    statusEl.classList.remove('show')
  }, 5000)
}

// ============================================================================
// UNIT DEFINITIONS TAB
// ============================================================================

// Unit definitions storage (loaded from backend)
let unitDefinitions = {}

// Add a new base unit
async function addBaseUnit() {
  const symbol = document.getElementById('newBaseUnitSymbol').value.trim()
  const description = document.getElementById('newBaseUnitDesc').value.trim()

  if (!symbol) {
    showStatus('Please enter a base unit symbol', 'error')
    return
  }

  try {
    const res = await fetch(`${API_BASE}/unit-definitions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseUnit: symbol,
        category: description || symbol,
        conversions: {}
      })
    })

    if (!res.ok) throw new Error('Failed to add base unit')

    showStatus(`Added base unit: ${symbol}`, 'success')

    // Clear form
    document.getElementById('newBaseUnitSymbol').value = ''
    document.getElementById('newBaseUnitDesc').value = ''

    // Reload schema and unit definitions
    await loadSchema()
    await loadUnitDefinitions()
    renderUnitDefinitions()

    // Reinitialize all dropdowns to include new base unit
    initializePatternDropdowns()
    initializeCustomCategoryDropdowns()
    initializeUnitDefinitionsDropdowns()
    initializePathOverridesDropdowns()
  } catch (error) {
    showStatus('Failed to add base unit: ' + error.message, 'error')
  }
}

// Add a conversion formula to an existing base unit
async function addConversion() {
  const baseSelect = document.getElementById('conversionBaseUnit')
  const baseUnit = baseSelect.value.trim()
  const targetUnit = document.getElementById('conversionTargetUnit').value.trim()
  const formula = document.getElementById('conversionFormula').value.trim()
  const inverseFormula = document.getElementById('conversionInverseFormula').value.trim()
  const symbol = document.getElementById('conversionSymbol').value.trim()

  if (!baseUnit || !targetUnit || !formula || !inverseFormula || !symbol) {
    showStatus('Please fill in all conversion fields', 'error')
    return
  }

  try {
    const res = await fetch(
      `${API_BASE}/unit-definitions/${encodeURIComponent(baseUnit)}/conversions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUnit,
          formula,
          inverseFormula,
          symbol
        })
      }
    )

    if (!res.ok) {
      const errorData = await res.json()
      throw new Error(errorData.error || 'Failed to add conversion')
    }

    showStatus(`Added conversion: ${baseUnit} → ${targetUnit}`, 'success')

    // Clear form
    document.getElementById('conversionTargetUnit').value = ''
    document.getElementById('conversionFormula').value = ''
    document.getElementById('conversionInverseFormula').value = ''
    document.getElementById('conversionSymbol').value = ''

    // Reload schema and unit definitions
    await loadSchema()
    await loadUnitDefinitions()
    renderUnitDefinitions()

    // Reinitialize all dropdowns to include new conversion
    initializePatternDropdowns()
    initializeCustomCategoryDropdowns()
    initializeUnitDefinitionsDropdowns()
    initializePathOverridesDropdowns()
  } catch (error) {
    showStatus('Failed to add conversion: ' + error.message, 'error')
  }
}

// Load unit definitions from backend
async function loadUnitDefinitions() {
  try {
    const res = await fetch(`${API_BASE}/unit-definitions`)
    if (!res.ok) throw new Error('Failed to load')
    unitDefinitions = await res.json()
    console.log('Loaded unitDefinitions:', unitDefinitions)
  } catch (error) {
    console.error('Error loading unit definitions:', error)
    unitDefinitions = {}
  }
}

// Render unit definitions list
function renderUnitDefinitions() {
  const container = document.getElementById('unitDefinitionsList')

  const defs = Object.entries(unitDefinitions).sort((a, b) =>
    a[0].toLowerCase().localeCompare(b[0].toLowerCase())
  )
  console.log('Rendering unit definitions, count:', defs.length)

  if (defs.length === 0) {
    container.innerHTML = '<div class="empty-state">No custom unit definitions yet</div>'
    return
  }

  container.innerHTML = defs
    .map(([baseUnit, def]) => {
      console.log(`Rendering baseUnit: ${baseUnit}, category: ${def.category}`)
      const conversions = Object.entries(def.conversions || {}).sort((a, b) =>
        a[0].toLowerCase().localeCompare(b[0].toLowerCase())
      )
      const isCustom = def.isCustom === true
      const badge = isCustom
        ? '<span style="background: #667eea; color: white; padding: 2px 8px; border-radius: 3px; font-size: 11px; margin-left: 8px;">CUSTOM</span>'
        : '<span style="background: #6c757d; color: white; padding: 2px 8px; border-radius: 3px; font-size: 11px; margin-left: 8px;">CORE</span>'
      const safeBaseUnit = sanitizeIdSegment(baseUnit)

      return `
      <div class="unit-definition-item" style="padding: 12px 16px; background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 6px; margin-bottom: 8px;">
        <div class="collapsible-header" onclick="toggleUnitItem('${baseUnit}')" style="cursor: pointer;">
          <div style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0;">
            <span style="font-family: monospace; font-weight: 500;">${baseUnit}${badge}</span>
            <span style="color: #7f8c8d; font-size: 13px;">${def.category || baseUnit}</span>
            <span style="color: #95a5a6; font-size: 13px;">${conversions.length} conversion${conversions.length !== 1 ? 's' : ''}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <button class="btn-primary btn-edit" onclick="event.stopPropagation(); editBaseUnit('${baseUnit}')">Edit</button>
            <button class="btn-danger btn-delete" onclick="event.stopPropagation(); deleteBaseUnit('${baseUnit}')">Delete</button>
            <span class="collapse-icon collapsed" id="unit-icon-${safeBaseUnit}">▼</span>
          </div>
        </div>
        <div class="collapsible-content collapsed" id="unit-content-${safeBaseUnit}">
          <div id="unit-view-${safeBaseUnit}">
            ${
              conversions.length > 0
                ? `
              <div style="background: white; padding: 15px; border-radius: 4px;">
                <h4 style="margin: 0 0 10px 0;">Available Conversions</h4>
                <table style="width: 100%; border-collapse: collapse;">
                  <thead>
                    <tr style="border-bottom: 2px solid #dee2e6; text-align: left;">
                      <th style="padding: 8px;">Target Unit</th>
                      <th style="padding: 8px;">Formula</th>
                      <th style="padding: 8px;">Inverse Formula</th>
                      <th style="padding: 8px;">Symbol</th>
                      <th style="padding: 8px;"></th>
                    </tr>
                  </thead>
                  <tbody id="conversions-tbody-${safeBaseUnit}">
                    ${conversions
                      .map(([target, conv]) => {
                        return `
                      <tr id="${buildConversionId('conversion-row', baseUnit, target)}" style="border-bottom: 1px solid #f0f0f0;">
                        <td style="padding: 8px; font-family: monospace;">${target}</td>
                        <td style="padding: 8px; font-family: monospace; font-size: 12px;">${conv.formula}</td>
                        <td style="padding: 8px; font-family: monospace; font-size: 12px;">${conv.inverseFormula}</td>
                        <td style="padding: 8px;">${conv.symbol}</td>
                        <td style="padding: 8px;">
                          <button class="btn-primary btn-edit" onclick="editConversion('${baseUnit}', '${target}')">Edit</button>
                          <button class="btn-danger btn-delete" onclick="deleteConversion('${baseUnit}', '${target}')">Delete</button>
                        </td>
                      </tr>`
                      })
                      .join('')}
                  </tbody>
                </table>
              </div>
            `
                : '<p style="color: #7f8c8d; font-style: italic;">No conversions defined yet</p>'
            }
          </div>
          <div id="unit-edit-${safeBaseUnit}" style="display: none;">
            <!-- Edit form will be inserted here -->
          </div>
        </div>
      </div>
    `
    })
    .join('')
}

// Delete a base unit
async function deleteBaseUnit(baseUnit) {
  const def = unitDefinitions[baseUnit]
  const conversionCount = def?.conversions ? Object.keys(def.conversions).length : 0

  const warningMessage = `⚠️ WARNING: Delete base unit "${baseUnit}"?

This will:
• Remove all ${conversionCount} conversion formula(s)
• Affect any categories using this base unit
• Remove it from all dropdowns

This action cannot be undone.

Are you sure you want to continue?`

  if (!confirm(warningMessage)) return

  try {
    const res = await fetch(`${API_BASE}/unit-definitions/${encodeURIComponent(baseUnit)}`, {
      method: 'DELETE'
    })

    if (!res.ok) throw new Error('Failed to delete')

    showStatus(`Deleted base unit: ${baseUnit}`, 'success')

    // Reload schema and unit definitions
    await loadSchema()
    await loadUnitDefinitions()
    renderUnitDefinitions()

    // Reinitialize all dropdowns to remove deleted base unit
    initializePatternDropdowns()
    initializeCustomCategoryDropdowns()
    initializeUnitDefinitionsDropdowns()
    initializePathOverridesDropdowns()
  } catch (error) {
    showStatus('Failed to delete: ' + error.message, 'error')
  }
}

// Delete a conversion
async function deleteConversion(baseUnit, targetUnit) {
  if (!confirm(`Delete conversion ${baseUnit} → ${targetUnit}?`)) return

  try {
    const res = await fetch(
      `${API_BASE}/unit-definitions/${encodeURIComponent(baseUnit)}/conversions/${encodeURIComponent(targetUnit)}`,
      {
        method: 'DELETE'
      }
    )

    if (!res.ok) throw new Error('Failed to delete')

    showStatus(`Deleted conversion: ${baseUnit} → ${targetUnit}`, 'success')

    // Reload schema and unit definitions
    await loadSchema()
    await loadUnitDefinitions()
    renderUnitDefinitions()

    // Reinitialize all dropdowns to remove deleted conversion
    initializePatternDropdowns()
    initializeCustomCategoryDropdowns()
    initializeUnitDefinitionsDropdowns()
    initializePathOverridesDropdowns()
  } catch (error) {
    showStatus('Failed to delete: ' + error.message, 'error')
  }
}

// Toggle unit item
function toggleUnitItem(baseUnit) {
  const safeBaseUnit = sanitizeIdSegment(baseUnit)
  const content = document.getElementById(`unit-content-${safeBaseUnit}`)
  const icon = document.getElementById(`unit-icon-${safeBaseUnit}`)

  if (!content || !icon) return

  const isCurrentlyCollapsed = content.classList.contains('collapsed')

  // Close all other units (accordion behavior)
  document.querySelectorAll('[id^="unit-content-"]').forEach(el => {
    if (el.id !== `unit-content-${safeBaseUnit}`) {
      el.classList.add('collapsed')
    }
  })
  document.querySelectorAll('[id^="unit-icon-"]').forEach(el => {
    if (el.id !== `unit-icon-${safeBaseUnit}`) {
      el.classList.add('collapsed')
    }
  })

  // Toggle current unit
  if (isCurrentlyCollapsed) {
    content.classList.remove('collapsed')
    icon.classList.remove('collapsed')
  } else {
    content.classList.add('collapsed')
    icon.classList.add('collapsed')
  }
}

// Edit base unit
function editBaseUnit(baseUnit) {
  const def = unitDefinitions[baseUnit] || {}
  const description = def.category || ''
  const safeBaseUnit = sanitizeIdSegment(baseUnit)

  const viewDiv = document.getElementById(`unit-view-${safeBaseUnit}`)
  const editDiv = document.getElementById(`unit-edit-${safeBaseUnit}`)

  const symbolInputId = `edit-unit-symbol-${safeBaseUnit}`
  const descInputId = `edit-unit-desc-${safeBaseUnit}`

  // Build edit form
  editDiv.innerHTML = `
    <div style="background: #fff3cd; padding: 15px; border-radius: 4px; border: 1px dashed #ffc107; margin-top: 10px;">
      <h4 style="margin: 0 0 15px 0; color: #856404; font-size: 14px;">Edit Base Unit: ${baseUnit}</h4>
      <div class="form-group" style="margin-bottom: 15px;">
        <div class="input-group">
          <label>Base Unit Symbol</label>
          <input type="text" id="${symbolInputId}" value="${baseUnit}" placeholder="e.g., L/h, bar" readonly style="background: #f5f5f5;">
          <small style="color: #666; display: block; margin-top: 3px;">Symbol cannot be changed</small>
        </div>
        <div class="input-group">
          <label>Description</label>
          <input type="text" id="${descInputId}" value="${description}" placeholder="e.g., Liters per hour">
        </div>
      </div>
      <div style="display: flex; gap: 10px;">
        <button class="btn-success" onclick="saveEditBaseUnit('${baseUnit}')" style="padding: 8px 16px;">Save Changes</button>
        <button class="btn-secondary" onclick="cancelEditBaseUnit('${baseUnit}')" style="padding: 8px 16px;">Cancel</button>
      </div>
    </div>
  `

  // Show edit form, hide view
  viewDiv.style.display = 'none'
  editDiv.style.display = 'block'

  // Ensure the content is expanded
  const content = document.getElementById(`unit-content-${safeBaseUnit}`)
  const icon = document.getElementById(`unit-icon-${safeBaseUnit}`)
  if (content.classList.contains('collapsed')) {
    content.classList.remove('collapsed')
    icon.classList.remove('collapsed')
  }
}

// Save edited base unit
async function saveEditBaseUnit(baseUnit) {
  const safeBaseUnit = sanitizeIdSegment(baseUnit)
  const descInputId = `edit-unit-desc-${safeBaseUnit}`
  const description = document.getElementById(descInputId).value.trim()

  try {
    // Get the existing unit definition and update only the category (description)
    const existingDef = unitDefinitions[baseUnit] || { conversions: {} }
    const updatedDef = {
      baseUnit: baseUnit,
      category: description || baseUnit,
      conversions: existingDef.conversions || {}
    }

    console.log('Saving base unit:', updatedDef)

    const res = await fetch(`${API_BASE}/unit-definitions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedDef)
    })

    if (!res.ok) {
      const errorText = await res.text()
      console.error('Failed to update base unit:', errorText)
      throw new Error('Failed to update base unit')
    }

    const result = await res.json()
    console.log('Save result:', result)

    showStatus(`Updated base unit: ${baseUnit}`, 'success')

    // Update local unitDefinitions to reflect the change immediately
    if (unitDefinitions[baseUnit]) {
      unitDefinitions[baseUnit].category = description
    }

    // Reload schema and unit definitions
    await loadSchema()
    await loadUnitDefinitions()

    console.log('Updated unitDefinitions:', unitDefinitions[baseUnit])

    renderUnitDefinitions()

    initializePatternDropdowns()
    initializeCustomCategoryDropdowns()
    initializeUnitDefinitionsDropdowns()
    initializePathOverridesDropdowns()
  } catch (error) {
    console.error('Error updating base unit:', error)
    showStatus('Failed to update base unit: ' + error.message, 'error')
  }
}

// Cancel editing base unit
function cancelEditBaseUnit(baseUnit) {
  const safeBaseUnit = sanitizeIdSegment(baseUnit)
  const viewDiv = document.getElementById(`unit-view-${safeBaseUnit}`)
  const editDiv = document.getElementById(`unit-edit-${safeBaseUnit}`)

  viewDiv.style.display = 'block'
  editDiv.style.display = 'none'
}

// Edit conversion
function editConversion(baseUnit, targetUnit) {
  const conv = unitDefinitions[baseUnit]?.conversions?.[targetUnit] || {}

  const rowId = buildConversionId('conversion-row', baseUnit, targetUnit)
  const row = document.getElementById(rowId)

  if (!row) return

  const editRowId = buildConversionId('conversion-edit', baseUnit, targetUnit)
  const targetInputId = buildConversionId('edit-conv-target', baseUnit, targetUnit)
  const formulaInputId = buildConversionId('edit-conv-formula', baseUnit, targetUnit)
  const inverseInputId = buildConversionId('edit-conv-inverse', baseUnit, targetUnit)
  const symbolInputId = buildConversionId('edit-conv-symbol', baseUnit, targetUnit)

  // Create edit row
  const editRow = document.createElement('tr')
  editRow.id = editRowId
  editRow.innerHTML = `
    <td colspan="5" style="padding: 15px; background: #fff3cd;">
      <h5 style="margin: 0 0 10px 0; color: #856404; font-size: 13px;">Edit Conversion: ${baseUnit} → ${targetUnit}</h5>
      <div style="display: grid; grid-template-columns: 1fr 2fr 2fr 1fr; gap: 10px; margin-bottom: 10px;">
        <div>
          <label style="font-size: 12px; color: #666; display: block; margin-bottom: 3px;">Target Unit</label>
          <input type="text" id="${targetInputId}" value="${targetUnit}" readonly style="background: #f5f5f5; padding: 6px; width: 100%; border: 1px solid #ddd; border-radius: 4px; font-family: monospace;">
        </div>
        <div>
          <label style="font-size: 12px; color: #666; display: block; margin-bottom: 3px;">Formula (base → target)</label>
          <input type="text" id="${formulaInputId}" value="${conv.formula}" placeholder="e.g., value * 0.264" style="padding: 6px; width: 100%; border: 1px solid #ddd; border-radius: 4px; font-family: monospace;">
        </div>
        <div>
          <label style="font-size: 12px; color: #666; display: block; margin-bottom: 3px;">Inverse Formula (target → base)</label>
          <input type="text" id="${inverseInputId}" value="${conv.inverseFormula}" placeholder="e.g., value * 3.785" style="padding: 6px; width: 100%; border: 1px solid #ddd; border-radius: 4px; font-family: monospace;">
        </div>
        <div>
          <label style="font-size: 12px; color: #666; display: block; margin-bottom: 3px;">Symbol</label>
          <input type="text" id="${symbolInputId}" value="${conv.symbol}" placeholder="e.g., gal/h" style="padding: 6px; width: 100%; border: 1px solid #ddd; border-radius: 4px;">
        </div>
      </div>
      <div style="display: flex; gap: 10px;">
        <button class="btn-success" onclick="saveEditConversion('${baseUnit}', '${targetUnit}')" style="padding: 6px 12px; font-size: 12px;">Save Changes</button>
        <button class="btn-secondary" onclick="cancelEditConversion('${baseUnit}', '${targetUnit}')" style="padding: 6px 12px; font-size: 12px;">Cancel</button>
      </div>
    </td>
  `

  // Insert edit row after current row and hide current row
  row.style.display = 'none'
  row.parentNode.insertBefore(editRow, row.nextSibling)
}

// Save edited conversion
async function saveEditConversion(baseUnit, targetUnit) {
  const formulaInputId = buildConversionId('edit-conv-formula', baseUnit, targetUnit)
  const inverseInputId = buildConversionId('edit-conv-inverse', baseUnit, targetUnit)
  const symbolInputId = buildConversionId('edit-conv-symbol', baseUnit, targetUnit)

  const formula = document.getElementById(formulaInputId).value.trim()
  const inverseFormula = document.getElementById(inverseInputId).value.trim()
  const symbol = document.getElementById(symbolInputId).value.trim()

  if (!formula || !inverseFormula || !symbol) {
    showStatus('Please fill in all fields', 'error')
    return
  }

  try {
    // Use POST to overwrite the existing conversion
    const res = await fetch(
      `${API_BASE}/unit-definitions/${encodeURIComponent(baseUnit)}/conversions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUnit,
          formula,
          inverseFormula,
          symbol
        })
      }
    )

    if (!res.ok) throw new Error('Failed to update conversion')

    showStatus(`Updated conversion: ${baseUnit} → ${targetUnit}`, 'success')

    // Reload schema and unit definitions
    await loadSchema()
    await loadUnitDefinitions()
    renderUnitDefinitions()

    initializePatternDropdowns()
    initializeCustomCategoryDropdowns()
    initializeUnitDefinitionsDropdowns()
    initializePathOverridesDropdowns()
  } catch (error) {
    showStatus('Failed to update conversion: ' + error.message, 'error')
  }
}

// Cancel editing conversion
function cancelEditConversion(baseUnit, targetUnit) {
  const rowId = buildConversionId('conversion-row', baseUnit, targetUnit)
  const editRowId = buildConversionId('conversion-edit', baseUnit, targetUnit)

  const row = document.getElementById(rowId)
  const editRow = document.getElementById(editRowId)

  if (row) row.style.display = ''
  if (editRow) editRow.remove()
}

// Initialize Unit Definitions dropdowns
function initializeUnitDefinitionsDropdowns() {
  // Populate base unit dropdown for adding conversions
  const container = document.getElementById('conversionBaseUnitContainer')
  if (!container) return

  const baseUnits = unitSchema.baseUnits || []

  container.innerHTML = `
    <select id="conversionBaseUnit">
      <option value="">-- Select Base Unit --</option>
      ${baseUnits
        .map(
          unit => `
        <option value="${unit.value}">${unit.label}</option>
      `
        )
        .join('')}
    </select>
  `
}

// ============================================================================
// PATH OVERRIDES TAB
// ============================================================================

// Add a path override
async function addPathOverride() {
  const path = document.getElementById('overridePathInput').value.trim()
  const baseSelect = document.getElementById('overrideBaseUnit')
  const targetSelect = document.getElementById('overrideTargetUnit')
  const format = document.getElementById('overrideFormat').value.trim()

  const baseUnit = baseSelect.value.trim()
  const targetUnit = targetSelect.value.trim()

  if (!path || !baseUnit || !targetUnit || !format) {
    showStatus('Please fill in all fields', 'error')
    return
  }

  try {
    const res = await fetch(`${API_BASE}/overrides/${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path,
        baseUnit,
        targetUnit,
        displayFormat: format
      })
    })

    if (!res.ok) throw new Error('Failed to add override')

    // Update local preferences
    if (!preferences.pathOverrides) {
      preferences.pathOverrides = {}
    }
    preferences.pathOverrides[path] = {
      path,
      baseUnit,
      targetUnit,
      displayFormat: format
    }

    showStatus(`Added path override: ${path}`, 'success')

    // Clear form
    document.getElementById('overridePathInput').value = ''
    document.getElementById('overrideFormat').value = '0.0'

    // Re-render without reloading (to preserve dirty state)
    renderPathOverrides()
  } catch (error) {
    showStatus('Failed to add override: ' + error.message, 'error')
  }
}

// Render path overrides list
function renderPathOverrides() {
  const container = document.getElementById('pathOverridesList')

  const overrides = Object.values(preferences.pathOverrides || {})
  if (overrides.length === 0) {
    container.innerHTML = '<div class="empty-state">No path overrides configured</div>'
    return
  }

  container.innerHTML = overrides
    .map(override => {
      const conversionUrl = `${API_BASE}/conversion/${override.path}`
      const currentValue = getCurrentValue(override.path) || 0
      const convertUrl = `${API_BASE}/convert/${override.path}/${currentValue}`
      const baseUnit = override.baseUnit || 'auto'
      const targetUnit = override.targetUnit || 'none'
      const displayFormat = override.displayFormat || '0.0'
      const safePath = override.path.replace(/\./g, '-')
      const escapedPath = override.path.replace(/'/g, "\\'")

      return `
      <div class="override-item" style="padding: 12px 16px; background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 6px; margin-bottom: 8px;">
        <div id="override-view-${safePath}" style="display: flex; align-items: center; justify-content: space-between; gap: 16px;">
          <div style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0;">
            <span class="path-name" style="flex-shrink: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${override.path}</span>
            <span style="color: #7f8c8d; font-size: 13px; white-space: nowrap;">→</span>
            <span style="color: #667eea; font-weight: 500; font-size: 13px; white-space: nowrap;">${baseUnit} → ${targetUnit}</span>
            <span style="color: #95a5a6; font-size: 13px; white-space: nowrap;">(${displayFormat})</span>
            <a href="${conversionUrl}" target="_blank" title="View conversion info" style="color: #3498db; font-size: 14px; text-decoration: none;">🔧</a>
            <a href="${convertUrl}" target="_blank" title="Test conversion with current value (${currentValue})" style="color: #2ecc71; font-size: 14px; text-decoration: none;">▶️</a>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn-primary btn-edit" onclick="editPathOverride('${escapedPath}')">Edit</button>
            <button class="btn-danger btn-delete" onclick="deletePathOverride('${escapedPath}')">Delete</button>
          </div>
        </div>
        <div id="override-edit-${safePath}" style="display: none;"></div>
      </div>
    `
    })
    .join('')
}

// Edit path override
async function editPathOverride(path) {
  const override = preferences.pathOverrides[path]
  if (!override) return

  const safePath = path.replace(/\./g, '-')
  const viewDiv = document.getElementById(`override-view-${safePath}`)
  const editDiv = document.getElementById(`override-edit-${safePath}`)

  // Get the actual base unit - if auto, fetch from conversion
  let baseUnit = override.baseUnit
  if (!baseUnit || baseUnit === 'auto') {
    try {
      const res = await fetch(`${API_BASE}/conversion/${path}`)
      if (res.ok) {
        const conversion = await res.json()
        baseUnit = conversion.baseUnit || 'auto'
      } else {
        baseUnit = 'auto'
      }
    } catch (error) {
      baseUnit = 'auto'
    }
  }

  const targetUnit = override.targetUnit || 'none'
  const displayFormat = override.displayFormat || '0.0'

  const baseSelectId = `edit-override-base-${safePath}`
  const targetSelectId = `edit-override-target-${safePath}`
  const formatInputId = `edit-override-format-${safePath}`
  const escapedPath = path.replace(/'/g, "\\'")

  editDiv.innerHTML = `
    <div style="background: #fff3cd; padding: 16px; border-radius: 6px; margin-top: 12px;">
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 12px;">
        <div>
          <label style="display: block; font-weight: 500; margin-bottom: 6px; font-size: 13px;">Base Unit</label>
          <div id="${baseSelectId}-container"></div>
        </div>
        <div>
          <label style="display: block; font-weight: 500; margin-bottom: 6px; font-size: 13px;">Target Unit</label>
          <div id="${targetSelectId}-container"></div>
        </div>
        <div>
          <label style="display: block; font-weight: 500; margin-bottom: 6px; font-size: 13px;">Display Format</label>
          <input type="text" id="${formatInputId}" value="${displayFormat}" placeholder="e.g., 0.0" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
        </div>
      </div>
      <div style="display: flex; gap: 10px;">
        <button class="btn-success" onclick="saveEditPathOverride('${escapedPath}')" style="padding: 8px 16px;">Save Changes</button>
        <button class="btn-secondary" onclick="cancelEditPathOverride('${escapedPath}')" style="padding: 8px 16px;">Cancel</button>
      </div>
    </div>
  `

  // Populate dropdowns
  document.getElementById(`${baseSelectId}-container`).innerHTML = createBaseUnitDropdown(
    baseSelectId,
    baseUnit,
    false
  )
  document.getElementById(`${targetSelectId}-container`).innerHTML = createTargetUnitDropdown(
    targetSelectId,
    baseUnit,
    targetUnit,
    false
  )

  // Handle base unit change to update target units
  document.getElementById(baseSelectId).addEventListener('change', e => {
    const newBaseUnit = e.target.value
    document.getElementById(`${targetSelectId}-container`).innerHTML = createTargetUnitDropdown(
      targetSelectId,
      newBaseUnit,
      '',
      false
    )
  })

  // Show edit form, hide view
  viewDiv.style.display = 'none'
  editDiv.style.display = 'block'
}

// Save edited path override
async function saveEditPathOverride(path) {
  const safePath = path.replace(/\./g, '-')
  const baseSelectId = `edit-override-base-${safePath}`
  const targetSelectId = `edit-override-target-${safePath}`
  const formatInputId = `edit-override-format-${safePath}`

  const baseUnit = document.getElementById(baseSelectId).value
  const targetUnit = document.getElementById(targetSelectId).value
  const displayFormat = document.getElementById(formatInputId).value

  if (!baseUnit || !targetUnit || !displayFormat) {
    showStatus('Please fill in all fields', 'error')
    return
  }

  try {
    const overridePref = {
      path,
      baseUnit,
      targetUnit,
      displayFormat
    }

    const res = await fetch(`${API_BASE}/overrides/${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(overridePref)
    })

    if (!res.ok) throw new Error('Failed to update path override')

    // Update local preferences
    if (!preferences.pathOverrides) {
      preferences.pathOverrides = {}
    }
    preferences.pathOverrides[path] = overridePref

    showStatus(`Updated path override: ${path}`, 'success')

    // Re-render without reloading (to preserve dirty state)
    renderPathOverrides()
  } catch (error) {
    showStatus('Failed to update path override: ' + error.message, 'error')
  }
}

// Cancel editing path override
function cancelEditPathOverride(path) {
  const safePath = path.replace(/\./g, '-')
  const viewDiv = document.getElementById(`override-view-${safePath}`)
  const editDiv = document.getElementById(`override-edit-${safePath}`)

  // Show view, hide edit form
  viewDiv.style.display = 'flex'
  editDiv.style.display = 'none'
}

// Delete path override
async function deletePathOverride(path) {
  if (!confirm(`Delete path override for "${path}"?`)) return

  try {
    const res = await fetch(`${API_BASE}/overrides/${path}`, {
      method: 'DELETE'
    })

    if (!res.ok) throw new Error('Failed to delete')

    // Update local preferences
    if (preferences.pathOverrides && preferences.pathOverrides[path]) {
      delete preferences.pathOverrides[path]
    }

    showStatus(`Deleted path override: ${path}`, 'success')

    // Re-render without reloading (to preserve dirty state)
    renderPathOverrides()
  } catch (error) {
    showStatus('Failed to delete: ' + error.message, 'error')
  }
}

// Initialize Path Overrides dropdowns
function initializePathOverridesDropdowns() {
  // Base unit dropdown
  const baseContainer = document.getElementById('overrideBaseUnitContainer')
  if (baseContainer) {
    baseContainer.innerHTML = createBaseUnitDropdown('overrideBaseUnit', '', false)

    // Handle base unit change
    document.getElementById('overrideBaseUnit').addEventListener('change', function () {
      const targetContainer = document.getElementById('overrideTargetUnitContainer')
      if (this.value) {
        targetContainer.innerHTML = createTargetUnitDropdown(
          'overrideTargetUnit',
          this.value,
          '',
          false
        )
      } else {
        targetContainer.innerHTML = `
          <select id="overrideTargetUnit" disabled>
            <option value="">-- Select Base Unit First --</option>
          </select>
        `
      }
    })
  }

  // Initialize target dropdown (disabled initially)
  const targetContainer = document.getElementById('overrideTargetUnitContainer')
  if (targetContainer) {
    targetContainer.innerHTML = `
      <select id="overrideTargetUnit" disabled>
        <option value="">-- Select Base Unit First --</option>
      </select>
    `
  }

  // Initialize path autocomplete
  initializePathAutocomplete()
}

// Initialize path autocomplete for override input
function initializePathAutocomplete() {
  const input = document.getElementById('overridePathInput')
  const dropdown = document.getElementById('overridePathAutocomplete')

  if (!input || !dropdown) return

  let selectedIndex = -1

  // Show autocomplete on focus (show first 50 paths)
  input.addEventListener('focus', function () {
    if (this.value.trim()) {
      // If there's already text, trigger the input handler
      input.dispatchEvent(new Event('input'))
      return
    }

    // Check if paths are loaded
    if (!availablePaths || availablePaths.length === 0) {
      dropdown.innerHTML =
        '<div style="padding: 12px; color: #e74c3c; font-style: italic;">No paths available. Make sure SignalK is running and has data.</div>'
      dropdown.style.display = 'block'
      return
    }

    // Show first 50 paths
    const displayPaths = availablePaths.slice(0, 50)

    dropdown.innerHTML = displayPaths
      .map(
        (path, index) => `
        <div class="autocomplete-item" data-index="${index}" data-path="${path}"
             style="padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #f0f0f0; font-family: monospace; font-size: 12px;">
          ${path}
        </div>
      `
      )
      .join('')

    if (availablePaths.length > 50) {
      dropdown.innerHTML += `<div style="padding: 8px 12px; color: #999; font-size: 11px; border-top: 2px solid #dee2e6;">Showing 50 of ${availablePaths.length} paths. Start typing to filter.</div>`
    }

    dropdown.style.display = 'block'
    selectedIndex = -1

    // Add hover and click handlers
    dropdown.querySelectorAll('.autocomplete-item').forEach((item, index) => {
      item.addEventListener('mouseenter', function () {
        dropdown.querySelectorAll('.autocomplete-item').forEach(i => i.classList.remove('selected'))
        this.classList.add('selected')
        selectedIndex = index
      })

      item.addEventListener('click', function () {
        input.value = this.dataset.path
        dropdown.style.display = 'none'
        selectedIndex = -1
      })
    })
  })

  // Show autocomplete on input
  input.addEventListener('input', function () {
    const searchTerm = this.value.toLowerCase().trim()

    if (!searchTerm) {
      dropdown.style.display = 'none'
      selectedIndex = -1
      return
    }

    // Check if paths are loaded
    if (!availablePaths || availablePaths.length === 0) {
      dropdown.innerHTML =
        '<div style="padding: 12px; color: #e74c3c; font-style: italic;">No paths available. Make sure SignalK is running and has data.</div>'
      dropdown.style.display = 'block'
      return
    }

    // Filter paths
    const matches = availablePaths.filter(path => path.toLowerCase().includes(searchTerm))

    if (matches.length === 0) {
      dropdown.innerHTML =
        '<div style="padding: 12px; color: #999; font-style: italic;">No matching paths</div>'
      dropdown.style.display = 'block'
      return
    }

    // Limit to 50 results for performance
    const displayMatches = matches.slice(0, 50)

    dropdown.innerHTML = displayMatches
      .map(
        (path, index) => `
        <div class="autocomplete-item" data-index="${index}" data-path="${path}"
             style="padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #f0f0f0; font-family: monospace; font-size: 12px;">
          ${path}
        </div>
      `
      )
      .join('')

    if (matches.length > 50) {
      dropdown.innerHTML += `<div style="padding: 8px 12px; color: #999; font-size: 11px; border-top: 2px solid #dee2e6;">Showing 50 of ${matches.length} matches. Keep typing to narrow results.</div>`
    }

    dropdown.style.display = 'block'
    selectedIndex = -1

    // Add hover and click handlers
    dropdown.querySelectorAll('.autocomplete-item').forEach((item, index) => {
      item.addEventListener('mouseenter', function () {
        dropdown.querySelectorAll('.autocomplete-item').forEach(i => i.classList.remove('selected'))
        this.classList.add('selected')
        selectedIndex = index
      })

      item.addEventListener('click', function () {
        input.value = this.dataset.path
        dropdown.style.display = 'none'
        selectedIndex = -1
      })
    })
  })

  // Keyboard navigation
  input.addEventListener('keydown', function (e) {
    const items = dropdown.querySelectorAll('.autocomplete-item')

    if (!items.length) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      selectedIndex = Math.min(selectedIndex + 1, items.length - 1)
      updateSelection(items, selectedIndex)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      selectedIndex = Math.max(selectedIndex - 1, 0)
      updateSelection(items, selectedIndex)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (selectedIndex >= 0 && items[selectedIndex]) {
        input.value = items[selectedIndex].dataset.path
        dropdown.style.display = 'none'
        selectedIndex = -1
      }
    } else if (e.key === 'Escape') {
      dropdown.style.display = 'none'
      selectedIndex = -1
    }
  })

  // Close on click outside
  document.addEventListener('click', function (e) {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = 'none'
      selectedIndex = -1
    }
  })

  // Helper to update selection styling
  function updateSelection(items, index) {
    items.forEach((item, i) => {
      if (i === index) {
        item.classList.add('selected')
        item.scrollIntoView({ block: 'nearest' })
      } else {
        item.classList.remove('selected')
      }
    })
  }
}

// Backup and Restore Functions
async function downloadBackup() {
  const statusEl = document.getElementById('backupStatus')
  try {
    statusEl.innerHTML =
      '<div style="color: #667eea; padding: 10px; background: #f0f4ff; border-radius: 4px;">Creating backup...</div>'

    const res = await fetch(`${API_BASE}/backup`)
    if (!res.ok) throw new Error('Failed to create backup')

    const blob = await res.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `signalk-units-backup-${Date.now()}.zip`
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)

    statusEl.innerHTML =
      '<div style="color: #27ae60; padding: 10px; background: #e8f5e9; border-radius: 4px;">✓ Backup downloaded successfully!</div>'
    setTimeout(() => {
      statusEl.innerHTML = ''
    }, 5000)
  } catch (error) {
    console.error('Backup error:', error)
    statusEl.innerHTML =
      '<div style="color: #e74c3c; padding: 10px; background: #ffebee; border-radius: 4px;">✗ Failed to create backup</div>'
  }
}

async function restoreBackup(event) {
  const file = event.target.files[0]
  if (!file) return

  const statusEl = document.getElementById('backupStatus')

  if (
    !confirm(
      '⚠️ WARNING: This will restore all configuration files from the backup.\n\nThis will overwrite:\n• All presets\n• Current preferences\n• Custom unit definitions\n\nAre you sure you want to continue?'
    )
  ) {
    event.target.value = '' // Reset file input
    return
  }

  try {
    statusEl.innerHTML =
      '<div style="color: #667eea; padding: 10px; background: #f0f4ff; border-radius: 4px;">Restoring backup...</div>'

    const arrayBuffer = await file.arrayBuffer()
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))

    const res = await fetch(`${API_BASE}/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zipData: base64 })
    })

    if (!res.ok) {
      const errorData = await res.json()
      throw new Error(errorData.error || 'Failed to restore backup')
    }

    const result = await res.json()

    statusEl.innerHTML = `<div style="color: #27ae60; padding: 10px; background: #e8f5e9; border-radius: 4px;">
      ✓ Backup restored successfully!<br>
      <small>Restored files: ${result.restoredFiles.join(', ')}</small><br>
      <small>Reloading in 2 seconds...</small>
    </div>`

    // Reload data and page after restore
    setTimeout(() => {
      window.location.reload()
    }, 2000)
  } catch (error) {
    console.error('Restore error:', error)
    statusEl.innerHTML = `<div style="color: #e74c3c; padding: 10px; background: #ffebee; border-radius: 4px;">✗ Failed to restore backup: ${error.message}</div>`
  } finally {
    event.target.value = '' // Reset file input
  }
}

// Generic download function for all file types
async function downloadFile(endpoint, fileType) {
  const statusEl = document.getElementById('fileManagementStatus')

  try {
    statusEl.innerHTML =
      '<div style="color: #3498db; padding: 10px; background: #e3f2fd; border-radius: 4px;">Downloading...</div>'

    const response = await fetch(`${API_BASE}/${endpoint}/${fileType}`)

    if (!response.ok) {
      throw new Error('Failed to download file')
    }

    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${fileType}.json`
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)

    statusEl.innerHTML = `<div style="color: #27ae60; padding: 10px; background: #e8f5e9; border-radius: 4px;">✓ Downloaded ${fileType}.json</div>`

    setTimeout(() => {
      statusEl.innerHTML = ''
    }, 3000)
  } catch (error) {
    console.error('Download error:', error)
    statusEl.innerHTML = `<div style="color: #e74c3c; padding: 10px; background: #ffebee; border-radius: 4px;">✗ Failed to download: ${error.message}</div>`
  }
}

// Generic upload function for all file types
async function uploadFile(event, endpoint, fileType) {
  const statusEl = document.getElementById('fileManagementStatus')
  const file = event.target.files[0]

  if (!file) return

  try {
    statusEl.innerHTML =
      '<div style="color: #3498db; padding: 10px; background: #e3f2fd; border-radius: 4px;">Uploading...</div>'

    const text = await file.text()
    const json = JSON.parse(text) // Validate JSON

    const response = await fetch(`${API_BASE}/${endpoint}/${fileType}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(json)
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Failed to upload file')
    }

    statusEl.innerHTML = `<div style="color: #27ae60; padding: 10px; background: #e8f5e9; border-radius: 4px;">
      ✓ Uploaded ${fileType}.json successfully!<br>
      <small>Reloading in 2 seconds to apply changes...</small>
    </div>`

    setTimeout(() => {
      window.location.reload()
    }, 2000)
  } catch (error) {
    console.error('Upload error:', error)
    statusEl.innerHTML = `<div style="color: #e74c3c; padding: 10px; background: #ffebee; border-radius: 4px;">✗ Failed to upload: ${error.message}</div>`
  } finally {
    event.target.value = '' // Reset file input
  }
}

// Switch to a specific tab programmatically
function switchTab(tabName) {
  // Update active tab button
  document.querySelectorAll('.tab').forEach(t => {
    if (t.dataset.tab === tabName) {
      t.classList.add('active')
    } else {
      t.classList.remove('active')
    }
  })

  // Show content
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'))
  document.getElementById(tabName).classList.add('active')
}

// Create pattern from metadata path
function createPatternFromPath(path, category) {
  // Switch to patterns tab
  switchTab('patterns')

  // Expand the "Add Path Pattern" section if it's collapsed
  setTimeout(() => {
    const addContent = document.getElementById('addPatternContent')
    if (addContent && addContent.classList.contains('collapsed')) {
      addContent.classList.remove('collapsed')
      // Also update the icon
      const header = addContent.previousElementSibling
      const icon = header?.querySelector('.collapse-icon')
      if (icon) {
        icon.classList.remove('collapsed')
      }
    }

    // Pre-populate the pattern input (note: ID is newPatternPattern, not newPatternPath)
    const patternInput = document.getElementById('newPatternPattern')
    if (patternInput) {
      patternInput.value = path
    }

    // Pre-populate category if available
    const categorySelect = document.getElementById('newPatternCategory')
    if (categorySelect && category && category !== '-') {
      categorySelect.value = category
    }

    // Scroll to the add pattern section
    const addSection = patternInput?.closest('.section')
    if (addSection) {
      addSection.scrollIntoView({ behavior: 'smooth', block: 'start' })
      patternInput.focus()
    }
  }, 100)
}

// Create override from metadata path
function createOverrideFromPath(path) {
  // Switch to overrides tab
  switchTab('overrides')

  // Expand the "Add Path Override" section if it's collapsed
  setTimeout(() => {
    const addContent = document.getElementById('addPathOverrideContent')
    if (addContent && addContent.classList.contains('collapsed')) {
      addContent.classList.remove('collapsed')
      // Also update the icon
      const header = addContent.previousElementSibling
      const icon = header?.querySelector('.collapse-icon')
      if (icon) {
        icon.classList.remove('collapsed')
      }
    }

    // Pre-populate the path input
    const pathInput = document.getElementById('overridePathInput')
    if (pathInput) {
      pathInput.value = path
      pathInput.dispatchEvent(new Event('input'))
    }

    // Scroll to the add override section
    const addSection = pathInput?.closest('.section')
    if (addSection) {
      addSection.scrollIntoView({ behavior: 'smooth', block: 'start' })
      pathInput.focus()
    }
  }, 100)
}

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
