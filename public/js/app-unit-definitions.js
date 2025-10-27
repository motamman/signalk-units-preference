/* eslint-disable no-unused-vars, @typescript-eslint/no-unused-vars */

/**
 * app-unit-definitions.js
 *
 * Unit Definitions Tab
 * Functions for managing base units and conversion formulas
 */

// ============================================================================
// STATE
// ============================================================================

let unitDefinitions = {}

// Track original form state for dirty checking
let baseUnitFormOriginalState = null
let currentlyEditingBaseUnit = null
let conversionFormOriginalState = null
let currentlyEditingConversion = null

// ============================================================================
// DIRTY TRACKING FUNCTIONS
// ============================================================================

// Check if base unit form is dirty
function isBaseUnitFormDirty() {
  if (!baseUnitFormOriginalState || !currentlyEditingBaseUnit) return false

  const safeBaseUnit = sanitizeIdSegment(currentlyEditingBaseUnit)
  const descInputId = `edit-unit-desc-${safeBaseUnit}`
  const descInput = document.getElementById(descInputId)

  if (!descInput) return false

  return descInput.value !== baseUnitFormOriginalState.description
}

// Check if conversion form is dirty
function isConversionFormDirty() {
  if (!conversionFormOriginalState || !currentlyEditingConversion) return false

  const { baseUnit, targetUnit } = currentlyEditingConversion
  const longNameInputId = buildConversionId('edit-conv-longname', baseUnit, targetUnit)
  const formulaInputId = buildConversionId('edit-conv-formula', baseUnit, targetUnit)
  const inverseInputId = buildConversionId('edit-conv-inverse', baseUnit, targetUnit)
  const symbolInputId = buildConversionId('edit-conv-symbol', baseUnit, targetUnit)

  const longNameInput = document.getElementById(longNameInputId)
  const formulaInput = document.getElementById(formulaInputId)
  const inverseInput = document.getElementById(inverseInputId)
  const symbolInput = document.getElementById(symbolInputId)

  if (!formulaInput || !inverseInput || !symbolInput) return false

  return (
    (longNameInput ? longNameInput.value : '') !== (conversionFormOriginalState.longName || '') ||
    formulaInput.value !== conversionFormOriginalState.formula ||
    inverseInput.value !== conversionFormOriginalState.inverseFormula ||
    symbolInput.value !== conversionFormOriginalState.symbol
  )
}

// ============================================================================
// BASE UNIT CRUD OPERATIONS
// ============================================================================

