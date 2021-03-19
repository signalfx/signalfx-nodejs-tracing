'use strict'

const url = require('url')
const semver = require('semver')
const opentracing = require('opentracing')
const log = require('../../log')
const constants = require('../../constants')
const tags = require('../../../ext/tags')
const kinds = require('../../../ext/kinds')
const formats = require('../../../ext/formats')
const urlFilter = require('../util/urlfilter')
const analyticsSampler = require('../../analytics_sampler')

const Reference = opentracing.Reference

const HTTP_HEADERS = formats.HTTP_HEADERS
const HTTP_STATUS_CODE = tags.HTTP_STATUS_CODE
const HTTP_REQUEST_HEADERS = tags.HTTP_REQUEST_HEADERS
const HTTP_RESPONSE_HEADERS = tags.HTTP_RESPONSE_HEADERS
const SPAN_KIND = tags.SPAN_KIND
const CLIENT = kinds.CLIENT
const REFERENCE_CHILD_OF = opentracing.REFERENCE_CHILD_OF
const REFERENCE_NOOP = constants.REFERENCE_NOOP

function patch (http, methodName, tracer, config) {
  config = normalizeConfig(tracer, config)
  this.wrap(http, methodName, fn => makeRequestTrace(fn))

  function makeRequestTrace (request) {
    return function requestTrace () {
      const args = normalizeArgs.apply(null, arguments)
      const uri = args.uri
      const options = args.options

      let callback = args.callback

      const method = (options.method || 'GET').toUpperCase()

      const scope = tracer.scope()
      const childOf = scope.active()

      let references
      if (config.filter(uri)) {
        references = (childOf !== null) ? [ new Reference(REFERENCE_CHILD_OF, childOf) ] : []
      } else {
        references = [ new Reference(REFERENCE_NOOP, childOf) ]
      }

      const span = tracer.startSpan('http.request', {
        references,
        tags: {
          [SPAN_KIND]: CLIENT,
          'service.name': getServiceName(tracer, config, options),
          'resource.name': method,
          'span.type': 'http',
          'http.method': method,
          'http.url': uri
        }
      })

      if (!hasAmazonSignature(options)) {
        tracer.inject(span, HTTP_HEADERS, options.headers)
      }

      analyticsSampler.sample(span, config.analytics)

      callback = scope.bind(callback, childOf)

      const req = scope.bind(request, span).call(this, options, callback)
      const emit = req.emit

      req.emit = function (eventName, arg) {
        switch (eventName) {
          case 'response': {
            const res = arg

            scope.bind(res)

            span.setTag(HTTP_STATUS_CODE, res.statusCode)

            addResponseHeaders(res, span, config)

            if (!config.validateStatus(res.statusCode)) {
              span.setTag('error', 'true')
            }

            res.on('end', () => finish(req, res, span, config))

            break
          }
          case 'error':
            addError(span, arg)
          case 'abort': // eslint-disable-line no-fallthrough
          case 'close': // eslint-disable-line no-fallthrough
            finish(req, null, span, config)
        }

        return emit.apply(this, arguments)
      }

      scope.bind(req)

      return req
    }
  }

  function finish (req, res, span, config) {
    addRequestHeaders(req, span, config)

    config.hooks.request(span, req, res)

    span.finish()
  }

  function addError (span, error) {
    span.addTags({
      'sfx.error.kind': error.name,
      'sfx.error.message': error.message,
      'sfx.error.stack': error.stack
    })

    return error
  }

  function addRequestHeaders (req, span, config) {
    config.headers.forEach(key => {
      const value = req.getHeader(key)

      if (value) {
        span.setTag(`${HTTP_REQUEST_HEADERS}.${key}`, value)
      }
    })
  }

  function addResponseHeaders (res, span, config) {
    config.headers.forEach(key => {
      const value = res.headers[key]

      if (value) {
        span.setTag(`${HTTP_RESPONSE_HEADERS}.${key}`, value)
      }
    })
  }

  function extractUrl (options) {
    const uri = options
    const agent = options.agent || http.globalAgent

    return typeof uri === 'string' ? uri : url.format({
      protocol: options.protocol || agent.protocol,
      hostname: options.hostname || options.host || 'localhost',
      port: options.port,
      pathname: options.path || options.pathname || '/'
    })
  }

  function normalizeArgs (inputURL, inputOptions, callback) {
    let options = typeof inputURL === 'string' ? url.parse(inputURL) : Object.assign({}, inputURL)
    options.headers = options.headers || {}
    if (typeof inputOptions === 'function') {
      callback = inputOptions
    } else if (typeof inputOptions === 'object') {
      options = Object.assign(options, inputOptions)
    }
    const uri = extractUrl(options)
    return { uri, options, callback }
  }
}

