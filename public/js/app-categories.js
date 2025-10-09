/* eslint-disable no-unused-vars, @typescript-eslint/no-unused-vars */

/**
 * app-categories.js
 *
 * Categories Tab and Preset Management
 * Functions for managing category preferences and unit system presets
 */

// ============================================================================
// PRESET STATE MANAGEMENT
// ============================================================================

// Track original form state for dirty checking
let categoryFormOriginalState = null
let currentlyEditingCategory = null

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
      current.displayFormat !== original.displayFormat ||
      current.baseUnit !== original.baseUnit
    ) {
      return true
    }
  }

  return false
}

// ============================================================================
// PRESET RENDERING
// ============================================================================

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

// ============================================================================
// CATEGORY CRUD OPERATIONS
// ============================================================================

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

// Update category preference
async function updateCategory(category, field, value) {
  try {
    const currentPref = preferences.categories?.[category] || {
      targetUnit: '',
      displayFormat: '0.0'
    }
    const updatedPref = { ...currentPref, [field]: value }

    await apiUpdateCategory(category, updatedPref)

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

    await apiUpdateCategory(categoryName, categoryPref)

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
    await apiDeleteCategory(category)

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

// Check if category form is dirty (has unsaved changes)
function isCategoryFormDirty() {
  if (!categoryFormOriginalState || !currentlyEditingCategory) return false

  const baseSelectId = `edit-base-${currentlyEditingCategory}`
  const targetSelectId = `edit-target-${currentlyEditingCategory}`
  const formatInputId = `edit-format-${currentlyEditingCategory}`

  const baseSelect = document.getElementById(baseSelectId)
  const targetSelect = document.getElementById(targetSelectId)
  const formatInput = document.getElementById(formatInputId)

  if (!baseSelect || !targetSelect || !formatInput) return false

  return (
    baseSelect.value !== categoryFormOriginalState.baseUnit ||
    targetSelect.value !== categoryFormOriginalState.targetUnit ||
    formatInput.value !== categoryFormOriginalState.displayFormat
  )
}

// Edit custom category
function editCategory(category) {
  // Check if there's an open form with unsaved changes
  if (currentlyEditingCategory && currentlyEditingCategory !== category && isCategoryFormDirty()) {
    if (
      !confirm(
        `You have unsaved changes for "${currentlyEditingCategory}". Discard changes and edit "${category}" instead?`
      )
    ) {
      return
    }
  }

  // Close any other open edit forms
  document.querySelectorAll('.category-item [id^="category-edit-"]').forEach(editDiv => {
    if (editDiv.style.display === 'block') {
      const viewId = editDiv.id.replace('category-edit-', 'category-view-')
      const viewDiv = document.getElementById(viewId)
      if (viewDiv) {
        viewDiv.style.display = 'flex'
      }
      editDiv.style.display = 'none'
    }
  })

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

  // Store original state for dirty checking AFTER form is populated
  // Use setTimeout to ensure dropdowns are rendered
  currentlyEditingCategory = category
  setTimeout(() => {
    const baseSelect = document.getElementById(baseSelectId)
    const targetSelect = document.getElementById(targetSelectId)
    const formatInput = document.getElementById(formatInputId)

    categoryFormOriginalState = {
      baseUnit: baseSelect?.value || '',
      targetUnit: targetSelect?.value || '',
      displayFormat: formatInput?.value || ''
    }
  }, 0)
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

    await apiUpdateCategory(category, categoryPref)

    // Update local preferences
    if (!preferences.categories) {
      preferences.categories = {}
    }
    preferences.categories[category] = categoryPref

    showStatus(`Updated category: ${category}`, 'success')

    // Clear dirty tracking
    categoryFormOriginalState = null
    currentlyEditingCategory = null

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
  // Check for unsaved changes
  if (isCategoryFormDirty()) {
    if (!confirm(`Discard unsaved changes for "${category}"?`)) {
      return
    }
  }

  const viewDiv = document.getElementById(`category-view-${category}`)
  const editDiv = document.getElementById(`category-edit-${category}`)

  // Clear dirty tracking
  categoryFormOriginalState = null
  currentlyEditingCategory = null

  // Show view, hide edit form
  viewDiv.style.display = 'flex'
  editDiv.style.display = 'none'
}

// ============================================================================
// PRESET OPERATIONS
// ============================================================================

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
    // Ensure custom categories include baseUnit and category fields
    const categoriesToSave = {}
    for (const [category, pref] of Object.entries(preferences.categories)) {
      const isCustomCategory = !unitSchema.coreCategories?.includes(category)
      categoriesToSave[category] = {
        ...pref,
        // Include category field for all categories
        category: pref.category || category,
        // Include baseUnit if it exists, or infer it for custom categories
        ...(pref.baseUnit || isCustomCategory
          ? { baseUnit: pref.baseUnit || unitSchema.categoryToBaseUnit[category] || null }
          : {})
      }
    }

    // Create preset data
    const presetData = {
      name: presetName,
      categories: categoriesToSave
    }

    const result = await apiSaveCustomPreset(presetName, presetData)

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
    const customPresets = await apiLoadCustomPresets()
    renderCustomPresets(customPresets)
  } catch (error) {
    showStatus('Failed to load custom presets: ' + error.message, 'error')
  }
}

