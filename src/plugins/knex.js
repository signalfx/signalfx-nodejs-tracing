'use strict'

const spanSymbol = '_sfxSpan'
const maxQueryLength = 1024

function createWrapBuilder (tracer, config) {
  return function wrapQueryBuilder (original) {
    return function queryBuilderWithTrace () {
      const scope = tracer.scope()
      const span = scope.active()
      const builder = original.apply(this, arguments)
      return Object.defineProperty(builder, spanSymbol, { value: span })
    }
  }
}

function createWrapRunner (wrapper, tracer, config) {
  return function wrapRunner (original) {
    return function runnerWithTrace () {
      const runner = original.apply(this, arguments)
      wrapper.wrap(runner, 'query', createWrapRunnerQuery(tracer, config))
      return runner
    }
  }
}

function createWrapRunnerQuery (tracer, config) {
  return function wrapQuery (original) {
    return function queryWithTrace (q) {
      const scope = tracer.scope()
      const childOf = this.builder[spanSymbol]

      const tags = {
        'component': 'knex',
        'db.statement': q.sql.substr(0, maxQueryLength)
      }
      if (q.timeout !== undefined) {
        tags.timeout = q.timeout
      }

      let spanName = 'knex.client.runner'
      if (q.method !== undefined) {
        spanName = `knex.client.runner.${q.method}`
      }
      const span = tracer.startSpan(spanName, {
        childOf,
        tags
      })
      setDBTags(this, span)

      return scope.activate(span, () => {
        try {
          return original.apply(this, arguments)
        } catch (e) {
          throw addError(span, e)
        } finally {
          span.finish()
        }
      })
    }
  }
}

function addError (span, error) {
  span.setTag('error', 'true')
  span.log({
    'error.type': error.name,
    'error.msg': error.message,
    'error.stack': error.stack
  })
  return error
}

function setDBTags (obj, span) {
  if (obj.client && obj.client.config) {
    const config = obj.client.config
    if (config.client) {
      span.setTag('db.type', config.client)
    }
    if (config.connection) {
      if (config.connection.user) {
        span.setTag('db.user', config.connection.user)
      }
      const instance = config.connection.filename || config.connection.database
      if (instance) {
        span.setTag('db.instance', instance)
      }
    }
  }
}

function patchKnex (version, basePath) {
  return [
    {
      name: 'knex',
      versions: version,
      file: `${basePath}/client.js`,
      patch (Client, tracer, config) {
        this.wrap(Client.prototype, 'queryBuilder', createWrapBuilder(tracer, config))
        this.wrap(Client.prototype, 'schemaBuilder', createWrapBuilder(tracer, config))
        this.wrap(Client.prototype, 'raw', createWrapBuilder(tracer, config))
        this.wrap(Client.prototype, 'runner', createWrapRunner(this, tracer, config))
      },
      unpatch (Client) {
        this.unwrap(Client.prototype, 'runner')
        this.unwrap(Client.prototype, 'raw')
        this.unwrap(Client.prototype, 'schemaBuilder')
        this.unwrap(Client.prototype, 'queryBuilder')
      }
    }
  ]
}

module.exports = patchKnex(['>=0.10.0 <0.18.0', '>=0.19.0 <0.21.0'], 'lib')
  .concat(patchKnex(['>=0.18.0 <0.19.0'], 'src'))
