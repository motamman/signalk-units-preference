/**
 * Stream Viewer Module
 * Handles WebSocket connection to SignalK delta stream and displays converted values
 */

let streamWebSocket = null
let streamDataMap = new Map() // Store path data for display
let isStreamConnected = false
let reconnectTimeout = null
let availableContexts = ['vessels.self'] // Will be populated from SignalK
let contextsRefreshInterval = null

/**
 * Populate context dropdown with available vessels
 */
async function populateContexts(showNotification = false) {
  try {
    // Fetch available vessels from SignalK API
    const response = await fetch('/signalk/v1/api/vessels')
    const vessels = await response.json()

    const oldCount = availableContexts.length
    availableContexts = ['vessels.self']

    // Add other vessels if they exist
    if (vessels && typeof vessels === 'object') {
      for (const vesselId of Object.keys(vessels)) {
        const context = `vessels.${vesselId}`
        if (context !== 'vessels.self' && !availableContexts.includes(context)) {
          availableContexts.push(context)
        }
      }
    }

    // Update dropdown
    const contextSelect = document.getElementById('streamContext')
    if (contextSelect) {
      // Store current selection
      const currentSelection = contextSelect.value

      // Remove old listener if exists (to prevent duplicates)
      contextSelect.removeEventListener('change', handleContextChange)

      contextSelect.innerHTML = ''

      for (const context of availableContexts) {
        const option = document.createElement('option')
        option.value = context

        if (context === 'vessels.self') {
          option.textContent = 'vessels.self (This Vessel)'
        } else {
          // Try to get vessel name
          const vesselId = context.replace('vessels.', '')
          const vesselData = vessels[vesselId]
          const vesselName = vesselData?.name || vesselId
          option.textContent = `${context} (${vesselName})`
        }

        contextSelect.appendChild(option)
      }

      // Restore previous selection if it still exists
      if (currentSelection && availableContexts.includes(currentSelection)) {
        contextSelect.value = currentSelection
      }

      // Add change event listener to handle context switching
      contextSelect.addEventListener('change', handleContextChange)
    }

    // Update last refresh time
    const refreshTime = document.getElementById('contextRefreshTime')
    if (refreshTime) {
      refreshTime.textContent = new Date().toLocaleTimeString()
    }

    // Show notification if requested and count changed
    const newCount = availableContexts.length
    if (showNotification && newCount !== oldCount) {
      console.log(`Vessel list updated: ${oldCount} → ${newCount} vessels`)
      if (newCount > oldCount) {
        showTemporaryMessage('contextRefreshBtn', `+${newCount - oldCount} vessel(s)`, 2000)
      }
    }

    console.log(`Found ${availableContexts.length} vessel contexts`)
  } catch (error) {
    console.error('Error populating contexts:', error)
    // Keep default vessels.self
  }
}

/**
 * Start auto-refresh of vessel contexts
 */
function startContextAutoRefresh() {
  // Refresh every 30 seconds
  if (!contextsRefreshInterval) {
    contextsRefreshInterval = setInterval(() => {
      populateContexts(true) // Show notification on auto-refresh
    }, 30000)
    console.log('Context auto-refresh started (30s interval)')
  }
}

/**
 * Stop auto-refresh of vessel contexts
 */
function stopContextAutoRefresh() {
  if (contextsRefreshInterval) {
    clearInterval(contextsRefreshInterval)
    contextsRefreshInterval = null
    console.log('Context auto-refresh stopped')
  }
}

/**
 * Show temporary message on button
 */
function showTemporaryMessage(buttonId, message, duration) {
  const button = document.getElementById(buttonId)
  if (button) {
    const originalText = button.textContent
    button.textContent = message
    button.style.background = '#4caf50'
    setTimeout(() => {
      button.textContent = originalText
      button.style.background = ''
    }, duration)
  }
}

/**
 * Handle context dropdown change
 */
function handleContextChange() {
  console.log('Context changed, clearing data...')

  // Clear current data
  clearStreamData()

  // If currently connected, reconnect with new context
  if (isStreamConnected && streamWebSocket && streamWebSocket.readyState === WebSocket.OPEN) {
    console.log('Reconnecting with new context...')
    disconnectFromStream()
    // Wait a bit for disconnect to complete, then reconnect
    setTimeout(() => {
      connectToStream()
    }, 500)
  }
}

/**
 * Connect to plugin's dedicated WebSocket stream
 */
