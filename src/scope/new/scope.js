'use strict'

const asyncHooks = require('../async_hooks')
const eid = asyncHooks.executionAsyncId || asyncHooks.currentId
const Base = require('./base')
const platform = require('../../platform')
const semver = require('semver')

// https://github.com/nodejs/node/issues/19859
const hasKeepAliveBug = !semver.satisfies(process.version, '^8.13 || >=10.14.2')

let singleton = null

class Scope extends Base {
  constructor (options) {
    if (singleton) return singleton

    super()

    singleton = this

    this._spans = Object.create(null)
    this._types = Object.create(null)
    this._weaks = new WeakMap()
    this._hook = asyncHooks.createHook({
      init: this._init.bind(this),
      destroy: this._destroy.bind(this),
      promiseResolve: this._destroy.bind(this)
    })

    this._hook.enable()
  }

  _active () {
    return this._spans[eid()] || null
  }

  _activate (span, callback) {
    const asyncId = eid()
    const oldSpan = this._spans[asyncId]

    this._spans[asyncId] = span

    try {
      return callback()
    } catch (e) {
      if (span && typeof span.addTags === 'function') {
        span.addTags({
          'error.type': e.name,
          'error.msg': e.message,
          'error.stack': e.stack
        })
      }

      throw e
    } finally {
      if (oldSpan) {
        this._spans[asyncId] = oldSpan
      } else {
        delete this._spans[asyncId]
      }
    }
  }

  _init (asyncId, type, triggerAsyncId, resource) {
    this._spans[asyncId] = this._active()
    this._types[asyncId] = type

    if (hasKeepAliveBug && (type === 'TCPWRAP' || type === 'HTTPPARSER')) {
      this._destroy(this._weaks.get(resource))
      this._weaks.set(resource, asyncId)
    }

    platform.metrics().increment('async.resources')
    platform.metrics().increment('async.resources.by.type', `resource_type:${type}`)
  }

  _destroy (asyncId) {
    const type = this._types[asyncId]

    if (type) {
      platform.metrics().decrement('async.resources')
      platform.metrics().decrement('async.resources.by.type', `resource_type:${type}`)
    }

    delete this._spans[asyncId]
    delete this._types[asyncId]
  }
}

module.exports = Scope
