'use strict'

const platform = require('../platform')
const log = require('../log')
const format = require('./format')
const Writer = require('../writer')

class ZipkinV2Writer extends Writer {
  constructor (prioritySampler, url, path, headers) {
    super(prioritySampler, url)
    // The dd-writer updates service-based sampling priorities for each
    // trace write to the agent.  We just need to prime the default
    // AUTO_KEEP sampler for subsequent isSampled(span) calls
    this._prioritySampler.update({})

    this.format = format
    this.encode = (trace) => trace
    this._path = path
    this._headers = headers
  }

  flush () {
    if (this._queue.length > 0) {
      const spans = []
      this._queue.forEach((trace) => {
        trace.forEach((span) => {
          spans.push(span)
        })
      })
      const data = JSON.stringify(spans)

      this._request(data)

      this._queue = []
      this._size = 0
    }
  }

  _request (data) {
    const options = {
      protocol: this._url.protocol,
      hostname: this._url.hostname,
      port: this._url.port,
      path: this._url.pathname,
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
