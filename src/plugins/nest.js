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

      if (typeof this.createHttpAdapter === 'function') {
        const httpServerOptions = this.isHttpServer(serverOrOptions)
          ? [serverOrOptions, options]
          : [this.createHttpAdapter(), serverOrOptions]
        const server = httpServerOptions[0]
        if (server.constructor && server.constructor.name) {
          span.setTag('nest.server', server.constructor.name)
        }
      }

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
            'request.method': req.method,
            'request.url': req.originalUrl,
            'request.route.path': req.route.path,
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
      span.setTag('request.method', request.method)
      span.setTag('request.url', request.originalUrl)

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
      'request.method': request.method,
      'request.url': request.originalUrl,
      'request.route.path': request.route.path
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
  span.setTag('error', 'true')
  span.log({
    'error.type': error.name,
    'error.msg': error.message,
    'error.stack': error.stack
  })
  return error
}

module.exports = [
  {
    name: '@nestjs/core',
    versions: ['>=1.0.2'],
    additionalDependencies: {
      "@nestjs/common": "^1.0.0",
      "@nestjs/websockets": "^1.0.0",
      "@nestjs/microservices": "^2.0.0", // FIXME: this should really be "^1.0.0" but that package version does not exist on npm
      "reflect-metadata": "0.1.10",
      "rxjs": "^5.0.3"
    },
    file: 'nest-factory.js',
    patch (NestFactoryStatic, tracer, config) {
      this.wrap(NestFactoryStatic.NestFactoryStatic.prototype,
        'create',
        createWrapNestFactoryCreate(tracer, config))
    },
    unpatch (NestFactoryStatic) {
      this.unwrap(NestFactoryStatic.NestFactoryStatic.prototype, 'create')
    }
  },
  {
    name: '@nestjs/core',
    versions: ['>=1.0.2'],
    additionalDependencies: {
      "@nestjs/common": "^1.0.0",
      "@nestjs/websockets": "^1.0.0",
      "@nestjs/microservices": "^2.0.0", // FIXME: this should really be "^1.0.0" but that package version does not exist on npm
      "reflect-metadata": "0.1.10",
      "rxjs": "^5.0.3"
    },
    file: 'router/router-execution-context.js',
    patch (RouterExecutionContext, tracer, config) {
      this.wrap(RouterExecutionContext.RouterExecutionContext.prototype,
        'create',
        createWrapCreateHandler(tracer, config))
    },
    unpatch (RouterExecutionContext) {
      this.unwrap(RouterExecutionContext.RouterExecutionContext.prototype, 'create')
    }
  },
  {
    name: '@nestjs/core',
    versions: ['>=4.5.2'],
    additionalDependencies: {
      "@nestjs/common": "^4.*",
      "@nestjs/websockets": "^4.*",
      "@nestjs/microservices": "^4.*",
      "reflect-metadata": "0.1.10",
      "rxjs": "^5.4.2"
    },
    file: 'router/router-execution-context.js',
    patch (RouterExecutionContext, tracer, config) {
      this.wrap(RouterExecutionContext.RouterExecutionContext.prototype,
        'createGuardsFn',
        createWrapCreateGuardsFn(tracer, config))
    },
    unpatch (RouterExecutionContext) {
      this.unwrap(RouterExecutionContext.RouterExecutionContext.prototype, 'createGuardsFn')
    }
  },
  {
    name: '@nestjs/core',
    versions: ['3.0.2 - 4.5.1'],
    additionalDependencies: {
      "@nestjs/common": "<=4.5.1",
      "@nestjs/websockets": "<=4.5.1",
      "@nestjs/microservices": "<=4.5.1",
      "reflect-metadata": "0.1.10",
      "rxjs": "5.0.3"
    },
    file: 'guards/guards-consumer.js',
    patch (GuardsConsumer, tracer, config) {
      this.wrap(GuardsConsumer.GuardsConsumer.prototype,
        'tryActivate',
        createWrapTryActivate(tracer, config))
    },
    unpatch (GuardsConsumer) {
      this.unwrap(GuardsConsumer.GuardsConsumer.prototype, 'tryActivate')
    }
  },
  {
    name: '@nestjs/core',
    versions: ['>=3.0.5'],
    additionalDependencies: {
      "@nestjs/common": "~3.*",
      "@nestjs/websockets": "~3.*",
      "@nestjs/microservices": "~3.*",
      "reflect-metadata": "0.1.10",
      "rxjs": "5.4.2"
    },
    file: 'interceptors/interceptors-consumer.js',
    patch (InterceptorsConsumer, tracer, config) {
      this.wrap(InterceptorsConsumer.InterceptorsConsumer.prototype,
        'intercept',
        createWrapIntercept(tracer, config))
    },
    unpatch (InterceptorsConsumer) {
      this.unwrap(InterceptorsConsumer.InterceptorsConsumer.prototype, 'intercept')
    }
  },
  {
    name: '@nestjs/core',
    versions: ['>=4.5.2'],
    additionalDependencies: {
      "@nestjs/common": "^4.*",
      "@nestjs/websockets": "^4.*",
      "@nestjs/microservices": "^4.*",
      "reflect-metadata": "0.1.10",
      "rxjs": "^5.4.2"
    },
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
]
