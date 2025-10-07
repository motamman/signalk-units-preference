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
  const emptySelected = !selectedValue ? 'selected' : ''
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
 * Create target unit dropdown HTML based on base unit
 */
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
  const emptySelected = !selectedValue ? 'selected' : ''
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
