'use strict'

const pick = require('lodash.pick')
const Uint64BE = require('int64-buffer').Uint64BE
const SignalFxSpanContext = require('../span_context')
const log = require('../../log')
const idToHex = require('../../utils').idToHex
const priority = require('../../../ext').priority

const traceIdKey = 'x-b3-traceid'
const spanIdKey = 'x-b3-spanid'
const parentIdKey = 'x-b3-parentspanid'
const sampledKey = 'x-b3-sampled'
const flagsKey = 'x-b3-flags'
const otBaggagePrefix = 'ot-baggage-'
const baggagePrefix = 'baggage-'
const baggagePrefixes = [otBaggagePrefix, baggagePrefix]

const logKeys = [traceIdKey, spanIdKey, parentIdKey, sampledKey]

class B3TextMapPropagator {
  inject (spanContext, carrier) {
    const traceId = idToHex(spanContext._traceId)
    // Don't inject trace data from NoopSpan
    if (traceId === '0000000000000000') {
      return
    }
    carrier[traceIdKey] = traceId
    carrier[spanIdKey] = idToHex(spanContext._spanId)

    const parentId = spanContext._parentId
    if (parentId !== null) {
      carrier[parentIdKey] = idToHex(parentId)
    }
    this._injectSampled(spanContext, carrier)
    this._injectBaggageItems(spanContext, carrier)

    log.debug(() => `Inject into carrier: ${JSON.stringify(pick(carrier, logKeys))}.`)
  }

  extract (carrier) {
    let traceId
    let spanId
    const keys = Object.keys(carrier)
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      const lcKey = key.toLowerCase()
      if (lcKey === traceIdKey) {
        traceId = carrier[key]
      } else if (lcKey === spanIdKey) {
        spanId = carrier[key]
      }
      if (traceId && spanId) {
        break
      }
    }

    if (!(traceId && spanId)) {
      return null
    }

    const spanContext = new SignalFxSpanContext({
      traceId: new Uint64BE(traceId, 16),
      spanId: new Uint64BE(spanId, 16)
    })

    this._extractBaggageItems(carrier, spanContext)
    this._extractSamplingPriority(carrier, spanContext)

    log.debug(() => `Extract from carrier: ${JSON.stringify(pick(carrier, logKeys))}.`)

    return spanContext
  }

  _injectSampled (spanContext, carrier) {
    let sampled = false
    const contextPriority = spanContext._sampling.priority
    if (contextPriority !== undefined) {
      sampled = contextPriority === priority.USER_KEEP || contextPriority === priority.AUTO_KEEP
    }
    carrier[sampledKey] = sampled ? '1' : '0'
  }

  _injectBaggageItems (spanContext, carrier) {
    spanContext._baggageItems && Object.keys(spanContext._baggageItems).forEach(key => {
      carrier[otBaggagePrefix + key] = String(spanContext._baggageItems[key])
    })
  }

  _extractBaggageItems (carrier, spanContext) {
    Object.keys(carrier).forEach(key => {
      const checkedKey = key.toLowerCase()
      let baggageItem
      for (let i = 0; i < baggagePrefixes.length; i++) {
        const prefix = baggagePrefixes[i]
        if (checkedKey.startsWith(prefix)) {
          baggageItem = key.substr(prefix.length)
          spanContext._baggageItems[baggageItem] = carrier[key]
          break
        }
      }
    })
  }

  _extractSamplingPriority (carrier, spanContext) {
    let sampled
    let debugged
    const keys = Object.keys(carrier)
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      const lcKey = key.toLowerCase()
      if (lcKey === sampledKey) {
        sampled = carrier[key]
      } else if (lcKey === flagsKey) {
        debugged = carrier[key]
      }
      if (sampled && debugged) {
        break
      }
    }

    if (debugged !== undefined) {
      const debugFlag = parseInt(debugged, 10)
      if (debugFlag === 1) {
        spanContext._sampling.priority = priority.USER_KEEP
        return
      }
    }

    if (sampled !== undefined) { // otherwise force priority sampler to decide on isSampled()
      const isSampled = parseInt(sampled, 10)
      if (Number.isInteger(isSampled)) {
        spanContext._sampling.priority = isSampled
      }
    }
  }
}

module.exports = B3TextMapPropagator
