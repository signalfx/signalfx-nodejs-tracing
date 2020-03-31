'use strict'

const Tags = require('opentracing').Tags
const analyticsSampler = require('../analytics_sampler')
const tx = require('./util/tx')

const OPERATION_NAME = 'pg.query'

function createWrapQuery (tracer, config) {
  return function wrapQuery (query) {
    return function queryWithTrace () {
      const scope = tracer.scope()
      const childOf = scope.active()
      const span = tracer.startSpan(OPERATION_NAME, {
        childOf,
        tags: {
          [Tags.SPAN_KIND]: Tags.SPAN_KIND_RPC_CLIENT,
          'service.name': config.service || `${tracer._service}-postgres`,
          'component': 'pg',
          'db.type': 'postgres'
        }
      })

      analyticsSampler.sample(span, config.analytics)

      const retval = scope.bind(query, span).apply(this, arguments)
      const queryQueue = this.queryQueue || this._queryQueue
      const activeQuery = this.activeQuery || this._activeQuery
      const pgQuery = queryQueue[queryQueue.length - 1] || activeQuery

      if (!pgQuery) {
        return retval
      }

      const originalCallback = pgQuery.callback
      const statement = pgQuery.text
      const params = this.connectionParameters

      span.setTag('resource.name', statement.split(' ')[0])
      span.setTag('db.statement', statement)

      if (params) {
        span.addTags({
          'db.instance': params.database,
          'db.user': params.user
        })
        tx.setHost(span, params.host, params.port)
      }

      pgQuery.callback = scope.bind((err, res) => {
        if (err) {
          span.addTags({
            'sfx.error.kind': err.name,
            'sfx.error.message': err.message,
            'sfx.error.stack': err.stack
          })
        }

        span.finish()

        if (originalCallback) {
          originalCallback(err, res)
        }
      }, childOf)

      return retval
    }
  }
}

module.exports = [
  {
    name: 'pg',
    versions: ['>=4'],
    patch (pg, tracer, config) {
      this.wrap(pg.Client.prototype, 'query', createWrapQuery(tracer, config))
    },
    unpatch (pg) {
      this.unwrap(pg.Client.prototype, 'query')
    }
  },
  {
    name: 'pg',
    versions: ['>=4'],
    file: 'lib/native/index.js',
    patch (Client, tracer, config) {
      this.wrap(Client.prototype, 'query', createWrapQuery(tracer, config))
    },
    unpatch (Client) {
      this.unwrap(Client.prototype, 'query')
    }
  }
]
