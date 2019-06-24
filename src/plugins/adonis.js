'use strict'

const web = require('./util/web')

function createWrapMethod (tracer, config) {
  config = web.normalizeConfig(config)

  return function wrapMethodRequest (handle) {
    return function methodWithTrace (request, response) {
      const route = this.Route.match(request.url, request.method, request.hostname)
      return web.instrument(tracer, config, request, response, 'adonis.request', () => {
        const span = web.active(request)
        if (span) {
          span.setTag('component', 'adonis')
        }

        web.exitRoute(request)
        if (route && route.route) {
          web.enterRoute(request, route.route._route)
        } else {
          web.enterRoute(request, '')
        }
        return handle.apply(this, arguments)
      })
    }
  }
}

function createWrapResolve (tracer, config) {
  return function wrapResolve (_resolveMiddleware) {
    return function resolveWithTrace (middleware, args) {
      middleware._name = 'adonis.middleware'
      if (typeof middleware.namespace === 'string') {
        middleware._name = middleware.namespace.split('.')[0]
      } else if (typeof middleware.namespace === 'function') {
        if (middleware.params && typeof middleware.params[0] === 'string') {
          middleware._name = middleware.params[0]
        } else if (middleware.args && typeof middleware.args[0] === 'string') {
          middleware._name = middleware.args[0]
        }
      }

      const request = args[0].req
      return web.wrapMiddleware(request, middleware, 'adonis.middleware', () => {
        const span = web.active(request)

        if (span) {
          span.setTag('component', 'adonis')
        }

        try {
          const result = _resolveMiddleware.apply(this, arguments)
          if (result && typeof result.then === 'function') {
            result.then(
              () => web.finish(request),
              err => web.finish(request, err)
            )
          } else {
            web.finish(request)
          }
          return result
        } catch (error) {
          web.finish(request, error)
          throw error
        }
      })
    }
  }
}

module.exports = [
  {
    name: '@adonisjs/framework',
    versions: ['>=4.0.0'],
    file: 'src/Server/index.js',
    patch (Server, tracer, config) {
      this.wrap(Server.prototype, 'handle', createWrapMethod(tracer, config))
    },
    unpatch (Server) {
      this.unwrap(Server.prototype, 'handle')
    }
  },
  {
    name: '@adonisjs/framework',
    versions: ['<=5.0.4'],
    file: 'src/Server/index.js',
    patch (Server, tracer, config) {
      this.wrap(Server.prototype, '_resolveMiddleware', createWrapResolve(tracer, config))
    },
    unpatch (Server) {
      this.unwrap(Server.prototype, '_resolveMiddleware')
    }
  },
  {
    name: '@adonisjs/middleware-base',
    versions: ['>=1'],
    patch (MiddlewareBase, tracer, config) {
      this.wrap(MiddlewareBase.prototype, '_resolveMiddleware', createWrapResolve(tracer, config))
    },
    unpatch (MiddlewareBase) {
      this.unwrap(MiddlewareBase.prototype, '_resolveMiddleware')
    }
  }
]
