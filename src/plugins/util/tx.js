'use strict'

const ipaddr = require('ipaddr.js')

const tx = {
  // Set the outgoing host by its deduced kind
  setHost (span, hostname, port) {
    try {
      const parsed = ipaddr.parse(hostname)
      if (parsed.kind() === 'ipv4') {
        span.setTag('peer.ipv4', hostname)
      } else {
        span.setTag('peer.ipv6', hostname)
      }
    } catch (e) {
      hostname && span.setTag('peer.hostname', hostname)
    }
    port && span.setTag('peer.port', port)
  },

  // Wrap a promise or a callback to also finish the span.
  wrap (span, done) {
    if (typeof done === 'function' || !done) {
      return wrapCallback(span, done)
    } else if (isPromise(done)) {
      return wrapPromise(span, done)
    }
  }
}

function wrapCallback (span, callback) {
  const scope = span.tracer().scope()
  const previous = scope.active()

  return function (err) {
    finish(span, err)

    if (callback) {
      return scope.activate(previous, () => callback.apply(this, arguments))
    }
  }
}

function wrapPromise (span, promise) {
  promise.then(
    () => finish(span),
    err => finish(span, err)
  )

  return promise
}

function finish (span, error) {
  if (error) {
    span.addTags({
      'sfx.error.kind': error.name,
      'sfx.error.object': error.name,
      'sfx.error.message': error.message,
      'sfx.error.stack': error.stack
    })
  }

  span.finish()
}

function isPromise (obj) {
  return isObject(obj) && typeof obj.then === 'function'
}

function isObject (obj) {
  return typeof obj === 'object' && obj !== null
}

module.exports = tx
