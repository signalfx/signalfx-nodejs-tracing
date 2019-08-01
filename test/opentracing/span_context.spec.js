'use strict'

const Uint64BE = require('int64-buffer').Uint64BE

describe('SpanContext', () => {
  let SpanContext

  beforeEach(() => {
    SpanContext = require('../../src/opentracing/span_context')
  })

  it('should instantiate with the given properties', () => {
    const props = {
      traceId: '123',
      spanId: '456',
      parentId: '789',
      name: 'test',
      isFinished: true,
      _logs: [],
      tags: {},
      metrics: {},
      sampling: { priority: 2 },
      baggageItems: { foo: 'bar' },
      trace: {
        started: ['span1', 'span2'],
        finished: ['span1']
      }
    }
    const spanContext = new SpanContext(props)

    // Support deep-eql for OpenTracing 0.14.4 SpanContext prototype changes and Node 4 & 6
    expect(spanContext).to.deep.equal(Object.setPrototypeOf({
      _traceId: '123',
      _spanId: '456',
      _parentId: '789',
      _name: 'test',
      _isFinished: true,
      _logs: [],
      _tags: {},
      _metrics: {},
      _sampling: { priority: 2 },
      _baggageItems: { foo: 'bar' },
      _trace: {
        started: ['span1', 'span2'],
        finished: ['span1']
      }
    }, Object.getPrototypeOf(spanContext)))
  })

  it('should have the correct default values', () => {
    const expected = {
      traceId: '123',
      spanId: '456',
      parentId: null,
      name: undefined,
      isFinished: false,
      _logs: [],
      tags: {},
      metrics: {},
      sampling: {},
      baggageItems: {},
      trace: {
        started: [],
        finished: []
      }
    }

    const spanContext = new SpanContext({
      traceId: expected.traceId,
      spanId: expected.spanId
    })

    expect(spanContext).to.deep.equal(Object.setPrototypeOf({
      _traceId: '123',
      _spanId: '456',
      _parentId: null,
      _name: undefined,
      _isFinished: false,
      _logs: [],
      _tags: {},
      _metrics: {},
      _sampling: {},
      _baggageItems: {},
      _trace: {
        started: [],
        finished: []
      }
    }, Object.getPrototypeOf(spanContext)))
  })

  describe('toTraceId()', () => {
    it('should return the trace ID as string', () => {
      const spanContext = new SpanContext({
        traceId: new Uint64BE(123),
        spanId: new Uint64BE(456)
      })

      expect(spanContext.toTraceId()).to.equal('123')
    })
  })

  describe('toSpanId()', () => {
    it('should return the span ID as string', () => {
      const spanContext = new SpanContext({
        traceId: new Uint64BE(123),
        spanId: new Uint64BE(456)
      })

      expect(spanContext.toSpanId()).to.equal('456')
    })
  })
})
