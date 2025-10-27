/**
 * WebSocket stream for unit conversions
 * Pushes conversion metadata updates to connected clients in real-time
 */

import { ServerAPI } from '@signalk/server-api'
import { UnitsManager } from './UnitsManager'
import WebSocket from 'ws'

interface ConversionsClient {
  ws: WebSocket
  id: string
}

export class ConversionsWebSocket {
  private clients: Set<ConversionsClient> = new Set()
  private wss: WebSocket.Server | null = null
  private clientIdCounter = 0
  private wsPath: string = '/signalk/v1/conversions/stream'
  private upgradeHandler: ((request: any, socket: any, head: any) => void) | null = null
  private httpServer: any = null

  constructor(
    private app: ServerAPI,
    private unitsManager: UnitsManager
  ) {}

  /**
   * Initialize WebSocket server on the given HTTP server
   * Uses noServer mode to avoid conflicts with SignalK's main WebSocket
   */
  initialize(server: any, path: string = '/signalk/v1/conversions/stream'): void {
    this.wsPath = path
    this.httpServer = server

    // Create WebSocket server in noServer mode to avoid conflicts
    this.wss = new WebSocket.Server({ noServer: true })

    this.wss.on('connection', (ws: WebSocket) => {
      const client: ConversionsClient = {
        ws,
        id: `client-${++this.clientIdCounter}`
      }

      this.clients.add(client)
      this.app.debug(`ConversionsWS: Client ${client.id} connected (${this.clients.size} total)`)

      // Send full conversions map on connect
      this.sendFullConversions(client)

      ws.on('close', () => {
        this.clients.delete(client)
        this.app.debug(`ConversionsWS: Client ${client.id} disconnected (${this.clients.size} total)`)
      })

      ws.on('error', (error) => {
        this.app.error(`ConversionsWS: Client ${client.id} error: ${error}`)
        this.clients.delete(client)
      })
    })

    // Create upgrade handler function
    this.upgradeHandler = (request: any, socket: any, head: any) => {
      const pathname = new URL(request.url, `http://${request.headers.host}`).pathname

      // Only handle upgrades for our specific path
      if (pathname === this.wsPath) {
        this.wss!.handleUpgrade(request, socket, head, (ws) => {
          this.wss!.emit('connection', ws, request)
        })
      }
      // Otherwise, let SignalK's WebSocket handler deal with it
    }

    // Attach upgrade handler to HTTP server
    server.on('upgrade', this.upgradeHandler)

    this.app.debug(`ConversionsWS: WebSocket server initialized at ${path} (noServer mode)`)
  }

  /**
   * Send full conversions map to a specific client
   */
  private async sendFullConversions(client: ConversionsClient): Promise<void> {
    try {
      // Use cache (30s TTL) on client connect for efficiency
      const conversions = await this.unitsManager.getPathsMetadata(true)
      const message = {
        type: 'full',
        timestamp: new Date().toISOString(),
        conversions
      }

      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify(message))
        this.app.debug(`ConversionsWS: Sent full conversions (${Object.keys(conversions).length} paths) to ${client.id}`)
      }
    } catch (error) {
      this.app.error(`ConversionsWS: Error sending full conversions to ${client.id}: ${error}`)
    }
  }

  /**
   * Broadcast full conversions update to all connected clients
   * Uses cache by default (30s TTL) to prevent API hammering on preference changes
   */
  async broadcastUpdate(): Promise<void> {
    if (this.clients.size === 0) {
      return
    }

    try {
      // Use cache by default to prevent API hammering
      // The cache gets invalidated on preference changes, so data will be fresh
      // within 30 seconds without requiring immediate SignalK API fetch
      const conversions = await this.unitsManager.getPathsMetadata(true, false)
      const message = {
        type: 'update',
        timestamp: new Date().toISOString(),
        conversions
      }

      const messageStr = JSON.stringify(message)
      let sentCount = 0

      for (const client of this.clients) {
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(messageStr)
          sentCount++
        }
      }

      this.app.debug(`ConversionsWS: Broadcast update to ${sentCount}/${this.clients.size} clients (using cache)`)
    } catch (error) {
      this.app.error(`ConversionsWS: Error broadcasting update: ${error}`)
    }
  }

  /**
   * Broadcast a delta update for specific paths
   */
  broadcastDelta(paths: string[]): void {
    if (this.clients.size === 0 || paths.length === 0) {
      return
    }

    const message = {
      type: 'delta',
      timestamp: new Date().toISOString(),
      paths
    }

    const messageStr = JSON.stringify(message)
    let sentCount = 0

    for (const client of this.clients) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(messageStr)
        sentCount++
      }
    }

    this.app.debug(`ConversionsWS: Broadcast delta for ${paths.length} paths to ${sentCount} clients`)
  }

  /**
   * Close all connections and cleanup
   */
  shutdown(): void {
    // Remove upgrade event handler from HTTP server
    if (this.httpServer && this.upgradeHandler) {
      this.httpServer.removeListener('upgrade', this.upgradeHandler)
      this.app.debug('ConversionsWS: Removed upgrade handler from HTTP server')
      this.upgradeHandler = null
      this.httpServer = null
    }

    // Close all client connections
    for (const client of this.clients) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.close()
      }
    }
    this.clients.clear()

    // Close WebSocket server
    if (this.wss) {
      this.wss.close()
      this.wss = null
    }

    this.app.debug('ConversionsWS: Shutdown complete')
  }

  /**
   * Get number of connected clients
   */
  getClientCount(): number {
    return this.clients.size
  }
}
