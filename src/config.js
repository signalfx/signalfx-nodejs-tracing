'use strict'

const URL = require('url-parse')
const platform = require('./platform')
const coalesce = require('koalas')

class Config {
  constructor (service, options) {
    options = typeof service === 'object' ? service : options || {}

    const enabled = coalesce(options.enabled, platform.env('SIGNALFX_TRACE_ENABLED'), true)
    const debug = coalesce(options.debug, platform.env('SIGNALFX_TRACE_DEBUG'), false)
    const logInjection = coalesce(options.logInjection, platform.env('SIGNALFX_LOGS_INJECTION'), false)
    const env = coalesce(options.env, platform.env('SIGNALFX_ENV'))
    const url = coalesce(options.url, platform.env('SIGNALFX_TRACE_AGENT_URL'), null)
    const protocol = 'http'
    const hostname = coalesce(
      options.hostname,
      platform.env('SIGNALFX_AGENT_HOST'),
      platform.env('SIGNALFX_TRACE_AGENT_HOSTNAME'),
      'localhost'
    )
    const port = coalesce(options.port, platform.env('SIGNALFX_TRACE_AGENT_PORT'), 9080)
    const zipkin = coalesce(options.zipkin, true)
    const path = coalesce(options.path, '/api/v2/spans')
    const headers = coalesce(options.headers, {})
    const sampleRate = coalesce(Math.min(Math.max(options.sampleRate, 0), 1), 1)
    const flushInterval = coalesce(parseInt(options.flushInterval, 10), 2000)
    const plugins = coalesce(options.plugins, true)

    this.enabled = String(enabled) === 'true'
    this.debug = String(debug) === 'true'
    this.logInjection = String(logInjection) === 'true'
    this.env = env
    this.url = url ? new URL(url) : new URL(`${protocol}://${hostname}:${port}`)
    this.zipkin = zipkin
    this.path = path
    this.headers = headers
    this.tags = Object.assign({}, options.tags)
    this.flushInterval = flushInterval
    this.bufferSize = 100000
    this.sampleRate = sampleRate
    this.logger = options.logger
    this.plugins = !!plugins
    this.service = coalesce(options.service, platform.env('SIGNALFX_SERVICE_NAME'), service, 'node')
  }
}

module.exports = Config
