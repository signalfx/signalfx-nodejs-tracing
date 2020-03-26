'use strict'

const agent = require('./agent')
const plugin = require('../../src/plugins/redis')

wrapIt()

describe('Plugin', () => {
  let redis
  let tracer
  let client
  let pub
  let sub

  describe('redis', () => {
    withVersions(plugin, 'redis', version => {
      beforeEach(() => {
        tracer = require('../..')
      })

      afterEach(() => {
        client.quit(() => {})
        pub.quit(() => {})
        sub.quit(() => {})
      })

      describe('without configuration', () => {
        before(() => {
          return agent.load(plugin, 'redis')
        })

        after(() => {
          return agent.close()
        })

        beforeEach(() => {
          redis = require(`../../versions/redis@${version}`).get()
          client = redis.createClient()
          pub = redis.createClient()
          sub = redis.createClient()
        })

        it('should do automatic instrumentation when using callbacks', done => {
          client.on('error', done)

          agent
            .use(traces => {
              expect(traces[0][0]).to.have.property('service', 'test')
              expect(traces[0][0]).to.have.property('name', 'get')
              expect(traces[0][0].meta).to.have.property('component', 'redis')
              expect(traces[0][0].meta).to.have.property('db.instance', '0')
              expect(traces[0][0].meta).to.have.property('db.type', 'redis')
              expect(traces[0][0].meta).to.have.property('span.kind', 'client')
              expect(traces[0][0].meta).to.have.property('db.statement', 'GET foo')
            })
            .then(done)
            .catch(done)

          client.get('foo', () => {})
        })

        it('should support commands without a callback', done => {
          sub.on('error', done)
          sub.on('message', () => done())
          sub.subscribe('foo')

          sub.on('subscribe', () => {
            pub.on('error', done)
            pub.publish('foo', 'test')
          })
        })

        it('should run the callback in the parent context', done => {
          if (process.env.SIGNALFX_CONTEXT_PROPAGATION === 'false') return done()

          client.on('error', done)

          client.get('foo', () => {
            expect(tracer.scope().active()).to.be.null
            done()
          })
        })

        it('should run client emitter listeners in the parent context', done => {
          if (process.env.SIGNALFX_CONTEXT_PROPAGATION === 'false') return done()

          client.on('error', done)

          client.on('ready', () => {
            expect(tracer.scope().active()).to.be.null
            done()
          })
        })

        it('should run stream emitter listeners in the parent context', done => {
          if (process.env.SIGNALFX_CONTEXT_PROPAGATION === 'false') return done()

          client.on('error', done)

          client.stream.on('close', () => {
            expect(tracer.scope().active()).to.be.null
            done()
          })

          client.stream.destroy()
        })

        it('should handle errors', done => {
          let error

          client.on('error', done)

          agent.use(() => { // wait for initial info command
            client.set('foo', 123, 'bar', (err, res) => {
              error = err
            })
          })

          agent
            .use(traces => {
              expect(traces[0][0].meta).to.have.property('error', 'true')
              expect(traces[0][0].meta).to.have.property('sfx.error.kind', error.name)
              expect(traces[0][0].meta).to.have.property('sfx.error.object', error.name)
              expect(traces[0][0].meta).to.have.property('sfx.error.message', error.message)
              expect(traces[0][0].meta).to.have.property('sfx.error.stack', error.stack)
            })
            .then(done)
            .catch(done)
        })
      })

      describe('with configuration', () => {
        before(() => {
          return agent.load(plugin, 'redis', { service: 'custom' })
        })

        after(() => {
          return agent.close()
        })

        beforeEach(() => {
          redis = require(`../../versions/redis@${version}`).get()
          client = redis.createClient()
        })

        it('should be configured with the correct values', done => {
          agent
            .use(traces => {
              expect(traces[0][0]).to.have.property('service', 'test')
            })
            .then(done)
            .catch(done)

          client.on('error', done)
        })
      })
    })
  })
})
