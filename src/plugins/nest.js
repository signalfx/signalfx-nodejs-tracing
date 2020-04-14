'use strict'

function createWrapNestFactoryCreate (tracer, config) {
  return function wrapCreate (create) {
    return function createWithTrace (nestModule, serverOrOptions, options) {
      const scope = tracer.scope()
      const childOf = scope.active()
      const span = tracer.startSpan('nest.factory.create', {
        childOf,
        tags: {
          'component': 'nest',
          'nest.module': nestModule.name
        }
      })

      return scope.activate(span, () => {
        try {
          return create.apply(this, arguments)
        } catch (e) {
          throw addError(span, e)
        } finally {
          span.finish()
        }
      })
    }
  }
}

function createWrapCreateHandler (tracer, config) {
  return function wrapCreateHandler (create) {
    return function createHandlerWithTrace (instance, callback) {
      arguments[1] = createWrapHandler(tracer, callback)
      const handler = create.apply(this, arguments)
      return function (req, res, next) {
        let opName = 'nest.request'
        if (instance.constructor && instance.constructor.name) {
          opName = instance.constructor.name
        }
        const scope = tracer.scope()
        const childOf = scope.active()
        const span = tracer.startSpan(opName, {
          childOf,
          tags: {
            'component': 'nest',
            'http.method': req.method,
            'http.url': req.originalUrl,
            'nest.route.path': req.route.path
          }
        })

        if (callback.name) {
          opName = `${opName}(${callback.name})`
          span.setOperationName(opName)
          span.setTag('nest.callback', callback.name)
        }

        return scope.activate(span, () => {
          try {
            return handler.apply(this, arguments)
          } catch (e) {
            throw addError(span, e)
          } finally {
            span.finish()
          }
        })
      }
    }
  }
}

function createWrapHandler (tracer, handler) {
  let name = 'nestHandler'
  if (handler.name) {
    name = handler.name
  }
  const wrappedHandler = function () {
    const scope = tracer.scope()
    const childOf = scope.active()
    const tags = { 'component': 'nest' }
    if (name) {
      tags['nest.callback'] = name
    }
    const span = tracer.startSpan(name, { childOf, tags })
    return scope.activate(span, () => {
      try {
        return handler.apply(this, arguments)
      } catch (e) {
        throw addError(span, e)
      } finally {
        span.finish()
      }
    })
  }

  if (name) {
    Object.defineProperty(wrappedHandler, 'name', { value: name })
  }
  return wrappedHandler
}

function createWrapCreateGuardsFn (tracer, config) {
  return function wrapCreateGuardsFn (createGuardsFn) {
    return function createGuardsFn (guards, instance, callback, contextType) {
      function wrappedCanActivateFn (canActivateFn) {
        return (args) => {
          if (typeof canActivateFn !== 'function') {
            return canActivateFn
          }
          createGuardsTrace(tracer, args, guards, instance, callback, canActivateFn)
        }
      }
      return wrappedCanActivateFn(createGuardsFn)
    }
  }
}

function createWrapTryActivate (tracer, config) {
  return function wrapTryActivate (tryActivate) {
    return function tryActivateWithTrace (guards, args, instance, callback) {
      createGuardsTrace(tracer, args, guards, instance, callback, tryActivate)
    }
  }
}

function createWrapIntercept (tracer, config) {
  return function wrapIntercept (intercept) {
    return function interceptWithTrace (interceptors, args, instance, callback, next, type) {
      const opName = 'nest.interceptor.intercept'
      const scope = tracer.scope()
      const childOf = scope.active()
      const span = tracer.startSpan(opName, {
        childOf,
        tags: {
          'component': 'nest'
        }
      })
      if (callback.name) {
        span.setTag('nest.callback', callback.name)
      }

      const request = args.length > 1 ? args[0] : args
      span.setTag('http.method', request.method)
      span.setTag('http.url', request.originalUrl)
      span.setTag('nest.route.path', request.route.path)

      if (interceptors.length > 0) {
        const interceptorNames = []
        interceptors.forEach(interceptor => {
          interceptorNames.push(interceptor.constructor.name)
        })
        span.setTag('nest.interceptors', interceptorNames)
      }

      if (instance.constructor && instance.constructor.name) {
        span.setTag('nest.controller.instance', instance.constructor.name)
      }

      return scope.activate(span, () => {
        try {
          return intercept.apply(this, arguments)
        } catch (e) {
          throw addError(span, e)
        } finally {
          span.finish()
        }
      })
    }
  }
}

