'use strict'

const pathToRegexp = require('path-to-regexp')
const xregexp = require('xregexp')
const analyticsSampler = require('../../analytics_sampler')
const FORMAT_HTTP_HEADERS = require('opentracing').FORMAT_HTTP_HEADERS
const log = require('../../log')
const tags = require('../../../ext/tags')
const types = require('../../../ext/types')
const kinds = require('../../../ext/kinds')
const urlFilter = require('./urlfilter')
const platform = require('../../platform')
const SpanContext = require('../../opentracing/span_context')
const idToHex = require('../../utils').idToHex

const HTTP = types.HTTP
const SERVER = kinds.SERVER
const RESOURCE_NAME = tags.RESOURCE_NAME
const SERVICE_NAME = tags.SERVICE_NAME
const SPAN_TYPE = tags.SPAN_TYPE
const SPAN_KIND = tags.SPAN_KIND
const ERROR = tags.ERROR
const HTTP_METHOD = tags.HTTP_METHOD
const HTTP_URL = tags.HTTP_URL
const HTTP_STATUS_CODE = tags.HTTP_STATUS_CODE
const HTTP_ROUTE = tags.HTTP_ROUTE
const HTTP_REQUEST_HEADERS = tags.HTTP_REQUEST_HEADERS
const HTTP_RESPONSE_HEADERS = tags.HTTP_RESPONSE_HEADERS

const web = {
  // Ensure the configuration has the correct structure and defaults.
  normalizeConfig (config) {
    config = config.server || config

    const headers = getHeadersToRecord(config)
    const validateStatus = getStatusValidator(config)
    const hooks = getHooks(config)
    const filter = urlFilter.getFilter(config)
    const expandRouteParameters = getExpandRouteParameters(config)
    const synthesizeRequestingContext = getSynthesizeRequestingContext(config)

    return Object.assign({}, config, {
      headers,
      validateStatus,
      hooks,
      filter,
      expandRouteParameters,
      synthesizeRequestingContext
    })
  },

  // Start a span and activate a scope for a request.
  instrument (tracer, config, req, res, name, callback) {
    this.patch(req)

    const span = startSpan(tracer, config, req, res, name)

    // TODO: replace this with a REFERENCE_NOOP after we split http/express/etc
    if (!config.filter(req.url)) {
      span.context()._sampling.drop = true
    }

    if (config.service) {
      span.setTag(SERVICE_NAME, config.service)
    }

    analyticsSampler.sample(span, config.analytics, true)

    wrapEnd(req)
    wrapEvents(req)

    const enableServerTiming = process.env.SIGNALFX_SERVER_TIMING_CONTEXT
    if (enableServerTiming && enableServerTiming.trim().toLowerCase() === 'true') {
      if (!res._sfx_serverTimingAdded) {
        res.setHeader('Server-Timing', traceParentHeader(span.context()))
        res.setHeader('Access-Control-Expose-Headers', 'Server-Timing')
        Object.defineProperty(res, '_sfx_serverTimingAdded', { value: true })
      }
    }

    return callback && tracer.scope().activate(span, () => callback(span))
  },

  // Reactivate the request scope in case it was changed by a middleware.
  reactivate (req, fn) {
    return reactivate(req, fn)
  },

  // Add a route segment that will be used for the resource name.
  enterRoute (req, path) {
    req._datadog.paths.push(path)
  },

  // Remove the current route segment.
  exitRoute (req) {
    req._datadog.paths.pop()
  },

  // Start a new middleware span and activate a new scope with the span.
  wrapMiddleware (req, middleware, name, fn) {
    if (!this.active(req)) return fn()

    const tracer = req._datadog.tracer
    const childOf = this.active(req)
    const span = tracer.startSpan(name, { childOf })

    span.addTags({
      [RESOURCE_NAME]: middleware._name || middleware.name || '<anonymous>'
    })

    analyticsSampler.sample(span, req._datadog.config.analytics)

    req._datadog.middleware.push(span)

    return tracer.scope().activate(span, fn)
  },

  // Finish the active middleware span.
  finish (req, error) {
    if (!this.active(req)) return

    const span = req._datadog.middleware.pop()

    if (span) {
      if (error) {
        span.addTags({
          'sfx.error.kind': error.name,
          'sfx.error.message': error.message,
          'sfx.error.stack': error.stack
        })
      }

      span.finish()
    }
  },

  // Register a callback to run before res.end() is called.
  beforeEnd (req, callback) {
    req._datadog.beforeEnd.push(callback)
  },

  // Prepare the request for instrumentation.
  patch (req) {
    if (req._datadog) return

    Object.defineProperty(req, '_datadog', {
      value: {
        span: null,
        paths: [],
        middleware: [],
        beforeEnd: [],
        childOfRequestingContext: false
      }
    })
  },

  // Return the request root span.
  root (req) {
    return req._datadog ? req._datadog.span : null
  },

  // Return the active span.
  active (req) {
    if (!req._datadog) return null
    if (req._datadog.middleware.length === 0) return req._datadog.span || null

    return req._datadog.middleware.slice(-1)[0]
  }
}

