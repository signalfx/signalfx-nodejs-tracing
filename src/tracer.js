'use strict'

const Tracer = require('./opentracing/tracer')
const NonReportingSpan = require('./opentracing/nonreporting_span')
const tags = require('../ext/tags')

const SPAN_TYPE = tags.SPAN_TYPE
const RESOURCE_NAME = tags.RESOURCE_NAME
const SERVICE_NAME = tags.SERVICE_NAME
const ANALYTICS = tags.ANALYTICS

class SignalFxTracer extends Tracer {
  constructor (config) {
    super(config)

    let ScopeManager
    let Scope

    if (process.env.SIGNALFX_CONTEXT_PROPAGATION === 'false') {
      ScopeManager = require('./scope/noop/scope_manager')
      Scope = require('./scope/new/base')
    } else {
      ScopeManager = require('./scope/scope_manager')
      Scope = require('./scope/new/scope')
    }

    this._scopeManager = new ScopeManager()
    this._scope = new Scope()
  }

  withNonReportingScope (callback) {
    const span = new NonReportingSpan(this, this._recorder, this._sampler, this._prioritySampler, {
      operationName: 'nonReportingSFXSpan'
    })
    return this.scope().activate(span, () => {
      return callback()
    })
  }

  trace (name, options, fn) {
    options = Object.assign({}, {
      childOf: this.scope().active()
    }, options)

    const span = this.startSpan(name, options)

    addTags(span, options)

    try {
      if (fn.length > 1) {
        return this.scope().activate(span, () => fn(span, err => {
          addError(span, err)
          span.finish()
        }))
      }

      const result = this.scope().activate(span, () => fn(span))

      if (result && typeof result.then === 'function') {
        result.then(
          () => span.finish(),
          err => {
            addError(span, err)
            span.finish()
          }
        )
      } else {
        span.finish()
      }

      return result
    } catch (e) {
      addError(span, e)
      span.finish()
      throw e
    }
  }

  wrap (name, options, fn) {
    const tracer = this

    return function () {
      const cb = arguments[arguments.length - 1]

      if (typeof cb === 'function') {
        return tracer.trace(name, options, (span, done) => {
          arguments[arguments.length - 1] = function (err) {
            done(err)
            return cb.apply(this, arguments)
          }

          fn.apply(this, arguments)
        })
      } else {
        return tracer.trace(name, options, () => fn.apply(this, arguments))
      }
    }
  }

  scopeManager () {
    return this._scopeManager
  }

  scope () {
    return this._scope
  }

  currentSpan () {
    return this.scope().active()
  }
}

function addError (span, error) {
  if (error && error instanceof Error) {
    span.addTags({
      'sfx.error.kind': error.name,
      'sfx.error.message': error.message,
      'sfx.error.stack': error.stack
    })
  }
}

function addTags (span, options) {
  const tags = {}

  if (options.type) tags[SPAN_TYPE] = options.type
  if (options.service) tags[SERVICE_NAME] = options.service
  if (options.resource) tags[RESOURCE_NAME] = options.resource

  tags[ANALYTICS] = options.analytics

  span.addTags(tags)
}

module.exports = SignalFxTracer
