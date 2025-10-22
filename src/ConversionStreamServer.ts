/**
 * Conversion Stream Server
 *
 * Provides a dedicated WebSocket endpoint for streaming converted values.
 * This keeps SignalK's data tree pure (SI units only) while providing
 * real-time conversions to clients.
 */

import { ServerAPI } from '@signalk/server-api'
import { UnitsManager } from './UnitsManager'
import { PatternMatcher } from './PatternMatcher'
import WebSocket from 'ws'

/**
 * Subscription configuration with SignalK-compliant parameters
 */
interface SubscriptionConfig {
  path: string
  period?: number // Update period in milliseconds (default: 1000)
  format?: 'delta' | 'full' // Response format (default: delta)
  policy?: 'instant' | 'ideal' | 'fixed' // Update policy (default: ideal)
  minPeriod?: number // Minimum period in milliseconds (rate limiting)
  lastSent?: number // Timestamp of last sent update (for throttling)
}

interface StreamClient {
  ws: WebSocket
  context: string
  contextPattern?: string // For wildcard context matching (e.g., "vessels.*")
  subscriptions: Map<string, SubscriptionConfig> // Path pattern -> config
}

interface SubscriptionMessage {
  context?: string
  subscribe?: Array<{
    path: string
    period?: number
    format?: 'delta' | 'full'
    policy?: 'instant' | 'ideal' | 'fixed'
    minPeriod?: number
  }>
  unsubscribe?: Array<{
    path: string
  }>
}

export class ConversionStreamServer {
  private app: ServerAPI
  private unitsManager: UnitsManager
  private sendMeta: boolean
  private wss: WebSocket.Server | null = null
  private clients: Set<StreamClient> = new Set()
  private signalkWs: WebSocket | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private pendingSubscriptionUpdate: boolean = false // Track if subscriptions need updating when connection opens
  private httpServer: any = null
  private upgradeHandler: ((request: any, socket: any, head: any) => void) | null = null
  private conversionCache: Map<string, any> = new Map() // Cache for conversion metadata (path → ConversionResponse)
  private patternMatcher: PatternMatcher
  private needsAllContexts: boolean = false // Track if we need to receive all vessel contexts

  constructor(app: ServerAPI, unitsManager: UnitsManager, sendMeta: boolean = false) {
    this.app = app
    this.unitsManager = unitsManager
    this.sendMeta = sendMeta
    this.patternMatcher = new PatternMatcher(app)
  }

  /**
   * Start the WebSocket server
   */
  start(httpServer: any): void {
    // Save httpServer reference for cleanup
    this.httpServer = httpServer

    // Create WebSocket server on a path
    this.wss = new WebSocket.Server({
      noServer: true,
      path: '/plugins/signalk-units-preference/stream'
    })

    // Handle WebSocket upgrade requests
    this.upgradeHandler = (request: any, socket: any, head: any) => {
      const url = new URL(request.url, `http://${request.headers.host}`)
      const pathname = url.pathname

      if (pathname === '/plugins/signalk-units-preference/stream') {
        // Parse query parameters for initial subscription
        const subscribe = url.searchParams.get('subscribe')

        // Check if wss is still available (server might be stopping)
        if (!this.wss) {
          this.app.debug('WebSocket server is not available, rejecting upgrade')
          socket.destroy()
          return
        }

        // Accept all connections (authentication happens at SignalK level)
        // The Authorization header is checked by SignalK's security middleware
        // during the HTTP upgrade process
        this.wss.handleUpgrade(request, socket, head, ws => {
          if (this.wss) {
            // Pass the subscribe parameter through the request object
            ;(request as any).initialSubscribe = subscribe
            this.wss.emit('connection', ws, request)
          }
        })
      }
    }

    httpServer.on('upgrade', this.upgradeHandler)

    this.wss.on('connection', (ws: WebSocket, request: any) => {
      this.handleClientConnection(ws, request)
    })

    // Register cache clear callback with UnitsManager
    // This ensures cache is invalidated when preferences change
    this.unitsManager.setPreferencesChangeCallback(() => {
      this.conversionCache.clear()
      this.app.debug('Conversion cache cleared due to preferences change')
    })

    // Connect to SignalK WebSocket internally
    this.connectToSignalK()

    this.app.debug('Conversion stream server started on /plugins/signalk-units-preference/stream')
  }

