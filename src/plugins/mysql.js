'use strict'

const Tags = require('opentracing').Tags
const analyticsSampler = require('../analytics_sampler')
const tx = require('./util/tx')

function createWrapQuery (tracer, config) {
  return function wrapQuery (query) {
    return function queryWithTrace (sql, values, cb) {
      const scope = tracer.scope()
      const childOf = scope.active()
      const span = tracer.startSpan('mysql.query', {
        childOf,
        tags: {
          [Tags.SPAN_KIND]: Tags.SPAN_KIND_RPC_CLIENT,
          'service.name': config.service || `${tracer._service}-mysql`,
          'span.type': 'mysql',
          'db.type': 'mysql',
          'db.user': this.config.user
        }
      })

      tx.setHost(span, this.config.host, this.config.port)
      span.setTag('db.instance', this.config.database || 'sql')

      analyticsSampler.sample(span, config.analytics)

      const sequence = scope.bind(query, span).call(this, sql, values, cb)

      span.setTag('resource.name', sequence.sql.split(' ')[0])
      span.setTag('db.statement', sequence.sql)

      if (sequence._callback) {
        sequence._callback = wrapCallback(tracer, span, childOf, sequence._callback)
      } else {
        sequence.on('end', () => {
          span.finish()
        })
      }

      return sequence
    }
  }
}

function createWrapGetConnection (tracer, config) {
  return function wrapGetConnection (getConnection) {
    return function getConnectionWithTrace (cb) {
      const scope = tracer.scope()
      return scope.bind(getConnection).call(this, scope.bind(cb))
    }
  }
}

function wrapCallback (tracer, span, parent, done) {
  return tracer.scope().bind((err, res) => {
    if (err) {
      span.addTags({
        'sfx.error.kind': err.name,
        'sfx.error.message': err.message,
        'sfx.error.stack': err.stack
      })
    }

    span.finish()

    done(err, res)
  }, parent)
}

function patchConnection (Connection, tracer, config) {
  this.wrap(Connection.prototype, 'query', createWrapQuery(tracer, config))
}

function unpatchConnection (Connection) {
  this.unwrap(Connection.prototype, 'query')
}

function patchPool (Pool, tracer, config) {
  this.wrap(Pool.prototype, 'getConnection', createWrapGetConnection(tracer, config))
}

function unpatchPool (Pool) {
  this.unwrap(Pool.prototype, 'getConnection')
}

module.exports = [
  {
    name: 'mysql',
    file: 'lib/Connection.js',
    versions: ['>=2'],
    patch: patchConnection,
    unpatch: unpatchConnection
  },
  {
    name: 'mysql',
    file: 'lib/Pool.js',
    versions: ['>=2'],
    patch: patchPool,
    unpatch: unpatchPool
  }
]
