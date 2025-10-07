/**
 * Utility functions used across the application
 * Depends on: app-state.js
 */

/**
 * Sanitize a value for use in HTML IDs
 */
function sanitizeIdSegment(value) {
  return String(value)
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Build a conversion ID from prefix, base unit, and target unit
 */
function buildConversionId(prefix, baseUnit, targetUnit) {
  return `${prefix}-${sanitizeIdSegment(baseUnit)}-${sanitizeIdSegment(targetUnit)}`
}

/**
 * Get current value for a path from SignalK
 */
function getCurrentValue(pathStr) {
  return signalKValues[pathStr]
}

/**
 * Get current value details for a path from SignalK
 */
function getCurrentValueDetails(pathStr) {
  return signalKValueDetails[pathStr]
}

/**
 * Check if a path matches a wildcard pattern
 * * matches any characters except dots
 * ** matches any characters including dots
 */
function matchesPattern(path, pattern) {
  // Convert wildcard pattern to regex
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '___DOUBLE_STAR___')
    .replace(/\*/g, '[^.]+')
    .replace(/___DOUBLE_STAR___/g, '.*')

  const regex = new RegExp(`^${regexPattern}$`)
  return regex.test(path)
}

/**
 * Find matching pattern for a path (sorted by priority)
 */
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

/**
 * Show status message to user
 */
function showStatus(message, type) {
  const statusEl = document.getElementById('statusMessage')
  statusEl.textContent = message
  statusEl.className = `status-message ${type} show`

  setTimeout(() => {
    statusEl.classList.remove('show')
  }, 5000)
}

/**
 * Switch to a specific tab
 */
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

/**
 * Setup tab click handlers
 * This function needs to be called after DOM is loaded
 */
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

      // Re-render metadata when tab is clicked (requires app-metadata.js)
      if (tabName === 'metadata' && typeof renderMetadata === 'function') {
        await renderMetadata()
      }

      // Load custom presets when settings tab is clicked (requires app-categories.js)
      if (tabName === 'settings' && typeof loadCustomPresets === 'function') {
        await loadCustomPresets()
      }
    })
  })
}
