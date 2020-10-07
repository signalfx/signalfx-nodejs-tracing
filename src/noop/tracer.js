'use strict'

const Tracer = require('opentracing').Tracer
const Scope = require('../scope/new/base')
const Span = require('./span')

class NoopTracer extends Tracer {
  constructor (config) {
    super(config)

    let ScopeManager

    if (process.env.SIGNALFX_CONTEXT_PROPAGATION === 'false') {
      ScopeManager = require('../scope/noop/scope_manager')
    } else {
      ScopeManager = require('../scope/scope_manager')
    }

    this._scopeManager = new ScopeManager()
    this._scope = new Scope()
    this._span = new Span(this)
  }

  withNonReportingScope (callback) {
    return callback()
  }

  trace (name, options, fn) {
    return fn(this._span, () => {})
  }

  wrap (name, options, fn) {
    return fn
  }

  scopeManager () {
    return this._scopeManager
  }

  scope () {
    return this._scope
  }

  currentSpan () {
    return null
  }

  _startSpan (name, options) {
    return this._span
  }

  flush () {
    return Promise.resolve()
  }
}

module.exports = NoopTracer