function connectToStream() {
  if (streamWebSocket && streamWebSocket.readyState === WebSocket.OPEN) {
    console.log('Already connected to stream')
    return
  }

  updateStreamStatus('Connecting...', '#ffc107')

  // Connect to plugin's dedicated WebSocket endpoint (not SignalK's)
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = window.location.host
  const wsUrl = `${protocol}//${host}/plugins/signalk-units-preference/stream`

  try {
    streamWebSocket = new WebSocket(wsUrl)

    streamWebSocket.onopen = () => {
      console.log('Stream connected')
      isStreamConnected = true
      updateStreamStatus('Connected', '#4caf50')

      // Show/hide buttons
      document.getElementById('streamConnectBtn').style.display = 'none'
      document.getElementById('streamDisconnectBtn').style.display = 'inline-block'

      // Subscribe to all paths with unitsConverted suffix
      subscribeToConvertedPaths()
    }

    streamWebSocket.onmessage = event => {
      try {
        const delta = JSON.parse(event.data)
        handleDeltaMessage(delta)
      } catch (error) {
        console.error('Error parsing delta message:', error)
      }
    }

    streamWebSocket.onerror = error => {
      console.error('Stream error:', error)
      updateStreamStatus('Error', '#e74c3c')
    }

    streamWebSocket.onclose = () => {
      console.log('Stream disconnected')
      isStreamConnected = false
      updateStreamStatus('Disconnected', '#6c757d')

      // Show/hide buttons
      document.getElementById('streamConnectBtn').style.display = 'inline-block'
      document.getElementById('streamDisconnectBtn').style.display = 'none'

      // Auto-reconnect after 5 seconds if not manually disconnected
      if (streamWebSocket && reconnectTimeout === null) {
        reconnectTimeout = setTimeout(() => {
          reconnectTimeout = null
          console.log('Attempting to reconnect...')
          connectToStream()
        }, 5000)
      }
    }
  } catch (error) {
    console.error('Failed to connect to stream:', error)
    updateStreamStatus('Connection Failed', '#e74c3c')
  }
}

/**
 * Disconnect from stream
 */
function disconnectFromStream() {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout)
    reconnectTimeout = null
  }

  if (streamWebSocket) {
    streamWebSocket.close()
    streamWebSocket = null
  }

  isStreamConnected = false
  updateStreamStatus('Disconnected', '#6c757d')

  // Show/hide buttons
  document.getElementById('streamConnectBtn').style.display = 'inline-block'
  document.getElementById('streamDisconnectBtn').style.display = 'none'
}

/**
 * Subscribe to paths for conversion
 */
async function subscribeToConvertedPaths() {
  try {
    // Get selected context
    const contextSelect = document.getElementById('streamContext')
    const selectedContext = contextSelect ? contextSelect.value : 'vessels.self'

    // Get all paths from the metadata
    const response = await fetch('/plugins/signalk-units-preference/paths')
    const pathsData = await response.json()

    // Create subscriptions (plugin will convert and stream back)
    const subscriptions = Object.keys(pathsData).map(path => ({
      path: path,
      period: 1000,
      format: 'delta',
      policy: 'instant'
    }))

    // Send subscription message with selected context
    if (streamWebSocket && streamWebSocket.readyState === WebSocket.OPEN) {
      streamWebSocket.send(
        JSON.stringify({
          context: selectedContext,
          subscribe: subscriptions
        })
      )
      console.log(
        `Subscribed to ${subscriptions.length} paths for conversion (context: ${selectedContext})`
      )
    }
  } catch (error) {
    console.error('Error subscribing to paths:', error)
  }
}

/**
 * Handle incoming delta message from plugin's conversion stream
 */
function handleDeltaMessage(delta) {
  if (!delta.updates) return

  for (const update of delta.updates) {
    if (!update.values) continue

    for (const pathValue of update.values) {
      const path = pathValue.path
      const value = pathValue.value

      // Plugin sends converted values directly (not as .unitsConverted paths)
      // The value object contains both converted and original data
      if (!path || !value) continue

      // Store or update the data
      let pathData = streamDataMap.get(path) || {
        originalPath: path,
        originalValue: null,
        convertedValue: null,
        timestamp: null,
        source: null
      }

      // Value from plugin contains conversion info
      pathData.convertedValue = value
      pathData.originalValue = value.original || null
      pathData.timestamp = update.timestamp || new Date().toISOString()
      pathData.source = update.$source || 'unknown'
      streamDataMap.set(path, pathData)
    }
  }

  // Update the display
  updateStreamDisplay()
}

/**
 * Update stream display
 */
