'use strict'

const agent = require('./agent')
const axios = require('axios')
const getPort = require('get-port')
const semver = require('semver')
const plugin = require('../../src/plugins/nest')
const spanUtils = require('./util/spans')

wrapIt()

const __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
  if (typeof Reflect === 'object' && typeof Reflect.decorate === 'function') {
    return Reflect.decorate(decorators, target, key, desc)
  }
  switch (arguments.length) {
    case 2: return decorators.reduceRight(function (o, d) { return (d && d(o)) || o }, target)
    case 3: return decorators.reduceRight(function (o, d) { return (d && d(target, key)) || o }, void 0)
    case 4: return decorators.reduceRight(function (o, d) { return (d && d(target, key, o)) || o }, desc)
  }
}

let UsersController = class UsersController {}
let UsersModule = class UsersModule {}
let ErrorController = class ErrorController {}
let ErrorModule = class ErrorModule {}
let AppModule = class AppModule {}

describe('Plugin', () => {
  let app
  let port
  let core

  describe('nest', () => {
    withVersions(plugin, '@nestjs/core', version => {
      beforeEach((done) => {
        core = require(`../../versions/@nestjs/core@${version}`).get()
        const common = require(`../../versions/@nestjs/core@${version}/node_modules/@nestjs/common`)

        UsersController = __decorate([common.Controller('users')], UsersController)
        UsersController.prototype.getUsers = function getUsers () {
          return '\nHello, world!\n\n'
        }
        Object.defineProperty(UsersController.prototype, 'getUsers',
          __decorate([common.Get()], UsersController.prototype, 'getUsers',
            Object.getOwnPropertyDescriptor(UsersController.prototype, 'getUsers')))

        UsersModule = __decorate([
          common.Module({
            controllers: [UsersController]
          })
        ], UsersModule)

        ErrorController = __decorate([common.Controller('errors')], ErrorController)
        ErrorController.prototype.getErrors = function getErrors () {
          throw new Error('custom error')
        }
        Object.defineProperty(ErrorController.prototype, 'getErrors',
          __decorate([common.Get()], ErrorController.prototype, 'getErrors',
            Object.getOwnPropertyDescriptor(ErrorController.prototype, 'getErrors')))

        ErrorModule = __decorate([
          common.Module({
            controllers: [ErrorController]
          })
        ], ErrorModule)

        if (semver.intersects(version, '>=4.6.3')) {
          AppModule = __decorate([
            common.Module({
              imports: [UsersModule, ErrorModule],
              controllers: [UsersController, ErrorController]
            })], AppModule)
        } else {
          AppModule = __decorate([
            common.Module({
              modules: [UsersModule, ErrorModule],
              controllers: [UsersController, ErrorController]
            })], AppModule)
        }

        core.NestFactory.create(AppModule)
          .then((application) => {
            app = application
            getPort().then(newPort => {
              port = newPort
              app.listen(port, 'localhost')
                .then(() => done())
                .catch(done)
            })
          })
      })

      describe('without configuration', () => {
        before(() => agent.load(plugin, 'nest'))
        after(() => agent.close())

        afterEach(() => {})

        it('should instrument automatically', done => {
          agent.watch(spans => {
            spans = spanUtils.sortByStartTime(spans)
            let routePath = '/users'
            if (semver.intersects(version, '<5.0.0')) {
              routePath = '/'
            }

            expect(spans[0]).to.have.property('service', 'test')
            expect(spans[0]).to.have.property('name', 'nest.factory.create')
            expect(spans[0].meta).to.have.property('component', 'nest')
            expect(spans[0].meta).to.have.property('nest.module', 'AppModule')

            expect(spans[1]).to.have.property('service', 'test')
            expect(spans[1]).to.have.property('name', 'UsersController(getUsers)')
            expect(spans[1].meta).to.have.property('component', 'nest')
            expect(spans[1].meta).to.have.property('http.method', 'GET')
            expect(spans[1].meta).to.have.property('http.url', '/users')
            expect(spans[1].meta).to.have.property('nest.route.path', routePath)
            expect(spans[1].meta).to.have.property('nest.callback', 'getUsers')

            expect(spans[2]).to.have.property('service', 'test')
            expect(spans[2]).to.have.property('name', 'nest.guard.canActivate.UsersController(getUsers)')
            expect(spans[2].meta).to.have.property('component', 'nest')
            expect(spans[2].meta).to.have.property('http.url', '/users')
            expect(spans[2].meta).to.have.property('nest.controller.instance', 'UsersController')
            expect(spans[2].meta).to.have.property('nest.route.path', routePath)
            expect(spans[2].meta).to.have.property('nest.callback', 'getUsers')
            expect(spans[2].parent_id.toString()).to.equal(spans[1].span_id.toString())

            expect(spans[3]).to.have.property('service', 'test')
            expect(spans[3]).to.have.property('name', 'nest.interceptor.intercept')
            expect(spans[3].meta).to.have.property('component', 'nest')
            expect(spans[3].meta).to.have.property('http.method', 'GET')
            expect(spans[3].meta).to.have.property('http.url', '/users')
            expect(spans[3].meta).to.have.property('nest.callback', 'getUsers')
            expect(spans[3].meta).to.have.property('nest.route.path', routePath)
            expect(spans[3].meta).to.have.property('nest.controller.instance', 'UsersController')
            expect(spans[3].parent_id.toString()).to.equal(spans[1].span_id.toString())

            expect(spans[4]).to.have.property('service', 'test')
            expect(spans[4]).to.have.property('name', 'getUsers')
            expect(spans[4].meta).to.not.have.property('error')
            expect(spans[4].meta).to.have.property('component', 'nest')
            expect(spans[4].meta).to.have.property('nest.callback', 'getUsers')
            expect(spans[4].parent_id.toString()).to.equal(spans[3].span_id.toString())
            done()
          }, 5) // run when 4 spans are received by the agent

          axios
            .get(`http://localhost:${port}/users`)
            .catch(done)
        }).timeout(5000)

        it('should properly record errors', done => {
          agent.watch(spans => {
            spans = spanUtils.sortByStartTime(spans)
            let routePath = '/errors'
            if (semver.intersects(version, '<5.0.0')) {
              routePath = '/'
            }

            expect(spans[0]).to.have.property('service', 'test')
            expect(spans[0]).to.have.property('name', 'nest.factory.create')
            expect(spans[0].meta).to.have.property('component', 'nest')
            expect(spans[0].meta).to.have.property('nest.module', 'AppModule')

            expect(spans[1]).to.have.property('service', 'test')
            expect(spans[1]).to.have.property('name', 'ErrorController(getErrors)')
            expect(spans[1].meta).to.have.property('component', 'nest')
            expect(spans[1].meta).to.have.property('http.method', 'GET')
            expect(spans[1].meta).to.have.property('http.url', '/errors')
            expect(spans[1].meta).to.have.property('nest.route.path', routePath)
            expect(spans[1].meta).to.have.property('nest.callback', 'getErrors')

            expect(spans[2]).to.have.property('service', 'test')
            expect(spans[2]).to.have.property('name', 'nest.guard.canActivate.ErrorController(getErrors)')
            expect(spans[2].meta).to.have.property('component', 'nest')
            expect(spans[2].meta).to.have.property('http.url', '/errors')
            expect(spans[2].meta).to.have.property('nest.controller.instance', 'ErrorController')
            expect(spans[2].meta).to.have.property('nest.route.path', routePath)
            expect(spans[2].meta).to.have.property('nest.callback', 'getErrors')
            expect(spans[2].parent_id.toString()).to.equal(spans[1].span_id.toString())

            expect(spans[3]).to.have.property('service', 'test')
            expect(spans[3]).to.have.property('name', 'nest.interceptor.intercept')
            expect(spans[3].meta).to.have.property('component', 'nest')
            expect(spans[3].meta).to.have.property('http.method', 'GET')
            expect(spans[3].meta).to.have.property('http.url', '/errors')
            expect(spans[3].meta).to.have.property('nest.callback', 'getErrors')
            expect(spans[3].meta).to.have.property('nest.route.path', routePath)
            expect(spans[3].meta).to.have.property('nest.controller.instance', 'ErrorController')
            expect(spans[3].parent_id.toString()).to.equal(spans[1].span_id.toString())

            expect(spans[4]).to.have.property('service', 'test')
            expect(spans[4]).to.have.property('name', 'getErrors')
            expect(spans[4].meta).to.have.property('component', 'nest')
            expect(spans[4].meta).to.have.property('nest.callback', 'getErrors')
            expect(spans[4].meta).to.have.property('error', 'true')
            expect(spans[4].meta).to.have.property('sfx.error.kind', 'Error')
            expect(spans[4].meta).to.have.property('sfx.error.message', 'custom error')
            expect(spans[4].meta).to.have.property('sfx.error.stack')
            expect(spans[4].parent_id.toString()).to.equal(spans[3].span_id.toString())
            done()
          }, 5) // run when 4 spans are received by the agent

          axios
            .get(`http://localhost:${port}/errors`)
            .catch(() => {})
        }).timeout(5000)
      })
    })
  })
})
