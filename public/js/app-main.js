/* global loadPaths */
/* eslint-disable no-unused-vars, @typescript-eslint/no-unused-vars */

// ============================================================================
// INITIALIZATION
// ============================================================================

// Load unit schema from server
async function loadSchema() {
  try {
    unitSchema = await apiLoadSchema()
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
  await loadUnitDefinitions()
  initializePatternDropdowns()
  initializeCustomCategoryDropdowns()
  initializeUnitDefinitionsDropdowns()
  initializePathOverridesDropdowns()
  renderUnitDefinitions()
  renderPathOverrides()
})

// ============================================================================
// TAB MANAGEMENT
// ============================================================================

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

      // Load custom presets when settings tab is clicked
      if (tabName === 'settings') {
        await loadCustomPresets()
      }
    })
  })
}

// Switch to a specific tab programmatically
function switchTab(tabName) {
  // Update active tab button
  document.querySelectorAll('.tab').forEach(t => {
    if (t.dataset.tab === tabName) {
      t.classList.add('active')
    } else {
      t.classList.remove('active')
    }
  })

  // Show content
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'))
  document.getElementById(tabName).classList.add('active')
}

// ============================================================================
// DATA LOADING
// ============================================================================

// Load all data
async function loadData() {
  try {
    // Load categories, overrides, patterns, and current preset
    const data = await apiLoadAllData()

    // Reconstruct preferences object
    preferences = {
      categories: data.categories,
      pathOverrides: data.pathOverrides,
      pathPatterns: data.pathPatterns,
      currentPreset: data.currentPreset
    }

    const presetType = preferences.currentPreset?.type
    if (presetType && !BUILT_IN_PRESETS.includes(presetType.toLowerCase())) {
      lastAppliedPresetId = presetType
    } else {
      lastAppliedPresetId = ''
    }

    // Save original preset state BEFORE rendering (so dirty check works correctly)
    saveOriginalPresetState()

    renderCategories()
    renderPatterns()
    // renderMetadata() is now called on tab click to ensure paths are loaded
  } catch (error) {
    showStatus('Failed to load data: ' + error.message, 'error')
  }
}

// ============================================================================
// UTILITIES
// ============================================================================

// Show status message
function showStatus(message, type) {
  const statusEl = document.getElementById('statusMessage')
  statusEl.textContent = message
  statusEl.className = `status-message ${type} show`

  setTimeout(() => {
    statusEl.classList.remove('show')
  }, 5000)
}

// ============================================================================
// BACKUP & RESTORE
// ============================================================================

// Backup and Restore Functions
async function downloadBackup() {
  const statusEl = document.getElementById('backupStatus')
  try {
    statusEl.innerHTML =
      '<div style="color: #667eea; padding: 10px; background: #f0f4ff; border-radius: 4px;">Creating backup...</div>'

    const blob = await apiCreateBackup()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `signalk-units-backup-${Date.now()}.zip`
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)

    statusEl.innerHTML =
      '<div style="color: #27ae60; padding: 10px; background: #e8f5e9; border-radius: 4px;">✓ Backup downloaded successfully!</div>'
    setTimeout(() => {
      statusEl.innerHTML = ''
    }, 5000)
  } catch (error) {
    console.error('Backup error:', error)
    statusEl.innerHTML =
      '<div style="color: #e74c3c; padding: 10px; background: #ffebee; border-radius: 4px;">✗ Failed to create backup</div>'
  }
}

async function restoreBackup(event) {
  const file = event.target.files[0]
  if (!file) return

  const statusEl = document.getElementById('backupStatus')

  if (
    !confirm(
      'Are you sure you want to restore this backup? This will replace all current settings.'
    )
  ) {
    event.target.value = '' // Reset file input
    return
  }

  try {
    statusEl.innerHTML =
      '<div style="color: #3498db; padding: 10px; background: #e3f2fd; border-radius: 4px;">Restoring backup...</div>'

    // Read file and convert to base64
    const arrayBuffer = await file.arrayBuffer()
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))

    const response = await fetch(`${API_BASE}/backups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zipData: base64 })
    })

    if (!response.ok) {
      let errorMsg = 'Failed to restore backup'
      try {
        const error = await response.json()
        errorMsg = error.message || error.error || errorMsg
      } catch (e) {
        errorMsg = `Server error (${response.status}): ${response.statusText}`
      }
      throw new Error(errorMsg)
    }

    statusEl.innerHTML = `<div style="color: #27ae60; padding: 10px; background: #e8f5e9; border-radius: 4px;">
      ✓ Backup restored successfully!<br>
      <small>Reloading in 2 seconds...</small>
    </div>`

    setTimeout(() => {
      window.location.reload()
    }, 2000)
  } catch (error) {
    console.error('Restore error:', error)
    statusEl.innerHTML = `<div style="color: #e74c3c; padding: 10px; background: #ffebee; border-radius: 4px;">✗ Failed to restore: ${error.message}</div>`
  } finally {
    event.target.value = '' // Reset file input
  }
}

// Generic download function for all file types
async function downloadFile(endpoint, fileType) {
  const statusEl = document.getElementById('fileManagementStatus')

  try {
    statusEl.innerHTML =
      '<div style="color: #3498db; padding: 10px; background: #e3f2fd; border-radius: 4px;">Downloading...</div>'

    const json = await apiDownloadFile(endpoint, fileType)
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${fileType}.json`
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)

    statusEl.innerHTML = `<div style="color: #27ae60; padding: 10px; background: #e8f5e9; border-radius: 4px;">✓ Downloaded ${fileType}.json</div>`

    setTimeout(() => {
      statusEl.innerHTML = ''
    }, 3000)
  } catch (error) {
    console.error('Download error:', error)
    statusEl.innerHTML = `<div style="color: #e74c3c; padding: 10px; background: #ffebee; border-radius: 4px;">✗ Failed to download: ${error.message}</div>`
  }
}

// Generic upload function for all file types
async function uploadFile(event, endpoint, fileType) {
  const statusEl = document.getElementById('fileManagementStatus')
  const file = event.target.files[0]

  if (!file) return

  try {
    statusEl.innerHTML =
      '<div style="color: #3498db; padding: 10px; background: #e3f2fd; border-radius: 4px;">Uploading...</div>'

    const text = await file.text()
    const json = JSON.parse(text) // Validate JSON

    await apiUploadFile(endpoint, fileType, json)

    statusEl.innerHTML = `<div style="color: #27ae60; padding: 10px; background: #e8f5e9; border-radius: 4px;">
      ✓ Uploaded ${fileType}.json successfully!<br>
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