// Render custom presets as file download/upload items
function renderCustomPresets(customPresets) {
  const container = document.getElementById('customPresetsFileList')

  if (!container) return

  if (customPresets.length === 0) {
    container.innerHTML =
      '<div class="empty-state" style="color: #7f8c8d; font-size: 14px; padding: 20px; text-align: center; background: #f8f9fa; border-radius: 6px;">No custom presets yet. Create one from the Categories tab.</div>'
    return
  }

  container.innerHTML = customPresets
    .map(
      preset => `
    <div style="border: 1px solid #dee2e6; border-radius: 6px; padding: 15px; background: #f8f9fa;">
      <h4 style="margin: 0 0 8px 0; color: #2c3e50; font-size: 1rem;">${preset.id}.json</h4>
      <p style="color: #7f8c8d; margin-bottom: 12px; font-size: 13px;">
        ${preset.description || 'Custom user preset'} • Version ${preset.version} • ${preset.categoriesCount} categories
      </p>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
        <button class="btn-primary" onclick="applyCustomPreset('${preset.id}', '${preset.name}')" style="padding: 8px; grid-column: 1 / -1;">
          ✓ Apply Preset
        </button>
        <button class="btn-primary" onclick="downloadCustomPreset('${preset.id}')" style="padding: 8px;">
          📥 Download
        </button>
        <button class="btn-primary" onclick="document.getElementById('upload-${preset.id}').click()" style="padding: 8px;">
          📤 Upload
        </button>
        <input type="file" id="upload-${preset.id}" accept=".json" style="display: none;" onchange="uploadCustomPreset(event, '${preset.id}')">
        <button class="btn-danger" onclick="deleteCustomPreset('${preset.id}', '${preset.name}')" style="padding: 8px; grid-column: 1 / -1;">
          🗑️ Delete
        </button>
      </div>
    </div>
  `
    )
    .join('')
}

// Apply a custom preset
async function applyCustomPreset(presetId, presetName) {
  if (!confirm(`Apply custom preset "${presetName}" to all category preferences?`)) {
    return
  }

  try {
    const result = await apiSetCurrentPreset(presetId)
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
    await apiDeleteCustomPreset(presetId)

    showStatus(`Deleted custom preset "${presetName}"`, 'success')

    // Reload custom presets list
    await loadCustomPresets()
  } catch (error) {
    showStatus('Failed to delete custom preset: ' + error.message, 'error')
  }
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
    const result = await apiSetCurrentPreset(presetType)
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

// Download custom preset file
async function downloadCustomPreset(presetId) {
  const statusEl = document.getElementById('fileManagementStatus')

  try {
    statusEl.innerHTML =
      '<div style="color: #3498db; padding: 10px; background: #e3f2fd; border-radius: 4px;">Downloading...</div>'

    const json = await apiDownloadCustomPreset(presetId)
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${presetId}.json`
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)

    statusEl.innerHTML = `<div style="color: #27ae60; padding: 10px; background: #e8f5e9; border-radius: 4px;">✓ Downloaded ${presetId}.json</div>`

    setTimeout(() => {
      statusEl.innerHTML = ''
    }, 3000)
  } catch (error) {
    console.error('Download error:', error)
    statusEl.innerHTML = `<div style="color: #e74c3c; padding: 10px; background: #ffebee; border-radius: 4px;">✗ Failed to download: ${error.message}</div>`
  }
}

// Upload custom preset file
async function uploadCustomPreset(event, presetId) {
  const statusEl = document.getElementById('fileManagementStatus')
  const file = event.target.files[0]

  if (!file) return

  try {
    statusEl.innerHTML =
      '<div style="color: #3498db; padding: 10px; background: #e3f2fd; border-radius: 4px;">Uploading...</div>'

    const text = await file.text()
    const json = JSON.parse(text) // Validate JSON

    await apiUploadCustomPreset(presetId, json)

    statusEl.innerHTML = `<div style="color: #27ae60; padding: 10px; background: #e8f5e9; border-radius: 4px;">
      ✓ Uploaded ${presetId}.json successfully!<br>
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

// ============================================================================
// INITIALIZATION
// ============================================================================

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
