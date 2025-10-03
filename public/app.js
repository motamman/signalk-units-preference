const API_BASE = '/plugins/signalk-units-preference'

let preferences = null
let metadata = null
let availablePaths = []
let pathTree = {}
let signalKValues = {}

// Unit schema data (loaded from server)
let unitSchema = {
  baseUnits: [],
  categories: [],
  targetUnitsByBase: {},
  categoryToBaseUnit: {}
}

// Get current value for a path from SignalK
function getCurrentValue(pathStr) {
  return signalKValues[pathStr]
}

// Create base unit dropdown HTML
function createBaseUnitDropdown(id, selectedValue = '', includeCustom = true) {
  const options = unitSchema.baseUnits.map(opt =>
    `<option value="${opt.value}" ${opt.value === selectedValue ? 'selected' : ''}>${opt.label}</option>`
  ).join('')
  const customOption = includeCustom ? `<option value="custom" ${selectedValue === 'custom' ? 'selected' : ''}>✏️ Custom...</option>` : ''
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
  const options = unitSchema.categories.map(cat =>
    `<option value="${cat}" ${cat === selectedValue ? 'selected' : ''}>${cat}</option>`
  ).join('')
  const customOption = includeCustom ? `<option value="custom" ${selectedValue === 'custom' ? 'selected' : ''}>✏️ Custom...</option>` : ''
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
  const options = units.map(unit =>
    `<option value="${unit}" ${unit === selectedValue ? 'selected' : ''}>${unit}</option>`
  ).join('')
  const customOption = includeCustom ? `<option value="custom" ${selectedValue === 'custom' ? 'selected' : ''}>✏️ Custom...</option>` : ''
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
  document.getElementById('newPatternCategoryContainer').innerHTML = createCategoryDropdown('newPatternCategory', '', true)

  // Initialize base unit dropdown (hidden by default)
  document.getElementById('newPatternBaseContainer').innerHTML = createBaseUnitDropdown('newPatternBase', '', true)

  // Target unit starts disabled until category is selected
  document.getElementById('newPatternTargetContainer').innerHTML = `
    <select id="newPatternTarget" disabled>
      <option value="">Select category first</option>
    </select>
  `

  // Handle category change
  document.getElementById('newPatternCategory').addEventListener('change', function() {
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
    baseSelect.addEventListener('change', function() {
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
        targetContainer.innerHTML = createTargetUnitDropdown('newPatternTarget', this.value, '', true)
        attachTargetUnitHandler()
      }
    })
  }
}

// Helper to attach target unit custom input handler
function attachTargetUnitHandler() {
  const targetSelect = document.getElementById('newPatternTarget')
  if (targetSelect) {
    targetSelect.addEventListener('change', function() {
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
    })
  })
}

// Load all data
async function loadData() {
  try {
    // Load categories, overrides, patterns, and metadata separately
    const [categoriesRes, overridesRes, patternsRes, metaRes] = await Promise.all([
      fetch(`${API_BASE}/categories`),
      fetch(`${API_BASE}/overrides`),
      fetch(`${API_BASE}/patterns`),
      fetch(`${API_BASE}/metadata`)
    ])

    if (!categoriesRes.ok || !overridesRes.ok || !patternsRes.ok || !metaRes.ok) {
      throw new Error('Failed to load data')
    }

    // Reconstruct preferences object
    preferences = {
      categories: await categoriesRes.json(),
      pathOverrides: await overridesRes.json(),
      pathPatterns: await patternsRes.json()
    }
    metadata = await metaRes.json()

    renderCategories()
    renderPatterns()
    // renderMetadata() is now called on tab click to ensure paths are loaded
  } catch (error) {
    showStatus('Failed to load data: ' + error.message, 'error')
  }
}

// Get available units for a category from metadata
function getAvailableUnitsForCategory(category) {
  const units = new Set()

  // Find all paths with this category and collect their conversion options
  for (const [path, meta] of Object.entries(metadata)) {
    if (meta.category === category) {
      Object.keys(meta.conversions).forEach(unit => units.add(unit))
    }
  }

  return Array.from(units).sort()
}

