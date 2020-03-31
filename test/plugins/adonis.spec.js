'use strict'

const axios = require('axios')
const getPort = require('get-port')
const agent = require('./agent')
const plugin = require('../../src/plugins/adonis')
const { setupResolver, Config, Logger } = require('@adonisjs/sink')
const { ioc } = require('@adonisjs/fold')
const path = require('path')
const semver = require('semver')

const frameworkPath = '../../versions/@adonisjs/framework'

wrapIt()

describe('Plugin', () => {
  let Server
  let Route
  let RouteStore
  let Request
  let Response
  let Context
  let Exception

  let port
  let server
  let framework
  let exception
  let newServer
  let randId

  describe('adonis', () => {
    withVersions(plugin, '@adonisjs/framework', version => {
      class AppMiddleware {
        handle (ctx, next, [id]) {
          return new Promise((resolve, reject) => {
            resolve(ctx)
          }).then(next)
        }
      }

      before(() => {
        framework = require(`${frameworkPath}@${version}`)

        // Required to mock the function of an adonisjs framework application
        Server = framework.get('@adonisjs/framework/src/Server')
        Route = framework.get('@adonisjs/framework/src/Route/Manager')
        RouteStore = framework.get('@adonisjs/framework/src/Route/Store')
        Request = framework.get('@adonisjs/framework/src/Request')
        Response = framework.get('@adonisjs/framework/src/Response')
        Context = framework.get('@adonisjs/framework/src/Context')
        Exception = framework.get('@adonisjs/framework/src/Exception')

        if (semver.intersects(version, '>=5.0.0')) {
          Context.getter('response', function () {
            const config = new Config()
            config.set('app.http.jsonpCallback', 'callback')
            return new Response(this.request, config)
          }, true)

          ioc.autoload(path.join(__dirname), 'App')
        } else {
          Context.getter('response', function () {
            return new Response(this.req, this.res, new Config())
          }, true)
        }

        Context.getter('request', function () {
          return new Request(this.req, this.res, new Config())
        }, true)

        setupResolver()
        agent.load(plugin, 'adonis').then(() => {
        })
      })

      beforeEach((done) => {
        exception = Exception
        newServer = new Server(Context, Route, new Logger(), exception)
        randId = Math.ceil(Math.random() * 100)

        getPort().then(newPort => {
          port = newPort
          server = newServer.listen('localhost', port)
          server.on('listening', done)
        })
      })

      afterEach(() => {
        RouteStore.clear()
        ioc.restore()
        exception.clear()
        server.close()
      })

      after(() => {
        return agent.close()
      })

      it('should perform automatic instrumentation on routers', done => {
        Route.get('/api/user', function ({ response }) {
          response.send('GET')
        })

        agent.use(traces => {
          const spans = traces[0]

          expect(spans[0]).to.have.property('service', 'test')
          expect(spans[0]).to.have.property('name', 'adonis.middleware')
          expect(spans[0].meta).to.have.property('component', 'adonis')
          expect(spans[0].parent_id.toString()).to.equal(spans[1].span_id.toString())

          expect(spans[1]).to.have.property('service', 'test')
          expect(spans[1]).to.have.property('name', '/api/user')
          expect(spans[1].meta).to.have.property('component', 'adonis')
          expect(spans[1].meta).to.have.property('span.kind', 'server')
          expect(spans[1].meta).to.have.property('http.url', `http://localhost:${port}/api/user`)
          expect(spans[1].meta).to.have.property('http.method', 'GET')
          expect(spans[1].meta).to.have.property('http.status_code', '200')
        }).then(done)
          .catch(done)

        axios
          .get(`http://localhost:${port}/api/user`)
          .catch(done)
      })

      it('should properly tag errors', done => {
        Route.get('/api/user/:id', function () {
          throw new Error('custom error')
        })

        agent.use(traces => {
          const spans = traces[0]

          expect(spans[0]).to.have.property('service', 'test')
          expect(spans[0]).to.have.property('name', 'adonis.middleware')
          expect(spans[0].meta).to.have.property('component', 'adonis')
          expect(spans[0].meta).to.have.property('error', 'true')
          expect(spans[0].meta).to.have.property('sfx.error.kind', 'Error')
          expect(spans[0].meta).to.have.property('sfx.error.message', 'custom error')
          expect(spans[0].meta).to.have.property('sfx.error.stack')
          expect(spans[0].parent_id.toString()).to.equal(spans[1].span_id.toString())

          expect(spans[1]).to.have.property('service', 'test')
          expect(spans[1]).to.have.property('name', '/api/user/:id')
          expect(spans[1].meta).to.have.property('component', 'adonis')
          expect(spans[1].meta).to.have.property('error', 'true')
          expect(spans[1].meta).to.have.property('span.kind', 'server')
          expect(spans[1].meta).to.have.property('http.url', `http://localhost:${port}/api/user/${randId}`)
          expect(spans[1].meta).to.have.property('http.method', 'GET')
          expect(spans[1].meta).to.have.property('http.status_code', '500')
        }).then(done)
          .catch(done)

        axios
          .get(`http://localhost:${port}/api/user/${randId}`)
          .then(() => {
            throw new Error('Should have client error.')
          }, () => {})
      })

      it('should automatically instrument app middleware', done => {
        ioc.fake('Middleware/AppMiddleware', function () {
          return new AppMiddleware()
        })
        newServer.registerNamed({
          'app': 'Middleware/AppMiddleware'
        })

        Route.get('/api/user/:id', function ({ ids }) {
          return ids
        })
          .middleware('app:1')

        agent.use(traces => {
          const spans = traces[0]

          expect(spans[0]).to.have.property('service', 'test')
          expect(spans[0]).to.have.property('name', 'adonis.middleware')
          expect(spans[0].meta).to.have.property('component', 'adonis')
          expect(spans[0].parent_id.toString()).to.equal(spans[1].span_id.toString())

          expect(spans[1]).to.have.property('service', 'test')
          expect(spans[1]).to.have.property('name', 'Middleware/AppMiddleware')
          expect(spans[1].meta).to.have.property('component', 'adonis')
          expect(spans[1].parent_id.toString()).to.equal(spans[2].span_id.toString())

          expect(spans[2]).to.have.property('name', '/api/user/:id')
          expect(spans[2]).to.have.property('service', 'test')
          expect(spans[2].meta).to.have.property('component', 'adonis')
          expect(spans[2].meta).to.have.property('span.kind', 'server')
          expect(spans[2].meta).to.have.property('http.url', `http://localhost:${port}/api/user/${randId}`)
          expect(spans[2].meta).to.have.property('http.method', 'GET')
          expect(spans[2].meta).to.have.property('http.status_code', '204')
        }).then(done)
          .catch(done)

        axios
          .get(`http://localhost:${port}/api/user/${randId}`)
          .catch(done)
      })

      it('should automatically instrument runtime middleware', done => {
        class Auth {
          handle ({ response }, next, authenticators) {
            response.send(authenticators)
          }
        }

        ioc.fake('Middleware/Auth', function () {
          return new Auth()
        })
        newServer.registerNamed({
          'auth': 'Middleware/Auth'
        })

        Route.get('/api/user/:id', function () {}).middleware('auth:jwt,basic')

        agent.use(traces => {
          const spans = traces[0]

          expect(spans[0]).to.have.property('service', 'test')
          expect(spans[0]).to.have.property('name', 'Middleware/Auth')
          expect(spans[0].meta).to.have.property('component', 'adonis')
          expect(spans[0].parent_id.toString()).to.equal(spans[1].span_id.toString())

          expect(spans[1]).to.have.property('name', '/api/user/:id')
          expect(spans[1]).to.have.property('service', 'test')
          expect(spans[1].meta).to.have.property('component', 'adonis')
          expect(spans[1].meta).to.have.property('span.kind', 'server')
          expect(spans[1].meta).to.have.property('http.url', `http://localhost:${port}/api/user/${randId}`)
          expect(spans[1].meta).to.have.property('http.method', 'GET')
          expect(spans[1].meta).to.have.property('http.status_code', '200')
        }).then(done)
          .catch(done)

        axios
          .get(`http://localhost:${port}/api/user/${randId}`)
          .catch(done)
      })

      it('should perform default naming on anonymous middleware', done => {
        Route.get('/api/user/:id', function ({ request }) {
          return request.middleware
        }).middleware(function ({ request }, next) {
          return new Promise((resolve, reject) => {
            resolve(request)
          }).then(next)
        })

        agent
          .use(traces => {
            const spans = traces[0]

            expect(spans[0]).to.have.property('service', 'test')
            expect(spans[0]).to.have.property('name', 'adonis.middleware')
            expect(spans[0].meta).to.have.property('component', 'adonis')
            expect(spans[0].parent_id.toString()).to.equal(spans[1].span_id.toString())

            expect(spans[1]).to.have.property('service', 'test')
            expect(spans[1]).to.have.property('name', 'adonis.middleware')
            expect(spans[1].meta).to.have.property('component', 'adonis')
            expect(spans[1].parent_id.toString()).to.equal(spans[2].span_id.toString())

            expect(spans[2]).to.have.property('name', `/api/user/:id`)
            expect(spans[2]).to.have.property('service', 'test')
            expect(spans[2].meta).to.have.property('component', 'adonis')
            expect(spans[2].meta).to.have.property('span.kind', 'server')
            expect(spans[2].meta).to.have.property('http.url', `http://localhost:${port}/api/user/${randId}`)
            expect(spans[2].meta).to.have.property('http.method', 'GET')
          })
          .then(done)
          .catch(done)

        axios
          .get(`http://localhost:${port}/api/user/${randId}`)
          .catch(done)
      })

      it('should properly parent the spans', done => {
        ioc.fake('Middleware/AppMiddleware', function () {
          return new AppMiddleware()
        })
        newServer.registerNamed({
          'app': 'Middleware/AppMiddleware'
        })

        Route.get('/api/user', function ({ ids }) {
          return ids
        })
          .middleware('app:1')

        agent
          .use(traces => {
            const spans = traces[0]

            expect(spans[0]).to.have.property('service', 'test')
            expect(spans[0]).to.have.property('name', 'adonis.middleware')
            expect(spans[0].meta).to.have.property('component', 'adonis')
            expect(spans[0].parent_id.toString()).to.equal(spans[1].span_id.toString())

            expect(spans[1]).to.have.property('service', 'test')
            expect(spans[1]).to.have.property('name', 'Middleware/AppMiddleware')
            expect(spans[1].meta).to.have.property('component', 'adonis')
            expect(spans[1].parent_id.toString()).to.equal(spans[2].span_id.toString())

            expect(spans[2]).to.have.property('service', 'test')
            expect(spans[2]).to.have.property('name', `/api/user`)
            expect(spans[2].meta).to.have.property('component', 'adonis')
            expect(spans[2].meta).to.have.property('span.kind', 'server')
            expect(spans[2].meta).to.have.property('http.url', `http://localhost:${port}/api/user`)
            expect(spans[2].meta).to.have.property('http.method', 'GET')
            expect(spans[2].meta).to.have.property('http.status_code', '204')
          }).then(done)
          .catch(done)

        axios
          .get(`http://localhost:${port}/api/user`)
          .catch(done)
      })
    })
  })
})
