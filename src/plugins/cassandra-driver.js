'use strict'

const tx = require('./util/tx')

function createWrapInnerExecute (tracer, config) {
  const isValid = (args) => {
    return args.length === 4 || typeof args[3] === 'function'
  }
  return function wrapInnerExecute (_innerExecute) {
    return function _innerExecuteWithTrace (query, params, execOptions, callback) {
      if (!isValid(arguments)) {
        return _innerExecute.apply(this, arguments)
      }
      const scope = tracer.scope()
      const childOf = scope.active()
      const name = query.split(' ')[0]
      const span = start(tracer, config, this, name, query)

      callback = scope.bind(callback, childOf)

      return scope.bind(_innerExecute, span).call(this, query, params, execOptions, function (err) {
        finish(span, err)
        return callback.apply(this, arguments)
      })
    }
  }
}

function createWrapExecute (tracer, config) {
  return function wrapExecute (_execute) {
    return function _executeWithTrace (query, params, execOptions, callback) {
      const name = query.split(' ')[0]
      const span = start(tracer, config, this, name, query)
      const promise = tracer.scope().bind(_execute, span).apply(this, arguments)

      return tx.wrap(span, promise)
    }
  }
}

function createWrapExecutionStart (tracer, config) {
  return function wrapExecutionStart (start) {
    return function startWithTrace (getHostCallback) {
      const span = tracer.scope().active()
      const execution = this

      if (!isRequestValid(this, arguments, 1, span)) {
        return start.apply(this, arguments)
      }

      return start.call(this, function () {
        addHost(span, execution._connection)
        return getHostCallback.apply(this, arguments)
      })
    }
  }
}

function createWrapSendOnConnection (tracer, config) {
  return function wrapSendOnConnection (_sendOnConnection) {
    return function _sendOnConnectionWithTrace () {
      const span = tracer.scope().active()

      addHost(span, this._connection)

      return _sendOnConnection.apply(this, arguments)
    }
  }
}

function createWrapSend (tracer, config) {
  return function wrapSend (send) {
    return function sendWithTrace (request, options, callback) {
      const span = tracer.scope().active()
      const handler = this

      if (!isRequestValid(this, arguments, 3, span)) {
        return send.apply(this, arguments)
      }

      return send.call(this, request, options, function () {
        addHost(span, handler.connection)
        return callback.apply(this, arguments)
      })
    }
  }
}

function createWrapBatch (tracer, config) {
  return function wrapBatch (batch) {
    return function batchWithTrace (queries, options, callback) {
      const name = batchName(queries)
      const query = combine(queries)
      const span = start(tracer, config, this, name, query)
      const scope = tracer.scope()
      const fn = scope.bind(batch, span)

      callback = arguments[arguments.length - 1]

      if (typeof callback === 'function') {
        arguments[arguments.length - 1] = tx.wrap(span, callback)
      }

      try {
        return tx.wrap(span, fn.apply(this, arguments))
      } catch (e) {
        finish(span, e)
        throw e
      }
    }
  }
}

function createWrapStream (tracer, config) {
  return function wrapStream (stream) {
    return function streamWithTrace (query, params, options, callback) {
      return tracer.scope().bind(stream.apply(this, arguments))
    }
  }
}

function start (tracer, config, client = {}, name, query) {
  const scope = tracer.scope()
  const childOf = scope.active()
  const span = tracer.startSpan('cassandra.query', {
    childOf,
    tags: {
      'service.name': config.service || `${tracer._service}-cassandra`,
      'resource.name': name,
      'span.type': 'cassandra',
      'span.kind': 'client',
      'db.type': 'cassandra',
      'db.statement': trim(query, 1024),
      'cassandra.keyspace': client.keyspace
    }
  })

  if (client.keyspace) {
    addTag(span, 'db.instance', client.keyspace)
  }

  return span
}

function finish (span, error) {
  addError(span, error)

  span.finish()

  return error
}

function addTag (span, key, value) {
  if (value) {
    span.setTag(key, value)
  }
}

function addHost (span, connection) {
  if (span && connection) {
    tx.setHost(span, connection.address, connection.port)
  }
}

function addError (span, error) {
  if (error && error instanceof Error) {
    span.addTags({
      'error': 'true',
      'sfx.error.kind': error.name,
      'sfx.error.message': error.message,
      'sfx.error.stack': error.stack
    })
  }

  return error
}

function batchName (queries) {
  return 'Batch: ' + queries
    .map(query => (query.query || query).split(' ')[0])
    .join(';')
}

function isRequestValid (exec, args, length, span) {
  if (!exec) return false
  if (args.length !== length || typeof args[length - 1] !== 'function') return false
  if (!span || span.context()._name !== 'cassandra.query') return false

  return true
}

function combine (queries) {
  if (!Array.isArray(queries)) return []

  return queries
    .map(query => (query.query || query).replace(/;?$/, ';'))
    .join(' ')
}

function trim (str, size) {
  if (!str || str.length <= size) return str

  return `${str.substr(0, size - 3)}...`
}

module.exports = [
  {
    name: 'cassandra-driver',
    versions: ['>=3.0.0'],
    patch (cassandra, tracer, config) {
      this.wrap(cassandra.Client.prototype, 'batch', createWrapBatch(tracer, config))
      this.wrap(cassandra.Client.prototype, 'stream', createWrapStream(tracer, config))
    },
    unpatch (cassandra) {
      this.unwrap(cassandra.Client.prototype, 'batch')
      this.unwrap(cassandra.Client.prototype, 'stream')
    }
  },
  {
    name: 'cassandra-driver',
    versions: ['>=4.4'],
    patch (cassandra, tracer, config) {
      this.wrap(cassandra.Client.prototype, '_execute', createWrapExecute(tracer, config))
    },
    unpatch (cassandra) {
      this.unwrap(cassandra.Client.prototype, '_execute')
    }
  },
  {
    name: 'cassandra-driver',
    versions: ['3 - 4.3'],
    patch (cassandra, tracer, config) {
      this.wrap(cassandra.Client.prototype, '_innerExecute', createWrapInnerExecute(tracer, config))
    },
    unpatch (cassandra) {
      this.unwrap(cassandra.Client.prototype, '_innerExecute')
    }
  },
  {
    name: 'cassandra-driver',
    versions: ['>=3.3.0'],
    file: 'lib/request-execution.js',
    patch (RequestExecution, tracer, config) {
      this.wrap(RequestExecution.prototype, '_sendOnConnection', createWrapSendOnConnection(tracer, config))
    },
    unpatch (RequestExecution) {
      this.unwrap(RequestExecution.prototype, '_sendOnConnection')
    }
  },
  {
    name: 'cassandra-driver',
    versions: ['3.3 - 4.3'],
    file: 'lib/request-execution.js',
    patch (RequestExecution, tracer, config) {
      this.wrap(RequestExecution.prototype, 'start', createWrapExecutionStart(tracer, config))
    },
    unpatch (RequestExecution) {
      this.unwrap(RequestExecution.prototype, 'start')
    }
  },
  {
    name: 'cassandra-driver',
    versions: ['3 - 3.2'],
    file: 'lib/request-handler.js',
    patch (RequestHandler, tracer, config) {
      this.wrap(RequestHandler.prototype, 'send', createWrapSend(tracer, config))
    },
    unpatch (RequestHandler) {
      this.unwrap(RequestHandler.prototype, 'send')
    }
  }
]