// Render category preferences
function renderCategories() {
  const container = document.getElementById('categoryList')

  if (!unitSchema.categories || unitSchema.categories.length === 0) {
    container.innerHTML = '<div class="empty-state">Loading categories...</div>'
    return
  }

  // Show all categories from schema, use preferences if they exist
  container.innerHTML = unitSchema.categories
    .map(category => {
      const pref = preferences?.categories?.[category] || { targetUnit: '', displayFormat: '0.0' }
      const baseUnit = unitSchema.categoryToBaseUnit[category]
      const availableUnits = unitSchema.targetUnitsByBase[baseUnit] || []
      const isCustom = pref.baseUnit !== undefined

      return `
      <div class="category-item">
        <div class="collapsible-header" onclick="toggleCategoryItem('${category}')">
          <div>
            <h3 class="category-name" style="display: inline;">${category}${isCustom ? ' <span style="color: #667eea; font-size: 12px;">(custom)</span>' : ''}</h3>
            <div style="color: #7f8c8d; font-size: 13px; margin-top: 5px;">Base: ${baseUnit} | Available: ${availableUnits.join(', ') || 'None'}</div>
          </div>
          <div style="display: flex; align-items: center; gap: 10px;">
            ${isCustom ? `
              <button class="btn-primary" onclick="event.stopPropagation(); editCategory('${category}')" style="padding: 4px 12px; font-size: 12px;">Edit</button>
              <button class="btn-danger" onclick="event.stopPropagation(); deleteCategory('${category}')" style="padding: 4px 12px; font-size: 12px;">Delete</button>
            ` : ''}
            <span class="collapse-icon" id="category-icon-${category}">▼</span>
          </div>
        </div>
        <div class="collapsible-content" id="category-content-${category}">
          <div id="category-view-${category}">
            <div class="form-group">
              <div class="input-group">
                <label>Target Unit</label>
                <select onchange="updateCategory('${category}', 'targetUnit', this.value)">
                  <option value="">-- Select Unit --</option>
                  ${availableUnits.map(unit => `
                    <option value="${unit}" ${unit === pref.targetUnit ? 'selected' : ''}>${unit}</option>
                  `).join('')}
                </select>
              </div>
              <div class="input-group">
                <label>Display Format</label>
                <input
                  type="text"
                  value="${pref.displayFormat || '0.0'}"
                  onchange="updateCategory('${category}', 'displayFormat', this.value)"
                  placeholder="e.g., 0.0"
                >
              </div>
            </div>
          </div>
          <div id="category-edit-${category}" style="display: none;">
            <!-- Edit form will be inserted here -->
          </div>
        </div>
      </div>
    `
    }).join('')
}

