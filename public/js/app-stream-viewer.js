/**
 * Stream Viewer Module
 * Handles WebSocket connection to SignalK delta stream and displays converted values
 * Uses standard SignalK WebSocket for raw values + conversions WebSocket for metadata
 */

let streamWebSocket = null // Main SignalK stream (raw values)
let conversionsWebSocket = null // Conversions metadata stream
let streamDataMap = new Map() // Store path data for display
let isStreamConnected = false
let reconnectTimeout = null
let availableContexts = [] // Will be populated from SignalK
let contextsRefreshInterval = null
let subscriptionMode = 'all' // 'all' or 'single'
let singlePathSubscription = null // Stores the path when in single mode
let conversionsMetadata = {} // Conversion formulas from conversions WebSocket
let currentSubscribedContext = null // Track which context we're subscribed to

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
  const contextSelect = document.getElementById('streamContext')
  const newContext = contextSelect ? contextSelect.value : 'unknown'
  console.log(`Context changed to: ${newContext}`)

  // Reset to all paths mode when switching contexts
  subscriptionMode = 'all'
  singlePathSubscription = null

  // If currently connected, reconnect with new context
  if (isStreamConnected && streamWebSocket && streamWebSocket.readyState === WebSocket.OPEN) {
    console.log('Reconnecting with new context...')

    // Clear data BEFORE disconnecting
    clearStreamData()

    disconnectFromStream()

    // Wait a bit for disconnect to complete, then reconnect
    setTimeout(() => {
      // Clear again after disconnect to ensure no stale data
      clearStreamData()
      connectToStream()
    }, 500)
  } else {
    // Not connected, just clear the data
    clearStreamData()
  }
}

/**
 * Connect to conversions metadata WebSocket
 */
function connectToConversionsMetadata() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = window.location.host
  const wsUrl = `${protocol}//${host}/signalk/v1/conversions/stream`

  try {
    conversionsWebSocket = new WebSocket(wsUrl)

    conversionsWebSocket.onopen = () => {
      console.log('Conversions metadata WebSocket connected')
    }

    conversionsWebSocket.onmessage = event => {
      try {
        const message = JSON.parse(event.data)

        // Handle full and update messages
        if ((message.type === 'full' || message.type === 'update') && message.conversions) {
          conversionsMetadata = message.conversions
          console.log(
            `Conversions metadata updated: ${Object.keys(conversionsMetadata).length} paths`
          )
        }
      } catch (error) {
        console.error('Error parsing conversions metadata:', error)
      }
    }

    conversionsWebSocket.onerror = error => {
      console.error('Conversions metadata WebSocket error:', error)
    }

    conversionsWebSocket.onclose = () => {
      console.log('Conversions metadata WebSocket disconnected')
      // Auto-reconnect after 5 seconds
      setTimeout(() => {
        console.log('Reconnecting to conversions metadata...')
        connectToConversionsMetadata()
      }, 5000)
    }
  } catch (error) {
    console.error('Failed to connect to conversions metadata:', error)
  }
}

/**
 * Connect to standard SignalK WebSocket stream for raw values
 */
