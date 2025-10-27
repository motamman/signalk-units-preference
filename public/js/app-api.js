/* eslint-disable no-unused-vars, @typescript-eslint/no-unused-vars */

/**
 * app-api.js
 *
 * Centralized API layer for SignalK Units Preference plugin
 * All fetch calls to the backend API are handled here
 */

// ============================================================================
// SCHEMA API
// ============================================================================

async function apiLoadSchema() {
  const res = await fetch(`${API_BASE}/schema`)
  if (!res.ok) throw new Error('Failed to load schema')
  return await res.json()
}

// ============================================================================
// DATA LOADING API
// ============================================================================

async function apiLoadCategories() {
  const res = await fetch(`${API_BASE}/categories`)
  if (!res.ok) throw new Error('Failed to load categories')
  return await res.json()
}

async function apiLoadOverrides() {
  const res = await fetch(`${API_BASE}/overrides`)
  if (!res.ok) throw new Error('Failed to load overrides')
  return await res.json()
}

async function apiLoadPatterns() {
  const res = await fetch(`${API_BASE}/patterns`)
  if (!res.ok) throw new Error('Failed to load patterns')
  return await res.json()
}

async function apiLoadPathsMetadata() {
  const res = await fetch(`${API_BASE}/paths`)
  if (!res.ok) throw new Error('Failed to load paths metadata')
  return await res.json()
}

async function apiLoadCurrentPreset() {
  const res = await fetch(`${API_BASE}/presets/current`)
  if (!res.ok) throw new Error('Failed to load current preset')
  return await res.json()
}

async function apiLoadAllData() {
  const [categoriesRes, overridesRes, patternsRes, presetRes] = await Promise.all([
    fetch(`${API_BASE}/categories`),
    fetch(`${API_BASE}/overrides`),
    fetch(`${API_BASE}/patterns`),
    fetch(`${API_BASE}/presets/current`)
  ])

  if (!categoriesRes.ok || !overridesRes.ok || !patternsRes.ok || !presetRes.ok) {
    throw new Error('Failed to load data')
  }

  return {
    categories: await categoriesRes.json(),
    pathOverrides: await overridesRes.json(),
    pathPatterns: await patternsRes.json(),
    currentPreset: await presetRes.json()
  }
}

async function apiGetCategoriesForBaseUnit(baseUnit) {
  const response = await fetch(
    `/plugins/signalk-units-preference/categories-for-base-unit?baseUnit=${encodeURIComponent(baseUnit)}`
  )
  if (!response.ok) throw new Error('Failed to fetch categories')
  return await response.json()
}

async function apiGetConversionForPath(path) {
  const res = await fetch(`${API_BASE}/conversions/${path}`)
  if (!res.ok) throw new Error('Failed to get conversion for path')
  return await res.json()
}

// ============================================================================
// CATEGORY API
// ============================================================================

async function apiUpdateCategory(category, categoryData) {
  const res = await fetch(`${API_BASE}/categories/${category}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(categoryData)
  })
  if (!res.ok) throw new Error('Failed to update category')
  return await res.json()
}

async function apiDeleteCategory(category) {
  const res = await fetch(`${API_BASE}/categories/${category}`, {
    method: 'DELETE'
  })
  if (!res.ok) throw new Error('Failed to delete category')
  return await res.json()
}

// ============================================================================
// PATTERN API
// ============================================================================

async function apiCreatePattern(patternData) {
  const res = await fetch(`${API_BASE}/patterns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patternData)
  })
  if (!res.ok) throw new Error('Failed to create pattern')
  return await res.json()
}

async function apiUpdatePattern(index, patternData) {
  const res = await fetch(`${API_BASE}/patterns/${index}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patternData)
  })
  if (!res.ok) throw new Error('Failed to update pattern')
  return await res.json()
}

async function apiDeletePattern(index) {
  const res = await fetch(`${API_BASE}/patterns/${index}`, {
    method: 'DELETE'
  })
  if (!res.ok) throw new Error('Failed to delete pattern')
  return await res.json()
}

// ============================================================================
// OVERRIDE API
// ============================================================================

async function apiCreateOverride(path, overrideData) {
  const res = await fetch(`${API_BASE}/overrides/${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(overrideData)
  })
  if (!res.ok) throw new Error('Failed to create override')
  return await res.json()
}

