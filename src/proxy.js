'use strict'

const BaseTracer = require('opentracing').Tracer
const NoopTracer = require('./noop/tracer')
const SignalFxTracer = require('./tracer')
const Config = require('./config')
const Instrumenter = require('./instrumenter')
const platform = require('./platform')
const log = require('./log')

const noop = new NoopTracer()

class Tracer extends BaseTracer {
  constructor () {
    super()
    this._tracer = noop
    this._instrumenter = new Instrumenter(this)
    this._deprecate = method => log.deprecate(`tracer.${method}`, [
      `tracer.${method}() is deprecated.`,
      'Please use tracer.startSpan() and tracer.scope() instead.',
      'See: https://github.com/signalfx/signalfx-nodejs-tracing/blob/master/docs/API.md#manual-instrumentation.'

    ].join(' '))
  }

  /**
   * Initializes the tracer. This should be called before importing other libraries.
   *
   * @param {Object} [options] Configuration options.
   * @param {boolean} [options.enabled=true] Whether to enable the tracer.
   * @param {boolean} [options.debug=false] Enable debug logging in the tracer.
   * @param {string} [options.service] The service name to be used for this program.
   * @param {string} [options.url='http://localhost:9080/v1/trace'] The url to the trace agent that the tracer will
   * submit to. Takes precedence over hostname and port, if set.
   * @param {string} [options.hostname=localhost] The address of the trace agent that the tracer will submit to.
   * @param {number|string} [options.port=9080] The port of the trace agent that the tracer will submit to.
   * @param {boolean} [options.zipkin=true] Enable Zipkin v2 JSON writer instead of trace agent writer
   * @param {string} [options.path=''] The endpoint for Zipkin collector that the tracer will submit to.
   * Used with options.hostname/port.
   * @param {string} [options.accessToken] The optional organization access token for SignalFx trace submissions.
   * @param {Object} [options.headers={}] Any headers to provide to ZipkinV2Writer POST requests
   * @param {number} [options.sampleRate=1] Percentage of spans to sample as a float between 0 and 1.
   * @param {number} [options.flushInterval=2000] Interval in milliseconds at which the tracer
   * will submit traces to the agent.
   * @param {Object|boolean} [options.experimental={}] Experimental features can be enabled all at once
   * using boolean `true` or individually using key/value pairs.
   * @param {boolean} [options.plugins=true] Whether to load all built-in plugins.
   * @returns {Tracer} Self
   */
  init (options) {
    if (this._tracer === noop) {
      try {
        const service = platform.service()
        const config = new Config(service, options)

        if (config.enabled) {
          platform.validate()
          platform.configure(config)

          if (config.runtimeMetrics) {
            platform.metrics().start()
          }

          this._tracer = new SignalFxTracer(config)
          this._instrumenter.enable()
          this._instrumenter.patch(config)
        }
      } catch (e) {
        log.error(e)
      }
    }

    return this
  }

  withNonReportingScope (callback) {
    return this._tracer.withNonReportingScope(callback)
  }

  use () {
    this._instrumenter.use.apply(this._instrumenter, arguments)
    return this
  }

  trace (name, options, fn) {
    if (!fn) {
      fn = options
      options = {}
    }

    if (typeof fn !== 'function') return

    options = options || {}

    return this._tracer.trace(name, options, fn)
  }

  wrap (name, options, fn) {
    if (!fn) {
      fn = options
      options = {}
    }

    if (typeof fn !== 'function') return fn

    options = options || {}

    return this._tracer.wrap(name, options, fn)
  }

  startSpan () {
    return this._tracer.startSpan.apply(this._tracer, arguments)
  }

  inject () {
    return this._tracer.inject.apply(this._tracer, arguments)
  }

  extract () {
    return this._tracer.extract.apply(this._tracer, arguments)
  }

  scopeManager () {
    this._deprecate('scopeManager')
    return this._tracer.scopeManager.apply(this._tracer, arguments)
  }

  scope () {
    return this._tracer.scope.apply(this._tracer, arguments)
  }

  currentSpan () {
    this._deprecate('currentSpan')
    return this._tracer.currentSpan.apply(this._tracer, arguments)
  }

  bind (callback) {
    this._deprecate('bind')
    return callback
  }

  bindEmitter () {
    this._deprecate('bindEmitter')
  }

  flush () {
    return this._tracer.flush.apply(this._tracer, arguments)
  }
}

module.exports = Tracer
