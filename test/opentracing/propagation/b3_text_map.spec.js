'use strict'

const Uint64BE = require('int64-buffer').Uint64BE
const SpanContext = require('../../../src/opentracing/span_context')

describe('B3TextMapPropagator', () => {
  let B3TextMapPropagator
  let propagator
  let textMap
  let baggageItems

  beforeEach(() => {
    B3TextMapPropagator = require('../../../src/opentracing/propagation/b3_text_map')
    propagator = new B3TextMapPropagator()
    textMap = {
      'x-b3-traceid': '000000000000007b',
      'x-b3-spanid': 'fffffffffffffe38',
      'ot-baggage-foo': 'bar',
      'baggage-baz': 'thud'
    }
    baggageItems = {
      foo: 'bar',
      baz: 'thud'
    }
  })

  describe('inject', () => {
    it('should inject the span context into the carrier', () => {
      const carrier = {}
      const spanContext = new SpanContext({
        traceId: new Uint64BE(0, 123),
        spanId: new Uint64BE(-456),
        baggageItems
      })

      propagator.inject(spanContext, carrier)
      expect(carrier).to.have.property('x-b3-traceid', '000000000000007b')
      expect(carrier).to.have.property('x-b3-spanid', 'fffffffffffffe38')
      expect(carrier).to.have.property('ot-baggage-foo', 'bar')
      expect(carrier).to.have.property('ot-baggage-baz', 'thud')
    })

    it('should handle non-string values', () => {
      const carrier = {}
      const spanContext = new SpanContext({
        traceId: new Uint64BE(0, 123),
        spanId: new Uint64BE(0, 456),
        baggageItems: {
          number: 1.23,
          bool: true,
          array: ['foo', 'bar'],
          object: {}
        }
      })

      propagator.inject(spanContext, carrier)

      expect(carrier).to.have.property('x-b3-traceid', '000000000000007b')
      expect(carrier).to.have.property('x-b3-spanid', '00000000000001c8')
      expect(carrier['ot-baggage-number']).to.equal('1.23')
      expect(carrier['ot-baggage-bool']).to.equal('true')
      expect(carrier['ot-baggage-array']).to.equal('foo,bar')
      expect(carrier['ot-baggage-object']).to.equal('[object Object]')
    })

    it('should inject an existing sampling priority as unsampled', () => {
      const carrier = {}
      const spanContext = new SpanContext({
        traceId: new Uint64BE(0, 123),
        spanId: new Uint64BE(-456),
        sampling: {
          priority: 0
        },
        baggageItems
      })

      propagator.inject(spanContext, carrier)

      expect(carrier).to.have.property('x-b3-sampled', '0')
    })

    it('should inject an existing sampling priority as sampled', () => {
      const carrier = {}
      const spanContext = new SpanContext({
        traceId: new Uint64BE(0, 123),
        spanId: new Uint64BE(-456),
        sampling: {
          priority: 1
        },
        baggageItems
      })

      propagator.inject(spanContext, carrier)

      expect(carrier).to.have.property('x-b3-sampled', '1')
    })
  })

  describe('extract', () => {
    it('should extract a span context from the carrier', () => {
      const carrier = textMap
      const spanContext = propagator.extract(carrier)

      expect(spanContext).to.deep.equal(new SpanContext({
        traceId: new Uint64BE(0, 123),
        spanId: new Uint64BE(-456),
        baggageItems
      }))
    })

    it('should return null if the carrier does not contain a trace', () => {
      const carrier = {}
      const spanContext = propagator.extract(carrier)

      expect(spanContext).to.equal(null)
    })

    it('should extract a span context with a valid sampling priority', () => {
      textMap['x-b3-sampled'] = '0'
      const carrier = textMap
      const spanContext = propagator.extract(carrier)

      expect(spanContext).to.deep.equal(new SpanContext({
        traceId: new Uint64BE(0, 123),
        spanId: new Uint64BE(-456),
        sampling: {
          priority: 0
        },
        baggageItems
      }))
    })
  })
})
