'use strict'

const analyticsSampler = require('../analytics_sampler')
const tx = require('./util/tx')

function createWrapCommand (tracer, config) {
  return function wrapCommand (command) {
    return function commandWithTrace (queryCompiler, server) {
      const scope = tracer.scope()
      const childOf = scope.active()
      const span = tracer.startSpan('memcached.command', {
        childOf,
        tags: {
          'span.kind': 'client',
          'span.type': 'memcached',
          'service.name': config.service || `${tracer._service}-memcached`
        }
      })

      analyticsSampler.sample(span, config.analytics)

      queryCompiler = wrapQueryCompiler(queryCompiler, this, server, scope, span)

      return scope.bind(command, span).call(this, queryCompiler, server)
    }
  }
}

function wrapQueryCompiler (original, client, server, scope, span) {
  const parent = scope.active()

  return function () {
    const query = original.apply(this, arguments)
    const callback = query.callback

    span.addTags({
      'resource.name': query.type,
      'db.statement': query.command,
      'db.type': 'memcached'
    })

    addHost(span, client, server, query)

    query.callback = scope.bind(function (err) {
      addError(span, err)

      span.finish()

      return callback.apply(this, arguments)
    }, parent)

    return query
  }
}

function addHost (span, client, server, query) {
  const address = getAddress(client, server, query)

  if (address) {
    tx.setHost(span, address[0], address[1])
  }
}

function addError (span, error) {
  if (error) {
    span.addTags({
      'sfx.error.kind': error.name,
      'sfx.error.object': error.name,
      'sfx.error.message': error.message,
      'sfx.error.stack': error.stack
    })
  }

  return error
}

function getAddress (client, server, query) {
  if (!server) {
    if (client.servers.length === 1) {
      server = client.servers[0]
    } else {
      let redundancy = client.redundancy && client.redundancy < client.servers.length
      const queryRedundancy = query.redundancyEnabled

      if (redundancy && queryRedundancy) {
        redundancy = client.HashRing.range(query.key, (client.redundancy + 1), true)
        server = redundancy.shift()
      } else {
        server = client.HashRing.get(query.key)
      }
    }
  }

  return server && server.split(':')
}

module.exports = {
  name: 'memcached',
  versions: ['>=2.2'],
  patch (Memcached, tracer, config) {
    this.wrap(Memcached.prototype, 'command', createWrapCommand(tracer, config))
  },
  unpatch (Memcached) {
    this.unwrap(Memcached.prototype, 'command')
  }
}
