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
    return function createHandlerWithTrace () {
      const instance = arguments[0]
      const methodName = arguments[2]

      const handler = create.apply(this, arguments)
      return function (req, res, next) {
        let opName = 'nest.request'
        if (instance.constructor && instance.constructor.name) {
          opName = instance.constructor.name
        }
        const scope = tracer.scope()
        const childOf = scope.active()
        const span = tracer.startSpan(`${opName}.${methodName}`, {
          childOf,
          tags: {
            'component': 'nest',
            'request.method': req.method,
            'request.path': req.route.path
          }
        })

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

          let opName = 'nest.guard.canActivate'
          const scope = tracer.scope()
          const childOf = scope.active()
          const span = tracer.startSpan(opName, {
            childOf,
            tags: {
              'component': 'nest'
            }
          })

          const guardNames = []
          guards.forEach(guardName => {
            guardNames.push(guardName.constructor.name)
          })
          if (guardNames.length > 0) {
            if (guardNames[0].constructor && guardNames[0].constructor.name) {
              opName = `${guardNames[0]}.canActivate`
            }
            span.setOperationName(opName)
            span.setTag('nest.guards', guardNames)
          }
          if (instance.constructor && instance.constructor.name) {
            span.setTag('nest.controller.instance', instance.constructor.name)
          }
          if (callback.name) {
            span.setTag('nest.guard.callabck', callback.name)
          }

          return scope.activate(span, () => {
            try {
              return canActivateFn.apply(this, args)
            } catch (e) {
              throw addError(span, e)
            } finally {
              span.finish()
            }
          })
        }
      }
      return wrappedCanActivateFn(createGuardsFn)
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
        span.setTag('nest.interceptor.callback', callback.name)
      }
      span.setTag('request.method', args[0].method)
      span.setTag('request.url', args[0].url)

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
    versions: ['>=4.0.2'],
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
    versions: ['>=4.6.3'],
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
    versions: ['>=4.0.2'],
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
    versions: ['>=4.6.3'],
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
