/* eslint-disable no-unused-vars, @typescript-eslint/no-unused-vars */

/**
 * app-overrides.js
 *
 * Path Overrides Tab
 * Functions for managing path-specific unit overrides
 */

// ============================================================================
// PATH OVERRIDE CRUD OPERATIONS
// ============================================================================

// Add a path override
async function addPathOverride() {
  const path = document.getElementById('overridePathInput').value.trim()
  const baseSelect = document.getElementById('overrideBaseUnit')
  const categorySelect = document.getElementById('overrideCategory')
  const targetSelect = document.getElementById('overrideTargetUnit')
  const format = document.getElementById('overrideFormat').value.trim()

  const baseUnit = baseSelect.value.trim()
  const category = categorySelect?.value?.trim() || ''
  const targetUnit = targetSelect.value.trim()

  if (!path || !baseUnit || !targetUnit || !format) {
    showStatus('Please fill in all fields', 'error')
    return
  }

  try {
    const overrideData = {
      path,
      baseUnit,
      targetUnit,
      displayFormat: format
    }

    // Include category if specified
    if (category) {
      overrideData.category = category
    }

    await apiCreateOverride(path, overrideData)

    // Update local preferences
    if (!preferences.pathOverrides) {
      preferences.pathOverrides = {}
    }
    preferences.pathOverrides[path] = overrideData

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
      const conversionUrl = `${API_BASE}/conversions/${override.path}`
      const currentValue = getCurrentValue(override.path) || 0
      const convertUrl = `${API_BASE}/conversions/${override.path}?value=${encodeURIComponent(currentValue)}`
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
      const conversion = await apiGetConversionForPath(path)
      baseUnit = conversion.baseUnit || 'auto'
    } catch (error) {
      baseUnit = 'auto'
    }
  }

  const targetUnit = override.targetUnit || 'none'
  const displayFormat = override.displayFormat || '0.0'

  const baseSelectId = `edit-override-base-${safePath}`
  const categorySelectId = `edit-override-category-${safePath}`
  const targetSelectId = `edit-override-target-${safePath}`
  const formatInputId = `edit-override-format-${safePath}`
  const escapedPath = path.replace(/'/g, "\\'")

  editDiv.innerHTML = `
    <div style="background: #fff3cd; padding: 16px; border-radius: 6px; margin-top: 12px;">
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 16px; margin-bottom: 12px;">
        <div>
          <label style="display: block; font-weight: 500; margin-bottom: 6px; font-size: 13px;">Base Unit</label>
          <div id="${baseSelectId}-container"></div>
        </div>
        <div>
          <label style="display: block; font-weight: 500; margin-bottom: 6px; font-size: 13px;">Category</label>
          <div id="${categorySelectId}-container"></div>
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

  // Populate category dropdown using helper
  await populateSmartCategoryDropdown(baseUnit, `${categorySelectId}-container`, categorySelectId, '', false)

  document.getElementById(`${targetSelectId}-container`).innerHTML = createTargetUnitDropdown(
    targetSelectId,
    baseUnit,
    targetUnit,
    false
  )

  // Handle base unit change to update category and target units
  document.getElementById(baseSelectId).addEventListener('change', async (e) => {
    const newBaseUnit = e.target.value

    // Update category dropdown
    await populateSmartCategoryDropdown(newBaseUnit, `${categorySelectId}-container`, categorySelectId, '', false)

    // Update target units
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
  const categorySelectId = `edit-override-category-${safePath}`
  const targetSelectId = `edit-override-target-${safePath}`
  const formatInputId = `edit-override-format-${safePath}`

  const baseUnit = document.getElementById(baseSelectId).value
  const category = document.getElementById(categorySelectId)?.value?.trim() || ''
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

    // Include category if specified
    if (category) {
      overridePref.category = category
    }

    await apiUpdateOverride(path, overridePref)

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
    await apiDeleteOverride(path)

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

// ============================================================================
// INITIALIZATION
// ============================================================================

// Initialize Path Overrides dropdowns
function initializePathOverridesDropdowns() {
  // Base unit dropdown
  const baseContainer = document.getElementById('overrideBaseUnitContainer')
  if (baseContainer) {
    baseContainer.innerHTML = createBaseUnitDropdown('overrideBaseUnit', '', false)

    // Handle base unit change - update category dropdown
    document.getElementById('overrideBaseUnit').addEventListener('change', async function () {
      const baseUnit = this.value
      const targetContainer = document.getElementById('overrideTargetUnitContainer')

      if (!baseUnit) {
        await populateSmartCategoryDropdown('', 'overrideCategoryContainer', 'overrideCategory', '', false)
        targetContainer.innerHTML = `
          <select id="overrideTargetUnit" disabled>
            <option value="">-- Select Base Unit First --</option>
          </select>
        `
        return
      }

      // Use helper function to populate category dropdown
      await populateSmartCategoryDropdown(baseUnit, 'overrideCategoryContainer', 'overrideCategory', '', false)

      // Update target unit dropdown
      targetContainer.innerHTML = createTargetUnitDropdown('overrideTargetUnit', baseUnit, '', false)
    })
  }

  // Initialize category dropdown (disabled initially)
  const categoryContainer = document.getElementById('overrideCategoryContainer')
  if (categoryContainer) {
    categoryContainer.innerHTML = `
      <select id="overrideCategory" disabled>
        <option value="">-- Select Base Unit First --</option>
      </select>
    `
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

// ============================================================================
// INTEGRATION WITH OTHER TABS
// ============================================================================

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