function createWrapCreatePipesFn (tracer, config) {
  return function wrapCreatePipesFn (createPipesFn) {
    return function createPipesFnWithTrace (pipes, paramsOptions) {
      function wrappedPipesFn (pipesFn) {
        return (args, req, res, next) => {
          if (typeof pipesFn !== 'function') {
            return pipesFn
          }

          let opName = 'nest.pipe.pipesFn'
          if (pipes.length > 0) {
            if (pipes[0].constructor && pipes[0].constructor.name) {
              opName = `${pipes[0].constructor.name}.pipeFn`
            }
          }
          const scope = tracer.scope()
          const childOf = scope.active()
          const span = tracer.startSpan(opName, {
            childOf,
            tags: {
              'component': 'nest'
            }
          })
          if (paramsOptions && paramsOptions[0]) {
            const pipes = []
            const pipeOptions = paramsOptions[0].pipes
            pipeOptions.forEach((param) => {
              if (param.constructor && param.constructor.name) {
                pipes.push(param.constructor.name)
              }
            })
            if (pipes.length > 0) {
              span.setTag('nest.pipes', pipes)
            }
          }

          return scope.activate(span, () => {
            try {
              return pipesFn.apply(this, [args, req, res, next])
            } catch (e) {
              throw addError(span, e)
            } finally {
              span.finish()
            }
          })
        }
      }
      return wrappedPipesFn(createPipesFn.apply(this, arguments))
    }
  }
}

function createGuardsTrace (tracer, args, guards, instance, callback, fn) {
  let opName = 'nest.guard.canActivate'
  const request = args.length > 1 ? args[0] : args
  const scope = tracer.scope()
  const childOf = scope.active()
  const span = tracer.startSpan(opName, {
    childOf,
    tags: {
      'component': 'nest',
      'http.method': request.method,
      'http.url': request.originalUrl,
      'nest.route.path': request.route.path
    }
  })

  const guardNames = []
  guards.forEach(guardName => {
    guardNames.push(guardName.constructor.name)
  })
  if (guardNames.length > 0) {
    if (guardNames[0].constructor && guardNames[0].constructor.name) {
      opName = `${guardNames[0]}.tryActivate`
    }
    span.setTag('nest.guards', guardNames)
  }
  if (instance.constructor && instance.constructor.name) {
    opName = `${opName}.${instance.constructor.name}`
    span.setTag('nest.controller.instance', instance.constructor.name)
  }
  if (callback.name) {
    opName = `${opName}(${callback.name})`
    span.setTag('nest.callback', callback.name)
  }

  span.setOperationName(opName)

  return scope.activate(span, () => {
    try {
      return fn.apply(this, args)
    } catch (e) {
      throw addError(span, e)
    } finally {
      span.finish()
    }
  })
}

function addError (span, error) {
  span.addTags({
    'sfx.error.kind': error.name,
    'sfx.error.message': error.message,
    'sfx.error.stack': error.stack
  })
  return error
}

function patchNestFactory (versions) {
  return {
    name: '@nestjs/core',
    versions: versions,
    file: 'nest-factory.js',
    patch (NestFactoryStatic, tracer, config) {
      this.wrap(NestFactoryStatic.NestFactoryStatic.prototype,
        'create',
        createWrapNestFactoryCreate(tracer, config))
    },
    unpatch (NestFactoryStatic) {
      this.unwrap(NestFactoryStatic.NestFactoryStatic.prototype, 'create')
    }
  }
}

