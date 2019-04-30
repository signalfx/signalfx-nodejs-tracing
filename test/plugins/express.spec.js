'use strict'

const axios = require('axios')
const getPort = require('get-port')
const agent = require('./agent')
const plugin = require('../../src/plugins/express')

wrapIt()

const sort = spans => spans.sort((a, b) => a.start.toString() >= b.start.toString() ? 1 : -1)

describe('Plugin', () => {
  let tracer
  let express
  let appListener

  describe('express', () => {
    withVersions(plugin, 'express', version => {
      beforeEach(() => {
        tracer = require('../..')
      })

      afterEach(() => {
        appListener.close()
      })

      describe('without configuration', () => {
        before(() => {
          return agent.load(plugin, 'express')
        })

        after(() => {
          return agent.close()
        })

        beforeEach(() => {
          express = require(`../../versions/express@${version}`).get()
        })

        it('should do automatic instrumentation on app routes', done => {
          const app = express()

          app.get('/user', (req, res) => {
            res.status(200).send()
          })

          getPort().then(port => {
            agent
              .use(traces => {
                const spans = sort(traces[0])

                expect(spans[0]).to.have.property('service', 'test')
                expect(spans[0].meta).to.have.property('component', 'express')
                expect(spans[0]).to.have.property('name', 'GET /user')
                expect(spans[0].meta).to.have.property('span.kind', 'server')
                expect(spans[0].meta).to.have.property('http.url', `http://localhost:${port}/user`)
                expect(spans[0].meta).to.have.property('http.method', 'GET')
                expect(spans[0].meta).to.have.property('http.status_code', '200')
              })
              .then(done)
              .catch(done)

            appListener = app.listen(port, 'localhost', () => {
              axios
                .get(`http://localhost:${port}/user`)
                .catch(done)
            })
          })
        })

        it('should do automatic instrumentation on routers', done => {
          const app = express()
          const router = express.Router()

          router.get('/user/:id', (req, res) => {
            res.status(200).send()
          })

          app.use('/app', router)

          getPort().then(port => {
            agent
              .use(traces => {
                const spans = sort(traces[0])

                expect(spans[0]).to.have.property('service', 'test')
                expect(spans[0]).to.have.property('name', 'GET /app/user/:id')
                expect(spans[0].meta).to.have.property('component', 'express')
                expect(spans[0].meta).to.have.property('span.kind', 'server')
                expect(spans[0].meta).to.have.property('http.url', `http://localhost:${port}/app/user/1`)
                expect(spans[0].meta).to.have.property('http.method', 'GET')
                expect(spans[0].meta).to.have.property('http.status_code', '200')
              })
              .then(done)
              .catch(done)

            appListener = app.listen(port, 'localhost', () => {
              axios
                .get(`http://localhost:${port}/app/user/1`)
                .catch(done)
            })
          })
        })

        it('should do automatic instrumentation on routes', done => {
          const app = express()
          const router = express.Router()

          router
            .route('/user/:id')
            .all((req, res) => {
              res.status(200).send()
            })

          app.use('/app', router)

          getPort().then(port => {
            agent
              .use(traces => {
                const spans = sort(traces[0])

                expect(spans[0]).to.have.property('service', 'test')
                expect(spans[0]).to.have.property('name', 'GET /app/user/:id')
                expect(spans[0].meta).to.have.property('component', 'express')
                expect(spans[0].meta).to.have.property('span.kind', 'server')
                expect(spans[0].meta).to.have.property('http.url', `http://localhost:${port}/app/user/1`)
                expect(spans[0].meta).to.have.property('http.method', 'GET')
                expect(spans[0].meta).to.have.property('http.status_code', '200')
              })
              .then(done)
              .catch(done)

            appListener = app.listen(port, 'localhost', () => {
              axios
                .get(`http://localhost:${port}/app/user/1`)
                .catch(done)
            })
          })
        })

        it('should do automatic instrumentation on middleware', done => {
          const app = express()
          const router = express.Router()

          router.get('/user/:id', (req, res) => {
            res.status(200).send()
          })

          app.use(function named (req, res, next) { next() })
          app.use('/app', router)

          getPort().then(port => {
            agent
              .use(traces => {
                const spans = sort(traces[0])

                expect(spans).to.have.length(5)

                expect(spans[0]).to.have.property('name', 'GET /app/user/:id')
                expect(spans[0].meta).to.have.property('component', 'express')
                expect(spans[1]).to.have.property('name', 'named')
                expect(spans[1].meta).to.have.property('component', 'express')
                expect(spans[1].parent_id.toString()).to.equal(spans[0].trace_id.toString())
                expect(spans[2]).to.have.property('name', 'router')
                expect(spans[2].meta).to.have.property('component', 'express')
                expect(spans[3].name).to.match(/^bound\s.*$/)
                expect(spans[3].meta).to.have.property('component', 'express')
                expect(spans[4]).to.have.property('name', '<anonymous>')
                expect(spans[4].meta).to.have.property('component', 'express')
              })
              .then(done)
              .catch(done)

            appListener = app.listen(port, 'localhost', () => {
              axios
                .get(`http://localhost:${port}/app/user/1`)
                .catch(done)
            })
          })
        })

        it('should surround matchers based on regular expressions', done => {
          const app = express()
          const router = express.Router()

          router.get(/^\/user\/(\d)$/, (req, res) => {
            res.status(200).send()
          })

          app.use('/app', router)

          getPort().then(port => {
            agent
              .use(traces => {
                const spans = sort(traces[0])

                expect(spans[0]).to.have.property('name', 'GET /app(/^\\/user\\/(\\d)$/)')
              })
              .then(done)
              .catch(done)

            appListener = app.listen(port, 'localhost', () => {
              axios
                .get(`http://localhost:${port}/app/user/1`)
                .catch(done)
            })
          })
        })

        it('should support a nested array of paths on the router', done => {
          const app = express()
          const router = express.Router()

          router.get([['/user/:id'], '/users/:id'], (req, res, next) => {
            res.status(200).send()
          })

          app.use('/app', router)

          getPort().then(port => {
            agent
              .use(traces => {
                const spans = sort(traces[0])

                expect(spans[0]).to.have.property('name', 'GET /app/user/:id')
              })
              .then(done)
              .catch(done)

            appListener = app.listen(port, 'localhost', () => {
              axios
                .get(`http://localhost:${port}/app/user/1`)
                .catch(done)
            })
          })
        })

        it('should only keep the last matching path of a middleware stack', done => {
          const app = express()
          const router = express.Router()

          router.use('/', (req, res, next) => next())
          router.use('*', (req, res, next) => next())
          router.use('/bar', (req, res, next) => next())
          router.use('/bar', (req, res, next) => {
            res.status(200).send()
          })

          app.use('/', (req, res, next) => next())
          app.use('*', (req, res, next) => next())
          app.use('/foo/bar', (req, res, next) => next())
          app.use('/foo', router)

          getPort().then(port => {
            agent
              .use(traces => {
                const spans = sort(traces[0])

                expect(spans[0]).to.have.property('name', 'GET /foo/bar')
              })
              .then(done)
              .catch(done)

            appListener = app.listen(port, 'localhost', () => {
              axios
                .get(`http://localhost:${port}/foo/bar`)
                .catch(done)
            })
          })
        })

        it('should support asynchronous routers', done => {
          const app = express()
          const router = express.Router()

          router.get('/user/:id', (req, res) => {
            setTimeout(() => res.status(200).send())
          })

          app.use('/app', router)

          getPort().then(port => {
            agent
              .use(traces => {
                const spans = sort(traces[0])

                expect(spans[0]).to.have.property('name', 'GET /app/user/:id')
              })
              .then(done)
              .catch(done)

            appListener = app.listen(port, 'localhost', () => {
              axios
                .get(`http://localhost:${port}/app/user/1`)
                .catch(done)
            })
          })
        })

        it('should support asynchronous middlewares', done => {
          const app = express()
          const router = express.Router()

          router.use((req, res, next) => setTimeout(() => next()))
          router.get('/user/:id', (req, res) => {
            res.status(200).send()
          })

          app.use('/app', router)

          getPort().then(port => {
            agent
              .use(traces => {
                const spans = sort(traces[0])

                expect(spans[0]).to.have.property('name', 'GET /app/user/:id')
              })
              .then(done)
              .catch(done)

            appListener = app.listen(port, 'localhost', () => {
              axios
                .get(`http://localhost:${port}/app/user/1`)
                .catch(done)
            })
          })
        })

        it('should support nested applications', done => {
          const app = express()
          const childApp = express()

          childApp.use('/child', (req, res) => {
            res.status(200).send()
          })

          app.use('/parent', childApp)

          getPort().then(port => {
            agent
              .use(traces => {
                const spans = sort(traces[0])

                expect(spans.filter(span => {
                  return span.meta.component === 'express' &&
                         span.meta['http.url']
                })).to.have.length(1)
                expect(spans[0]).to.have.property('name', 'GET /parent/child')
              })
              .then(done)
              .catch(done)

            appListener = app.listen(port, 'localhost', () => {
              axios
                .get(`http://localhost:${port}/parent/child`)
                .catch(done)
            })
          })
        })

        it('should finish middleware spans when next() is called', done => {
          const app = express()

          let span

          app.use((req, res, next) => {
            span = tracer.scope().active()

            sinon.spy(span, 'finish')

            next()
          })

          app.use((req, res, next) => {
            expect(span.finish).to.have.been.called
            res.status(200).send()
            done()
          })

          getPort().then(port => {
            appListener = app.listen(port, 'localhost', () => {
              axios
                .get(`http://localhost:${port}/app/user/1`)
                .catch(done)
            })
          })
        })

        it('should not lose the current path when changing scope', done => {
          if (process.env.SIGNALFX_CONTEXT_PROPAGATION === 'false') return done()

          const app = express()
          const router = express.Router()

          router.use((req, res, next) => {
            const childOf = tracer.scope().active()
            const child = tracer.startSpan('child', { childOf })

            tracer.scope().activate(child, () => {
              child.finish()
              next()
            })
          })

          router.get('/user/:id', (req, res) => {
            res.status(200).send()
          })

          app.use('/app', router)

          getPort().then(port => {
            agent
              .use(traces => {
                const spans = sort(traces[0])

                expect(spans[0]).to.have.property('name', 'GET /app/user/:id')
              })
              .then(done)
              .catch(done)

            appListener = app.listen(port, 'localhost', () => {
              axios
                .get(`http://localhost:${port}/app/user/123`)
                .catch(done)
            })
          })
        })

        it('should not lose the current path without a scope', done => {
          if (process.env.SIGNALFX_CONTEXT_PROPAGATION === 'false') return done()

          const app = express()
          const router = express.Router()

          router.use((req, res, next) => {
            tracer.scope().activate(null, () => next())
          })

          router.get('/user/:id', (req, res) => {
            res.status(200).send()
          })

          app.use('/app', router)

          getPort().then(port => {
            agent
              .use(traces => {
                const spans = sort(traces[0])

                expect(spans[0]).to.have.property('name', 'GET /app/user/:id')
              })
              .then(done)
              .catch(done)

            appListener = app.listen(port, 'localhost', () => {
              axios
                .get(`http://localhost:${port}/app/user/123`)
                .catch(done)
            })
          })
        })

        it('should not lose the current path on error', done => {
          const app = express()

          app.get('/app', (req, res, next) => {
            next(new Error())
          })

          app.use((error, req, res, next) => {
            res.status(200).send(error.message)
          })

          getPort().then(port => {
            agent
              .use(traces => {
                const spans = sort(traces[0])

                expect(spans[0]).to.have.property('name', 'GET /app')
              })
              .then(done)
              .catch(done)

            appListener = app.listen(port, 'localhost', () => {
              axios
                .get(`http://localhost:${port}/app`)
                .catch(done)
            })
          })
        })

        it('should not leak the current scope to other requests when using a task queue', done => {
          const app = express()

          let handler

          const interval = setInterval(() => {
            if (handler) {
              handler()

              clearInterval(interval)

              expect(tracer.scope().active()).to.be.null

              done()
            }
          })

          app.use((req, res, next) => {
            handler = next
          })

          app.get('/app', (req, res) => {
            res.status(200).send()
          })

          getPort().then(port => {
            appListener = app.listen(port, 'localhost', () => {
              axios
                .get(`http://localhost:${port}/app`)
                .catch(done)
            })
          })
        })

        it('should fallback to the the verb if a path pattern could not be found', done => {
          const app = express()

          app.use((req, res, next) => res.status(200).send())

          getPort().then(port => {
            agent
              .use(traces => {
                const spans = sort(traces[0])

                expect(spans[0]).to.have.property('name', 'GET')
              })
              .then(done)
              .catch(done)

            appListener = app.listen(port, 'localhost', () => {
              axios
                .get(`http://localhost:${port}/app`)
                .catch(done)
            })
          })
        })

        it('should activate a scope per middleware', done => {
          if (process.env.SIGNALFX_CONTEXT_PROPAGATION === 'false') return done()

          const app = express()

          let span

          app.use((req, res, next) => {
            span = tracer.scope().active()

            tracer.scope().activate(null, () => next())
          })

          app.get('/user', (req, res) => {
            res.status(200).send()

            try {
              expect(tracer.scope().active()).to.not.be.null.and.not.equal(span)
              done()
            } catch (e) {
              done(e)
            }
          })

          getPort().then(port => {
            appListener = app.listen(port, 'localhost', () => {
              axios.get(`http://localhost:${port}/user`)
                .catch(done)
            })
          })
        })

        it('should activate a span for every middleware on a route', done => {
          if (process.env.SIGNALFX_CONTEXT_PROPAGATION === 'false') return done()

          const app = express()

          const span = {}

          app.get(
            '/user',
            (req, res, next) => {
              tracer.scope().activate(span, () => next())
            },
            (req, res, next) => {
              res.status(200).send()

              try {
                expect(tracer.scope().active()).to.not.be.null.and.not.equal(span)
                done()
              } catch (e) {
                done(e)
              }
            }
          )

          getPort().then(port => {
            appListener = app.listen(port, 'localhost', () => {
              axios.get(`http://localhost:${port}/user`)
                .catch(done)
            })
          })
        })

        it('should only include paths for routes that matched', done => {
          const app = express()
          const router = express.Router()

          router.use('/baz', (req, res, next) => next())
          router.get('/user/:id', (req, res) => {
            res.status(200).send()
          })
          router.use('/qux', (req, res, next) => next())

          app.use('/foo', (req, res, next) => next())
          app.use('/app', router)
          app.use('/bar', (req, res, next) => next())

          getPort().then(port => {
            agent
              .use(traces => {
                const spans = sort(traces[0])

                expect(spans[0]).to.have.property('name', 'GET /app/user/:id')
              })
              .then(done)
              .catch(done)

            appListener = app.listen(port, 'localhost', () => {
              axios.get(`http://localhost:${port}/app/user/123`)
                .catch(done)
            })
          })
        })

        it('should extract its parent span from the headers', done => {
          const app = express()

          app.get('/user', (req, res) => {
            res.status(200).send()
          })

          getPort().then(port => {
            agent.use(traces => {
              const spans = sort(traces[0])

              expect(spans[0].trace_id.toString()).to.equal('0000000000001234')
              expect(spans[0].parent_id.toString()).to.equal('0000000000005678')
            })
              .then(done)
              .catch(done)

            appListener = app.listen(port, 'localhost', () => {
              axios
                .get(`http://localhost:${port}/user`, {
                  headers: {
                    'x-b3-traceid': '1234',
                    'x-b3-spanid': '5678',
                    'ot-baggage-foo': 'bar'
                  }
                })
                .catch(done)
            })
          })
        })

        it('should handle error status codes', done => {
          const app = express()

          app.use((req, res, next) => {
            next()
          })

          app.get('/user', (req, res) => {
            res.status(500).send()
          })

          getPort().then(port => {
            agent.use(traces => {
              const spans = sort(traces[0])

              expect(spans[0].meta).to.have.property('error', 'true')
              expect(spans[0]).to.have.property('name', 'GET /user')
              expect(spans[0].meta).to.have.property('http.status_code', '500')

              done()
            })

            appListener = app.listen(port, 'localhost', () => {
              axios
                .get(`http://localhost:${port}/user`, {
                  validateStatus: status => status === 500
                })
                .catch(done)
            })
          })
        })

        it('should only handle errors for configured status codes', done => {
          const app = express()

          app.use((req, res, next) => {
            next()
          })

          app.get('/user', (req, res) => {
            res.statusCode = 400
            throw new Error('boom')
          })

          getPort().then(port => {
            agent.use(traces => {
              const spans = sort(traces[0])

              expect(spans[0].meta).to.not.have.property('error')
              expect(spans[0]).to.have.property('name', 'GET /user')
              expect(spans[0].meta).to.have.property('http.status_code', '400')

              done()
            })

            appListener = app.listen(port, 'localhost', () => {
              axios
                .get(`http://localhost:${port}/user`, {
                  validateStatus: status => status === 400
                })
                .catch(done)
            })
          })
        })

        it('should handle request errors', done => {
          const app = express()
          const error = new Error('boom')

          app.use(() => { throw error })

          getPort().then(port => {
            agent
              .use(traces => {
                const spans = sort(traces[0])

                expect(spans[0].meta).to.have.property('error', 'true')
                expect(spans[0].meta).to.have.property('http.status_code', '500')
              })
              .then(done)
              .catch(done)

            appListener = app.listen(port, 'localhost', () => {
              axios
                .get(`http://localhost:${port}/user`, {
                  validateStatus: status => status === 500
                })
                .catch(done)
            })
          })
        })

        it('should handle middleware errors', done => {
          const app = express()
          const error = new Error('boom')

          app.use((req, res) => { throw error })
          app.use((error, req, res, next) => res.status(500).send())

          getPort().then(port => {
            agent
              .use(traces => {
                const spans = sort(traces[0])

                expect(spans[1].meta).to.have.property('error', 'true')
                expect(spans[1].meta).to.have.property('error.type', error.name)
                expect(spans[1].meta).to.have.property('error.msg', error.message)
                expect(spans[1].meta).to.have.property('error.stack', error.stack)
              })
              .then(done)
              .catch(done)

            appListener = app.listen(port, 'localhost', () => {
              axios
                .get(`http://localhost:${port}/user`, {
                  validateStatus: status => status === 500
                })
                .catch(done)
            })
          })
        })

        it('should support capturing groups in routes', done => {
          const app = express()

          app.get('/:path(*)', (req, res) => {
            res.status(200).send()
          })

          getPort().then(port => {
            agent
              .use(traces => {
                const spans = sort(traces[0])

                expect(spans[0]).to.have.property('name', 'GET /:path(*)')
                expect(spans[0].meta).to.have.property('http.url', `http://localhost:${port}/user`)
              })
              .then(done)
              .catch(done)

            appListener = app.listen(port, 'localhost', () => {
              axios
                .get(`http://localhost:${port}/user`)
                .catch(done)
            })
          })
        })
      })

      describe('with configuration', () => {
        const pathOne = '/a/:one/:two/:three'
        // for router registration at /some/prefix
        const pathTwo = '/some/prefix/b/:four/:five/:six/some'
        // no expandRouteParameters directive provided
        const pathThree = '/c/:seven/thing/:eight/:nine/something'
        const pathFour = '/:ten(\\d+)-:eleven(\\w+)/a/[a-z]{0,}/:twelve(\\d+)....:thirteen(\\d{2})/[a-z]+'
        const pathFive = ('/athing/:fourteen(\\D+|\\W)---:fifteen([0-4]+|[^9])/([^0]+)/[a-z]{0,}/' +
          ':sixteen(\\d\\d\\S\\S):seventeen(\\d{2})/([a-z]+)')
        const pathSix = ('/bthing/:eighteen(\\D+|\\W)---:nineteen([0-4]+|[^9])/([^0]+)/[a-z]{0,}/' +
          ':twenty(\\d\\d\\S\\S):twentyone(\\d{2})/([a-z]+)')
        const paths = [pathOne, pathThree, pathFour, pathFive, pathSix]

        const expandRouteParameters = {}
        expandRouteParameters[pathOne] = { 'two': true }
        expandRouteParameters[pathTwo] = { 'four': true, 'six': true }
        expandRouteParameters[pathFour] = { 'ten': true, 'thirteen': true }
        expandRouteParameters[pathFive] = { 'fourteen': true, 'fifteen': true, 'sixteen': true, 'seventeen': true }
        expandRouteParameters[pathSix] = { 'eighteen': true, 'twenty': true }

        before(() => {
          return agent.load(plugin, 'express', {
            validateStatus: code => code < 400,
            headers: ['User-Agent'],
            expandRouteParameters
          })
        })

        after(() => {
          return agent.close()
        })

        beforeEach(() => {
          express = require(`../../versions/express@${version}`).get()
        })

        it('should be configured with the correct service name', done => {
          const app = express()

          app.get('/user', (req, res) => {
            res.status(200).send()
          })

          getPort().then(port => {
            agent
              .use(traces => {
                const spans = sort(traces[0])

                expect(spans[0]).to.have.property('service', 'test')
              })
              .then(done)
              .catch(done)

            appListener = app.listen(port, 'localhost', () => {
              axios
                .get(`http://localhost:${port}/user`)
                .catch(done)
            })
          })
        })

        it('should be configured with the correct status code validator', done => {
          const app = express()

          app.get('/user', (req, res) => {
            res.status(400).send()
          })

          getPort().then(port => {
            agent
              .use(traces => {
                const spans = sort(traces[0])

                expect(spans[0].meta).to.have.property('error', 'true')
              })
              .then(done)
              .catch(done)

            appListener = app.listen(port, 'localhost', () => {
              axios
                .get(`http://localhost:${port}/user`, {
                  validateStatus: status => status === 400
                })
                .catch(done)
            })
          })
        })

        it('should include specified headers in metadata', done => {
          const app = express()

          app.get('/user', (req, res) => {
            res.status(200).send()
          })

          getPort().then(port => {
            agent
              .use(traces => {
                const spans = sort(traces[0])

                expect(spans[0].meta).to.have.property('http.request.headers.user-agent', 'test')
              })
              .then(done)
              .catch(done)

            appListener = app.listen(port, 'localhost', () => {
              axios
                .get(`http://localhost:${port}/user`, {
                  headers: { 'User-Agent': 'test' }
                })
                .catch(done)
            })
          })
        });

        [['base', '/a/myOne/myTwo/myThree', '/a/:one/myTwo/:three'],
          ['prefix', '/some/prefix/b/myFour/myFive/mySix/some?a=query&parameter=123',
            '/some/prefix/b/myFour/:five/mySix/some'],
          ['no rule', '/c/mySeven/thing/myEight/myNine/something', '/c/:seven/thing/:eight/:nine/something'],
          ['regex1', '/101010-eleven/a/thisisathing/12121212....13/thing?another=queryParemeter',
            '/101010-:eleven(\\w+)/a/[a-z]{0,}/:twelve(\\d+)....13/[a-z]+'],
          ['regex2', '/athing/myFourteen---123/notZero/abcdefg/22bb44/zz',
            '/athing/myFourteen---123/([^0]+)/[a-z]{0,}/22bb44/([a-z]+)'],
          ['regex3', '/bthing/myEighteen---123/notZero/abcdefg/22bb44/zz?someOther=queryParameter',
            '/bthing/myEighteen---:nineteen([0-4]+|[^9])/([^0]+)/[a-z]{0,}/22bb:twentyone(\\d{2})/([a-z]+)']
        ].forEach(function (params) {
          const name = params[0]
          const path = params[1]
          const expected = params[2]
          it(`should expand specified route parameters (${name})`, done => {
            const app = express()

            paths.forEach(path => {
              app.get(path, (req, res) => {
                res.status(200).send()
              })
            })

            const router = express.Router()
            router.get('/b/:four/:five/:six/some', (req, res) => {
              res.status(200).send()
            })
            app.use('/some/prefix', router)

            getPort().then(port => {
              agent
                .use(traces => {
                  const spans = sort(traces[0])
                  expect(spans[0]).to.have.property('name', `GET ${expected}`)
                })
                .then(done)
                .catch(done)

              appListener = app.listen(port, 'localhost', () => {
                axios
                  .get(`http://localhost:${port}${path}`, {})
                  .catch(done)
              })
            })
          })
        })
      })
    })
  })
})
