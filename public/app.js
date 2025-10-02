const API_BASE = '/plugins/signalk-units-preference'

let preferences = null
let metadata = null
let availablePaths = []
let pathTree = {}

// Unit schema data (loaded from server)
let unitSchema = {
  baseUnits: [],
  categories: [],
  targetUnitsByBase: {},
  categoryToBaseUnit: {}
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
  initializePatternDropdowns()
  initializeCustomCategoryDropdowns()
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
        <div class="category-header">
          <span class="category-name">${category}${isCustom ? ' <span style="color: #667eea; font-size: 12px;">(custom)</span>' : ''}</span>
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="color: #7f8c8d; font-size: 13px;">Base: ${baseUnit} | Available: ${availableUnits.join(', ') || 'None'}</span>
            ${isCustom ? `<button class="btn-danger" onclick="deleteCategory('${category}')" style="padding: 4px 12px; font-size: 12px;">Delete</button>` : ''}
          </div>
        </div>
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
    const hasAppMetadata = metadata && metadata[path]
    const skMeta = signalKMetadata[path]
    const hasSignalKMetadata = skMeta && skMeta.units
    const matchingPattern = findMatchingPattern(path)

    let color, status, baseUnit, category, conversions

    if (hasAppMetadata) {
      // Green: Has extended metadata from our app
      color = '#d4edda'
      status = 'Extended'
      baseUnit = metadata[path].baseUnit
      category = metadata[path].category
      conversions = Object.keys(metadata[path].conversions).join(', ')
    } else if (matchingPattern) {
      // Yellow: Matches a pattern rule
      color = '#fff3cd'
      status = `Pattern: ${matchingPattern.pattern}`
      baseUnit = matchingPattern.baseUnit || (unitSchema?.categoryToBaseUnit?.[matchingPattern.category]) || '-'
      category = matchingPattern.category
      conversions = 'Auto from pattern'
    } else if (hasSignalKMetadata) {
      // Blue: Has only SignalK metadata
      color = '#cfe2ff'
      status = 'SignalK Only'
      baseUnit = skMeta.units
      category = '-'
      conversions = '-'
    } else {
      // Gray: Has neither
      color = '#f8f9fa'
      status = 'None'
      baseUnit = '-'
      category = '-'
      conversions = '-'
    }

    pathInfo.push({ path, color, status, baseUnit, category, conversions })
  }

  // Render table
  container.innerHTML = `
    <div style="margin-bottom: 15px;">
      <div style="display: flex; gap: 20px; font-size: 13px;">
        <div><span style="display: inline-block; width: 15px; height: 15px; background: #d4edda; border: 1px solid #c3e6cb; margin-right: 5px;"></span> Extended Metadata (${pathInfo.filter(p => p.status === 'Extended').length})</div>
        <div><span style="display: inline-block; width: 15px; height: 15px; background: #fff3cd; border: 1px solid #ffc107; margin-right: 5px;"></span> Pattern Match (${pathInfo.filter(p => p.status.startsWith('Pattern:')).length})</div>
        <div><span style="display: inline-block; width: 15px; height: 15px; background: #cfe2ff; border: 1px solid #9ec5fe; margin-right: 5px;"></span> SignalK Only (${pathInfo.filter(p => p.status === 'SignalK Only').length})</div>
        <div><span style="display: inline-block; width: 15px; height: 15px; background: #f8f9fa; border: 1px solid #dee2e6; margin-right: 5px;"></span> No Metadata (${pathInfo.filter(p => p.status === 'None').length})</div>
      </div>
    </div>
    <div style="overflow-x: auto;">
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background: #f8f9fa; border-bottom: 2px solid #dee2e6;">
            <th style="padding: 12px; text-align: left;">Path</th>
            <th style="padding: 12px; text-align: left;">Status</th>
            <th style="padding: 12px; text-align: left;">Base Unit</th>
            <th style="padding: 12px; text-align: left;">Category</th>
            <th style="padding: 12px; text-align: left;">Conversions</th>
          </tr>
        </thead>
        <tbody>
          ${pathInfo.map(info => `
            <tr style="border-bottom: 1px solid #e9ecef; background: ${info.color};">
              <td style="padding: 12px; font-family: monospace; font-size: 13px;">${info.path}</td>
              <td style="padding: 12px; font-size: 12px;">${info.status}</td>
              <td style="padding: 12px;">${info.baseUnit}</td>
              <td style="padding: 12px;">${info.category}</td>
              <td style="padding: 12px; font-size: 13px;">${info.conversions}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `
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