function patchRouterExecutionContext (versions) {
  return {
    versions,
    name: '@nestjs/core',
    file: 'router/router-execution-context.js',
    patch (RouterExecutionContext, tracer, config) {
      this.wrap(RouterExecutionContext.RouterExecutionContext.prototype,
        'create',
        createWrapCreateHandler(tracer, config))
    },
    unpatch (RouterExecutionContext) {
      this.unwrap(RouterExecutionContext.RouterExecutionContext.prototype, 'create')
    }
  }
}

function patchGuardsConsumer (versions) {
  return {
    versions,
    name: '@nestjs/core',
    file: 'guards/guards-consumer.js',
    patch (GuardsConsumer, tracer, config) {
      this.wrap(GuardsConsumer.GuardsConsumer.prototype,
        'tryActivate',
        createWrapTryActivate(tracer, config))
    },
    unpatch (GuardsConsumer) {
      this.unwrap(GuardsConsumer.GuardsConsumer.prototype, 'tryActivate')
    }
  }
}

function patchRouterExecutionContextGuard (versions) {
  return {
    versions,
    name: '@nestjs/core',
    file: 'router/router-execution-context.js',
    patch (RouterExecutionContext, tracer, config) {
      this.wrap(RouterExecutionContext.RouterExecutionContext.prototype,
        'createGuardsFn',
        createWrapCreateGuardsFn(tracer, config))
    },
    unpatch (RouterExecutionContext) {
      this.unwrap(RouterExecutionContext.RouterExecutionContext.prototype, 'createGuardsFn')
    }
  }
}

function patchInterceptors (versions) {
  return {
    versions,
    name: '@nestjs/core',
    file: 'interceptors/interceptors-consumer.js',
    patch (InterceptorsConsumer, tracer, config) {
      this.wrap(InterceptorsConsumer.InterceptorsConsumer.prototype,
        'intercept',
        createWrapIntercept(tracer, config))
    },
    unpatch (InterceptorsConsumer) {
      this.unwrap(InterceptorsConsumer.InterceptorsConsumer.prototype, 'intercept')
    }
  }
}

function patchRouterExecutionContextPipes (versions) {
  return {
    versions,
    name: '@nestjs/core',
    file: 'router/router-execution-context.js',
    patch (RouterExecutionContext, tracer, config) {
      this.wrap(RouterExecutionContext.RouterExecutionContext.prototype,
        'createPipesFn',
        createWrapCreatePipesFn(tracer, config))
    },
    unpatch (RouterExecutionContext) {
      this.unwrap(RouterExecutionContext.RouterExecutionContext.prototype, 'createPipesFn')
    }
  }
}

module.exports = [
  patchGuardsConsumer(['>=4.0.0 <=4.5.1']),

  patchNestFactory(['>=4.0.0 <5.0.0']),
  patchRouterExecutionContext(['>=4.0.0 <5.0.0']),
  patchInterceptors(['>=4.0.0 <5.0.0']),
  patchRouterExecutionContextGuard(['>=4.5.2 <5.0.0']),
  patchRouterExecutionContextPipes(['>=4.5.2 <5.0.0']),

  patchNestFactory(['>=5.0.0 <6.0.0']),
  patchRouterExecutionContext(['>=5.0.0 <6.0.0']),
  patchInterceptors(['>=5.0.0 <6.0.0']),
  patchRouterExecutionContextGuard(['>=5.0.0 <6.0.0']),
  patchRouterExecutionContextPipes(['>=5.0.0 <6.0.0']),

  patchNestFactory(['>=6.0.0 <7.0.0']),
  patchRouterExecutionContext(['>=6.0.0 <7.0.0']),
  patchInterceptors(['>=6.0.0 <7.0.0']),
  patchRouterExecutionContextGuard(['>=6.0.0 <7.0.0']),
  patchRouterExecutionContextPipes(['>=6.0.0 <7.0.0'])
]
