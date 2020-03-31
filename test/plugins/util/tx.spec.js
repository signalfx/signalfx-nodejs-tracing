'use strict'

describe('plugins/util/tx', () => {
  let tx
  let tracer
  let span

  beforeEach(() => {
    tracer = require('../../..').init({ plugins: false })
    span = tracer.startSpan('test')
    tx = require('../../../src/plugins/util/tx')

    sinon.spy(span, 'finish')
  })

  afterEach(() => {
    span.finish.restore()
  })

  describe('setHost', () => {
    it('should set the peer.hostname and peer.port tags', () => {
      tx.setHost(span, 'example.com', '1234')

      expect(span.context()._tags).to.have.property('peer.hostname', 'example.com')
      expect(span.context()._tags).to.have.property('peer.port', '1234')
    })

    it('should set the peer.ipv4 and peer.port tags', () => {
      tx.setHost(span, '127.0.0.1', '1234')

      expect(span.context()._tags).to.have.property('peer.ipv4', '127.0.0.1')
      expect(span.context()._tags).to.have.property('peer.port', '1234')
    })

    it('should set the peer.ipv6 and peer.port tags', () => {
      tx.setHost(span, '2001:db8:1234::1', '1234')

      expect(span.context()._tags).to.have.property('peer.ipv6', '2001:db8:1234::1')
      expect(span.context()._tags).to.have.property('peer.port', '1234')
    })
  })

  describe('wrap', () => {
    describe('with a callback', () => {
      it('should return a wrapper that finishes the span', () => {
        const callback = sinon.spy()
        const wrapper = tx.wrap(span, callback)

        wrapper(null, 'foo', 'bar')

        expect(callback).to.have.been.calledWith(null, 'foo', 'bar')
        expect(span.finish).to.have.been.called
      })

      it('should return a wrapper that sets error tags', () => {
        const callback = sinon.spy()
        const error = new Error('boom')
        const wrapper = tx.wrap(span, callback)

        wrapper(error)

        expect(span.context()._tags).to.have.property('sfx.error.message', error.message)
        expect(span.context()._tags).to.have.property('sfx.error.kind', error.name)
        expect(span.context()._tags).to.have.property('sfx.error.stack', error.stack)
      })

      it('should return a wrapper that runs in the current scope', done => {
        const parent = {}
        const child = {}

        tracer.scope().activate(parent, () => {
          const wrapper = tx.wrap(span, () => {
            expect(tracer.scope().active()).to.equal(parent)
            done()
          })

          tracer.scope().activate(child, () => {
            wrapper()
          })
        })
      })
    })

    describe('with a promise', () => {
      it('should finish the span when the promise is resolved', () => {
        const promise = Promise.resolve('value')

        tx.wrap(span, promise)

        return promise.then(value => {
          expect(value).to.equal('value')
          expect(span.finish).to.have.been.called
        })
      })

      it('should set the error tags when the promise is rejected', () => {
        const error = new Error('boom')
        const promise = Promise.reject(error)

        tx.wrap(span, promise)

        return promise.catch(err => {
          expect(err).to.equal(error)
          expect(span.context()._tags).to.have.property('sfx.error.message', error.message)
          expect(span.context()._tags).to.have.property('sfx.error.kind', error.name)
          expect(span.context()._tags).to.have.property('sfx.error.stack', error.stack)
        })
      })
    })
  })
})