function getHost (options) {
  if (typeof options === 'string') {
    return url.parse(options).host
  }

  const hostname = options.hostname || options.host || 'localhost'
  const port = options.port

  return [hostname, port].filter(val => val).join(':')
}

function getServiceName (tracer, config, options) {
  if (config.splitByDomain) {
    return getHost(options)
  } else if (config.service) {
    return config.service
  }

  return `${tracer._service}-http-client`
}

function hasAmazonSignature (options) {
  if (!options) {
    return false
  }

  if (options.headers) {
    const headers = Object.keys(options.headers)

    for (let i = 0; i < headers.length; i++) {
      const header = headers[i].toLowerCase()

      if (header === 'x-amz-signature') {
        return true
      }

      if (header === 'authorization' && hasAmazonHmac([].concat(options.headers[headers[i]]))) {
        return true
      }
    }
  }

  return options.path && options.path.toLowerCase().indexOf('x-amz-signature=') !== -1
}

function hasAmazonHmac (fields) {
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i]

    if (typeof field === 'string' && field.startsWith('AWS4-HMAC-SHA256')) {
      return true
    }
  }

  return false
}

function unpatch (http) {
  this.unwrap(http, 'request')
  this.unwrap(http, 'get')
}

function getStatusValidator (config) {
  if (typeof config.validateStatus === 'function') {
    return config.validateStatus
  } else if (config.hasOwnProperty('validateStatus')) {
    log.error('Expected `validateStatus` to be a function.')
  }
  return code => code < 500 || code >= 600
}

function getFilter (tracer, config) {
  config = Object.assign({}, config, {
    exclude: [`${tracer._url.href}`].concat(config.exclude || [])
  })

  return urlFilter.getFilter(config)
}

function normalizeConfig (tracer, config) {
  config = config.client || config

  const validateStatus = getStatusValidator(config)
  const filter = getFilter(tracer, config)
  const headers = getHeaders(config)
  const hooks = getHooks(config)

  return Object.assign({}, config, {
    validateStatus,
    filter,
    headers,
    hooks
  })
}

function getHeaders (config) {
  if (!Array.isArray(config.headers)) return []

  return config.headers
    .filter(key => typeof key === 'string')
    .map(key => key.toLowerCase())
}

function getHooks (config) {
  const noop = () => {}
  const request = (config.hooks && config.hooks.request) || noop

  return { request }
}

module.exports = [
  {
    name: 'http',
    patch: function (http, tracer, config) {
      if (config.client === false) return

      patch.call(this, http, 'request', tracer, config)
      if (semver.satisfies(process.version, '>=8')) {
        /**
         * In newer Node versions references internal to modules, such as `http(s).get` calling `http(s).request`, do
         * not use externally patched versions, which is why we need to also patch `get` here separately.
         */
        patch.call(this, http, 'get', tracer, config)
      }
    },
    unpatch
  },
  {
    name: 'https',
    patch: function (http, tracer, config) {
      if (config.client === false) return

      if (semver.satisfies(process.version, '>=9')) {
        patch.call(this, http, 'request', tracer, config)
        patch.call(this, http, 'get', tracer, config)
      } else {
        /**
         * Below Node v9 the `https` module invokes `http.request`, which would end up counting requests twice.
         * So rather then patch the `https` module, we ensure the `http` module is patched and we count only there.
         */
        require('http')
      }
    },
    unpatch
  }
]