// Add a new base unit
async function addBaseUnit() {
  const symbol = document.getElementById('newBaseUnitSymbol').value.trim()
  const longName = document.getElementById('newBaseUnitDesc').value.trim()

  if (!symbol) {
    showStatus('Please enter a base unit symbol', 'error')
    return
  }

  try {
    await apiCreateBaseUnit({
      baseUnit: symbol,
      longName: longName || undefined,
      conversions: {}
    })

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
    await apiDeleteBaseUnit(baseUnit)

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

// Edit base unit
function editBaseUnit(baseUnit, isStandard = false) {
  // Store whether this is a standard or custom unit
  window.currentEditingUnitIsStandard = isStandard

  // Check if there's an open base unit form with unsaved changes
  if (currentlyEditingBaseUnit && currentlyEditingBaseUnit !== baseUnit) {
    if (isBaseUnitFormDirty()) {
      if (
        !confirm(
          `You have unsaved changes for base unit "${currentlyEditingBaseUnit}". Discard changes and edit "${baseUnit}" instead?`
        )
      ) {
        return
      }
    }
    // Close the previous form (avoiding confirm dialog on cancel)
    const prevSafeBaseUnit = sanitizeIdSegment(currentlyEditingBaseUnit)
    const prevViewDiv = document.getElementById(`unit-view-${prevSafeBaseUnit}`)
    const prevEditDiv = document.getElementById(`unit-edit-${prevSafeBaseUnit}`)
    if (prevViewDiv && prevEditDiv) {
      baseUnitFormOriginalState = null
      currentlyEditingBaseUnit = null
      prevViewDiv.style.display = 'block'
      prevEditDiv.style.display = 'none'
    }
  }

  // Check if there's an open conversion form with unsaved changes
  if (currentlyEditingConversion) {
    const { baseUnit: convBase, targetUnit: convTarget } = currentlyEditingConversion
    if (isConversionFormDirty()) {
      if (
        !confirm(
          `You have unsaved changes for conversion "${convBase} → ${convTarget}". Discard changes and edit "${baseUnit}" instead?`
        )
      ) {
        return
      }
    }
    // Close the previous form (avoiding confirm dialog on cancel)
    const rowId = buildConversionId('conversion-row', convBase, convTarget)
    const editRowId = buildConversionId('conversion-edit', convBase, convTarget)
    const row = document.getElementById(rowId)
    const editRow = document.getElementById(editRowId)
    conversionFormOriginalState = null
    currentlyEditingConversion = null
    if (row) row.style.display = ''
    if (editRow) editRow.remove()
  }

  const safeBaseUnit = sanitizeIdSegment(baseUnit)
  const def = unitDefinitions[baseUnit] || {}
  const longName = def.longName || def.description || ''

  const viewDiv = document.getElementById(`unit-view-${safeBaseUnit}`)
  const editDiv = document.getElementById(`unit-edit-${safeBaseUnit}`)

  const symbolInputId = `edit-unit-symbol-${safeBaseUnit}`
  const descInputId = `edit-unit-desc-${safeBaseUnit}`

  // Build edit form
  editDiv.innerHTML = `
    <div style="background: #fff3cd; padding: 15px; border-radius: 4px; border: 1px dashed #ffc107; margin-top: 10px;">
      <h4 style="margin: 0 0 15px 0; color: #856404; font-size: 14px;">Edit Base Unit: ${baseUnit}</h4>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
        <div class="input-group">
          <label>Base Unit Symbol</label>
          <input type="text" id="${symbolInputId}" value="${baseUnit}" placeholder="e.g., L/h, bar" readonly style="background: #f5f5f5;">
          <small style="color: #666; display: block; margin-top: 3px;">Symbol cannot be changed</small>
        </div>
        <div class="input-group">
          <label>Description (optional)</label>
          <input type="text" id="${descInputId}" value="${longName}" placeholder="e.g., flow rate, energy">
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

  // Store original state for dirty checking AFTER form is populated
  currentlyEditingBaseUnit = baseUnit
  setTimeout(() => {
    const descInput = document.getElementById(descInputId)
    baseUnitFormOriginalState = {
      description: descInput?.value || ''
    }
  }, 0)
}

// Save edited base unit
async function saveEditBaseUnit(baseUnit) {
  const safeBaseUnit = sanitizeIdSegment(baseUnit)
  const descInputId = `edit-unit-desc-${safeBaseUnit}`
  const longName = document.getElementById(descInputId).value.trim()
  const isStandard = window.currentEditingUnitIsStandard || false

  try {
    // Get the existing unit definition and update only the longName
    const existingDef = unitDefinitions[baseUnit] || { conversions: {} }
    const updatedDef = {
      baseUnit: baseUnit,
      longName: longName || undefined,
      conversions: existingDef.conversions || {}
    }

    // Call the appropriate API function based on unit type
    if (isStandard) {
      await apiUpdateStandardBaseUnit(baseUnit, updatedDef)
    } else {
      await apiUpdateBaseUnit(baseUnit, updatedDef)
    }

    showStatus(`Updated ${isStandard ? 'standard' : 'custom'} base unit: ${baseUnit}`, 'success')

    // Clear dirty tracking
    baseUnitFormOriginalState = null
    currentlyEditingBaseUnit = null
    window.currentEditingUnitIsStandard = false

    // Update local unitDefinitions
    if (unitDefinitions[baseUnit]) {
      unitDefinitions[baseUnit].longName = longName
    }

    // Reload and re-render
    await loadUnitDefinitions()
    renderUnitDefinitions()

    // Cancel edit mode to show updated view
    cancelEditBaseUnit(baseUnit)
  } catch (error) {
    showStatus('Failed to update base unit: ' + error.message, 'error')
  }
}

// Cancel editing base unit
function cancelEditBaseUnit(baseUnit) {
  // Check for unsaved changes
  if (isBaseUnitFormDirty()) {
    if (!confirm(`Discard unsaved changes for base unit "${baseUnit}"?`)) {
      return
    }
  }

  const safeBaseUnit = sanitizeIdSegment(baseUnit)
  const viewDiv = document.getElementById(`unit-view-${safeBaseUnit}`)
  const editDiv = document.getElementById(`unit-edit-${safeBaseUnit}`)

  // Clear dirty tracking
  baseUnitFormOriginalState = null
  currentlyEditingBaseUnit = null

  viewDiv.style.display = 'block'
  editDiv.style.display = 'none'
}

// ============================================================================
// CONVERSION CRUD OPERATIONS
// ============================================================================

// Check if a string contains extended (non-ASCII) characters
function hasExtendedCharacters(str) {
  // eslint-disable-next-line no-control-regex
  return /[^\x00-\x7F]/.test(str)
}

// Toggle visibility of key field based on symbol input (creation form)
function toggleConversionKeyField() {
  const symbolInput = document.getElementById('conversionSymbol')
  const keyFieldContainer = document.getElementById('conversionKeyFieldContainer')
  const symbol = symbolInput?.value || ''

  if (hasExtendedCharacters(symbol)) {
    keyFieldContainer.style.display = 'block'
  } else {
    keyFieldContainer.style.display = 'none'
    // Clear the key field when hidden
    const keyInput = document.getElementById('conversionKey')
    if (keyInput) keyInput.value = ''
  }
}

// Toggle visibility of key field based on symbol input (edit form)
function toggleEditConversionKeyField(baseUnit, targetUnit) {
  const symbolInputId = buildConversionId('edit-conv-symbol', baseUnit, targetUnit)
  const keyContainerId = buildConversionId('edit-conv-key-container', baseUnit, targetUnit)
  const keyInputId = buildConversionId('edit-conv-key', baseUnit, targetUnit)

  const symbolInput = document.getElementById(symbolInputId)
  const keyContainer = document.getElementById(keyContainerId)
  const keyInput = document.getElementById(keyInputId)

  const symbol = symbolInput?.value || ''

  if (hasExtendedCharacters(symbol)) {
    keyContainer.style.display = 'block'
  } else {
    keyContainer.style.display = 'none'
    // Clear the key field when hidden
    if (keyInput) keyInput.value = ''
  }
}

// Add a conversion formula to an existing base unit
async function addConversion() {
  const baseSelect = document.getElementById('conversionBaseUnit')
  const baseUnit = baseSelect.value.trim()
  const longName = document.getElementById('conversionLongName').value.trim()
  const formula = document.getElementById('conversionFormula').value.trim()
  const inverseFormula = document.getElementById('conversionInverseFormula').value.trim()
  const symbol = document.getElementById('conversionSymbol').value.trim()
  const key = document.getElementById('conversionKey').value.trim()

  if (!baseUnit || !formula || !inverseFormula || !symbol) {
    showStatus('Please fill in base unit, formula, inverse formula, and symbol fields', 'error')
    return
  }

  // If symbol has extended characters, key is required
  if (hasExtendedCharacters(symbol) && !key) {
    showStatus('Key field is required when symbol contains extended characters', 'error')
    return
  }

  try {
    const conversionData = {
      targetUnit: key || symbol, // Use key if provided, otherwise symbol
      formula,
      inverseFormula,
      symbol,
      longName: longName || undefined
    }

    // Add key field only if it differs from symbol
    if (key && key !== symbol) {
      conversionData.key = key
    }

    await apiCreateConversion(baseUnit, conversionData)

    showStatus(`Added conversion: ${baseUnit} → ${symbol}`, 'success')

    // Clear form
    document.getElementById('conversionLongName').value = ''
    document.getElementById('conversionFormula').value = ''
    document.getElementById('conversionInverseFormula').value = ''
    document.getElementById('conversionSymbol').value = ''
    document.getElementById('conversionKey').value = ''
    toggleConversionKeyField() // Hide key field

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

// Delete a conversion
async function deleteConversion(baseUnit, targetUnit) {
  if (!confirm(`Delete conversion ${baseUnit} → ${targetUnit}?`)) return

  try {
    await apiDeleteConversion(baseUnit, targetUnit)

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

// Edit conversion
function editConversion(baseUnit, targetUnit, isStandard = false) {
  // Store whether this is a standard or custom conversion
  window.currentEditingConversionIsStandard = isStandard

  // Check if there's an open base unit form with unsaved changes
  if (currentlyEditingBaseUnit) {
    if (isBaseUnitFormDirty()) {
      if (
        !confirm(
          `You have unsaved changes for base unit "${currentlyEditingBaseUnit}". Discard changes and edit conversion "${baseUnit} → ${targetUnit}" instead?`
        )
      ) {
        return
      }
    }
    // Close the previous form (avoiding confirm dialog on cancel)
    const prevSafeBaseUnit = sanitizeIdSegment(currentlyEditingBaseUnit)
    const prevViewDiv = document.getElementById(`unit-view-${prevSafeBaseUnit}`)
    const prevEditDiv = document.getElementById(`unit-edit-${prevSafeBaseUnit}`)
    if (prevViewDiv && prevEditDiv) {
      baseUnitFormOriginalState = null
      currentlyEditingBaseUnit = null
      prevViewDiv.style.display = 'block'
      prevEditDiv.style.display = 'none'
    }
  }

  // Check if there's another open conversion form with unsaved changes
  if (currentlyEditingConversion) {
    const { baseUnit: convBase, targetUnit: convTarget } = currentlyEditingConversion
    if (convBase !== baseUnit || convTarget !== targetUnit) {
      if (isConversionFormDirty()) {
        if (
          !confirm(
            `You have unsaved changes for conversion "${convBase} → ${convTarget}". Discard changes and edit "${baseUnit} → ${targetUnit}" instead?`
          )
        ) {
          return
        }
      }
      // Close the previous form (avoiding confirm dialog on cancel)
      const rowId = buildConversionId('conversion-row', convBase, convTarget)
      const editRowId = buildConversionId('conversion-edit', convBase, convTarget)
      const row = document.getElementById(rowId)
      const editRow = document.getElementById(editRowId)
      conversionFormOriginalState = null
      currentlyEditingConversion = null
      if (row) row.style.display = ''
      if (editRow) editRow.remove()
    }
  }

  const conv = unitDefinitions[baseUnit]?.conversions?.[targetUnit] || {}

  const rowId = buildConversionId('conversion-row', baseUnit, targetUnit)
  const row = document.getElementById(rowId)

  if (!row) return

  const editRowId = buildConversionId('conversion-edit', baseUnit, targetUnit)
  const targetInputId = buildConversionId('edit-conv-target', baseUnit, targetUnit)
  const longNameInputId = buildConversionId('edit-conv-longname', baseUnit, targetUnit)
  const keyInputId = buildConversionId('edit-conv-key', baseUnit, targetUnit)
  const formulaInputId = buildConversionId('edit-conv-formula', baseUnit, targetUnit)
  const inverseInputId = buildConversionId('edit-conv-inverse', baseUnit, targetUnit)
  const symbolInputId = buildConversionId('edit-conv-symbol', baseUnit, targetUnit)
  const keyContainerId = buildConversionId('edit-conv-key-container', baseUnit, targetUnit)

  const showKeyField = hasExtendedCharacters(conv.symbol || '')

  // Create edit row
  const editRow = document.createElement('tr')
  editRow.id = editRowId
  editRow.innerHTML = `
    <td colspan="5" style="padding: 15px; background: #fff3cd;">
      <h5 style="margin: 0 0 10px 0; color: #856404; font-size: 13px;">Edit Conversion: ${baseUnit} → ${targetUnit}</h5>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
        <div>
          <label style="font-size: 12px; color: #666; display: block; margin-bottom: 3px;">Target Unit (Key)</label>
          <input type="text" id="${targetInputId}" value="${targetUnit}" readonly style="background: #f5f5f5; padding: 6px; width: 100%; border: 1px solid #ddd; border-radius: 4px; font-family: monospace;">
        </div>
        <div>
          <label style="font-size: 12px; color: #666; display: block; margin-bottom: 3px;">Description (optional)</label>
          <input type="text" id="${longNameInputId}" value="${conv.longName || ''}" placeholder="e.g., gallons per hour, fahrenheit" style="padding: 6px; width: 100%; border: 1px solid #ddd; border-radius: 4px;">
        </div>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 10px;">
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
          <input type="text" id="${symbolInputId}" value="${conv.symbol}" placeholder="e.g., gal/h, °F" style="padding: 6px; width: 100%; border: 1px solid #ddd; border-radius: 4px;" oninput="toggleEditConversionKeyField('${baseUnit}', '${targetUnit}')">
        </div>
      </div>
      <div id="${keyContainerId}" style="display: ${showKeyField ? 'block' : 'none'}; margin-bottom: 10px;">
        <label style="font-size: 12px; color: #666; display: block; margin-bottom: 3px;">Key (ASCII-safe identifier)</label>
        <input type="text" id="${keyInputId}" value="${conv.key || ''}" placeholder="e.g., deg, deg_s" style="padding: 6px; width: 100%; border: 1px solid #ddd; border-radius: 4px;">
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

  // Store original state for dirty checking AFTER form is populated
  currentlyEditingConversion = { baseUnit, targetUnit }
  setTimeout(() => {
    const longNameInput = document.getElementById(longNameInputId)
    const formulaInput = document.getElementById(formulaInputId)
    const inverseInput = document.getElementById(inverseInputId)
    const symbolInput = document.getElementById(symbolInputId)

    conversionFormOriginalState = {
      longName: longNameInput?.value || '',
      formula: formulaInput?.value || '',
      inverseFormula: inverseInput?.value || '',
      symbol: symbolInput?.value || ''
    }
  }, 0)
}

// Save edited conversion
async function saveEditConversion(baseUnit, targetUnit) {
  const longNameInputId = buildConversionId('edit-conv-longname', baseUnit, targetUnit)
  const keyInputId = buildConversionId('edit-conv-key', baseUnit, targetUnit)
  const formulaInputId = buildConversionId('edit-conv-formula', baseUnit, targetUnit)
  const inverseInputId = buildConversionId('edit-conv-inverse', baseUnit, targetUnit)
  const symbolInputId = buildConversionId('edit-conv-symbol', baseUnit, targetUnit)

  const longName = document.getElementById(longNameInputId).value.trim()
  const key = document.getElementById(keyInputId)?.value.trim() || ''
  const formula = document.getElementById(formulaInputId).value.trim()
  const inverseFormula = document.getElementById(inverseInputId).value.trim()
  const symbol = document.getElementById(symbolInputId).value.trim()

  if (!formula || !inverseFormula || !symbol) {
    showStatus('Please fill in all fields', 'error')
    return
  }

  // If symbol has extended characters, key is required
  if (hasExtendedCharacters(symbol) && !key) {
    showStatus('Key field is required when symbol contains extended characters', 'error')
    return
  }

  const isStandard = window.currentEditingConversionIsStandard || false

  try {
    const conversionData = {
      targetUnit,
      formula,
      inverseFormula,
      symbol,
      longName: longName || undefined
    }

    // Add key field only if it differs from symbol
    if (key && key !== symbol) {
      conversionData.key = key
    }

    // Call the appropriate API function based on conversion type
    if (isStandard) {
      await apiUpdateStandardConversion(baseUnit, targetUnit, conversionData)
    } else {
      await apiUpdateConversion(baseUnit, targetUnit, conversionData)
    }

    showStatus(
      `Updated ${isStandard ? 'standard' : 'custom'} conversion: ${baseUnit} → ${targetUnit}`,
      'success'
    )

    // Clear dirty tracking
    conversionFormOriginalState = null
    currentlyEditingConversion = null
    window.currentEditingConversionIsStandard = false

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
  // Check for unsaved changes
  if (isConversionFormDirty()) {
    if (!confirm(`Discard unsaved changes for conversion "${baseUnit} → ${targetUnit}"?`)) {
      return
    }
  }

  const rowId = buildConversionId('conversion-row', baseUnit, targetUnit)
  const editRowId = buildConversionId('conversion-edit', baseUnit, targetUnit)

  const row = document.getElementById(rowId)
  const editRow = document.getElementById(editRowId)

  // Clear dirty tracking
  conversionFormOriginalState = null
  currentlyEditingConversion = null

  if (row) row.style.display = ''
  if (editRow) editRow.remove()
}

// ============================================================================
// DATA LOADING & RENDERING
// ============================================================================

// Load unit definitions from backend
async function loadUnitDefinitions() {
  try {
    // Load both standard and custom units
    const customUnits = await apiLoadUnitDefinitions()
    const standardUnits = await apiLoadStandardUnitDefinitions()

    console.log('Loaded custom units:', customUnits)
    console.log('Loaded standard units:', standardUnits)

    // Merge: custom units override standard units
    // Mark each with isStandard flag
    unitDefinitions = {}

    // Add standard units first
    for (const [baseUnit, def] of Object.entries(standardUnits)) {
      unitDefinitions[baseUnit] = {
        ...def,
        isCustom: false,
        isStandard: true
      }
    }

    // Add/override with custom units
    for (const [baseUnit, def] of Object.entries(customUnits)) {
      // If this unit exists in standard, it's a standard unit with custom additions
      const isStandardUnit = !!standardUnits[baseUnit]

      unitDefinitions[baseUnit] = {
        ...def,
        isCustom: !isStandardUnit,
        isStandard: isStandardUnit
      }
    }

    console.log('Merged unitDefinitions:', unitDefinitions)
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
      // For display purposes, use schema's target units if available (e.g., for date/time formats)
      const schemaTargets = unitSchema.targetUnitsByBase?.[baseUnit] || []
      const fileConversions = def.conversions || {}

      // Merge: show all from schema, fill in details from file where available
      const conversionsToDisplay =
        schemaTargets.length > 0
          ? schemaTargets.map(target => [
              target,
              fileConversions[target] || { formula: 'value', inverseFormula: 'value', symbol: '' }
            ])
          : Object.entries(fileConversions)

      const conversions = conversionsToDisplay.sort((a, b) =>
        a[0].toLowerCase().localeCompare(b[0].toLowerCase())
      )
      const isCustom = def.isCustom === true
      const isStandard = def.isStandard === true
      const badge = isCustom
        ? '<span style="background: #667eea; color: white; padding: 2px 8px; border-radius: 3px; font-size: 11px; margin-left: 8px;">CUSTOM</span>'
        : '<span style="background: #28a745; color: white; padding: 2px 8px; border-radius: 3px; font-size: 11px; margin-left: 8px;">STANDARD</span>'
      const safeBaseUnit = sanitizeIdSegment(baseUnit)

      return `
      <div class="unit-definition-item" style="padding: 12px 16px; background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 6px; margin-bottom: 8px;">
        <div class="collapsible-header" onclick="toggleUnitItem('${baseUnit}')" style="cursor: pointer;">
          <div style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0;">
            <span style="font-family: monospace; font-weight: 600; font-size: 18px; color: #2c3e50;">${baseUnit}${badge}</span>
            <span style="color: #95a5a6; font-size: 13px;">${conversions.length} conversion${conversions.length !== 1 ? 's' : ''}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <button class="btn-primary btn-edit" onclick="event.stopPropagation(); ${isStandard ? 'editStandardBaseUnit' : 'editBaseUnit'}('${baseUnit}')">Edit</button>
            <button class="btn-danger btn-delete" onclick="event.stopPropagation(); ${isStandard ? 'deleteStandardBaseUnit' : 'deleteBaseUnit'}('${baseUnit}')">Delete</button>
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
                        // All conversions are now editable
                        return `
                      <tr id="${buildConversionId('conversion-row', baseUnit, target)}" style="border-bottom: 1px solid #f0f0f0;">
                        <td style="padding: 8px; font-family: monospace;">${target}</td>
                        <td style="padding: 8px; font-family: monospace; font-size: 12px;">${conv.formula}</td>
                        <td style="padding: 8px; font-family: monospace; font-size: 12px;">${conv.inverseFormula}</td>
                        <td style="padding: 8px;">${conv.symbol}</td>
                        <td style="padding: 8px;">
                          <button class="btn-primary btn-edit" onclick="${isStandard ? 'editStandardConversion' : 'editConversion'}('${baseUnit}', '${target}')">Edit</button>
                          <button class="btn-danger btn-delete" onclick="${isStandard ? 'deleteStandardConversion' : 'deleteConversion'}('${baseUnit}', '${target}')">Delete</button>
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

// Toggle unit item
function toggleUnitItem(baseUnit) {
  // Check if there's an open base unit form with unsaved changes
  if (currentlyEditingBaseUnit && isBaseUnitFormDirty()) {
    if (
      !confirm(
        `You have unsaved changes for base unit "${currentlyEditingBaseUnit}". Discard changes and expand "${baseUnit}"?`
      )
    ) {
      return
    }
    // Close the form (avoiding confirm dialog on cancel)
    const prevSafeBaseUnit = sanitizeIdSegment(currentlyEditingBaseUnit)
    const prevViewDiv = document.getElementById(`unit-view-${prevSafeBaseUnit}`)
    const prevEditDiv = document.getElementById(`unit-edit-${prevSafeBaseUnit}`)
    if (prevViewDiv && prevEditDiv) {
      baseUnitFormOriginalState = null
      currentlyEditingBaseUnit = null
      prevViewDiv.style.display = 'block'
      prevEditDiv.style.display = 'none'
    }
  }

  // Check if there's an open conversion form with unsaved changes
  if (currentlyEditingConversion && isConversionFormDirty()) {
    const { baseUnit: convBase, targetUnit: convTarget } = currentlyEditingConversion
    if (
      !confirm(
        `You have unsaved changes for conversion "${convBase} → ${convTarget}". Discard changes and expand "${baseUnit}"?`
      )
    ) {
      return
    }
    // Close the form (avoiding confirm dialog on cancel)
    const rowId = buildConversionId('conversion-row', convBase, convTarget)
    const editRowId = buildConversionId('conversion-edit', convBase, convTarget)
    const row = document.getElementById(rowId)
    const editRow = document.getElementById(editRowId)
    conversionFormOriginalState = null
    currentlyEditingConversion = null
    if (row) row.style.display = ''
    if (editRow) editRow.remove()
  }

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
    // Expanding
    content.classList.remove('collapsed')
    icon.classList.remove('collapsed')
  } else {
    // Collapsing - check if there are unsaved changes within this section
    const hasBaseUnitForm = currentlyEditingBaseUnit === baseUnit && isBaseUnitFormDirty()
    const hasConversionFormInSection =
      currentlyEditingConversion &&
      currentlyEditingConversion.baseUnit === baseUnit &&
      isConversionFormDirty()

    if (hasBaseUnitForm || hasConversionFormInSection) {
      const formType = hasBaseUnitForm ? `base unit "${baseUnit}"` : `conversion`
      if (!confirm(`You have unsaved changes for ${formType}. Discard changes and collapse?`)) {
        return
      }
      // Clear the forms
      if (hasBaseUnitForm) {
        const prevSafeBaseUnit = sanitizeIdSegment(currentlyEditingBaseUnit)
        const prevViewDiv = document.getElementById(`unit-view-${prevSafeBaseUnit}`)
        const prevEditDiv = document.getElementById(`unit-edit-${prevSafeBaseUnit}`)
        if (prevViewDiv && prevEditDiv) {
          baseUnitFormOriginalState = null
          currentlyEditingBaseUnit = null
          prevViewDiv.style.display = 'block'
          prevEditDiv.style.display = 'none'
        }
      }
      if (hasConversionFormInSection) {
        const { baseUnit: convBase, targetUnit: convTarget } = currentlyEditingConversion
        const rowId = buildConversionId('conversion-row', convBase, convTarget)
        const editRowId = buildConversionId('conversion-edit', convBase, convTarget)
        const row = document.getElementById(rowId)
        const editRow = document.getElementById(editRowId)
        conversionFormOriginalState = null
        currentlyEditingConversion = null
        if (row) row.style.display = ''
        if (editRow) editRow.remove()
      }
    }

    content.classList.add('collapsed')
    icon.classList.add('collapsed')
  }
}

// ============================================================================
// JS-QUANTITIES INTEGRATION
// ============================================================================

// Handle base unit change - populate target units from js-quantities
async function onConversionBaseUnitChange(baseUnit) {
  const targetSelect = document.getElementById('conversionTargetUnit')
  const loadingDiv = document.getElementById('conversionTargetLoading')

  if (!baseUnit) {
    // Reset target unit dropdown
    targetSelect.disabled = true
    targetSelect.innerHTML = '<option value="">-- Select base unit first --</option>'
    clearConversionFormulas()
    return
  }

  // Show loading
  loadingDiv.style.display = 'block'
  targetSelect.disabled = true

  try {
    // Fetch available targets from js-quantities
    const encodedUnit = encodeURIComponent(baseUnit)
    const response = await fetch(
      `/plugins/signalk-units-preference/quantities/available-targets/${encodedUnit}`
    )
    const data = await response.json()

    // Build dropdown options
    let options = '<option value="">-- Select or type custom --</option>'

    if (data.targets && data.targets.length > 0) {
      // Add suggested units from js-quantities
      options += '<optgroup label="✨ Suggested (from js-quantities)">'
      for (const target of data.targets) {
        const factor = target.factor.toFixed(8).replace(/\.?0+$/, '') // Remove trailing zeros
        options += `<option value="${target.unit}" data-qty-unit="${target.qtyUnit}">${target.unit} (${target.symbol}) - factor: ${factor}</option>`
      }
      options += '</optgroup>'
    }

    // Add custom option
    options += '<option value="__custom__">➕ Add custom unit (manual formulas)</option>'

    targetSelect.innerHTML = options
    targetSelect.disabled = false

    // Add change event listener
    targetSelect.onchange = () => onConversionTargetUnitChange(baseUnit, targetSelect.value)
  } catch (error) {
    console.error('Failed to load target units:', error)
    targetSelect.innerHTML =
      '<option value="__custom__">⚠️ js-quantities unavailable - Enter manually</option>'
    targetSelect.disabled = false
  } finally {
    loadingDiv.style.display = 'none'
  }
}

// Handle target unit change - auto-fill formulas from js-quantities
async function onConversionTargetUnitChange(baseUnit, targetUnit) {
  if (!targetUnit || targetUnit === '__custom__') {
    // Clear formula fields for manual entry
    clearConversionFormulas()
    if (targetUnit === '__custom__') {
      showStatus('Enter custom formulas manually', 'info')
    }
    return
  }

  // Show loading in formula fields
  document.getElementById('conversionFormula').value = '⏳ Generating...'
  document.getElementById('conversionInverseFormula').value = '⏳ Generating...'
  document.getElementById('conversionSymbol').value = '⏳...'

  try {
    // Generate formula using js-quantities
    const response = await fetch('/plugins/signalk-units-preference/quantities/generate-formula', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUnit, targetUnit })
    })

    const result = await response.json()

    if (result.success) {
      // Auto-fill formula fields (keep them editable!)
      document.getElementById('conversionFormula').value = result.formula
      document.getElementById('conversionInverseFormula').value = result.inverseFormula
      document.getElementById('conversionSymbol').value = result.symbol

      // Trigger key field check
      toggleConversionKeyField()

      // Show success message
      let message = `✨ Formula generated from js-quantities`
      if (result.isOffset) {
        message += ' (offset-based conversion for temperature)'
      }
      showStatus(message, 'success')
    } else {
      // js-quantities doesn't support this conversion
      clearConversionFormulas()
      showStatus(result.message || 'Conversion not supported - enter manually', 'warning')
    }
  } catch (error) {
    console.error('Failed to generate formula:', error)
    clearConversionFormulas()
    showStatus('Failed to generate formula - enter manually', 'error')
  }
}

// Clear conversion formula fields
function clearConversionFormulas() {
  document.getElementById('conversionFormula').value = ''
  document.getElementById('conversionInverseFormula').value = ''
  document.getElementById('conversionSymbol').value = ''
  document.getElementById('conversionKey').value = ''
  toggleConversionKeyField()
}

// ============================================================================
// INITIALIZATION
// ============================================================================

// Initialize Unit Definitions dropdowns
function initializeUnitDefinitionsDropdowns() {
  // Populate base unit dropdown for adding conversions
  const container = document.getElementById('conversionBaseUnitContainer')
  if (!container) return

  const baseUnits = unitSchema.baseUnits || []

  container.innerHTML = `
    <select id="conversionBaseUnit" onchange="onConversionBaseUnitChange(this.value)">
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
// STANDARD UNIT DEFINITIONS HANDLERS
// ============================================================================

// Edit standard base unit
function editStandardBaseUnit(baseUnit) {
  // Reuse the same edit function but mark it as standard
  editBaseUnit(baseUnit, true)
}

// Delete standard base unit
async function deleteStandardBaseUnit(baseUnit) {
  const confirmed = confirm(
    `Delete standard base unit "${baseUnit}"?\n\nThis will remove the unit and all its conversions from the standard definitions file. Are you sure?`
  )

  if (!confirmed) return

  try {
    await apiDeleteStandardBaseUnit(baseUnit)
    showStatus(`Standard base unit "${baseUnit}" deleted successfully!`, 'success')

    // Reload and re-render
    await loadSchema()
    await loadUnitDefinitions()
    renderUnitDefinitions()
    initializePatternDropdowns()
    initializeCustomCategoryDropdowns()
    initializeUnitDefinitionsDropdowns()
    initializePathOverridesDropdowns()
  } catch (error) {
    showStatus('Failed to delete standard base unit: ' + error.message, 'error')
  }
}

// Edit standard conversion
function editStandardConversion(baseUnit, targetUnit) {
  // Reuse the same edit function but mark it as standard
  editConversion(baseUnit, targetUnit, true)
}

// Delete standard conversion
async function deleteStandardConversion(baseUnit, targetUnit) {
  const confirmed = confirm(`Delete standard conversion "${baseUnit} → ${targetUnit}"?`)

  if (!confirmed) return

  try {
    await apiDeleteStandardConversion(baseUnit, targetUnit)
    showStatus(`Standard conversion "${baseUnit} → ${targetUnit}" deleted successfully!`, 'success')

    // Reload and re-render
    await loadUnitDefinitions()
    renderUnitDefinitions()
    initializePatternDropdowns()
    initializeCustomCategoryDropdowns()
    initializeUnitDefinitionsDropdowns()
    initializePathOverridesDropdowns()
  } catch (error) {
    showStatus('Failed to delete standard conversion: ' + error.message, 'error')
  }
}