function updateStreamDisplay() {
  const streamDataDiv = document.getElementById('streamData')
  if (!streamDataDiv) return

  if (streamDataMap.size === 0) {
    streamDataDiv.innerHTML =
      '<div style="color: #6c757d; text-align: center; padding: 40px;">Waiting for data...</div>'
    return
  }

  // Sort paths alphabetically
  const sortedPaths = Array.from(streamDataMap.keys()).sort()

  let html = '<div style="display: grid; gap: 10px;">'

  for (const path of sortedPaths) {
    const data = streamDataMap.get(path)

    // Only show paths with converted values
    if (!data.convertedValue) continue

    const timestamp = new Date(data.timestamp).toLocaleTimeString()
    const source = data.source || 'unknown'
    const baseUnit = data.convertedValue.baseUnit || ''
    const targetUnit = data.convertedValue.targetUnit || ''

    html += `
            <div style="background: white; border: 1px solid #dee2e6; border-radius: 4px; padding: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                    <div style="font-weight: 600; color: #2c3e50; font-size: 13px; font-family: 'Courier New', monospace; flex: 1;">
                        ${escapeHtml(path)}
                    </div>
                    <div style="font-size: 11px; color: #95a5a6; margin-left: 10px; text-align: right;">
                        <div>${timestamp}</div>
                        <div style="font-size: 10px; margin-top: 2px;">$source: ${escapeHtml(source)}</div>
                    </div>
                </div>

                ${
                  baseUnit && targetUnit
                    ? `
                <div style="font-size: 11px; color: #667eea; margin-bottom: 8px; font-weight: 500;">
                    ${escapeHtml(baseUnit)} → ${escapeHtml(targetUnit)}
                </div>
                `
                    : ''
                }

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <div style="background: #f8f9fa; padding: 8px; border-radius: 3px;">
                        <div style="font-size: 11px; color: #6c757d; margin-bottom: 4px;">Original (${escapeHtml(baseUnit || 'SI')})</div>
                        <div style="font-weight: 500; color: #6c757d;">
                            ${formatOriginalValue(data.originalValue)}
                        </div>
                    </div>

                    <div style="background: #e3f2fd; padding: 8px; border-radius: 3px;">
                        <div style="font-size: 11px; color: #1976d2; margin-bottom: 4px;">Converted (${escapeHtml(targetUnit || '')})</div>
                        <div style="font-weight: 600; color: #1976d2;">
                            ${formatConvertedValue(data.convertedValue)}
                        </div>
                    </div>
                </div>
            </div>
        `
  }

  html += '</div>'
  streamDataDiv.innerHTML = html

  // Auto-scroll to bottom if near bottom (within 100px)
  const isNearBottom =
    streamDataDiv.scrollHeight - streamDataDiv.scrollTop - streamDataDiv.clientHeight < 100
  if (isNearBottom) {
    streamDataDiv.scrollTop = streamDataDiv.scrollHeight
  }
}

/**
 * Format original value for display
 */
function formatOriginalValue(value) {
  if (value === null || value === undefined) {
    return '<span style="color: #95a5a6;">No data</span>'
  }

  if (typeof value === 'object') {
    return JSON.stringify(value)
  }

  return String(value)
}

/**
 * Format converted value for display
 */
function formatConvertedValue(convertedData) {
  if (!convertedData) {
    return '<span style="color: #95a5a6;">No conversion</span>'
  }

  // If convertedData has formatted field, use that
  if (convertedData.formatted) {
    return escapeHtml(convertedData.formatted)
  }

  // Otherwise show value and symbol
  if (convertedData.value !== undefined) {
    const valueStr = String(convertedData.value)
    const symbolStr = convertedData.symbol ? ` ${convertedData.symbol}` : ''
    return `${escapeHtml(valueStr)}${escapeHtml(symbolStr)}`
  }

  return JSON.stringify(convertedData)
}

/**
 * Clear stream data
 */
function clearStreamData() {
  streamDataMap.clear()
  const streamDataDiv = document.getElementById('streamData')
  if (streamDataDiv) {
    if (isStreamConnected) {
      streamDataDiv.innerHTML =
        '<div style="color: #6c757d; text-align: center; padding: 40px;">Waiting for data...</div>'
    } else {
      streamDataDiv.innerHTML =
        '<div style="color: #6c757d; text-align: center; padding: 40px;">Click "Connect to Stream" to start receiving real-time data</div>'
    }
  }
}

/**
 * Update stream status display
 */
function updateStreamStatus(status, color) {
  const statusDiv = document.getElementById('streamStatus')
  if (statusDiv) {
    // Get current context
    const contextSelect = document.getElementById('streamContext')
    const selectedContext = contextSelect ? contextSelect.value : 'vessels.self'
    const contextDisplay =
      selectedContext === 'vessels.self' ? 'self' : selectedContext.replace('vessels.', '')

    statusDiv.textContent = `${status} (${contextDisplay})`
    statusDiv.style.background = color + '20' // 20% opacity
    statusDiv.style.color = color
    statusDiv.style.borderColor = color
  }
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  stopContextAutoRefresh()
  if (streamWebSocket) {
    streamWebSocket.close()
  }
})

// Initialize context dropdown when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    populateContexts()
    startContextAutoRefresh()
  })
} else {
  populateContexts()
  startContextAutoRefresh()
}