function startSpan (tracer, config, req, res, name) {
  req._datadog.config = config

  if (req._datadog.span) {
    req._datadog.span.context()._name = name
    return req._datadog.span
  }

  let childOf = tracer.extract(FORMAT_HTTP_HEADERS, req.headers)
  if (!childOf) {
    childOf = synthesizedSpanContext(req)
  } else {
    req._datadog.childOfRequestingContext = true
  }

  const span = tracer.startSpan(name, { childOf })

  req._datadog.tracer = tracer
  req._datadog.span = span
  req._datadog.res = res

  return span
}

function finish (req, res) {
  if (req._datadog.finished) return

  addRequestTags(req)
  addResponseTags(req)

  req._datadog.config.hooks.request(req._datadog.span, req, res)

  addResourceTag(req)
  revertSynthesizedContext(req)

  req._datadog.span.finish()
  req._datadog.finished = true
}

function finishMiddleware (req, res) {
  if (req._datadog.finished) return

  let span

  while ((span = req._datadog.middleware.pop())) {
    span.finish()
  }
}

function wrapEnd (req) {
  const scope = req._datadog.tracer.scope()
  const res = req._datadog.res
  const end = res.end

  if (end === req._datadog.end) return

  let _end = req._datadog.end = res.end = function () {
    req._datadog.beforeEnd.forEach(beforeEnd => beforeEnd())

    finishMiddleware(req, res)

    const returnValue = end.apply(this, arguments)

    finish(req, res)

    return returnValue
  }

  Object.defineProperty(res, 'end', {
    configurable: true,
    get () {
      return _end
    },
    set (value) {
      _end = scope.bind(value, req._datadog.span)
    }
  })
}

function wrapEvents (req) {
  const scope = req._datadog.tracer.scope()
  const res = req._datadog.res
  const on = res.on

  if (on === req._datadog.on) return

  req._datadog.on = scope.bind(res, req._datadog.span).on
}

function reactivate (req, fn) {
  return req._datadog.tracer.scope().activate(req._datadog.span, fn)
}

function addRequestTags (req) {
  const protocol = req.connection.encrypted ? 'https' : 'http'
  const url = `${protocol}://${req.headers['host']}${req.originalUrl || req.url}`
  const span = req._datadog.span

  span.addTags({
    [HTTP_URL]: url.split('?')[0],
    [HTTP_METHOD]: req.method,
    [SPAN_KIND]: SERVER,
    [SPAN_TYPE]: HTTP
  })

  addHeaders(req)
}

function addResponseTags (req) {
  const span = req._datadog.span
  const res = req._datadog.res

  if (req._datadog.paths.length > 0) {
    span.setTag(HTTP_ROUTE, req._datadog.paths.join(''))
  }

  span.addTags({
    [HTTP_STATUS_CODE]: res.statusCode
  })

  addStatusError(req)
}

function addResourceTag (req) {
  const span = req._datadog.span
  const tags = span.context()._tags

  if (tags['resource.name']) return

  const path = expandRouteParameters(tags[HTTP_ROUTE], req)
  const resource = [].concat(path)
    .filter(val => val)
    .join(' ')

  if (!resource) {
    const componentName = tags.component ? tags.component : 'handle'
    span.setTag(RESOURCE_NAME, `${componentName}.request`)
  } else {
    span.setTag(RESOURCE_NAME, resource)
  }
}

