'use strict'

const platform = require('../platform')
const log = require('../log')
const format = require('./format')
const Writer = require('../writer')

class ZipkinV2Writer extends Writer {
  constructor (prioritySampler, url, size, path, headers) {
    super(prioritySampler, url, size)
    this.format = format
    this.encode = (trace) => trace
    this._path = path
    this._headers = headers
  }

  flush () {
    if (this._queue.length > 0) {
      let spans = []
      this._queue.forEach((trace) => { spans = spans.concat(trace) })
      const data = JSON.stringify(spans)

      this._request(data)

      this._queue = []
    }
  }

  _request (data) {
    const options = {
      protocol: this._url.protocol,
      hostname: this._url.hostname,
      port: this._url.port,
      path: this._path,
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, this._headers)
    }
    log.debug(() => `Request to the agent: ${JSON.stringify(options)}`)

    platform
      .request(Object.assign({ data }, options))
      .catch(e => log.error(e))
  }
}

module.exports = ZipkinV2Writer