async function apiUpdateOverride(path, overrideData) {
  const res = await fetch(`${API_BASE}/overrides/${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(overrideData)
  })
  if (!res.ok) throw new Error('Failed to update override')
  return await res.json()
}

async function apiDeleteOverride(path) {
  const res = await fetch(`${API_BASE}/overrides/${path}`, {
    method: 'DELETE'
  })
  if (!res.ok) throw new Error('Failed to delete override')
  return await res.json()
}

// ============================================================================
// METADATA API
// ============================================================================

async function apiSaveMetadata(path, metadataObj) {
  const res = await fetch(`${API_BASE}/metadata/${encodeURIComponent(path)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(metadataObj)
  })
  if (!res.ok) throw new Error('Failed to save metadata')
  return await res.json()
}

async function apiSendSignalKMetadata(metadataMap) {
  const res = await fetch(`${API_BASE}/signalk-metadata`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(metadataMap)
  })
  if (!res.ok) throw new Error('Failed to send SignalK metadata')
  return await res.json()
}

async function apiLoadSignalKMetadata() {
  const res = await fetch('/signalk/v1/api/')
  if (!res.ok) throw new Error('Failed to load SignalK metadata')
  return await res.json()
}

// ============================================================================
// UNIT DEFINITION API
// ============================================================================

async function apiLoadUnitDefinitions() {
  const res = await fetch(`${API_BASE}/unit-definitions`)
  if (!res.ok) throw new Error('Failed to load unit definitions')
  return await res.json()
}

async function apiCreateBaseUnit(baseUnitData) {
  const res = await fetch(`${API_BASE}/unit-definitions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(baseUnitData)
  })
  if (!res.ok) throw new Error('Failed to create base unit')
  return await res.json()
}

async function apiUpdateBaseUnit(baseUnit, baseUnitData) {
  const res = await fetch(`${API_BASE}/unit-definitions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(baseUnitData)
  })
  if (!res.ok) throw new Error('Failed to update base unit')
  return await res.json()
}

async function apiDeleteBaseUnit(baseUnit) {
  const res = await fetch(`${API_BASE}/unit-definitions/${encodeURIComponent(baseUnit)}`, {
    method: 'DELETE'
  })
  if (!res.ok) throw new Error('Failed to delete base unit')
  return await res.json()
}

async function apiCreateConversion(baseUnit, conversionData) {
  const res = await fetch(
    `${API_BASE}/unit-definitions/${encodeURIComponent(baseUnit)}/conversions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(conversionData)
    }
  )
  if (!res.ok) throw new Error('Failed to create conversion')
  return await res.json()
}

async function apiUpdateConversion(baseUnit, targetUnit, conversionData) {
  const res = await fetch(
    `${API_BASE}/unit-definitions/${encodeURIComponent(baseUnit)}/conversions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(conversionData)
    }
  )
  if (!res.ok) throw new Error('Failed to update conversion')
  return await res.json()
}

async function apiDeleteConversion(baseUnit, targetUnit) {
  const res = await fetch(
    `${API_BASE}/unit-definitions/${encodeURIComponent(baseUnit)}/conversions/${encodeURIComponent(targetUnit)}`,
    {
      method: 'DELETE'
    }
  )
  if (!res.ok) throw new Error('Failed to delete conversion')
  return await res.json()
}

// ============================================================================
// STANDARD UNIT DEFINITIONS API
// ============================================================================

async function apiLoadStandardUnitDefinitions() {
  const res = await fetch(`${API_BASE}/standard-unit-definitions`)
  if (!res.ok) throw new Error('Failed to load standard unit definitions')
  return await res.json()
}

