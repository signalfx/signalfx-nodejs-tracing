'use strict'

const { idToHex, microTs } = require('../utils')

function formatZipkinV2Json (span) {
  const formatted = {}

  formatLocalEndpoint(formatted, span)
  formatAnnotations(formatted, span)
  formatTags(formatted, span)
  formatSpan(formatted, span)

  return formatted
}

function formatLocalEndpoint (formatted, span) {
  formatted.localEndpoint = { 'serviceName': span._parentTracer._service }
}

function formatAnnotations (formatted, span) {
  const logs = span.context()._logs
  if (logs.length === 0) {
    return
  }

  const annotations = []
  logs.forEach(logged => {
    annotations.push({
      timestamp: microTs(logged.timestamp),
      value: JSON.stringify(logged.value)
    })
  })
  formatted.annotations = annotations
}

function formatTags (formatted, span) {
  const tags = span.context()._tags
  const keys = Object.keys(tags)
  if (keys.length === 0) {
    return
  }

  const formattedTags = {}
  formatted.tags = formattedTags

  keys.forEach(tag => {
    switch (tag) {
      case 'span.kind':
        if (span.kind == null) {
          span.kind = tags[tag]
        }
        break
      case 'span.type':
        if (formattedTags.component === undefined) {
          formattedTags.component = String(tags[tag])
        }
        break
      case 'service.name':
        break // do not add to tags
      case 'resource.name':
        // resource names make for more informative OT operation names
        span.setOperationName(tags[tag])
        break
      case 'error':
        if (tags[tag]) {
          formattedTags.error = String(tags[tag])
        }
        break
      case 'error.type':
      case 'error.msg':
      case 'error.stack':
        formattedTags.error = 'true'
        formattedTags[tag] = String(tags[tag])
        break
      default:
        formattedTags[tag] = String(tags[tag])
    }
  })
}

function formatSpan (formatted, span) {
  const spanContext = span.context()

  formatted.traceId = idToHex(spanContext._traceId)
  formatted.name = String(spanContext._name)
  formatted.id = idToHex(spanContext._spanId)
  formatted.timestamp = microTs(span._startTime)
  formatted.duration = microTs(span._duration)

  const parentId = spanContext._parentId
  if (parentId) {
    formatted.parentId = idToHex(parentId)
  }

  if (span.kind) {
    formatted.kind = span.kind.toUpperCase()
  }

  return formatted
}

module.exports = formatZipkinV2Json