function connectToStream() {
  if (streamWebSocket && streamWebSocket.readyState === WebSocket.OPEN) {
    console.log('Already connected to stream')
    return
  }

  updateStreamStatus('Connecting...', '#ffc107')

  // Connect to conversions metadata first (if not already connected)
  if (!conversionsWebSocket || conversionsWebSocket.readyState !== WebSocket.OPEN) {
    connectToConversionsMetadata()
  }

  // Connect to standard SignalK WebSocket stream
  // IMPORTANT: Use subscribe=none to prevent SignalK from auto-subscribing to 'self'
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = window.location.host
  const wsUrl = `${protocol}//${host}/signalk/v1/stream?subscribe=none`

  try {
    streamWebSocket = new WebSocket(wsUrl)

    streamWebSocket.onopen = () => {
      console.log('SignalK stream connected')
      isStreamConnected = true
      updateStreamStatus('Connected', '#4caf50')

      // Show/hide buttons
      document.getElementById('streamConnectBtn').style.display = 'none'
      document.getElementById('streamDisconnectBtn').style.display = 'inline-block'

      // Subscribe to paths
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

  // Reset subscribed context tracking
  currentSubscribedContext = null

  // Note: Keep conversionsWebSocket connected - it's lightweight and provides metadata

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
 * Subscribe to paths from standard SignalK stream
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

    // Get all available paths from conversions metadata
    const allPaths = Object.keys(conversionsMetadata)

    if (allPaths.length === 0) {
      console.warn('No conversions metadata available yet, waiting...')
      // Retry after conversions metadata loads
      setTimeout(subscribeToConvertedPaths, 1000)
      return
    }

    // If we're changing contexts, first unsubscribe from everything on the old context
    if (
      currentSubscribedContext &&
      currentSubscribedContext !== selectedContext &&
      streamWebSocket &&
      streamWebSocket.readyState === WebSocket.OPEN
    ) {
      console.log(`⚠️  Unsubscribing from old context: ${currentSubscribedContext}`)

      // Unsubscribe from ALL using wildcard
      const unsubscribeMessage = {
        context: currentSubscribedContext,
        unsubscribe: [{ path: '*' }]
      }

      streamWebSocket.send(JSON.stringify(unsubscribeMessage))
      console.log(`   - Sent unsubscribe wildcard for old context`)

      // Give SignalK time to process the unsubscribe before subscribing to new context
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    let subscriptions = []
    let unsubscriptions = []

    if (subscriptionMode === 'single' && singlePathSubscription) {
      // Unsubscribe from ALL paths in current context, then subscribe to single path
      unsubscriptions = [{ path: '*' }]
      subscriptions = [
        {
          path: singlePathSubscription,
          period: 1000,
          format: 'delta',
          policy: 'instant'
        }
      ]
    } else {
      // Subscribe to all paths
      subscriptions = allPaths.map(path => ({
        path: path,
        period: 1000,
        format: 'delta',
        policy: 'instant'
      }))
    }

    // Send standard SignalK subscription message for new context
    if (streamWebSocket && streamWebSocket.readyState === WebSocket.OPEN) {
      const message = {
        context: selectedContext,
        subscribe: subscriptions,
        ...(unsubscriptions.length > 0 && { unsubscribe: unsubscriptions })
      }

      console.log(`📡 Subscribing to context: ${selectedContext}`)
      console.log(`   - ${subscriptions.length} path(s)`)
      if (unsubscriptions.length > 0) {
        console.log(
          `   - Also unsubscribing from paths in this context using: ${JSON.stringify(unsubscriptions)}`
        )
      }

      streamWebSocket.send(JSON.stringify(message))

      // Update tracked context
      currentSubscribedContext = selectedContext
    }
  } catch (error) {
    console.error('Error subscribing to paths:', error)
  }
}

/**
 * Duration formatting functions (from formulaEvaluator.ts)
 */
const pad2 = value => value.toString().padStart(2, '0')
const pad3 = value => value.toString().padStart(3, '0')

function formatDurationDHMS(totalSeconds) {
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = Math.floor(totalSeconds % 60)
  return `${pad2(days)}:${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`
}

function formatDurationHMS(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = Math.floor(totalSeconds % 60)
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`
}

function formatDurationHMSMillis(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = Math.floor(totalSeconds % 60)
  const milliseconds = Math.round((totalSeconds % 1) * 1000)
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}.${pad3(milliseconds)}`
}

function formatDurationMS(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.floor(totalSeconds % 60)
  return `${pad2(minutes)}:${pad2(seconds)}`
}

function formatDurationMSMillis(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.floor(totalSeconds % 60)
  const milliseconds = Math.round((totalSeconds % 1) * 1000)
  return `${pad2(minutes)}:${pad2(seconds)}.${pad3(milliseconds)}`
}

function formatDurationCompact(totalSeconds) {
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = Math.floor(totalSeconds % 60)

  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

/**
 * Evaluate formula using mathjs (safe, no eval)
 */
function evaluateFormula(formula, value) {
  if (typeof value !== 'number' || !isFinite(value)) {
    throw new Error(`Invalid input value: ${value}`)
  }

  try {
    // Check for duration formatting functions
    if (formula === 'formatDurationDHMS(value)') return formatDurationDHMS(value)
    if (formula === 'formatDurationHMS(value)') return formatDurationHMS(value)
    if (formula === 'formatDurationHMSMillis(value)') return formatDurationHMSMillis(value)
    if (formula === 'formatDurationMS(value)') return formatDurationMS(value)
    if (formula === 'formatDurationMSMillis(value)') return formatDurationMSMillis(value)
    if (formula === 'formatDurationCompact(value)') return formatDurationCompact(value)

    // Use mathjs to evaluate (safe, sandboxed)
    if (typeof math === 'undefined') {
      throw new Error('mathjs library not loaded')
    }

    const result = math.evaluate(formula, { value })

    if (typeof result !== 'number' || !isFinite(result)) {
      throw new Error(`Formula produced invalid result: ${result}`)
    }

    return result
  } catch (error) {
    throw new Error(`Failed to evaluate formula "${formula}": ${error.message}`)
  }
}

/**
 * Map date format key to date-fns pattern (from ConversionEngine.ts)
 */
function getDateFnsPattern(formatKey) {
  const patterns = {
    'short-date': 'MMM d, yyyy',
    'short-date-local': 'MMM d, yyyy',
    'long-date': 'EEEE, MMMM d, yyyy',
    'long-date-local': 'EEEE, MMMM d, yyyy',
    'dd/mm/yyyy': 'dd/MM/yyyy',
    'dd/mm/yyyy-local': 'dd/MM/yyyy',
    'mm/dd/yyyy': 'MM/dd/yyyy',
    'mm/dd/yyyy-local': 'MM/dd/yyyy',
    'mm/yyyy': 'MM/yyyy',
    'mm/yyyy-local': 'MM/yyyy',
    'time-24hrs': 'HH:mm:ss',
    'time-24hrs-local': 'HH:mm:ss',
    'time-am/pm': 'hh:mm:ss a',
    'time-am/pm-local': 'hh:mm:ss a',
    'short-date-24hrs': 'MMM d, yyyy HH:mm:ss',
    'short-date-24hrs-local': 'MMM d, yyyy HH:mm:ss',
    'short-date-am/pm': 'MMM d, yyyy hh:mm:ss a',
    'short-date-am/pm-local': 'MMM d, yyyy hh:mm:ss a',
    'long-date-24hrs': 'EEEE, MMMM d, yyyy HH:mm:ss',
    'long-date-24hrs-local': 'EEEE, MMMM d, yyyy HH:mm:ss',
    'long-date-am/pm': 'EEEE, MMMM d, yyyy hh:mm:ss a',
    'long-date-am/pm-local': 'EEEE, MMMM d, yyyy hh:mm:ss a',
    'dd/mm/yyyy-24hrs': 'dd/MM/yyyy HH:mm:ss',
    'dd/mm/yyyy-24hrs-local': 'dd/MM/yyyy HH:mm:ss',
    'dd/mm/yyyy-am/pm': 'dd/MM/yyyy hh:mm:ss a',
    'dd/mm/yyyy-am/pm-local': 'dd/MM/yyyy hh:mm:ss a',
    'mm/dd/yyyy-24hrs': 'MM/dd/yyyy HH:mm:ss',
    'mm/dd/yyyy-24hrs-local': 'MM/dd/yyyy HH:mm:ss',
    'mm/dd/yyyy-am/pm': 'MM/dd/yyyy hh:mm:ss a',
    'mm/dd/yyyy-am/pm-local': 'MM/dd/yyyy hh:mm:ss a'
  }

  // If pattern not found, log warning and return null (will trigger fallback)
  const pattern = patterns[formatKey]
  if (!pattern) {
    console.warn(`Unknown date format key: ${formatKey}`)
    return null
  }

  return pattern
}

/**
 * Format number with display format (from formulaEvaluator.ts)
 */
function formatNumber(value, format) {
  const decimalPlaces = format.includes('.') ? format.split('.')[1].length : 0
  return value.toFixed(decimalPlaces)
}

/**
 * Format date value (ported from ConversionEngine.ts)
 * Handles both RFC 3339 strings and Epoch Seconds
 */
function formatDateValue(rawValue, targetUnit, dateFormat, baseUnit) {
  try {
    const normalizedTarget = targetUnit.endsWith('-local')
      ? targetUnit.replace(/-local$/, '')
      : targetUnit
    const formatKey = (dateFormat || normalizedTarget || '').toLowerCase()
    const useLocalTime = targetUnit.endsWith('-local')

    // Handle epoch-seconds special case
    if (formatKey === 'epoch-seconds') {
      let date
      if (baseUnit === 'Epoch Seconds' || typeof rawValue === 'number') {
        date = new Date(rawValue * 1000)
      } else {
        date = new Date(rawValue)
      }

      if (isNaN(date.getTime())) {
        throw new Error('Invalid date value')
      }

      const epochSeconds = Math.floor(date.getTime() / 1000)
      return {
        convertedValue: epochSeconds,
        formatted: String(epochSeconds)
      }
    }

    // Get date-fns format pattern
    const dateFnsPattern = getDateFnsPattern(formatKey)

    if (!dateFnsPattern) {
      // Unknown format - return as-is
      console.debug(`No pattern found for format: ${formatKey}, using raw value`)
      return {
        convertedValue: rawValue,
        formatted: String(rawValue)
      }
    }

    let isoString

    // Convert to ISO string based on input type
    if (baseUnit === 'Epoch Seconds' || typeof rawValue === 'number') {
      isoString = new Date(rawValue * 1000).toISOString()
    } else {
      isoString = rawValue
    }

    const date = dateFns.parseISO(isoString)
    if (isNaN(date.getTime())) {
      throw new Error('Invalid date value')
    }

    const formatted = dateFns.format(date, dateFnsPattern)

    return {
      convertedValue: formatted,
      formatted: formatted
    }
  } catch (error) {
    console.error('Date formatting error:', error)
    return {
      convertedValue: rawValue,
      formatted: String(rawValue)
    }
  }
}

/**
 * Apply conversion formula to raw value (ported from ConversionEngine.ts)
 */
function applyConversion(rawValue, conversionMeta) {
  if (!conversionMeta || !conversionMeta.conversions) {
    return null
  }

  // Get the first (and typically only) target unit conversion
  const targetUnits = Object.keys(conversionMeta.conversions)
  if (targetUnits.length === 0) {
    return null
  }

  const targetUnit = targetUnits[0]
  const conversion = conversionMeta.conversions[targetUnit]

  if (!conversion || !conversion.formula) {
    return null
  }

  const baseUnit = conversionMeta.baseUnit
  const symbol = conversion.symbol || ''
  const displayFormat = conversion.displayFormat || '0.0'

  try {
    // Handle boolean conversions
    if (baseUnit === 'bool' || conversionMeta.category === 'boolean') {
      const boolStr = rawValue ? 'true' : 'false'
      return {
        value: boolStr,
        symbol: '',
        targetUnit: targetUnit,
        formula: 'boolean',
        formatted: boolStr
      }
    }

    // Check if this is a date/time conversion
    if (conversion.dateFormat) {
      const result = formatDateValue(rawValue, targetUnit, conversion.dateFormat, baseUnit)
      return {
        value: result.formatted,
        symbol: '',
        targetUnit: targetUnit,
        formula: `date format: ${conversion.dateFormat}`,
        isDate: true
      }
    }

    // Regular conversion using mathjs (can return number or string for durations)
    const convertedValue = evaluateFormula(conversion.formula, rawValue)

    // Handle duration formatting (returns string)
    if (typeof convertedValue === 'string') {
      const formatted = symbol ? `${convertedValue} ${symbol}`.trim() : convertedValue
      return {
        value: convertedValue,
        symbol: symbol,
        targetUnit: targetUnit,
        formula: conversion.formula,
        formatted: formatted,
        isDuration: true
      }
    }

    // Numeric conversion
    const formattedNumber = formatNumber(convertedValue, displayFormat)
    const formatted = `${formattedNumber} ${symbol}`.trim()

    return {
      value: convertedValue,
      symbol: symbol,
      targetUnit: targetUnit,
      formula: conversion.formula,
      formatted: formatted
    }
  } catch (error) {
    console.error(`Error applying conversion for ${targetUnit}:`, error)
    // Return pass-through on error
    return {
      value: rawValue,
      symbol: '',
      targetUnit: targetUnit,
      formatted: String(rawValue)
    }
  }
}

/**
 * Handle incoming delta message from standard SignalK stream
 */
function handleDeltaMessage(delta) {
  if (!delta.updates) return

  // Extract context from delta
  const deltaContext = delta.context || 'unknown'

  for (const update of delta.updates) {
    if (!update.values) continue

    for (const pathValue of update.values) {
      const path = pathValue.path
      const rawValue = pathValue.value

      // Skip if no path
      if (path === undefined || rawValue === undefined) continue

      // If in single path mode, only process the subscribed path
      if (subscriptionMode === 'single' && path !== singlePathSubscription) {
        continue
      }

      // Look up conversion metadata for this path
      const conversionMeta = conversionsMetadata[path]
      if (!conversionMeta) {
        // No conversion available for this path
        continue
      }

      // Get base unit and category from metadata
      const baseUnit = conversionMeta.baseUnit || ''
      const category = conversionMeta.category || ''

      // Check if we have conversions available
      if (!conversionMeta.conversions) continue

      const targetUnit = Object.keys(conversionMeta.conversions)[0]

      // Apply conversion formula (will pass-through if conversion fails)
      const converted = applyConversion(rawValue, conversionMeta)

      // If conversion failed, create pass-through
      const convertedOrPassthrough = converted || {
        value: rawValue,
        symbol: '',
        targetUnit: targetUnit || baseUnit,
        formatted: typeof rawValue === 'object' ? JSON.stringify(rawValue) : String(rawValue)
      }

      // Store or update the data
      let pathData = streamDataMap.get(path) || {
        originalPath: path,
        originalValue: null,
        convertedValue: null,
        timestamp: null,
        source: null,
        baseUnit: null,
        targetUnit: null,
        category: null,
        context: null
      }

      pathData.originalValue = rawValue
      pathData.convertedValue = convertedOrPassthrough
      pathData.timestamp = update.timestamp || new Date().toISOString()
      pathData.source = update.$source || 'unknown'
      pathData.baseUnit = baseUnit
      pathData.targetUnit = convertedOrPassthrough.targetUnit
      pathData.category = category
      pathData.context = deltaContext

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
    const message =
      subscriptionMode === 'single'
        ? `Waiting for data from path: ${singlePathSubscription}...`
        : 'Waiting for data...'
    streamDataDiv.innerHTML = `<div style="color: #6c757d; text-align: center; padding: 40px;">${message}</div>`
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
    const context = data.context || 'unknown'
    const baseUnit = data.baseUnit || (data.convertedValue && data.convertedValue.baseUnit) || ''
    const targetUnit =
      data.targetUnit || (data.convertedValue && data.convertedValue.targetUnit) || ''

    // Shorten context for display
    let contextDisplay = context.replace('vessels.', '')
    if (contextDisplay.startsWith('urn:mrn:imo:mmsi:')) {
      contextDisplay = 'MMSI:' + contextDisplay.replace('urn:mrn:imo:mmsi:', '')
    }

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
                        <div style="font-size: 10px; margin-top: 2px; font-weight: 600; color: #e74c3c;">Context: ${escapeHtml(contextDisplay)}</div>
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
    return '<span style="color: #95a5a6;">-</span>'
  }

  // If we have a pre-formatted string from the conversion, use that
  if (convertedData.formatted) {
    return escapeHtml(convertedData.formatted)
  }

  // Fallback to manual formatting
  if (convertedData.value !== undefined) {
    let valueStr

    // Check if this is a date or duration (already formatted string)
    if (
      convertedData.isDate ||
      convertedData.isDuration ||
      typeof convertedData.value === 'string'
    ) {
      valueStr = String(convertedData.value)
    } else if (typeof convertedData.value === 'number') {
      // Format numbers to reasonable precision
      valueStr = convertedData.value.toFixed(2)
    } else {
      valueStr = String(convertedData.value)
    }

    const symbolStr = convertedData.symbol ? ` ${convertedData.symbol}` : ''
    return `${escapeHtml(valueStr)}${escapeHtml(symbolStr)}`
  }

  return '<span style="color: #95a5a6;">-</span>'
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
  if (conversionsWebSocket) {
    conversionsWebSocket.close()
  }
})

// Initialize context dropdown and conversions metadata when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    populateContexts()
    startContextAutoRefresh()
    connectToConversionsMetadata() // Auto-connect to metadata stream
  })
} else {
  populateContexts()
  startContextAutoRefresh()
  connectToConversionsMetadata() // Auto-connect to metadata stream
}