async function apiCreateStandardBaseUnit(baseUnitData) {
  const res = await fetch(`${API_BASE}/standard-unit-definitions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(baseUnitData)
  })
  if (!res.ok) throw new Error('Failed to create standard base unit')
  return await res.json()
}

async function apiUpdateStandardBaseUnit(baseUnit, baseUnitData) {
  const res = await fetch(`${API_BASE}/standard-unit-definitions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(baseUnitData)
  })
  if (!res.ok) throw new Error('Failed to update standard base unit')
  return await res.json()
}

async function apiDeleteStandardBaseUnit(baseUnit) {
  const res = await fetch(`${API_BASE}/standard-unit-definitions/${encodeURIComponent(baseUnit)}`, {
    method: 'DELETE'
  })
  if (!res.ok) throw new Error('Failed to delete standard base unit')
  return await res.json()
}

async function apiCreateStandardConversion(baseUnit, conversionData) {
  const res = await fetch(
    `${API_BASE}/standard-unit-definitions/${encodeURIComponent(baseUnit)}/conversions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(conversionData)
    }
  )
  if (!res.ok) throw new Error('Failed to create standard conversion')
  return await res.json()
}

async function apiUpdateStandardConversion(baseUnit, targetUnit, conversionData) {
  const res = await fetch(
    `${API_BASE}/standard-unit-definitions/${encodeURIComponent(baseUnit)}/conversions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(conversionData)
    }
  )
  if (!res.ok) throw new Error('Failed to update standard conversion')
  return await res.json()
}

async function apiDeleteStandardConversion(baseUnit, targetUnit) {
  const res = await fetch(
    `${API_BASE}/standard-unit-definitions/${encodeURIComponent(baseUnit)}/conversions/${encodeURIComponent(targetUnit)}`,
    {
      method: 'DELETE'
    }
  )
  if (!res.ok) throw new Error('Failed to delete standard conversion')
  return await res.json()
}

// ============================================================================
// PRESET API
// ============================================================================

async function apiLoadCustomPresets() {
  const res = await fetch(`${API_BASE}/presets/custom`)
  if (!res.ok) throw new Error('Failed to load custom presets')
  return await res.json()
}

async function apiSaveCustomPreset(presetName, presetData) {
  const res = await fetch(`${API_BASE}/presets/custom/${presetName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(presetData)
  })
  if (!res.ok) throw new Error('Failed to save custom preset')
  return await res.json()
}

async function apiDeleteCustomPreset(presetId) {
  const res = await fetch(`${API_BASE}/presets/custom/${presetId}`, {
    method: 'DELETE'
  })
  if (!res.ok) throw new Error('Failed to delete custom preset')
  return await res.json()
}

async function apiSetCurrentPreset(presetType) {
  const res = await fetch(`${API_BASE}/presets/current`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ presetType })
  })
  if (!res.ok) throw new Error('Failed to set current preset')
  return await res.json()
}

async function apiDownloadCustomPreset(presetId) {
  const res = await fetch(`${API_BASE}/presets/custom/${presetId}`)
  if (!res.ok) throw new Error('Failed to download preset')
  return await res.json()
}

async function apiUploadCustomPreset(presetId, presetData) {
  const res = await fetch(`${API_BASE}/presets/custom/${presetId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(presetData)
  })
  if (!res.ok) throw new Error('Failed to upload preset')
  return await res.json()
}

// ============================================================================
// BACKUP/IMPORT API
// ============================================================================

async function apiCreateBackup() {
  const res = await fetch(`${API_BASE}/backups`)
  if (!res.ok) throw new Error('Failed to create backup')
  return await res.blob()
}

async function apiRestoreBackup(zipData) {
  const res = await fetch(`${API_BASE}/backups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ zipData })
  })
  if (!res.ok) throw new Error('Failed to restore backup')
  return await res.json()
}

async function apiDownloadFile(endpoint, fileType) {
  const response = await fetch(`${API_BASE}/${endpoint}/${fileType}`)
  if (!response.ok) throw new Error('Failed to download file')
  return await response.json()
}

async function apiUploadFile(endpoint, fileType, jsonData) {
  const response = await fetch(`${API_BASE}/${endpoint}/${fileType}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(jsonData)
  })
  if (!response.ok) throw new Error('Failed to upload file')
  return await response.json()
}
