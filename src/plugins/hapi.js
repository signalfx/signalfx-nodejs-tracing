'use strict'

const semver = require('semver')
const web = require('./util/web')

function createWrapGenerate (tracer, config) {
  return function wrapGenerate (generate) {
    return function generateWithTrace (server, req, res, options) {
      const request = generate.apply(this, arguments)

      web.beforeEnd(req, () => {
        const span = web.active(req)
        if (span) {
          span.setTag('component', 'hapi')
        }
        web.enterRoute(req, request.route.path)
      })

      return request
    }
  }
}

function createWrapExecute (tracer, config) {
  config = web.normalizeConfig(config)

  return function wrapExecute (execute) {
    return function executeWithTrace () {
      const req = this.raw.req

      web.beforeEnd(req, () => {
        web.enterRoute(req, this.route.path)
      })

      return execute.apply(this, arguments)
    }
  }
}

function createWrapDispatch (tracer, config) {
  config = web.normalizeConfig(config)

  return function wrapDispatch (dispatch) {
    return function dispatchWithTrace (options) {
      const handler = dispatch.apply(this, arguments)

      return function (req, res) {
        return web.instrument(tracer, config, req, res, 'hapi.request', () => {
          const span = web.active(req)
          if (span) {
            span.setTag('component', 'hapi')
          }
          return handler.apply(this, arguments)
        })
      }
    }
  }
}

function patch (name, versions, file, property, method, notPrototypical) {
  return {
    name: name,
    versions: versions,
    file: file,
    patch (Obj, tracer, config) {
      const target = notPrototypical ? Obj : Obj.prototype
      this.wrap(target, property, method(tracer, config))
    },
    unpatch (Obj) {
      const target = notPrototypical ? Obj : Obj.prototype
      this.unwrap(target, property)
    }
  }
}

let patches = [
  patch('@hapi/hapi', ['>=17.9 <19.0'], 'lib/request.js', 'generate', createWrapGenerate, true),
  patch('hapi', ['>=17.1'], 'lib/request.js', 'generate', createWrapGenerate, true),
  patch('hapi', ['8.5 - 17.0'], 'lib/request.js', 'request', createWrapGenerate),
  patch('hapi', ['2 - 8.4'], 'lib/request.js', '_execute', createWrapExecute),
  patch('hapi', ['7.2 - 16'], 'lib/connection.js', '_dispatch', createWrapDispatch),
  patch('@hapi/hapi', ['>=17.9 <19.0'], 'lib/core.js', '_dispatch', createWrapDispatch),
  patch('hapi', ['>=17'], 'lib/core.js', '_dispatch', createWrapDispatch),
  patch('hapi', ['2 - 7.1'], 'lib/server.js', '_dispatch', createWrapDispatch)
]

if (semver.gte(process.version, '12.0.0')) {
  patches = patches.concat([
    patch('@hapi/hapi', ['>=19.0'], 'lib/request.js', 'generate', createWrapGenerate, true),
    patch('@hapi/hapi', ['>=19.0'], 'lib/core.js', '_dispatch', createWrapDispatch)
  ])
}

module.exports = patches
