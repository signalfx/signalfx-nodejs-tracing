'use strict'

const Tags = require('opentracing').Tags

const reservedEvents = [
  'error',
  'connect',
  'disconnect',
  'disconnecting',
  'newListener',
  'removeListener',
  'ping',
  'pong'
]

function createPatchEmit (tracer, config) {
  return function wrapEmit (emit) {
    return function emitWithTrace (eventName, callback) {
      if ((config.omitReserved && reservedEvents.includes(eventName)) ||
          (config.omitEvents && config.omitEvents.includes(eventName))) {
        return emit.apply(this, arguments)
      }

      const scope = tracer.scope()
      const childOf = scope.active()

      const tags = {
        [Tags.SPAN_KIND]: Tags.SPAN_KIND_RPC_CLIENT,
        'component': 'socket.io',
        'namespace': this.name,
        'path': this.server._path,
        'clients.count': this.server.eio.clientsCount,
        'events.count': this._eventsCount
      }

      const span = tracer.startSpan('emit ' + eventName, { childOf, tags: tags })

      try {
        return scope.bind(emit, span).call(this, eventName, callback)
      } catch (e) {
        if (span) {
          span.addTags({
            'error': true,
            'message': e.message,
            'stack': e.stack,
            'error.kind': e.name
          })

          throw e
        }
      } finally {
        span.finish()
      }
    }
  }
}

function patchSocket (socketio, tracer, config) {
  this.wrap(socketio.prototype, 'emit', createPatchEmit(tracer, config))
}

function unpatchSocket (socketio) {
  this.unwrap(socketio.prototype, 'emit')
}

module.exports = [
  {
    name: 'socket.io',
    versions: ['>=1.2.0'],
    patch: patchSocket,
    unpatch: unpatchSocket
  },
  {
    name: 'socket.io',
    file: 'lib/namespace.js',
    versions: ['>=1.2.0'],
    patch: patchSocket,
    unpatch: unpatchSocket
  }
]
