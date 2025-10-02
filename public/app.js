const API_BASE = '/plugins/signalk-units-preference'

let preferences = null
let metadata = null
let availablePaths = []
let pathTree = {}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  setupTabs()
  await loadData()
  await loadPaths()
})

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

  if (!preferences || !preferences.categories || Object.keys(preferences.categories).length === 0) {
    container.innerHTML = '<div class="empty-state">No category preferences configured</div>'
    return
  }

  container.innerHTML = Object.entries(preferences.categories)
    .map(([category, pref]) => {
      const availableUnits = getAvailableUnitsForCategory(category)

      return `
      <div class="category-item">
        <div class="category-header">
          <span class="category-name">${category}</span>
          <span style="color: #7f8c8d; font-size: 13px;">Available: ${availableUnits.join(', ') || 'None'}</span>
        </div>
        <div class="form-group">
          <div class="input-group">
            <label>Target Unit</label>
            <select onchange="updateCategory('${category}', 'targetUnit', this.value)">
              ${availableUnits.map(unit => `
                <option value="${unit}" ${unit === pref.targetUnit ? 'selected' : ''}>${unit}</option>
              `).join('')}
            </select>
          </div>
          <div class="input-group">
            <label>Display Format</label>
            <input
              type="text"
              value="${pref.displayFormat}"
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
      baseUnit = matchingPattern.baseUnit
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
    const currentPref = preferences.categories[category]
    const updatedPref = { ...currentPref, [field]: value }

    const res = await fetch(`${API_BASE}/categories/${category}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedPref)
    })

    if (!res.ok) throw new Error('Failed to update')

    preferences.categories[category] = updatedPref
    showStatus(`Updated ${category} preference`, 'success')
  } catch (error) {
    showStatus('Failed to update: ' + error.message, 'error')
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

  container.innerHTML = sorted.map((pattern, index) => `
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
          <input type="text" value="${pattern.baseUnit}" readonly style="background: #f8f9fa;">
        </div>
        <div class="input-group">
          <label>Target Unit</label>
          <input type="text" value="${pattern.targetUnit}" readonly style="background: #f8f9fa;">
        </div>
        <div class="input-group">
          <label>Display Format</label>
          <input type="text" value="${pattern.displayFormat}" readonly style="background: #f8f9fa;">
        </div>
        <div class="input-group">
          <label>Priority</label>
          <input type="text" value="${pattern.priority || 0}" readonly style="background: #f8f9fa;">
        </div>
      </div>
    </div>
  `).join('')
}

// Add new pattern
async function addPattern() {
  const pattern = document.getElementById('newPatternPattern').value.trim()
  const category = document.getElementById('newPatternCategory').value.trim()
  const baseUnit = document.getElementById('newPatternBase').value.trim()
  const targetUnit = document.getElementById('newPatternUnit').value.trim()
  const displayFormat = document.getElementById('newPatternFormat').value.trim()
  const priority = parseInt(document.getElementById('newPatternPriority').value) || 100

  if (!pattern || !category || !baseUnit || !targetUnit || !displayFormat) {
    showStatus('Please fill in all fields', 'error')
    return
  }

  try {
    const res = await fetch(`${API_BASE}/patterns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pattern, category, baseUnit, targetUnit, displayFormat, priority })
    })

    if (!res.ok) throw new Error('Failed to add pattern')

    // Clear inputs
    document.getElementById('newPatternPattern').value = ''
    document.getElementById('newPatternCategory').value = ''
    document.getElementById('newPatternBase').value = ''
    document.getElementById('newPatternUnit').value = ''
    document.getElementById('newPatternFormat').value = ''
    document.getElementById('newPatternPriority').value = '100'

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
