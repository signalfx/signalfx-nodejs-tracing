'use strict'

const platform = require('./platform')
const log = require('./log')
const format = require('./format')
const encode = require('./encode')
const tracerVersion = require('../lib/version')

const MAX_SIZE = 8 * 1024 * 1024 // 8MB

class Writer {
  constructor (prioritySampler, url) {
    this._queue = []
    this._prioritySampler = prioritySampler
    this._url = url
    this.format = format
    this.encode = encode
    this._size = 0
  }

  get length () {
    return this._queue.length
  }

  append (span) {
    const spanContext = span.context()
    const trace = spanContext._trace

    if (trace.started.length === trace.finished.length) {
      this._prioritySampler.sample(spanContext)

      const formattedTrace = trace.finished.map(this.format)
      this._erase(trace)

      if (spanContext._sampling.drop === true) {
        log.debug(() => `Dropping trace due to user configured filtering: ${JSON.stringify(formattedTrace)}`)
        return
      }

      log.debug(() => `Encoding trace: ${JSON.stringify(formattedTrace)}`)

      const buffer = this.encode(formattedTrace)

      log.debug(() => `Adding encoded trace to buffer: ${buffer.toString('hex').match(/../g).join(' ')}`)

      if (buffer.length + this._size > MAX_SIZE) {
        this.flush()
      }

      this._size += buffer.length
      this._queue.push(buffer)
    }
  }

  flush () {
    if (this._queue.length > 0) {
      const data = platform.msgpack.prefix(this._queue)

      const request = this._request(data, this._queue.length)

      this._queue = []
      this._size = 0
      return request
    }
  }

  _request (data, count) {
    const options = {
      path: '/v0.4/traces',
      method: 'PUT',
      headers: {
        'Content-Type': 'application/msgpack',
        'Datadog-Meta-Lang': platform.name(),
        'Datadog-Meta-Lang-Version': platform.version(),
        'Datadog-Meta-Lang-Interpreter': platform.engine(),
        'Datadog-Meta-Tracer-Version': tracerVersion,
        'X-Datadog-Trace-Count': String(count)
      }
    }

    if (this._url.protocol === 'unix:') {
      options.socketPath = this._url.pathname
    } else {
      options.protocol = this._url.protocol
      options.hostname = this._url.hostname
      options.port = this._url.port
    }

    log.debug(() => `Request to the agent: ${JSON.stringify(options)}`)

    return platform
      .request(Object.assign({ data }, options))
      .then(res => {
        log.debug(`Response from the agent: ${res}`)

        this._prioritySampler.update(JSON.parse(res).rate_by_service)
      })
      .catch(e => log.error(e))
  }

  _erase (trace) {
    trace.finished.forEach(span => {
      span.context()._tags = {}
      span.context()._logs = []
      span.context()._metrics = {}
    })

    trace.started = []
    trace.finished = []
  }
}

module.exports = Writer
