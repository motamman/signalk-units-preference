/**
 * Dropdown creation and smart population functions
 * Depends on: app-state.js
 */

/**
 * Create base unit dropdown HTML
 */
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

  // Only select the empty option if no value provided AND it's not 'custom'
  const hasSelection = selectedValue && selectedValue !== ''
  const emptySelected = !hasSelection ? 'selected' : ''

  return `
    <select id="${id}">
      <option value="" ${emptySelected}>-- Select Base Unit --</option>
      ${options}
      ${customOption}
    </select>
  `
}

/**
 * Create category dropdown HTML
 */
function createCategoryDropdown(id, selectedValue = '', includeCustom = true) {
  const options = unitSchema.categories
    .map(cat => `<option value="${cat}" ${cat === selectedValue ? 'selected' : ''}>${cat}</option>`)
    .join('')
  const customOption = includeCustom
    ? `<option value="custom" ${selectedValue === 'custom' ? 'selected' : ''}>✏️ Custom...</option>`
    : ''
  const emptySelected = !selectedValue ? 'selected' : ''
  return `
    <select id="${id}">
      <option value="" ${emptySelected}>-- Select Category --</option>
      ${options}
      ${customOption}
    </select>
  `
}

/**
 * Normalize a target unit value to its actual key (handles both symbols and longNames)
 * This ensures backward compatibility with old preferences that might use longNames
 */
function normalizeTargetUnitKey(baseUnit, targetUnitValue) {
  if (!targetUnitValue) return targetUnitValue

  const baseUnitDef = unitSchema.baseUnitDefinitions?.[baseUnit]
  if (!baseUnitDef?.conversions) {
    return targetUnitValue
  }

  // First check if it's already a valid key
  if (baseUnitDef.conversions[targetUnitValue]) {
    return targetUnitValue
  }

  // Try to find by longName (case-insensitive)
  const targetLower = targetUnitValue.toLowerCase()
  for (const [key, conversion] of Object.entries(baseUnitDef.conversions)) {
    if (conversion.longName?.toLowerCase() === targetLower) {
      return key
    }
  }

  // Return original if no match found
  return targetUnitValue
}

/**
 * Get display label for a target unit (shows "longName (symbol)" if available)
 */
function getTargetUnitLabel(baseUnit, targetUnitKey) {
  const baseUnitDef = unitSchema.baseUnitDefinitions?.[baseUnit]
  if (!baseUnitDef?.conversions) {
    return targetUnitKey
  }

  const conversion = baseUnitDef.conversions[targetUnitKey]
  if (!conversion) {
    return targetUnitKey
  }

  const longName = conversion.longName
  const symbol = conversion.symbol

  // Format: "longName (symbol)" or just symbol if no longName
  if (longName && symbol && longName !== symbol) {
    return `${longName} (${symbol})`
  } else if (longName) {
    return longName
  } else if (symbol) {
    return symbol
  }

  return targetUnitKey
}

/**
 * Create target unit dropdown HTML based on base unit
 */
function createTargetUnitDropdown(id, baseUnit = '', selectedValue = '', includeCustom = true) {
  // Normalize the selected value to ensure it matches the actual key
  const normalizedSelected = normalizeTargetUnitKey(baseUnit, selectedValue)

  const units = unitSchema.targetUnitsByBase[baseUnit] || []
  const options = units
    .map(unit => {
      const label = getTargetUnitLabel(baseUnit, unit)
      return `<option value="${unit}" ${unit === normalizedSelected ? 'selected' : ''}>${label}</option>`
    })
    .join('')
  const customOption = includeCustom
    ? `<option value="custom" ${normalizedSelected === 'custom' ? 'selected' : ''}>✏️ Custom...</option>`
    : ''

  // Only select the empty option if no value provided AND it's not 'custom'
  const hasSelection = normalizedSelected && normalizedSelected !== ''
  const emptySelected = !hasSelection ? 'selected' : ''

  return `
    <select id="${id}">
      <option value="" ${emptySelected}>-- Select Target Unit --</option>
      ${options}
      ${customOption}
    </select>
  `
}

/**
 * Populate smart category dropdown based on base unit
 * - 1:1 mapping: auto-select and disable
 * - Many-to-one: show filtered options
 * - No mapping: show all categories
 */
async function populateSmartCategoryDropdown(
  baseUnit,
  containerId,
  selectId,
  currentCategory = '',
  includeCustom = false
) {
  const container = document.getElementById(containerId)
  if (!container) return

  if (!baseUnit || baseUnit === '') {
    // No base unit - show all categories
    container.innerHTML = createCategoryDropdown(selectId, currentCategory, includeCustom)
    return
  }

  try {
    // Fetch categories for this base unit
    const response = await fetch(
      `/plugins/signalk-units-preference/categories-for-base-unit?baseUnit=${encodeURIComponent(baseUnit)}`
    )
    if (!response.ok) throw new Error('Failed to fetch categories')

    const data = await response.json()
    const categories = data.categories || []

    if (categories.length === 1) {
      // 1:1 mapping - auto-select and disable
      const catValue = currentCategory || categories[0]
      container.innerHTML = `
        <select id="${selectId}" disabled>
          <option value="${catValue}">${catValue} (auto)</option>
        </select>
      `
    } else if (categories.length > 1) {
      // Many-to-one - show filtered dropdown
      let options = '<option value="">-- Select Category --</option>'
      categories.forEach(cat => {
        options += `<option value="${cat}" ${cat === currentCategory ? 'selected' : ''}>${cat}</option>`
      })
      if (includeCustom) {
        options += '<option value="custom">✏️ Custom...</option>'
      }
      container.innerHTML = `<select id="${selectId}">${options}</select>`
    } else {
      // No categories for this base unit
      container.innerHTML = createCategoryDropdown(selectId, currentCategory, includeCustom)
    }
  } catch (error) {
    console.error('Error fetching categories for base unit:', error)
    container.innerHTML = createCategoryDropdown(selectId, currentCategory, includeCustom)
  }
}
