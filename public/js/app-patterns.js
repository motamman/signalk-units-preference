/**
 * Path Patterns Tab functionality
 * Depends on: app-state.js, app-utils.js, app-dropdowns.js
 */

/**
 * Initialize dropdown handlers for add pattern form
 */
function initializePatternDropdowns() {
  // Initialize base unit dropdown (now shown by default as optional)
  document.getElementById('newPatternBaseContainer').innerHTML = createBaseUnitDropdown(
    'newPatternBase',
    '',
    true // includeCustom
  )

  // Render category dropdown (with custom option)
  document.getElementById('newPatternCategoryContainer').innerHTML = createCategoryDropdown(
    'newPatternCategory',
    '',
    true
  )

  // Target unit starts disabled until category is selected
  document.getElementById('newPatternTargetContainer').innerHTML = `
    <select id="newPatternTarget" disabled>
      <option value="">Select category first</option>
    </select>
  `

  // Handle base unit change (smart category filtering)
  document.getElementById('newPatternBase').addEventListener('change', async function () {
    const baseUnit = this.value
    const categoryCustomInput = document.getElementById('newPatternCategoryCustom')

    if (baseUnit === 'custom') {
      // Show custom base unit input
      document.getElementById('newPatternBaseCustom').style.display = 'block'
      return
    } else {
      document.getElementById('newPatternBaseCustom').style.display = 'none'
    }

    // Use helper function to populate smart category dropdown
    await populateSmartCategoryDropdown(
      baseUnit,
      'newPatternCategoryContainer',
      'newPatternCategory',
      '',
      true
    )
    categoryCustomInput.style.display = 'none'
    attachCategoryHandler()

    // Trigger category change to populate target units if category was auto-selected
    const categorySelect = document.getElementById('newPatternCategory')
    if (categorySelect && categorySelect.value) {
      categorySelect.dispatchEvent(new Event('change'))
    }
  })

  // Handle category change
  function attachCategoryHandler() {
    document.getElementById('newPatternCategory').addEventListener('change', function () {
      const targetContainer = document.getElementById('newPatternTargetContainer')
      const categoryCustomInput = document.getElementById('newPatternCategoryCustom')
      const targetLabel = document.getElementById('targetUnitLabel')
      const targetHelp = document.getElementById('targetUnitHelp')

      if (this.value === 'custom') {
        // Custom category - show custom category input
        categoryCustomInput.style.display = 'block'
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
      } else if (this.value === '' || !this.value) {
        // No category selected
        categoryCustomInput.style.display = 'none'
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
  }

  // Attach handlers initially
  attachCategoryHandler()
  attachTargetUnitHandler()
}

/**
 * Helper to attach target unit custom input handler
 */
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

/**
 * Render all path patterns
 */
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

/**
 * Add a new path pattern
 */
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

    // Reload data (requires app.js loadData function)
    if (typeof loadData === 'function') {
      await loadData()
    }
    showStatus(`Added pattern ${pattern}`, 'success')
  } catch (error) {
    showStatus('Failed to add pattern: ' + error.message, 'error')
  }
}

/**
 * Edit an existing pattern
 */
async function editPattern(index) {
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
          <label>Base Unit (optional)</label>
          <div id="edit-pattern-base-container-${index}"></div>
        </div>
        <div class="input-group">
          <label>Category</label>
          <div id="edit-pattern-category-container-${index}"></div>
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
  const baseUnitLabel = pattern.baseUnit
    ? `-- None (uses category default) --`
    : `-- Use Category Default --`
  const emptySelected = !pattern.baseUnit ? 'selected' : ''
  document.getElementById(`edit-pattern-base-container-${index}`).innerHTML = `
    <select id="edit-pattern-base-${index}">
      <option value="" ${emptySelected}>${baseUnitLabel}</option>
      ${baseOptions}
    </select>
  `

  // Populate category dropdown using helper
  await populateSmartCategoryDropdown(
    pattern.baseUnit || '',
    `edit-pattern-category-container-${index}`,
    `edit-pattern-category-${index}`,
    pattern.category,
    false
  )

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

  // Handle base unit change to update category and target units
  document.getElementById(`edit-pattern-base-${index}`).addEventListener('change', async e => {
    const selectedBase = e.target.value

    // Update category dropdown
    const currentCategory = document.getElementById(`edit-pattern-category-${index}`)?.value || ''
    await populateSmartCategoryDropdown(
      selectedBase,
      `edit-pattern-category-container-${index}`,
      `edit-pattern-category-${index}`,
      currentCategory,
      false
    )

    // Update target units
    const baseForTargets = selectedBase || unitSchema.categoryToBaseUnit[currentCategory] || ''
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

/**
 * Save edited pattern
 */
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

    // Reload data and re-render (requires app.js loadData function)
    if (typeof loadData === 'function') {
      await loadData()
    }
    renderPatterns()
  } catch (error) {
    showStatus('Failed to update pattern: ' + error.message, 'error')
  }
}

/**
 * Cancel editing a pattern
 */
function cancelEditPattern(index) {
  const viewDiv = document.getElementById(`pattern-view-${index}`)
  const editDiv = document.getElementById(`pattern-edit-${index}`)

  viewDiv.style.display = 'flex'
  editDiv.style.display = 'none'
}

/**
 * Delete a pattern
 */
async function deletePattern(index) {
  const pattern = preferences.pathPatterns[index]
  if (!confirm(`Delete pattern ${pattern.pattern}?`)) return

  try {
    const res = await fetch(`${API_BASE}/patterns/${index}`, {
      method: 'DELETE'
    })

    if (!res.ok) throw new Error('Failed to delete')

    // Reload data (requires app.js loadData function)
    if (typeof loadData === 'function') {
      await loadData()
    }
    showStatus(`Deleted pattern ${pattern.pattern}`, 'success')
  } catch (error) {
    showStatus('Failed to delete: ' + error.message, 'error')
  }
}

/**
 * Create a pattern from a SignalK path (called from metadata tab)
 */
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
