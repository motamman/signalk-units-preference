/**
 * Stream Viewer Module
 * Handles WebSocket connection to SignalK delta stream and displays converted values
 */

let streamWebSocket = null
let streamDataMap = new Map() // Store path data for display
let isStreamConnected = false
let reconnectTimeout = null
let availableContexts = [] // Will be populated from SignalK
let contextsRefreshInterval = null
let subscriptionMode = 'all' // 'all' or 'single'
let singlePathSubscription = null // Stores the path when in single mode

/**
 * Populate context dropdown with available vessels
 */
async function populateContexts(showNotification = false) {
  try {
    // Fetch available vessels from SignalK API
    const vesselsResponse = await fetch('/signalk/v1/api/vessels')
    const vessels = await vesselsResponse.json()

    // Fetch self vessel ID from our plugin endpoint (uses app.selfId)
    const selfResponse = await fetch('/plugins/signalk-units-preference/self')
    const selfData = await selfResponse.json()
    const selfId = selfData.selfId || 'self'

    const oldCount = availableContexts.length
    availableContexts = []

    // Add all vessels with special marking for self
    if (vessels && typeof vessels === 'object') {
      for (const vesselId of Object.keys(vessels)) {
        const context = `vessels.${vesselId}`
        if (!availableContexts.includes(context)) {
          availableContexts.push(context)
        }
      }
    }

    // Sort so self vessel is first
    availableContexts.sort((a, b) => {
      const aIsSelf = a.includes(selfId)
      const bIsSelf = b.includes(selfId)
      if (aIsSelf && !bIsSelf) return -1
      if (!aIsSelf && bIsSelf) return 1
      return a.localeCompare(b)
    })

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

        // Try to get vessel name
        const vesselId = context.replace('vessels.', '')
        const vesselData = vessels[vesselId]
        const vesselName = vesselData?.name || vesselId

        // Check if this is the self vessel
        const isSelf = context.includes(selfId) || vesselId === 'self'
        if (isSelf) {
          option.textContent = `${context} (${vesselName} - This Vessel)`
        } else {
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

  // Reset to all paths mode when switching contexts
  subscriptionMode = 'all'
  singlePathSubscription = null

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
 * Subscribe to a single path
 */
function subscribeToSinglePath(path) {
  // If already subscribed to this path, toggle it off
  if (subscriptionMode === 'single' && singlePathSubscription === path) {
    subscribeToAllPaths()
    return
  }

  subscriptionMode = 'single'
  singlePathSubscription = path
  console.log(`Switching to single path subscription: ${path}`)

  // Clear existing data and resubscribe
  clearStreamData()
  subscribeToConvertedPaths()

  // Update display to show subscription mode
  updateStreamDisplay()
}

/**
 * Subscribe to all paths
 */
function subscribeToAllPaths() {
  subscriptionMode = 'all'
  singlePathSubscription = null
  console.log('Switching to all paths subscription')

  // Clear existing data and resubscribe
  clearStreamData()
  subscribeToConvertedPaths()

  // Update display to show subscription mode
  updateStreamDisplay()
}

/**
 * Subscribe to paths for conversion
 */
async function subscribeToConvertedPaths() {
  try {
    // Get selected context
    const contextSelect = document.getElementById('streamContext')
    if (!contextSelect || !contextSelect.value) {
      console.warn('No context selected, waiting for contexts to load...')
      return
    }
    const selectedContext = contextSelect.value

    // Get all available paths (for unsubscribing)
    const response = await fetch('/plugins/signalk-units-preference/paths')
    const pathsData = await response.json()
    const allPaths = Object.keys(pathsData)

    let subscriptions = []
    let unsubscriptions = []

    if (subscriptionMode === 'single' && singlePathSubscription) {
      // Unsubscribe from ALL paths, then subscribe to single path
      unsubscriptions = allPaths.map(path => ({ path }))
      subscriptions = [{
        path: singlePathSubscription,
        period: 1000,
        format: 'delta',
        policy: 'instant'
      }]
    } else {
      // Subscribe to all paths (no need to unsubscribe in this case, just re-subscribe)
      subscriptions = allPaths.map(path => ({
        path: path,
        period: 1000,
        format: 'delta',
        policy: 'instant'
      }))
    }

    // Send subscription message with selected context
    if (streamWebSocket && streamWebSocket.readyState === WebSocket.OPEN) {
      const message = {
        context: selectedContext,
        subscribe: subscriptions,
        ...(unsubscriptions.length > 0 && { unsubscribe: unsubscriptions })
      }

      streamWebSocket.send(JSON.stringify(message))

      console.log(
        `Subscribed to ${subscriptions.length} paths for conversion (context: ${selectedContext}, mode: ${subscriptionMode})`
      )
      if (unsubscriptions.length > 0) {
        console.log(`Unsubscribed from ${unsubscriptions.length} paths`)
      }
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

      // If in single path mode, only process the subscribed path
      if (subscriptionMode === 'single' && path !== singlePathSubscription) {
        continue // Skip paths that aren't the selected one
      }

      // Store or update the data
      let pathData = streamDataMap.get(path) || {
        originalPath: path,
        originalValue: null,
        convertedValue: null,
        timestamp: null,
        source: null,
        baseUnit: null,
        targetUnit: null
      }

      // Value from plugin contains conversion info
      pathData.convertedValue = value
      pathData.originalValue = value.original !== undefined ? value.original : null
      pathData.timestamp = update.timestamp || new Date().toISOString()
      pathData.source = update.$source || 'unknown'

      // Extract metadata for units information
      if (update.meta && Array.isArray(update.meta)) {
        const metaEntry = update.meta.find(m => m.path === path)
        if (metaEntry && metaEntry.value) {
          pathData.baseUnit = metaEntry.value.originalUnits || metaEntry.value.baseUnit || null
          pathData.targetUnit = metaEntry.value.units || null
        }
      }

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
    // Show appropriate message based on subscription mode
    const message = subscriptionMode === 'single'
      ? `Waiting for data from path: ${singlePathSubscription}...`
      : 'Waiting for data...'
    streamDataDiv.innerHTML =
      `<div style="color: #6c757d; text-align: center; padding: 40px;">${message}</div>`
    return
  }

  // Sort paths alphabetically
  const sortedPaths = Array.from(streamDataMap.keys()).sort()

  let html = '<div style="display: grid; gap: 10px;">'

  // Add subscription mode indicator
  if (subscriptionMode === 'single') {
    html += `
      <div style="background: #fff3cd; border: 1px solid #ffc107; border-radius: 4px; padding: 10px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <strong style="color: #856404;">Single Path Mode:</strong>
          <span style="font-family: 'Courier New', monospace; margin-left: 8px;">${escapeHtml(singlePathSubscription)}</span>
        </div>
        <button onclick="subscribeToAllPaths()" style="background: #007bff; color: white; border: none; padding: 6px 12px; border-radius: 3px; cursor: pointer; font-size: 12px;">
          Show All Paths
        </button>
      </div>
    `
  }

  for (const path of sortedPaths) {
    const data = streamDataMap.get(path)

    // Skip paths without any data
    if (!data) continue

    const timestamp = new Date(data.timestamp).toLocaleTimeString()
    const source = data.source || 'unknown'
    const baseUnit = data.baseUnit || (data.convertedValue && data.convertedValue.baseUnit) || ''
    const targetUnit = data.targetUnit || (data.convertedValue && data.convertedValue.targetUnit) || ''

    // Check if this is the currently subscribed single path
    const isActiveSinglePath = subscriptionMode === 'single' && path === singlePathSubscription
    const borderColor = isActiveSinglePath ? '#ffc107' : '#dee2e6'
    const borderWidth = isActiveSinglePath ? '2px' : '1px'

    html += `
            <div style="background: white; border: ${borderWidth} solid ${borderColor}; border-radius: 4px; padding: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px; flex: 1;">
                        <button
                            onclick="subscribeToSinglePath('${escapeHtml(path).replace(/'/g, "\\'")}')"
                            title="Subscribe to this path only"
                            style="background: ${isActiveSinglePath ? '#ffc107' : '#e3f2fd'};
                                   border: 1px solid ${isActiveSinglePath ? '#ffc107' : '#2196f3'};
                                   color: ${isActiveSinglePath ? '#856404' : '#1976d2'};
                                   cursor: pointer;
                                   padding: 4px 8px;
                                   border-radius: 3px;
                                   font-size: 11px;
                                   font-weight: 600;">
                            ${isActiveSinglePath ? '●' : '○'}
                        </button>
                        <div style="font-weight: 600; color: #2c3e50; font-size: 13px; font-family: 'Courier New', monospace;">
                            ${escapeHtml(path)}
                        </div>
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
                    <div style="background: #f8f9fa; padding: 8px; border-radius: 3px; max-width: 40vw; overflow: hidden;">
                        <div style="font-size: 11px; color: #6c757d; margin-bottom: 4px;">Original (${escapeHtml(baseUnit || '')})</div>
                        <div style="font-weight: 500; color: #6c757d; word-wrap: break-word; overflow-wrap: break-word;">
                            ${formatOriginalValue(data.originalValue)}
                        </div>
                    </div>

                    <div style="background: #e3f2fd; padding: 8px; border-radius: 3px; max-width: 40vw; overflow: hidden;">
                        <div style="font-size: 11px; color: #1976d2; margin-bottom: 4px;">Converted (${escapeHtml(targetUnit || '')})</div>
                        <div style="font-weight: 600; color: #1976d2; word-wrap: break-word; overflow-wrap: break-word;">
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
    const selectedContext = contextSelect ? contextSelect.value : ''

    // Extract just the vessel ID part for display
    let contextDisplay = selectedContext.replace('vessels.', '')

    // Shorten long URNs for display
    if (contextDisplay.startsWith('urn:mrn:imo:mmsi:')) {
      contextDisplay = contextDisplay.replace('urn:mrn:imo:mmsi:', '')
    }

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
