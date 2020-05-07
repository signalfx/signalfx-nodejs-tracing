'use strict'

const URL = require('url-parse')
const platform = require('./platform')
const version = require('../lib/version')
const coalesce = require('koalas')

class Config {
  constructor (service, options) {
    options = options || {}

    const enabled = coalesce(options.enabled, platform.env('SIGNALFX_TRACING_ENABLED'), true)
    const debug = coalesce(options.debug, platform.env('SIGNALFX_TRACING_DEBUG'), false)
    const logInjection = coalesce(options.logInjection, platform.env('SIGNALFX_LOGS_INJECTION'), false)
    const env = coalesce(options.env, platform.env('SIGNALFX_ENV'))
    const url = coalesce(
      options.url, platform.env('SIGNALFX_ENDPOINT_URL'),
      platform.env('SIGNALFX_INGEST_URL'), 'http://localhost:9080/v1/trace'
    )
    const accessToken = coalesce(options.accessToken, platform.env('SIGNALFX_ACCESS_TOKEN'))
    const protocol = 'http'
    const hostname = coalesce(
      options.hostname,
      platform.env('SIGNALFX_AGENT_HOST'),
      platform.env('SIGNALFX_TRACE_AGENT_HOSTNAME'),
      'localhost'
    )
    const port = coalesce(options.port, platform.env('SIGNALFX_TRACE_AGENT_PORT'), 9080)
    const zipkin = coalesce(options.zipkin, true)
    const path = coalesce(options.path, '')
    const headers = coalesce(options.headers, {})
    const sampleRate = coalesce(Math.min(Math.max(options.sampleRate, 0), 1), 1)
    const flushInterval = coalesce(parseInt(options.flushInterval, 10), 2000)
    const plugins = coalesce(options.plugins, true)
    const dogstatsd = options.dogstatsd || {}
    const runtimeMetrics = coalesce(options.runtimeMetrics, platform.env('SIGNALFX_RUNTIME_METRICS_ENABLED'), false)
    const analytics = coalesce(
      options.analytics,
      platform.env('SIGNALFX_TRACE_ANALYTICS_ENABLED'),
      platform.env('SIGNALFX_TRACE_ANALYTICS')
    )

    this.enabled = String(enabled) === 'true'
    this.debug = String(debug) === 'true'
    this.logInjection = String(logInjection) === 'true'
    this.env = env
    this.url = url ? new URL(url) : new URL(`${protocol}://${hostname}:${port}${path}`)
    this.zipkin = zipkin
    this.path = path
    this.headers = headers

    if (accessToken) {
      this.headers['x-sf-token'] = accessToken
    }
    this.hostname = hostname || this.url.hostname
    this.flushInterval = flushInterval
    this.sampleRate = sampleRate
    this.logger = options.logger
    this.plugins = !!plugins
    this.service = coalesce(options.service, platform.env('SIGNALFX_SERVICE_NAME'), service, 'unnamed-nodejs-service')
    this.analytics = String(analytics) === 'true'
    this.tags = Object.assign({
      'signalfx.tracing.library': 'nodejs-tracing',
      'signalfx.tracing.version': version
    }, options.tags)
    if (process.env.SIGNALFX_SPAN_TAGS) {
      for (const segment of process.env.SIGNALFX_SPAN_TAGS.split(',')) {
        const kv = segment.split(':')
        if (kv.length === 2 && kv[0].trim().length !== 0 && kv[1].trim().length !== 0) {
          this.tags[kv[0].trim()] = kv[1].trim()
        }
      }
    }
    this.dogstatsd = {
      port: String(coalesce(dogstatsd.port, platform.env('DD_DOGSTATSD_PORT'), 8125))
    }
    this.runtimeMetrics = String(runtimeMetrics) === 'true'
    this.experimental = {}
  }
}

module.exports = Config