// Allows :routeParameters to be expanded by their request path value
function expandRouteParameters (httpRoute, req) {
  let expandedPath = httpRoute // default w/o expansion
  const expansionRules = req._datadog.config.expandRouteParameters[httpRoute]
  if (expansionRules === undefined) {
    return expandedPath
  }

  const keys = []
  const re = pathToRegexp(httpRoute, keys)
  // Account for routing-reduced paths
  const path = req.originalUrl.substring(0, req.originalUrl.indexOf(req.path) + req.path.length)
  const matches = re.exec(path)
  if (matches === null) {
    return expandedPath
  }

  const hits = matches.slice(1, keys.length + 1)
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    if (expansionRules[key.name] === true) {
      const replacePattern = `:${key.name}`
      const patternIndex = expandedPath.indexOf(replacePattern)
      // get substrings before and after :key.name
      const before = expandedPath.substring(0, patternIndex)
      let after = expandedPath.substring(patternIndex + replacePattern.length)
      // remove immediate capture group from after substring
      let capGroupMatches
      try {
        capGroupMatches = xregexp.matchRecursive(after, '\\(', '\\)')
      } catch (err) { // will throw if unbalanced parens in data (nothing we can do)
        capGroupMatches = []
      }
      if (capGroupMatches.length >= 1) {
        // replace stripped outer parens from recursive match and remove from after substring
        const replacedGroup = `(${capGroupMatches[0]})`
        const replacedGroupIndex = after.indexOf(replacedGroup)
        after = after.substring(replacedGroupIndex + replacedGroup.length)
      }
      // recreate expanded path with truncated substring
      // set expandedPath to be replaced :key.name w/ value
      expandedPath = before + hits[i] + after
    }
  }

  return expandedPath
}

// Creates a new span context and sets its ids as `req.sfx.traceId`
// and `req.sfx.spanId` for user access.
function synthesizedSpanContext (req) {
  const traceId = platform.id()
  const spanContext = new SpanContext({ traceId, spanId: traceId })
  Object.defineProperty(spanContext, 'isSynthesized', { value: true })
  const resId = idToHex(traceId)
  Object.defineProperty(req, 'sfx', { value: { traceId: resId, spanId: resId } })
  return spanContext
}

// Will remove the synthesized parent for any request without
// `synthesizeRequestingContext` configured.  Since the router
// instrumentation only determines paths by the end of the
// lifecycle, this must affect all spans that aren't the actual
// child of propagated context.
function revertSynthesizedContext (req) {
  if (req._datadog.childOfRequestingContext) {
    return
  }
  const span = req._datadog.span
  const tags = span.context()._tags
  const path = tags[HTTP_ROUTE]

  const synthesize = req._datadog.config.synthesizeRequestingContext[path]
  if (synthesize) {
    return
  }
  // "revert" synthesized context
  span.context()._parentId = null
}

function addHeaders (req) {
  const span = req._datadog.span

  req._datadog.config.headers.forEach(key => {
    const reqHeader = req.headers[key]
    const resHeader = req._datadog.res.getHeader(key)

    if (reqHeader) {
      span.setTag(`${HTTP_REQUEST_HEADERS}.${key}`, reqHeader)
    }

    if (resHeader) {
      span.setTag(`${HTTP_RESPONSE_HEADERS}.${key}`, resHeader)
    }
  })
}

function addStatusError (req) {
  if (!req._datadog.config.validateStatus(req._datadog.res.statusCode)) {
    req._datadog.span.setTag(ERROR, true)
  }
}

function getHeadersToRecord (config) {
  if (Array.isArray(config.headers)) {
    try {
      return config.headers.map(key => key.toLowerCase())
    } catch (err) {
      log.error(err)
    }
  } else if (config.hasOwnProperty('headers')) {
    log.error('Expected `headers` to be an array of strings.')
  }
  return []
}

function getStatusValidator (config) {
  if (typeof config.validateStatus === 'function') {
    return config.validateStatus
  } else if (config.hasOwnProperty('validateStatus')) {
    log.error('Expected `validateStatus` to be a function.')
  }
  return code => code < 500
}

function getHooks (config) {
  const noop = () => {}
  const request = (config.hooks && config.hooks.request) || noop

  return { request }
}

function getExpandRouteParameters (config) {
  if (typeof config.expandRouteParameters === 'object') {
    return config.expandRouteParameters
  } else if (config.hasOwnProperty('expandRouteParameters')) {
    log.error('Expected `expandRouteParameters` to be an object of paths to expansion rules')
  }
  return {}
}

function getSynthesizeRequestingContext (config) {
  if (typeof config.synthesizeRequestingContext === 'object') {
    return config.synthesizeRequestingContext
  } else if (config.hasOwnProperty('synthesizeRequestingContext')) {
    log.error('Expected `synthesizeRequestingContext` to be an object of paths to booleans')
  }
  return {}
}

function padTo128 (hexId) {
  const padded = '0000000000000000' + hexId
  return padded.slice(-32)
}

function traceParentHeader (spanContext) {
  // https://www.w3.org/TR/server-timing/
  // https://www.w3.org/TR/trace-context/#traceparent-header
  return 'traceparent;desc="00-' + padTo128(idToHex(spanContext._traceId)) + '-' + idToHex(spanContext._spanId) + '-01"'
}

module.exports = web
