'use strict'

const http = require('http')
const bodyParser = require('body-parser')
const getPort = require('get-port')
const express = require('express')
const path = require('path')
const Int64BE = require('int64-buffer').Int64BE

const handlers = new Set()
const watchers = new Set()
let receivedRequests = []
let agent = null
let server = null
let listener = null
let tracer = null

function flat (array) {
  const flat = []
  array.forEach(inner => {
    inner.forEach(item => {
      flat.push(item)
    })
  })
  return flat
}

const zipkinV2toDD = trace => {
  // Convert Zipkin v2 JSON to dd format to prevent unnecessary test updates
  const zipkin = JSON.parse(trace)
  let dd = []
  for (let i = 0; i < zipkin.length; i++) {
    const zipkinSpan = zipkin[i]
    const ddSpan = {}

    ddSpan.trace_id = zipkinSpan.traceId
    ddSpan.span_id = zipkinSpan.id
    ddSpan.name = zipkinSpan.name
    ddSpan.service = zipkinSpan.localEndpoint.serviceName
    ddSpan.meta = zipkinSpan.tags
    if (zipkinSpan.kind) {
      ddSpan.meta['span.kind'] = zipkinSpan.kind.toLowerCase()
    }
    if (zipkinSpan.parentId !== undefined) {
      ddSpan.parent_id = zipkinSpan.parentId
    }
    ddSpan.start = new Int64BE(zipkinSpan.timestamp)
    ddSpan.duration = new Int64BE(zipkinSpan.duration)

    dd = dd.concat(ddSpan)
  }
  return [dd]
}

module.exports = {
  // Load the plugin on the tracer with an optional config and start a mock Zipkin
  load (plugin, pluginName, config) {
    tracer = require('../..')
    agent = express()
    agent.use(bodyParser.raw({ type: 'application/json' }))
    agent.use((req, res, next) => {
      if (req.body.length === 0) return res.status(200).send()
      req.body = zipkinV2toDD(req.body)
      next()
    })

    agent.post('/v1/trace', (req, res) => {
      receivedRequests.push(req.body)
      res.status(200).send()
      handlers.forEach(handler => handler(req.body))
      const spans = flat(flat(receivedRequests))
      watchers.forEach(watcher => {
        if (spans.length >= watcher.numSpans) {
          watcher.callback(spans)
        }
      })
    })

    return getPort().then(port => {
      return new Promise((resolve, reject) => {
        server = http.createServer(agent)

        listener = server.listen(port, 'localhost', resolve)

        pluginName = [].concat(pluginName)
        config = [].concat(config)

        server.on('close', () => {
          tracer._instrumenter.unpatch()
          tracer = null
        })

        tracer.init({
          service: 'test',
          url: `http://localhost:${port}/v1/trace`,
          flushInterval: 0,
          plugins: false
        })

        for (let i = 0, l = pluginName.length; i < l; i++) {
          tracer.use(pluginName[i], config[i])
        }
      })
    })
  },

  // Register a callback with expectations to be run on every agent call.
  use (callback) {
    const deferred = {}
    const promise = new Promise((resolve, reject) => {
      deferred.resolve = resolve
      deferred.reject = reject
    })

    const timeout = setTimeout(() => {
      if (error) {
        deferred.reject(error)
      }
    }, 1000)

    let error

    const handler = function () {
      try {
        callback.apply(null, arguments)
        handlers.delete(handler)
        clearTimeout(timeout)
        deferred.resolve()
      } catch (e) {
        error = error || e
      }
    }

    handler.promise = promise
    handlers.add(handler)

    return promise
  },

  // Register a callback with expectations to be run after N number of spans are received.
  watch (callback, numSpans) {
    watchers.add({ numSpans, callback })
  },

  // Return a promise that will resolve when all expectations have run.
  promise () {
    const promises = Array.from(handlers)
      .map(handler => handler.promise.catch(e => e))

    return Promise.all(promises)
      .then(results => results.find(e => e instanceof Error))
  },

  // Unregister any outstanding expectation callbacks.
  reset () {
    receivedRequests = []
    handlers.clear()
    watchers.clear()
  },

  // Wrap a callback so it will only be called when all expectations have run.
  wrap (callback) {
    return error => {
      this.promise()
        .then(err => callback(error || err))
    }
  },

  // Return the current active span.
  currentSpan () {
    return tracer.scope().active()
  },

  receivedRequests () {
    return receivedRequests
  },

  // Stop the mock agent, reset all expectations and wipe the require cache.
  close () {
    this.wipe()

    listener.close()
    listener = null
    agent = null
    handlers.clear()
    watchers.clear()
    delete require.cache[require.resolve('../..')]

    return new Promise((resolve, reject) => {
      server.on('close', () => {
        server = null

        resolve()
      })
    })
  },

  // Wipe the require cache.
  wipe () {
    const basedir = path.join(__dirname, '..', '..', 'versions')
    const exceptions = ['/libpq/', '/sqlite3/'] // wiping native modules results in errors
      .map(exception => new RegExp(exception))

    Object.keys(require.cache)
      .filter(name => name.indexOf(basedir) !== -1)
      .filter(name => !exceptions.some(exception => exception.test(name)))
      .forEach(name => {
        delete require.cache[name]
      })
  }
}
