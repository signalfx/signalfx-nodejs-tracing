'use strict'

const semver = require('semver')
const agent = require('./agent')
const plugin = require('../../src/plugins/dns')
const version = require('../../lib/version')

wrapIt()

describe('Plugin', () => {
  let dns

  describe('dns', () => {
    afterEach(() => {
      return agent.close()
    })

    beforeEach(() => {
      return agent.load(plugin, 'dns')
        .then(() => {
          dns = require(`dns`)
        })
    })

    it('should instrument lookup', done => {
      agent
        .use(traces => {
          expect(traces[0][0]).to.deep.include({
            name: 'dns.lookup: localhost',
            service: 'test',
            meta: {
              'dns.hostname': 'localhost',
              'dns.address': '127.0.0.1',
              'span.kind': 'client',
              'signalfx.tracing.library': 'nodejs-tracing',
              'signalfx.tracing.version': version
            }
          })
        })
        .then(done)
        .catch(done)

      dns.lookup('localhost', 4, (err, address, family) => err && done(err))
    })

    it('should instrument lookupService', done => {
      agent
        .use(traces => {
          expect(traces[0][0]).to.deep.include({
            name: 'dns.lookup_service 127.0.0.1:22',
            service: 'test',
            meta: {
              'dns.address': '127.0.0.1',
              'dns.port': '22',
              'span.kind': 'client',
              'signalfx.tracing.library': 'nodejs-tracing',
              'signalfx.tracing.version': version
            }
          })
        })
        .then(done)
        .catch(done)

      dns.lookupService('127.0.0.1', 22, err => err && done(err))
    })

    it('should instrument resolve', done => {
      agent
        .use(traces => {
          expect(traces[0][0]).to.deep.include({
            name: 'dns.resolve: A localhost',
            service: 'test',
            meta: {
              'dns.hostname': 'localhost',
              'dns.rrtype': 'A',
              'span.kind': 'client',
              'signalfx.tracing.library': 'nodejs-tracing',
              'signalfx.tracing.version': version
            }
          })
        })
        .then(done)
        .catch(done)

      dns.resolve('localhost', err => err && done(err))
    })

    it('should instrument resolve shorthands', done => {
      agent
        .use(traces => {
          expect(traces[0][0]).to.deep.include({
            name: 'dns.resolve: ANY localhost',
            service: 'test',
            meta: {
              'dns.hostname': 'localhost',
              'dns.rrtype': 'ANY',
              'span.kind': 'client',
              'signalfx.tracing.library': 'nodejs-tracing',
              'signalfx.tracing.version': version
            }
          })
        })
        .then(done)
        .catch(done)

      dns.resolveAny('localhost', err => err && done(err))
    })

    it('should instrument reverse', done => {
      agent
        .use(traces => {
          expect(traces[0][0]).to.deep.include({
            name: 'dns.reverse: 127.0.0.1',
            service: 'test',
            meta: {
              'dns.ip': '127.0.0.1',
              'span.kind': 'client',
              'signalfx.tracing.library': 'nodejs-tracing',
              'signalfx.tracing.version': version
            }
          })
        })
        .then(done)
        .catch(done)

      dns.reverse('127.0.0.1', err => err && done(err))
    })

    if (semver.gte(process.version, '8.3.0')) {
      it('should instrument Resolver', done => {
        const resolver = new dns.Resolver()

        agent
          .use(traces => {
            expect(traces[0][0]).to.deep.include({
              name: 'dns.resolve: A localhost',
              service: 'test',
              meta: {
                'dns.hostname': 'localhost',
                'dns.rrtype': 'A',
                'span.kind': 'client',
                'signalfx.tracing.library': 'nodejs-tracing',
                'signalfx.tracing.version': version
              }
            })
          })
          .then(done)
          .catch(done)

        resolver.resolve('localhost', err => err && done(err))
      })
    }
  })
})