  /**
   * Stop the WebSocket server
   */
  stop(): void {
    // Remove upgrade event handler from HTTP server to prevent race conditions
    if (this.httpServer && this.upgradeHandler) {
      this.httpServer.removeListener('upgrade', this.upgradeHandler)
      this.app.debug('Removed upgrade event handler from HTTP server')
      this.upgradeHandler = null
      this.httpServer = null
    }

    // Disconnect from SignalK
    if (this.signalkWs) {
      this.signalkWs.close()
      this.signalkWs = null
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    // Close all client connections
    for (const client of this.clients) {
      client.ws.close()
    }
    this.clients.clear()

    // Close the server
    if (this.wss) {
      this.wss.close()
      this.wss = null
    }

    this.app.debug('Conversion stream server stopped')
  }

  /**
   * Connect to SignalK WebSocket internally
   */
  private connectToSignalK(): void {
    try {
      const protocol = 'ws:' // Internal connection
      const host = 'localhost'
      const port = (this.app as any).config?.settings?.port || 3000

      // If any client needs wildcard contexts (vessels.*), connect with ?subscribe=all
      // to receive deltas for all vessels. Otherwise, use ?subscribe=none and send
      // specific subscription messages
      const subscribeParam = this.needsAllContexts ? 'all' : 'none'
      const wsUrl = `${protocol}//${host}:${port}/signalk/v1/stream?subscribe=${subscribeParam}`

      this.app.debug(`Connecting to internal SignalK stream (subscribe=${subscribeParam})`)
      this.signalkWs = new WebSocket(wsUrl)

      this.signalkWs.on('open', () => {
        this.app.debug('Internal SignalK connection established')
        // Always process subscriptions when connection opens
        // This handles subscriptions that arrived before the connection was ready
        this.updateSignalKSubscriptions()
      })

      this.signalkWs.on('message', (data: WebSocket.Data) => {
        try {
          const delta = JSON.parse(data.toString())

          // Debug: Log first delta received to verify connection is working
          if (!this.signalkWs || (this.signalkWs as any)._receivedFirstDelta !== true) {
            this.app.debug(
              `Internal SignalK: Receiving deltas (context: ${delta.context || 'unknown'})`
            )
            if (this.signalkWs) {
              ;(this.signalkWs as any)._receivedFirstDelta = true
            }
          }

          this.handleSignalKDelta(delta)
        } catch (error) {
          this.app.error(`Error parsing SignalK delta: ${error}`)
        }
      })

      this.signalkWs.on('error', error => {
        this.app.error(`SignalK WebSocket error: ${error}`)
      })

      this.signalkWs.on('close', () => {
        this.app.debug('Internal SignalK connection closed, reconnecting in 5s...')
        this.signalkWs = null
        this.pendingSubscriptionUpdate = true

        // Reconnect after 5 seconds
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null
          this.connectToSignalK()
        }, 5000)
      })
    } catch (error) {
      this.app.error(`Failed to connect to SignalK: ${error}`)
    }
  }

  /**
   * Handle new client connection
   */
  private handleClientConnection(ws: WebSocket, request?: any): void {
    const clientId = `client-${Math.random().toString(36).substr(2, 9)}`
    const client: StreamClient = {
      ws,
      context: 'vessels.self',
      subscriptions: new Map()
    }
    ;(client as any).id = clientId

    this.clients.add(client)

    // Apply initial subscription from query parameter if provided
    // SignalK spec: ?subscribe=all, ?subscribe=self, ?subscribe=none
    const initialSubscribe = request?.initialSubscribe
    if (initialSubscribe) {
      this.app.debug(`[${clientId}] Connected with ?subscribe=${initialSubscribe}`)
      this.applyInitialSubscription(client, initialSubscribe)
    } else {
      this.app.debug(`[${clientId}] Connected (no initial subscription)`)
    }

    ws.on('message', (data: WebSocket.Data) => {
      try {
        const message: SubscriptionMessage = JSON.parse(data.toString())
        this.handleClientMessage(client, message)
      } catch (error) {
        this.app.error(`Error parsing client message: ${error}`)
      }
    })

    ws.on('close', () => {
      this.clients.delete(client)
      this.app.debug('Conversion stream client disconnected')
      this.updateSignalKSubscriptions()
    })

    ws.on('error', error => {
      this.app.error(`Client WebSocket error: ${error}`)
    })
  }

  /**
   * Handle client subscription message
   */
  private handleClientMessage(client: StreamClient, message: SubscriptionMessage): void {
    let changed = false

    if (message.context) {
      client.context = message.context

      // Store context pattern for wildcard matching (e.g., "vessels.*")
      if (message.context.includes('*')) {
        client.contextPattern = message.context
        this.app.debug(`Client context changed to wildcard: ${message.context}`)
        changed = true
      } else {
        client.contextPattern = undefined
      }
    }

    // IMPORTANT: Process unsubscribe BEFORE subscribe
    // This allows clients to clear all subscriptions and then add new ones atomically
    if (message.unsubscribe) {
      for (const unsub of message.unsubscribe) {
        // Support wildcard unsubscribe (e.g., "*" to clear all)
        if (unsub.path === '*' || unsub.path === '**') {
          client.subscriptions.clear()
          this.app.debug('Client cleared all subscriptions')
          changed = true
        } else {
          client.subscriptions.delete(unsub.path)
        }
      }
    }

    if (message.subscribe) {
      for (const sub of message.subscribe) {
        const config: SubscriptionConfig = {
          path: sub.path,
          period: sub.period ?? 1000, // Default 1 second
          format: sub.format ?? 'delta', // Default delta format
          policy: sub.policy ?? 'ideal', // Default ideal policy
          minPeriod: sub.minPeriod
        }
        client.subscriptions.set(sub.path, config)

        // Log important subscriptions (wildcards)
        if (sub.path.includes('*')) {
          this.app.debug(`[${(client as any).id}] Subscribed to pattern: ${sub.path}`)
          changed = true
        }
      }
    }

    // Update SignalK subscriptions
    if (message.subscribe || message.unsubscribe) {
      if (changed) {
        this.app.debug(
          `[${(client as any).id}] Subscriptions updated (${client.subscriptions.size} patterns, context: ${client.context})`
        )
      }
      this.updateSignalKSubscriptions()
    }
  }

  /**
   * Update SignalK subscriptions based on all clients
   */
  private updateSignalKSubscriptions(): void {
    // Collect all unique subscriptions across all clients
    const allPaths = new Set<string>()
    const allContexts = new Set<string>()
    let hasWildcardContext = false

    for (const client of this.clients) {
      // Check if any client wants wildcard contexts
      if (client.contextPattern || client.context.includes('*')) {
        hasWildcardContext = true
      } else {
        allContexts.add(client.context)
      }

      for (const [path, _config] of client.subscriptions) {
        allPaths.add(path)
      }
    }

    // Check if we need to reconnect with different subscribe parameter
    if (hasWildcardContext !== this.needsAllContexts) {
      this.needsAllContexts = hasWildcardContext
      this.app.debug(
        `Reconnecting to SignalK (wildcard contexts ${hasWildcardContext ? 'enabled' : 'disabled'})`
      )

      // Reconnect with new subscribe parameter
      if (this.signalkWs) {
        this.signalkWs.close()
      }
      this.connectToSignalK()
      return // Will retry when connection opens
    }

    // Check if internal SignalK connection is ready
    if (!this.signalkWs || this.signalkWs.readyState !== WebSocket.OPEN) {
      this.pendingSubscriptionUpdate = true
      return
    }

    // Clear pending flag - we're processing now
    this.pendingSubscriptionUpdate = false

    if (allPaths.size === 0) {
      return // No subscriptions yet
    }

    const subscriptions = Array.from(allPaths).map(path => ({
      path,
      period: 1000,
      format: 'delta',
      policy: 'instant'
    }))

    if (hasWildcardContext) {
      // When connected with ?subscribe=all, we receive all contexts automatically
      // Just send path subscriptions without context to get all vessels
      this.signalkWs.send(
        JSON.stringify({
          context: 'vessels.self', // Required field, but server sends all contexts anyway
          subscribe: subscriptions
        })
      )

      this.app.debug(`Subscribed to ${subscriptions.length} paths (all contexts)`)
    } else {
      // Subscribe to each specific context separately
      for (const context of allContexts) {
        this.signalkWs.send(
          JSON.stringify({
            context,
            subscribe: subscriptions
          })
        )
      }

      this.app.debug(`Subscribed to ${subscriptions.length} paths (${allContexts.size} contexts)`)
    }
  }

  /**
   * Handle delta message from SignalK
   */
  private handleSignalKDelta(delta: any): void {
    if (!delta.updates || delta.updates.length === 0) {
      return
    }

    const context = delta.context || 'vessels.self'
    const selfId = (this.app as any).selfId
    const isSelf = context === 'vessels.self' || (selfId && context === `vessels.${selfId}`)

    // DEBUG: Only log for non-self vessels (AIS targets)
    if (!isSelf) {
      const receivedPaths = delta.updates
        .flatMap((u: any) => u.values?.map((v: any) => v.path) || [])
        .slice(0, 3)
      if (receivedPaths.length > 0) {
        this.app.debug(
          `AIS Delta from ${context}: ${receivedPaths.join(', ')}${delta.updates[0].values?.length > 3 ? '...' : ''}`
        )
      }
    }

    // CRITICAL: Check if ANY client is interested in this context BEFORE processing
    // This prevents wasting CPU on AIS targets when clients only want vessels.self
    // Now supports wildcard contexts like "vessels.*"
    const hasInterestedClient = Array.from(this.clients).some(client =>
      this.matchesContext(context, client)
    )
    if (!hasInterestedClient && !isSelf) {
      this.app.debug(`No interested clients for AIS context: ${context}`)
      return
    }
    if (!hasInterestedClient) {
      return
    }

    for (const update of delta.updates) {
      if (!update.values || update.values.length === 0) {
        continue
      }

      const convertedValues: any[] = []
      const metadataEntries: any[] = []

      for (const pathValue of update.values) {
        const { path, value } = pathValue

        if (!path || value === undefined || value === null) {
          continue
        }

        // Skip if already converted
        if (path.endsWith('.unitsConverted')) {
          continue
        }

        try {
          // Convert the value (returns converted value AND metadata in one call)
          const result = this.convertValue(path, value)

          // If conversion failed or is pass-through, send original value as-is
          if (!result) {
            const fallbackValue = {
              converted: value,
              formatted: typeof value === 'object' ? JSON.stringify(value) : String(value),
              original: value
            }
            convertedValues.push({
              path: path,
              value: fallbackValue
            })
            continue
          }

          // Send converted value at the ORIGINAL path (not .unitsConverted)
          // This dedicated stream is meant to provide converted values transparently
          convertedValues.push({
            path: path, // Use original path, NOT path.unitsConverted
            value: {
              converted: result.converted,
              formatted: result.formatted,
              original: result.original
            }
          })

          // Build metadata entry if sendMeta is enabled
          // Use metadata from convertValue() result - NO redundant getConversion() call!
          if (this.sendMeta) {
            metadataEntries.push({
              path: path, // Metadata for original path
              value: result.metadata // Already available from convertPathValue()
            })
          }
        } catch (error) {
          // Even on error, send the original value through
          const fallbackValue = {
            converted: value,
            formatted: typeof value === 'object' ? JSON.stringify(value) : String(value),
            original: value
          }
          convertedValues.push({
            path: path,
            value: fallbackValue
          })
        }
      }

      // Send converted values to interested clients
      if (convertedValues.length > 0) {
        const deltaUpdate: any = {
          $source: update.$source || 'units-preference',
          timestamp: update.timestamp || new Date().toISOString(),
          values: convertedValues
        }

        // Add metadata if we have any
        if (metadataEntries.length > 0) {
          deltaUpdate.meta = metadataEntries
        }

        const convertedDelta = {
          context,
          updates: [deltaUpdate]
        }

        this.broadcastToClients(convertedDelta, context)
      }
    }
  }

  /**
   * Convert a value using the UNIFIED conversion method with caching
   * Returns the full result including metadata to avoid redundant getConversion() calls
   *
   * Caching strategy:
   * - Caches the metadata portion of conversion results per path
   * - Cache is cleared when preferences change (via callback in start())
   * - This optimizes repeated conversions of the same paths across multiple deltas
   */
  private convertValue(
    path: string,
    value: any
  ): { converted: any; formatted: string; original: any; metadata: any } | null {
    try {
      // Check cache for previously computed metadata
      // This helps when the same path appears in multiple deltas
      const cachedMetadata = this.conversionCache.get(path)

      // Convert the value using the UNIFIED conversion method
      const result = this.unitsManager.convertPathValue(path, value)

      // Cache the metadata if this is first time seeing this path
      // Metadata rarely changes (only when preferences update)
      if (!cachedMetadata) {
        this.conversionCache.set(path, result.metadata)
      }

      return {
        converted: result.converted,
        formatted: result.formatted,
        original: result.original,
        metadata: result.metadata // Keep metadata to avoid redundant getConversion() call
      }
    } catch (error) {
      this.app.debug(`Conversion failed for ${path}: ${error}`)
      return null
    }
  }

  /**
   * Apply initial subscription based on query parameter
   * SignalK spec: ?subscribe=all, ?subscribe=self, ?subscribe=none
   */
  private applyInitialSubscription(client: StreamClient, subscribe: string): void {
    switch (subscribe.toLowerCase()) {
      case 'all':
        // Subscribe to all paths in all contexts
        client.context = 'vessels.*'
        client.contextPattern = 'vessels.*'
        client.subscriptions.set('**', {
          path: '**',
          period: 1000,
          format: 'delta',
          policy: 'ideal'
        })
        this.updateSignalKSubscriptions()
        break

      case 'self':
        // Subscribe to all paths for self vessel (default behavior)
        client.context = 'vessels.self'
        client.subscriptions.set('**', {
          path: '**',
          period: 1000,
          format: 'delta',
          policy: 'ideal'
        })
        this.updateSignalKSubscriptions()
        break

      case 'none':
        // No initial subscription - client will send subscribe messages later
        break

      default:
        this.app.debug(`Unknown subscribe parameter: ${subscribe}, defaulting to none`)
        break
    }
  }

  /**
   * Broadcast delta to interested clients
   */
  private broadcastToClients(delta: any, context: string): void {
    const paths = delta.updates[0]?.values.map((v: any) => v.path) || []
    const selfId = (this.app as any).selfId
    const isSelf = context === 'vessels.self' || (selfId && context === `vessels.${selfId}`)

    if (!isSelf) {
      this.app.debug(`Broadcasting AIS data from ${context} to ${this.clients.size} clients`)
    }

    for (const client of this.clients) {
      const clientId = (client as any).id || 'unknown'

      // Check if client is interested in this context (with wildcard support)
      const contextMatches = this.matchesContext(context, client)
      if (!contextMatches) {
        continue
      }

      // Check if client is interested in any of these paths (with wildcard support)
      const matchingPaths = this.getMatchingPaths(paths, client, isSelf)
      if (matchingPaths.length === 0) {
        continue
      }

      // Filter delta to only include paths this client wants
      const filteredDelta = this.filterDeltaForClient(delta, matchingPaths, client)

      if (filteredDelta && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify(filteredDelta))
        if (!isSelf) {
          this.app.debug(`[${clientId}] Sent ${matchingPaths.length} AIS paths`)
        }
      }
    }
  }

  /**
   * Check if a context matches the client's context subscription (with wildcard support)
   */
  private matchesContext(context: string, client: StreamClient): boolean {
    const clientId = (client as any).id || 'unknown'
    const selfId = (this.app as any).selfId
    const isSelf = context === 'vessels.self' || (selfId && context === `vessels.${selfId}`)

    // If client has a wildcard context pattern, use pattern matching
    if (client.contextPattern) {
      const matches = this.patternMatcher.matchesPattern(context, client.contextPattern)
      // Only log for AIS targets
      if (!isSelf) {
        this.app.debug(
          `[${clientId}] AIS context match: ${context} vs ${client.contextPattern} = ${matches}`
        )
      }
      return matches
    }

    // Otherwise, exact match
    return client.context === context
  }

  /**
   * Get paths that match client's subscriptions (with wildcard support)
   */
  private getMatchingPaths(
    paths: string[],
    client: StreamClient,
    isSelf: boolean = false
  ): string[] {
    const matchingPaths: string[] = []
    const clientId = (client as any).id || 'unknown'

    // DEBUG: Only log for AIS targets
    if (!isSelf) {
      const patterns = Array.from(client.subscriptions.keys())
      this.app.debug(
        `[${clientId}] Patterns: ${patterns.slice(0, 3).join(', ')}${patterns.length > 3 ? `... (${patterns.length} total)` : ''}`
      )
      this.app.debug(
        `[${clientId}] Incoming AIS paths: ${paths.slice(0, 3).join(', ')}${paths.length > 3 ? '...' : ''}`
      )
    }

    for (const path of paths) {
      // Check each subscription pattern
      for (const [pattern, _config] of client.subscriptions) {
        const matches = this.patternMatcher.matchesPattern(path, pattern)
        if (matches) {
          matchingPaths.push(path)
          if (!isSelf) {
            this.app.debug(`[${clientId}] ✓ ${path} matches ${pattern}`)
          }
          break // Don't add the same path multiple times
        }
      }
    }

    if (!isSelf) {
      this.app.debug(`[${clientId}] Matched ${matchingPaths.length}/${paths.length} AIS paths`)
    }
    return matchingPaths
  }

  /**
   * Filter delta to only include paths the client is interested in
   * and apply subscription parameters (period, policy, format, minPeriod)
   */
  private filterDeltaForClient(delta: any, matchingPaths: string[], client: StreamClient): any {
    if (!delta.updates || delta.updates.length === 0) {
      return null
    }

    const now = Date.now()
    const filteredUpdates = []

    for (const update of delta.updates) {
      if (!update.values || update.values.length === 0) {
        continue
      }

      const filteredValues = []
      const filteredMeta = []

      for (const pathValue of update.values) {
        const { path, value } = pathValue

        // Only include paths that matched
        if (!matchingPaths.includes(path)) {
          continue
        }

        // Find the subscription config for this path
        let matchedConfig: SubscriptionConfig | undefined
        for (const [pattern, config] of client.subscriptions) {
          if (this.patternMatcher.matchesPattern(path, pattern)) {
            matchedConfig = config
            break
          }
        }

        if (!matchedConfig) {
          continue
        }

        // Apply throttling based on minPeriod and policy
        if (matchedConfig.minPeriod && matchedConfig.lastSent) {
          const timeSinceLastSent = now - matchedConfig.lastSent
          if (timeSinceLastSent < matchedConfig.minPeriod) {
            // Skip this update due to rate limiting
            continue
          }
        }

        // Update last sent timestamp
        matchedConfig.lastSent = now

        // Add to filtered values
        filteredValues.push({ path, value })

        // Add metadata if present
        if (update.meta) {
          const metaEntry = update.meta.find((m: any) => m.path === path)
          if (metaEntry) {
            filteredMeta.push(metaEntry)
          }
        }
      }

      if (filteredValues.length > 0) {
        const filteredUpdate: any = {
          $source: update.$source || 'units-preference',
          timestamp: update.timestamp || new Date().toISOString(),
          values: filteredValues
        }

        if (filteredMeta.length > 0) {
          filteredUpdate.meta = filteredMeta
        }

        filteredUpdates.push(filteredUpdate)
      }
    }

    if (filteredUpdates.length === 0) {
      return null
    }

    return {
      context: delta.context,
      updates: filteredUpdates
    }
  }
}