// Extract all SignalK metadata at once
async function getAllSignalKMetadata() {
  try {
    const res = await fetch('/signalk/v1/api/')
    if (!res.ok) return {}
    const data = await res.json()

    const metadataMap = {}

    function extractMeta(obj, prefix = '') {
      if (!obj || typeof obj !== 'object') return

      for (const key in obj) {
        if (key === 'meta' || key === 'timestamp' || key === 'source' || key === '$source' || key === 'values' || key === 'sentence') continue

        const currentPath = prefix ? `${prefix}.${key}` : key

        if (obj[key] && typeof obj[key] === 'object') {
          // Check if this object has meta
          if (obj[key].meta && obj[key].meta.units) {
            metadataMap[currentPath] = obj[key].meta
          }
          extractMeta(obj[key], currentPath)
        }
      }
    }

    const selfId = data.self?.replace('vessels.', '')
    if (data.vessels && selfId && data.vessels[selfId]) {
      extractMeta(data.vessels[selfId])
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
    const hasSignalKMetadata = skMeta && skMeta.units
    const matchingPattern = findMatchingPattern(path)
    const pathOverride = preferences?.pathOverrides?.[path]

    let color, status, baseUnit, category, displayUnit

    if (pathOverride) {
      // Green: Has explicit path override
      color = '#d4edda'
      status = 'Path Override'
      baseUnit = pathOverride.baseUnit || (matchingPattern?.baseUnit) || (skMeta?.units) || '-'
      category = pathOverride.category || (matchingPattern?.category) || '-'
      displayUnit = pathOverride.targetUnit
    } else if (matchingPattern) {
      // Yellow: Matches a pattern rule
      color = '#fff3cd'
      status = `Pattern: ${matchingPattern.pattern}`
      baseUnit = matchingPattern.baseUnit || (unitSchema?.categoryToBaseUnit?.[matchingPattern.category]) || '-'
      category = matchingPattern.category
      const categoryTarget = preferences?.categories?.[matchingPattern.category]?.targetUnit
      displayUnit = matchingPattern.targetUnit || categoryTarget || baseUnit || '-'
    } else if (hasSignalKMetadata) {
      // Blue: Has only SignalK metadata
      color = '#cfe2ff'
      status = 'SignalK Only'
      baseUnit = skMeta.units
      category = '-'
      displayUnit = baseUnit
    } else {
      // Gray: Has neither
      color = '#f8f9fa'
      status = 'None'
      baseUnit = '-'
      category = '-'
      displayUnit = '-'
    }

    pathInfo.push({ path, color, status, baseUnit, category, displayUnit })
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
        info.baseUnit,
        info.category,
        info.displayUnit
      ].join(' ').toLowerCase()

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

  // Update counts
  document.getElementById('overrideCount').textContent = filtered.filter(p => p.status === 'Path Override').length
  document.getElementById('patternCount').textContent = filtered.filter(p => p.status.startsWith('Pattern:')).length
  document.getElementById('signalkCount').textContent = filtered.filter(p => p.status === 'SignalK Only').length
  document.getElementById('noneCount').textContent = filtered.filter(p => p.status === 'None').length

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
        <div style="display: flex; gap: 20px; font-size: 13px; flex-wrap: wrap;">
          <div><span style="display: inline-block; width: 15px; height: 15px; background: #d4edda; border: 1px solid #c3e6cb; margin-right: 5px;"></span> Path Override (<span id="overrideCount">${window.metadataPathInfo.filter(p => p.status === 'Path Override').length}</span>)</div>
          <div><span style="display: inline-block; width: 15px; height: 15px; background: #fff3cd; border: 1px solid #ffc107; margin-right: 5px;"></span> Pattern Match (<span id="patternCount">${window.metadataPathInfo.filter(p => p.status.startsWith('Pattern:')).length}</span>)</div>
          <div><span style="display: inline-block; width: 15px; height: 15px; background: #cfe2ff; border: 1px solid #9ec5fe; margin-right: 5px;"></span> SignalK Only (<span id="signalkCount">${window.metadataPathInfo.filter(p => p.status === 'SignalK Only').length}</span>)</div>
          <div><span style="display: inline-block; width: 15px; height: 15px; background: #f8f9fa; border: 1px solid #dee2e6; margin-right: 5px;"></span> No Metadata (<span id="noneCount">${window.metadataPathInfo.filter(p => p.status === 'None').length}</span>)</div>
        </div>
      </div>
      <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
          <thead>
            <tr style="background: #f8f9fa; border-bottom: 2px solid #dee2e6;">
              <th class="metadata-sortable-header" data-column="path" style="padding: 8px; text-align: left; min-width: 200px; cursor: pointer; user-select: none;">Path<span class="sort-arrow"> ▲</span></th>
              <th class="metadata-sortable-header" data-column="status" style="padding: 8px; text-align: left; width: 150px; cursor: pointer; user-select: none;">Status<span class="sort-arrow"></span></th>
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
  tbody.innerHTML = pathInfo.map(info => {
    const conversionUrl = `${API_BASE}/conversion/${info.path}`
    const currentValue = getCurrentValue(info.path) || 0
    const convertUrl = `${API_BASE}/convert/${info.path}/${currentValue}`

    return `
      <tr style="border-bottom: 1px solid #e9ecef; background: ${info.color};">
        <td style="padding: 8px; font-family: monospace; font-size: 11px; word-break: break-all;">
          ${info.path}
          <a href="${conversionUrl}" target="_blank" title="View conversion info" style="color: #3498db; margin-left: 6px; text-decoration: none; font-size: 14px;">🔧</a>
          <a href="${convertUrl}" target="_blank" title="Test conversion with current value (${currentValue})" style="color: #2ecc71; margin-left: 4px; text-decoration: none; font-size: 14px;">▶️</a>
        </td>
        <td style="padding: 8px; font-size: 11px;">${info.status}</td>
        <td style="padding: 8px;">${info.baseUnit}</td>
        <td style="padding: 8px;">${info.category}</td>
        <td style="padding: 8px; font-weight: bold;">${info.displayUnit}</td>
      </tr>
    `
  }).join('')
}

// Update category preference
async function updateCategory(category, field, value) {
  try {
    const currentPref = preferences.categories?.[category] || { targetUnit: '', displayFormat: '0.0' }
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
  const baseUnit = baseSelect.value === 'custom'
    ? document.getElementById('newCategoryBaseCustom').value.trim()
    : baseSelect.value.trim()

  // Get target unit (from dropdown or custom input)
  const targetUnit = targetSelect.value === 'custom'
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

    // Clear form
    document.getElementById('newCategoryName').value = ''
    document.getElementById('newCategoryFormat').value = '0.0'

    // Reload schema and data to pick up new category
    await loadSchema()
    await loadData()

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

    // Reload schema and data to remove deleted category
    await loadSchema()
    await loadData()

    // Reinitialize dropdowns to remove deleted category
    initializePatternDropdowns()
    initializeCustomCategoryDropdowns()
  } catch (error) {
    showStatus('Failed to delete category: ' + error.message, 'error')
  }
}

// Edit custom category
function editCategory(category) {
  const pref = preferences?.categories?.[category] || {}
  const baseUnit = pref.baseUnit || ''
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
          <label>Base Unit</label>
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
  document.getElementById(`${baseSelectId}-container`).innerHTML = createBaseUnitDropdown(baseSelectId, baseUnit, false)
  document.getElementById(`${targetSelectId}-container`).innerHTML = createTargetUnitDropdown(targetSelectId, baseUnit, targetUnit, false)

  // Handle base unit change to update target units
  document.getElementById(baseSelectId).addEventListener('change', (e) => {
    const newBaseUnit = e.target.value
    document.getElementById(`${targetSelectId}-container`).innerHTML = createTargetUnitDropdown(targetSelectId, newBaseUnit, '', false)
  })

  // Show edit form, hide view
  viewDiv.style.display = 'none'
  editDiv.style.display = 'block'

  // Ensure the content is expanded
  const content = document.getElementById(`category-content-${category}`)
  const icon = document.getElementById(`category-icon-${category}`)
  if (content.classList.contains('collapsed')) {
    content.classList.remove('collapsed')
    icon.classList.remove('collapsed')
  }
}

// Save edited category
async function saveEditCategory(category) {
  const baseSelectId = `edit-base-${category}`
  const targetSelectId = `edit-target-${category}`
  const formatInputId = `edit-format-${category}`

  const baseUnit = document.getElementById(baseSelectId).value
  const targetUnit = document.getElementById(targetSelectId).value
  const displayFormat = document.getElementById(formatInputId).value

  if (!baseUnit || !targetUnit || !displayFormat) {
    showStatus('Please fill in all fields', 'error')
    return
  }

  try {
    const categoryPref = {
      baseUnit,
      targetUnit,
      displayFormat
    }

    const res = await fetch(`${API_BASE}/categories/${category}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(categoryPref)
    })

    if (!res.ok) throw new Error('Failed to update category')

    showStatus(`Updated category: ${category}`, 'success')

    // Reload schema and data
    await loadSchema()
    await loadData()

    // Reinitialize dropdowns
    initializePatternDropdowns()
    initializeCustomCategoryDropdowns()
  } catch (error) {
    showStatus('Failed to update category: ' + error.message, 'error')
  }
}

// Cancel editing category
function cancelEditCategory(category) {
  const viewDiv = document.getElementById(`category-view-${category}`)
  const editDiv = document.getElementById(`category-edit-${category}`)

  // Show view, hide edit form
  viewDiv.style.display = 'block'
  editDiv.style.display = 'none'
}

// Initialize custom category form dropdowns
function initializeCustomCategoryDropdowns() {
  // Render base unit dropdown
  document.getElementById('newCategoryBaseContainer').innerHTML = createBaseUnitDropdown('newCategoryBase', '', true)

  // Initialize target unit dropdown (disabled until base is selected)
  document.getElementById('newCategoryTargetContainer').innerHTML = `
    <select id="newCategoryTarget" disabled>
      <option value="">-- Select Base Unit First --</option>
    </select>
  `

  // Handle base unit change
  document.getElementById('newCategoryBase').addEventListener('change', function() {
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
      targetContainer.innerHTML = createTargetUnitDropdown('newCategoryTarget', this.value, '', true)
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
    targetSelect.addEventListener('change', function() {
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

  // Sort by priority
  const sorted = [...preferences.pathPatterns].sort((a, b) => (b.priority || 0) - (a.priority || 0))

  container.innerHTML = sorted.map((pattern, index) => {
    // Derive base unit: use pattern's baseUnit if present, otherwise from category
    const baseUnit = pattern.baseUnit || unitSchema.categoryToBaseUnit[pattern.category] || '(derived from category)'

    // Get category defaults for display
    const categoryDefault = preferences.categories?.[pattern.category]
    const targetUnit = pattern.targetUnit || categoryDefault?.targetUnit || '(category default)'
    const displayFormat = pattern.displayFormat || categoryDefault?.displayFormat || '(category default)'

    return `
    <div class="override-item">
      <div class="override-header">
        <span class="path-name">${pattern.pattern}</span>
        <button class="btn-danger" onclick="deletePattern(${index})">Delete</button>
      </div>
      <div class="form-group">
        <div class="input-group">
          <label>Category</label>
          <input type="text" value="${pattern.category}" readonly style="background: #f8f9fa;">
        </div>
        <div class="input-group">
          <label>Base Unit</label>
          <input type="text" value="${baseUnit}" readonly style="background: #f8f9fa;" title="${pattern.baseUnit ? 'From pattern' : 'Derived from category'}">
        </div>
        <div class="input-group">
          <label>Target Unit</label>
          <input type="text" value="${targetUnit}" readonly style="background: #f8f9fa;">
        </div>
        <div class="input-group">
          <label>Display Format</label>
          <input type="text" value="${displayFormat}" readonly style="background: #f8f9fa;">
        </div>
        <div class="input-group">
          <label>Priority</label>
          <input type="text" value="${pattern.priority || 0}" readonly style="background: #f8f9fa;">
        </div>
      </div>
    </div>
  `}).join('')
}

// Add new pattern
async function addPattern() {
  const pattern = document.getElementById('newPatternPattern').value.trim()

  // Get category (from dropdown or custom input)
  const categorySelect = document.getElementById('newPatternCategory')
  const category = categorySelect.value === 'custom'
    ? document.getElementById('newPatternCategoryCustom').value.trim()
    : categorySelect.value.trim()

  // Get base unit (optional for known categories, required for custom)
  const baseSelect = document.getElementById('newPatternBase')
  let baseUnit = ''
  if (categorySelect.value === 'custom') {
    baseUnit = baseSelect.value === 'custom'
      ? document.getElementById('newPatternBaseCustom').value.trim()
      : baseSelect.value.trim()
  }

  // Get target unit (optional for known categories, required for custom)
  const targetSelect = document.getElementById('newPatternTarget')
  const targetUnit = targetSelect.value === 'custom'
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
  'K': [
    { unit: 'celsius', formula: 'value - 273.15', inverseFormula: 'value + 273.15', symbol: '°C' },
    { unit: 'fahrenheit', formula: '(value - 273.15) * 9/5 + 32', inverseFormula: '(value - 32) * 5/9 + 273.15', symbol: '°F' }
  ],
  'Pa': [
    { unit: 'hPa', formula: 'value * 0.01', inverseFormula: 'value * 100', symbol: 'hPa' },
    { unit: 'mbar', formula: 'value * 0.01', inverseFormula: 'value * 100', symbol: 'mbar' },
    { unit: 'inHg', formula: 'value * 0.0002953', inverseFormula: 'value * 3386.39', symbol: 'inHg' },
    { unit: 'psi', formula: 'value * 0.000145038', inverseFormula: 'value * 6894.76', symbol: 'psi' }
  ],
  'm': [
    { unit: 'ft', formula: 'value * 3.28084', inverseFormula: 'value * 0.3048', symbol: 'ft' },
    { unit: 'km', formula: 'value * 0.001', inverseFormula: 'value * 1000', symbol: 'km' },
    { unit: 'nm', formula: 'value * 0.000539957', inverseFormula: 'value * 1852', symbol: 'nm' },
    { unit: 'mi', formula: 'value * 0.000621371', inverseFormula: 'value * 1609.34', symbol: 'mi' },
    { unit: 'fathom', formula: 'value * 0.546807', inverseFormula: 'value * 1.8288', symbol: 'fathom' }
  ],
  'rad': [
    { unit: 'deg', formula: 'value * 57.2958', inverseFormula: 'value * 0.0174533', symbol: '°' }
  ],
  'm3': [
    { unit: 'L', formula: 'value * 1000', inverseFormula: 'value * 0.001', symbol: 'L' },
    { unit: 'gal', formula: 'value * 264.172', inverseFormula: 'value * 0.00378541', symbol: 'gal' },
    { unit: 'gal(UK)', formula: 'value * 219.969', inverseFormula: 'value * 0.00454609', symbol: 'gal(UK)' }
  ],
  'V': [
    { unit: 'mV', formula: 'value * 1000', inverseFormula: 'value * 0.001', symbol: 'mV' }
  ],
  'A': [
    { unit: 'mA', formula: 'value * 1000', inverseFormula: 'value * 0.001', symbol: 'mA' }
  ],
  'W': [
    { unit: 'kW', formula: 'value * 0.001', inverseFormula: 'value * 1000', symbol: 'kW' },
    { unit: 'hp', formula: 'value * 0.00134102', inverseFormula: 'value * 745.7', symbol: 'hp' }
  ],
  'Hz': [
    { unit: 'rpm', formula: 'value * 60', inverseFormula: 'value / 60', symbol: 'rpm' }
  ],
  'ratio': [
    { unit: 'percent', formula: 'value * 100', inverseFormula: 'value * 0.01', symbol: '%' }
  ],
  's': [
    { unit: 'min', formula: 'value / 60', inverseFormula: 'value * 60', symbol: 'min' },
    { unit: 'h', formula: 'value / 3600', inverseFormula: 'value * 3600', symbol: 'h' },
    { unit: 'days', formula: 'value / 86400', inverseFormula: 'value * 86400', symbol: 'd' }
  ],
  'C': [
    { unit: 'Ah', formula: 'value / 3600', inverseFormula: 'value * 3600', symbol: 'Ah' },
    { unit: 'mAh', formula: 'value / 3.6', inverseFormula: 'value * 3.6', symbol: 'mAh' }
  ],
  'deg': [
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
    templateSelect.innerHTML = '<option value="">-- Select Conversion --</option><option value="custom">✏️ Custom Conversion...</option>'
  } else {
    customInput.style.display = 'none'
    // Populate conversion templates based on base unit
    const templates = conversionTemplates[select.value] || []
    templateSelect.innerHTML = '<option value="">-- Select Conversion --</option>' +
      templates.map((t, i) => `<option value="${i}">${select.value} → ${t.unit} (${t.symbol})</option>`).join('') +
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

  container.innerHTML = Object.entries(currentMetadataConversions).map(([unit, conv]) => `
    <div style="display: flex; gap: 10px; align-items: center; padding: 8px; background: #f8f9fa; border-radius: 4px; margin-bottom: 5px;">
      <span style="flex: 1;"><strong>${unit}</strong>: ${conv.formula} (${conv.symbol})</span>
      <button onclick="removeConversion('${unit}')" style="background: #e74c3c; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer;">Remove</button>
    </div>
  `).join('')
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
  const baseUnit = baseUnitSelect === 'custom'
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
    const res = await fetch(`${API_BASE}/unit-definitions/${baseUnit}/conversions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetUnit,
        formula,
        inverseFormula,
        symbol
      })
    })

    if (!res.ok) throw new Error('Failed to add conversion')

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

  const defs = Object.entries(unitDefinitions)
  console.log('Rendering unit definitions, count:', defs.length)

  if (defs.length === 0) {
    container.innerHTML = '<div class="empty-state">No custom unit definitions yet</div>'
    return
  }

  container.innerHTML = defs.map(([baseUnit, def]) => {
    console.log(`Rendering baseUnit: ${baseUnit}, category: ${def.category}`)
    const conversions = Object.entries(def.conversions || {})
    const isCustom = def.isCustom === true
    const badge = isCustom
      ? '<span style="background: #667eea; color: white; padding: 2px 8px; border-radius: 3px; font-size: 11px; margin-left: 8px;">CUSTOM</span>'
      : '<span style="background: #6c757d; color: white; padding: 2px 8px; border-radius: 3px; font-size: 11px; margin-left: 8px;">CORE</span>'

    return `
      <div class="unit-definition-item" style="margin-bottom: 15px;">
        <div class="collapsible-header" onclick="toggleUnitItem('${baseUnit}')">
          <div>
            <h3 style="margin: 0; font-family: monospace;">${baseUnit}${badge}</h3>
            <p style="margin: 5px 0 0 0; color: #7f8c8d; font-size: 14px;">${def.category || baseUnit}</p>
          </div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <button class="btn-primary" onclick="event.stopPropagation(); editBaseUnit('${baseUnit}')" style="padding: 4px 12px; font-size: 12px;">Edit</button>
            <button class="btn-danger" onclick="event.stopPropagation(); deleteBaseUnit('${baseUnit}')" style="padding: 4px 12px; font-size: 12px;">Delete</button>
            <span class="collapse-icon" id="unit-icon-${baseUnit}">▼</span>
          </div>
        </div>
        <div class="collapsible-content" id="unit-content-${baseUnit}">
          <div id="unit-view-${baseUnit}">
            ${conversions.length > 0 ? `
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
                  <tbody id="conversions-tbody-${baseUnit}">
                    ${conversions.map(([target, conv]) => `
                      <tr id="conversion-row-${baseUnit}-${target}" style="border-bottom: 1px solid #f0f0f0;">
                        <td style="padding: 8px; font-family: monospace;">${target}</td>
                        <td style="padding: 8px; font-family: monospace; font-size: 12px;">${conv.formula}</td>
                        <td style="padding: 8px; font-family: monospace; font-size: 12px;">${conv.inverseFormula}</td>
                        <td style="padding: 8px;">${conv.symbol}</td>
                        <td style="padding: 8px;">
                          <button class="btn-primary" onclick="editConversion('${baseUnit}', '${target}')" style="padding: 4px 12px; font-size: 12px; margin-right: 5px;">Edit</button>
                          <button class="btn-danger" onclick="deleteConversion('${baseUnit}', '${target}')" style="padding: 4px 12px; font-size: 12px;">Delete</button>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            ` : '<p style="color: #7f8c8d; font-style: italic;">No conversions defined yet</p>'}
          </div>
          <div id="unit-edit-${baseUnit}" style="display: none;">
            <!-- Edit form will be inserted here -->
          </div>
        </div>
      </div>
    `
  }).join('')
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
    const res = await fetch(`${API_BASE}/unit-definitions/${baseUnit}`, {
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
    const res = await fetch(`${API_BASE}/unit-definitions/${baseUnit}/conversions/${targetUnit}`, {
      method: 'DELETE'
    })

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
  const content = document.getElementById(`unit-content-${baseUnit}`)
  const icon = document.getElementById(`unit-icon-${baseUnit}`)

  if (content && icon) {
    content.classList.toggle('collapsed')
    icon.classList.toggle('collapsed')
  }
}

// Edit base unit
function editBaseUnit(baseUnit) {
  const def = unitDefinitions[baseUnit] || {}
  const description = def.category || ''

  const viewDiv = document.getElementById(`unit-view-${baseUnit}`)
  const editDiv = document.getElementById(`unit-edit-${baseUnit}`)

  const symbolInputId = `edit-unit-symbol-${baseUnit}`
  const descInputId = `edit-unit-desc-${baseUnit}`

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
  const content = document.getElementById(`unit-content-${baseUnit}`)
  const icon = document.getElementById(`unit-icon-${baseUnit}`)
  if (content.classList.contains('collapsed')) {
    content.classList.remove('collapsed')
    icon.classList.remove('collapsed')
  }
}

// Save edited base unit
async function saveEditBaseUnit(baseUnit) {
  const descInputId = `edit-unit-desc-${baseUnit}`
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
  const viewDiv = document.getElementById(`unit-view-${baseUnit}`)
  const editDiv = document.getElementById(`unit-edit-${baseUnit}`)

  viewDiv.style.display = 'block'
  editDiv.style.display = 'none'
}

// Edit conversion
function editConversion(baseUnit, targetUnit) {
  const conv = unitDefinitions[baseUnit]?.conversions?.[targetUnit] || {}

  const rowId = `conversion-row-${baseUnit}-${targetUnit}`
  const row = document.getElementById(rowId)

  if (!row) return

  const editRowId = `conversion-edit-${baseUnit}-${targetUnit}`
  const targetInputId = `edit-conv-target-${baseUnit}-${targetUnit}`
  const formulaInputId = `edit-conv-formula-${baseUnit}-${targetUnit}`
  const inverseInputId = `edit-conv-inverse-${baseUnit}-${targetUnit}`
  const symbolInputId = `edit-conv-symbol-${baseUnit}-${targetUnit}`

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
  const formulaInputId = `edit-conv-formula-${baseUnit}-${targetUnit}`
  const inverseInputId = `edit-conv-inverse-${baseUnit}-${targetUnit}`
  const symbolInputId = `edit-conv-symbol-${baseUnit}-${targetUnit}`

  const formula = document.getElementById(formulaInputId).value.trim()
  const inverseFormula = document.getElementById(inverseInputId).value.trim()
  const symbol = document.getElementById(symbolInputId).value.trim()

  if (!formula || !inverseFormula || !symbol) {
    showStatus('Please fill in all fields', 'error')
    return
  }

  try {
    // Use POST to overwrite the existing conversion
    const res = await fetch(`${API_BASE}/unit-definitions/${baseUnit}/conversions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetUnit,
        formula,
        inverseFormula,
        symbol
      })
    })

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
  const rowId = `conversion-row-${baseUnit}-${targetUnit}`
  const editRowId = `conversion-edit-${baseUnit}-${targetUnit}`

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
      ${baseUnits.map(unit => `
        <option value="${unit.value}">${unit.label}</option>
      `).join('')}
    </select>
  `
}

// ============================================================================
// PATH OVERRIDES TAB
// ============================================================================

// Path overrides list
let pathOverrides = {}

// Add a path override
async function addPathOverride() {
  const path = document.getElementById('selectedOverridePath').value.trim()
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
        targetUnit,
        displayFormat: format
      })
    })

    if (!res.ok) throw new Error('Failed to add override')

    showStatus(`Added path override: ${path}`, 'success')

    // Clear form
    document.getElementById('selectedOverridePath').value = ''
    document.getElementById('overridePathSearch').value = ''
    document.getElementById('overrideFormat').value = '0.0'

    // Reload
    await loadData()
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

  container.innerHTML = overrides.map(override => {
    const conversionUrl = `${API_BASE}/conversion/${override.path}`
    const currentValue = getCurrentValue(override.path) || 0
    const convertUrl = `${API_BASE}/convert/${override.path}/${currentValue}`

    return `
      <div class="override-item">
        <div class="override-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="path-name">${override.path}</span>
            <a href="${conversionUrl}" target="_blank" title="View conversion info" style="color: #3498db; font-size: 14px; text-decoration: none;">🔧</a>
            <a href="${convertUrl}" target="_blank" title="Test conversion with current value (${currentValue})" style="color: #2ecc71; font-size: 14px; text-decoration: none;">▶️</a>
          </div>
          <button class="btn-danger" onclick="deletePathOverride('${override.path}')">Delete</button>
        </div>
        <div class="form-group">
          <div class="input-group">
            <label>Target Unit</label>
            <input type="text" value="${override.targetUnit}" readonly style="background: #f8f9fa;">
          </div>
          <div class="input-group">
            <label>Display Format</label>
            <input type="text" value="${override.displayFormat}" readonly style="background: #f8f9fa;">
          </div>
        </div>
      </div>
    `
  }).join('')
}

// Delete path override
async function deletePathOverride(path) {
  if (!confirm(`Delete path override for "${path}"?`)) return

  try {
    const res = await fetch(`${API_BASE}/overrides/${path}`, {
      method: 'DELETE'
    })

    if (!res.ok) throw new Error('Failed to delete')

    showStatus(`Deleted path override: ${path}`, 'success')
    await loadData()
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
    document.getElementById('overrideBaseUnit').addEventListener('change', function() {
      const targetContainer = document.getElementById('overrideTargetUnitContainer')
      if (this.value) {
        targetContainer.innerHTML = createTargetUnitDropdown('overrideTargetUnit', this.value, '', false)
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
}
