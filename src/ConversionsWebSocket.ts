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

  constructor(
    private app: ServerAPI,
    private unitsManager: UnitsManager
  ) {}

  /**
   * Initialize WebSocket server on the given HTTP server
   */
  initialize(server: any, path: string = '/signalk/v1/conversions/stream'): void {
    this.wss = new WebSocket.Server({
      server,
      path
    })

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

    this.app.debug(`ConversionsWS: WebSocket server initialized at ${path}`)
  }

  /**
   * Send full conversions map to a specific client
   */
  private async sendFullConversions(client: ConversionsClient): Promise<void> {
    try {
      const conversions = await this.unitsManager.getPathsMetadata()
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
   */
  async broadcastUpdate(): Promise<void> {
    if (this.clients.size === 0) {
      return
    }

    try {
      const conversions = await this.unitsManager.getPathsMetadata()
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

      this.app.debug(`ConversionsWS: Broadcast update to ${sentCount}/${this.clients.size} clients`)
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
    for (const client of this.clients) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.close()
      }
    }
    this.clients.clear()

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
