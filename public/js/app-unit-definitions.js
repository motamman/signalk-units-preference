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

// ============================================================================
// BASE UNIT CRUD OPERATIONS
// ============================================================================

// Add a new base unit
async function addBaseUnit() {
  const symbol = document.getElementById('newBaseUnitSymbol').value.trim()
  const description = document.getElementById('newBaseUnitDesc').value.trim()

  if (!symbol) {
    showStatus('Please enter a base unit symbol', 'error')
    return
  }

  try {
    await apiCreateBaseUnit({
      baseUnit: symbol,
      description: description || undefined,
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
function editBaseUnit(baseUnit) {
  const safeBaseUnit = sanitizeIdSegment(baseUnit)
  const def = unitDefinitions[baseUnit] || {}
  const description = def.description || ''

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
          <input type="text" id="${descInputId}" value="${description}" placeholder="e.g., flow rate, energy">
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
    // Get the existing unit definition and update only the description
    const existingDef = unitDefinitions[baseUnit] || { conversions: {} }
    const updatedDef = {
      baseUnit: baseUnit,
      description: description || undefined,
      conversions: existingDef.conversions || {}
    }

    await apiUpdateBaseUnit(baseUnit, updatedDef)

    showStatus(`Updated base unit: ${baseUnit}`, 'success')

    // Update local unitDefinitions
    if (unitDefinitions[baseUnit]) {
      unitDefinitions[baseUnit].description = description
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
  const safeBaseUnit = sanitizeIdSegment(baseUnit)
  const viewDiv = document.getElementById(`unit-view-${safeBaseUnit}`)
  const editDiv = document.getElementById(`unit-edit-${safeBaseUnit}`)

  viewDiv.style.display = 'block'
  editDiv.style.display = 'none'
}

// ============================================================================
// CONVERSION CRUD OPERATIONS
// ============================================================================

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
    await apiCreateConversion(baseUnit, {
      targetUnit,
      formula,
      inverseFormula,
      symbol
    })

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
    await apiUpdateConversion(baseUnit, targetUnit, {
      targetUnit,
      formula,
      inverseFormula,
      symbol
    })

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

// ============================================================================
// DATA LOADING & RENDERING
// ============================================================================

// Load unit definitions from backend
async function loadUnitDefinitions() {
  try {
    unitDefinitions = await apiLoadUnitDefinitions()
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
      const badge = isCustom
        ? '<span style="background: #667eea; color: white; padding: 2px 8px; border-radius: 3px; font-size: 11px; margin-left: 8px;">CUSTOM</span>'
        : '<span style="background: #6c757d; color: white; padding: 2px 8px; border-radius: 3px; font-size: 11px; margin-left: 8px;">CORE</span>'
      const safeBaseUnit = sanitizeIdSegment(baseUnit)

      return `
      <div class="unit-definition-item" style="padding: 12px 16px; background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 6px; margin-bottom: 8px;">
        <div class="collapsible-header" onclick="toggleUnitItem('${baseUnit}')" style="cursor: pointer;">
          <div style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0;">
            <span style="font-family: monospace; font-weight: 600; font-size: 18px; color: #2c3e50;">${baseUnit}${badge}</span>
            <span style="color: #95a5a6; font-size: 13px;">${conversions.length} conversion${conversions.length !== 1 ? 's' : ''}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 10px;">
            ${
              isCustom
                ? `<button class="btn-primary btn-edit" onclick="event.stopPropagation(); editBaseUnit('${baseUnit}')">Edit</button>
            <button class="btn-danger btn-delete" onclick="event.stopPropagation(); deleteBaseUnit('${baseUnit}')">Delete</button>`
                : ''
            }
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
                        // Check if this specific conversion is custom (editable)
                        const isConversionCustom =
                          isCustom || (def.customConversions || []).includes(target)
                        return `
                      <tr id="${buildConversionId('conversion-row', baseUnit, target)}" style="border-bottom: 1px solid #f0f0f0;">
                        <td style="padding: 8px; font-family: monospace;">${target}</td>
                        <td style="padding: 8px; font-family: monospace; font-size: 12px;">${conv.formula}</td>
                        <td style="padding: 8px; font-family: monospace; font-size: 12px;">${conv.inverseFormula}</td>
                        <td style="padding: 8px;">${conv.symbol}</td>
                        <td style="padding: 8px;">
                          ${
                            isConversionCustom
                              ? `<button class="btn-primary btn-edit" onclick="editConversion('${baseUnit}', '${target}')">Edit</button>
                          <button class="btn-danger btn-delete" onclick="deleteConversion('${baseUnit}', '${target}')">Delete</button>`
                              : ''
                          }
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
