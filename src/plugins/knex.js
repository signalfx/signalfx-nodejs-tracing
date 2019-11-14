'use strict'

const tx = require('./util/promise')

function createWrapQueryBuilderToSQL (tracer, config) {
  return function wrapToSQL (toSQL) {
    return function toSQLWithTrace (method, tz) {
      const scope = tracer.scope()
      const childOf = scope.active()
      const mthd = method || this._method

      const span = tracer.startSpan(`knex.QueryBuilder.toSQL(${mthd})`, {
        childOf,
        tags: {
          'component': 'knex'
        }
      })
      setDBTags(this, span)

      return scope.activate(span, () => {
        try {
          return toSQL.apply(this, arguments)
        } catch (e) {
          throw addError(span, e)
        } finally {
          span.finish()
        }
      })
    }
  }
}

function createWrapSchemaBuilderToSQL (tracer, config) {
  return function wrapToSQL (toSQL) {
    return function toSQLWithTrace () {
      const scope = tracer.scope()
      const childOf = scope.active()
      const span = tracer.startSpan('knex.SchemaBuilder.toSQL', {
        childOf,
        tags: {
          'component': 'knex'
        }
      })
      setDBTags(this, span)
      setMethods(this, span)

      return scope.activate(span, () => {
        try {
          return toSQL.apply(this, arguments)
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
    if (config.connection && config.connection.user) {
      span.setTag('db.user', config.connection.user)
    }
  }
}

function setMethods (obj, span) {
  if (obj._sequence) {
    const methods = []
    for (let i = 0, l = obj._sequence.length; i < l; i++) {
      methods.push(obj._sequence[i].method)
    }
    span.setTag('schema.methods', methods)
  }
}

module.exports = [
  {
    name: 'knex',
    versions: ['>=0.8.0'],
    file: 'lib/query/builder.js',
    patch (Builder, tracer, config) {
      this.wrap(Builder.prototype, 'then', tx.createWrapThen(tracer, config))
      this.wrap(Builder.prototype, 'toSQL', createWrapQueryBuilderToSQL(tracer, config))
    },
    unpatch (Builder) {
      this.unwrap(Builder.prototype, 'then')
      this.unwrap(Builder.prototype, 'toSQL')
    }
  },
  {
    name: 'knex',
    versions: ['>=0.8.0'],
    file: 'lib/schema/builder.js',
    patch (Builder, tracer, config) {
      this.wrap(Builder.prototype, 'then', tx.createWrapThen(tracer, config))
      this.wrap(Builder.prototype, 'toSQL', createWrapSchemaBuilderToSQL(tracer, config))
    },
    unpatch (Builder) {
      this.unwrap(Builder.prototype, 'then')
      this.unwrap(Builder.prototype, 'toSQL')
    }
  },
  {
    name: 'knex',
    versions: ['>=0.8.0'],
    file: 'lib/raw.js',
    patch (Raw, tracer, config) {
      this.wrap(Raw.prototype, 'then', tx.createWrapThen(tracer, config))
    },
    unpatch (Raw) {
      this.unwrap(Raw.prototype, 'then')
    }
  }
]
