'use strict'

const Tags = require('opentracing').Tags

function wrapActionFunction (tracer, actionFn, identity) {
  function actionWithTracing (req, res, next) {
    const scope = tracer.scope()
    const childOf = scope.active()
    const span = tracer.startSpan(
      actionFn.identity || 'action ' + identity,
      {
        childOf,
        tags: {
          [Tags.SPAN_KIND]: Tags.SPAN_KIND_RPC_SERVER,
          'component': 'Sails.js'
        }
      }
    )

    try {
      return scope.bind(actionFn, span).apply(this, arguments)
    } catch (e) {
      if (span) {
        span.addTags({
          'error': true,
          'sfx.error.kind': e.name,
          'sfx.error.message': e.message,
          'sfx.error.stack': e.stack
        })
      }

      throw e
    } finally {
      span.finish()
    }
  }

  // copy over any additional members before returning, as by this point it's
  // potentially a processed machine
  return Object.assign(actionWithTracing, actionFn)
}

function wrapAction (tracer, action, identity) {
  if (typeof action.fn === 'function') {
    // actions2
    action.fn = wrapActionFunction(tracer, action.fn, action.identity || identity)
  } else {
    // classic action
    action = wrapActionFunction(tracer, action, identity)
  }

  return action
}

function wrapActionMiddleware (tracer, middleware, actionsGlobKey) {
  if (typeof middleware === 'function') {
    return wrapActionFunction(tracer, middleware, actionsGlobKey)
  }

  return middleware.map((fn) => {
    return wrapActionFunction(tracer, fn, actionsGlobKey)
  })
}

function createWrapRegisterAction (tracer, config) {
  return function wrapRegisterAction (registerAction) {
    return function registerActionWithTracing (action, identity, force) {
      registerAction.call(this, wrapAction(tracer, action, identity), identity, force)
    }
  }
}

function createWrapRegisterActionMiddleware (tracer, config) {
  return function wrapRegisterActionMiddleware (registerActionMiddleware) {
    return function registerActionMiddlewareWithTracing (middleware, actionsGlobKey) {
      registerActionMiddleware.call(this, wrapActionMiddleware(tracer, middleware, actionsGlobKey), actionsGlobKey)
    }
  }
}

function patchSails (sails, tracer, config) {
  this.wrap(sails.prototype, 'registerAction', createWrapRegisterAction(tracer, config))
  this.wrap(sails.prototype, 'registerActionMiddleware', createWrapRegisterActionMiddleware(tracer, config))
}

function unpatchSails (sails) {
  this.unwrap(sails.prototype, 'registerAction')
  this.unwrap(sails.prototype, 'registerActionMiddleware')
}

module.exports = [
  {
    name: 'sails',
    file: 'lib/app/Sails.js',
    versions: ['>=1'],
    patch: patchSails,
    unpatch: unpatchSails
  }
]
