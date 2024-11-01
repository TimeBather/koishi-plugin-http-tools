import { RequestSummary } from './type'
import { Context, Service } from 'cordis'
import { Request } from './storage'
import { Entry } from '@cordisjs/plugin-webui'
import { remove } from 'cosmokit'
import { Symbols } from './symbols'
import {} from '@cordisjs/loader'

export interface HttpSummary{
    user: RequestSummary[]
    capture: RequestSummary[]
    captureEnabled: boolean
}
declare module 'cordis'{
    interface Context{
        'http/data': HttpDataService
    }
}
export interface PluginRecord{
  id: string
  getCount: number
  getDownloadSize: number
  getUploadSize: number
  postCount: number
  postDownloadSize: number
  postUploadSize: number
  otherCount: number
  otherDownloadSize: number
  otherUploadSize: number
}
export class HttpDataService extends Service {
  entry: Entry<HttpSummary>
  constructor(ctx: Context, config: {entry: Entry<HttpSummary>}) {
    super(ctx, 'http/data')
    this.entry = config.entry
  }

  async start() {
    await this.loadSummary()
    this.entry.refresh()
  }

  userSummary: RequestSummary[] = []

  capturedSummary: RequestSummary[] = []

  captured: Request[] = []

  historySummary: RequestSummary[] = []

  history: Request[] = []

  historyMapper: Map<Request, Request> = new Map()

  initMap: WeakMap<RequestInit, Request> = new WeakMap()

  captureEnabled: boolean = true

  idCounter: number = 0

  pluginRecords: Record<string, PluginRecord> = {}

  async loadSummary() {
    this.userSummary = await this.ctx.database.get('requests', {}, [
      'id', 'method', 'path', 'host', 'originalRequest',
    ])
  }

  getSummary() {
    return {
      user: this.userSummary,
      capture: this.capturedSummary,
      history: this.historySummary,
      captureEnabled: this.captureEnabled,
    }
  }

  capture(init: object, request: Request) {
    request.id = this.idCounter++
    this.captured.unshift(request)
    const data = {
      host: request.host,
      method: request.method,
      id: request.id,
      path: request.path,
      startTime: request.startTime,
      originalRequest: request.originalRequest,
    }
    this.initMap.set(init, request)
    this.capturedSummary.unshift(data)
    this.entry?.refresh()
  }

  enableCapture() {
    this.captureEnabled = true
    this.entry?.patch({ captureEnabled: true })
  }

  disableCapture() {
    this.captureEnabled = false
    this.entry?.patch({ captureEnabled: false })
  }

  clearCapture() {
    this.captured = []
    this.capturedSummary = []
    this.entry?.refresh()
  }

  async getRequest(type: string, id: number) {
    if (type === 'capture') {
      return this.captured.find((request) => request.id === id)
    }
    if (type === 'user') {
      return (await this.ctx.database.get('requests', { id }))?.[0]
    }
  }

  async createRequest(request: Request) {
    let url: URL | null = null
    try {
      url = new URL(request.url)
    } catch (e) {}
    request.host = url?.host ?? ''
    request.path = url?.pathname ?? '/'
    const resp = (await this.ctx.database.create('requests', request))
    if (!resp) { return }
    this.userSummary.push({
      host: resp.host,
      method: resp.method,
      id: resp.id,
      path: resp.path,
      startTime: resp.startTime,
    })
    this.entry?.refresh()
    return resp?.id
  }

  async saveRequest(request: Request) {
    if (!request.id) { return }
    let url: URL | null = null
    try {
      url = new URL(request.url)
    } catch (e) {}
    request.host = url?.host ?? ''
    request.path = url?.pathname ?? '/'
    const id = request.id
    delete request['id']
    const resp = (await this.ctx.database.set('requests', id, request))
    if (!resp) { return }
    const summary = this.userSummary.find((summary) => summary.id === id)
    summary.host = request.host
    summary.method = request.method
    summary.id = id
    summary.path = request.path
    summary.startTime = request.startTime
    this.entry?.refresh()
    return resp?.matched
  }

  async deleteRequest(requestInfo: {type: string; id: number}) {
    if (requestInfo.type === 'user') {
      const summary = this.userSummary.find((summary) => summary.id === requestInfo.id)
      if (summary) {
        remove(this.userSummary, summary)
      }
      await this.ctx.database.remove('requests', requestInfo.id)
      this.entry?.refresh()
    }
    if (requestInfo.type === 'capture') {
      const summary = this.capturedSummary.find((summary) => summary.id === requestInfo.id)
      if (summary) {
        remove(this.capturedSummary, summary)
      }
      const request = this.captured.find((request) => request.id === requestInfo.id)
      remove(this.captured, request)
      this.entry?.refresh()
    }
  }

  fillCapture(init: object, request: Partial<Request>) {
    const targetObject = this.initMap.get(init)
    if (!targetObject) { return }
    Object.assign(targetObject, request)
    this.entry?.refresh()
  }

  async doRequest(requestId: number) {
    const request: Request = (await this.ctx.database.get('requests', requestId))?.[0]
    if (!request) {
      throw new Error('Not found')
    }

    try {
      await this.ctx.http(request.url, {
        method: request.method,
        data: request.requestBody,
        headers: request.requestHeaders,
        [Symbols.request]: requestId,
      } as any)
    } catch (e) {}
    return 0
  }

  updatePluginRecord(pluginId: string, record: Partial<PluginRecord>) {
    let original = this.pluginRecords[pluginId]
    if (!original) {
      original = {
        id: pluginId,
        getCount: 0,
        getDownloadSize: 0,
        getUploadSize: 0,
        postCount: 0,
        postDownloadSize: 0,
        postUploadSize: 0,
        otherCount: 0,
        otherDownloadSize: 0,
        otherUploadSize: 0,
      }
    }

    if (record.getCount) original.getCount += record.getCount
    if (record.getDownloadSize) original.getDownloadSize += record.getDownloadSize
    if (record.getUploadSize) original.getUploadSize += record.getUploadSize
    if (record.postCount) original.postCount += record.postCount
    if (record.postDownloadSize) original.postDownloadSize += record.postDownloadSize
    if (record.postUploadSize) original.postUploadSize += record.postUploadSize
    if (record.otherCount) original.otherCount += record.otherCount
    if (record.otherDownloadSize) original.otherDownloadSize += record.otherDownloadSize
    if (record.otherUploadSize) original.otherUploadSize += record.otherUploadSize

    this.pluginRecords[pluginId] = original
  }
}
