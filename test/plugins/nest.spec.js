'use strict'

const agent = require('./agent')
const axios = require('axios')
const getPort = require('get-port')
const plugin = require('../../src/plugins/nest')
const semver = require('semver')

const __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
  if (typeof Reflect === 'object' && typeof Reflect.decorate === 'function') {
    return Reflect.decorate(decorators, target, key, desc)
  }
  switch (arguments.length) {
    case 2: return decorators.reduceRight(function (o, d) { return (d && d(o)) || o }, target)
    case 3: return decorators.reduceRight(function (o, d) { return (d && d(target, key)), void 0 }, void 0)
    case 4: return decorators.reduceRight(function (o, d) { return (d && d(target, key, o)) || o }, desc)
  }
}

// interface User {
//     readonly name: string;
//     readonly age: number;
//     readonly title: string;
//   }

// const UserDto = class UserDto {
//   constructor (name, id) {
//     this.name = name
//     this.id = id
//   }
// }

let UsersService = class UsersService {
  constructor (User) { this.users = new Map() }
  create (user, id) { this.users.set(id, user) }
  getUser (id) { return this.users.get(id) }
  getUsers () { return this.users }
}

let UsersController = class UsersController {}
let UsersModule = class UsersModule {}
let AppModule = class AppModule {}

describe('Plugin', () => {
  let tracer
  let app
  let port
  let core = require ('@nestjs/core')
  let common = require('@nestjs/common')
  let commonVersion

  describe('nest', () => {
    withVersions(plugin, '@nestjs/core', version => {
      beforeEach((done) => {
        tracer = require('../..')
        core = require(`../../versions/@nestjs/core@${version}`).get()

        if (`${semver.coerce(version).major}` === `4`) {
          commonVersion = `${semver.coerce('^4.*').version}`
        } else if (`${semver.coerce(version).major}` === `3`) {
          commonVersion = `${semver.coerce('~3.*').version}`
        } else if (`${semver.coerce(version).major}` === `1`) {
          commonVersion = `${semver.coerce('~2.*').version}`
        }

        // TODO: Fix to use the most major version released
        // else if (`${semver.coerce(version).major}` === `6`)  {
        //   commonVersion = `${semver.coerce('^6.*').version}`
        // }
        // else {
        //   console.log("GETTiNG ThE 6th VERSION")
        //   commonVersion = `${semver.coerce('^6.*').version}`
        // }

        common = require(`../../versions/@nestjs/common@${commonVersion}`).get()

        // UsersService = __decorate([common.Injectable()], UsersService)

        UsersController.prototype.getUsers = function getUsers () {
          return '\nHello, world!\n\n'
        }
        UsersController = __decorate([common.Controller('users')], UsersController)
        Object.defineProperty(UsersController.prototype, 'getUsers',
          __decorate([common.Get()], UsersController.prototype, 'getUsers',
            Object.getOwnPropertyDescriptor(UsersController.prototype, 'getUsers')))

        UsersModule = __decorate([
          common.Module({
            controllers: [UsersController],
            // providers: [UsersService]
          })
        ], UsersModule)


        if (semver.intersects(version, '>=4.6.3')) {
          AppModule = __decorate([
            common.Module({ 
              imports: [UsersModule],
              controllers: [UsersController]
            })], AppModule)
        } else {
            AppModule = __decorate([
              common.Module({
                modules: [UsersModule],
                controllers: [UsersController]
              })], AppModule)
        }

        if (semver.intersects(version, '>=3.0.2')) {
          core.NestFactory.create(AppModule)
            .then((application) => { 
                app = application 
            })
        } else {
          app = core.NestFactory.create(AppModule)
        }

        getPort()
          .then(newPort => { port = newPort })
          .then(() => { done() })
        })

      describe('without configuration', () => {
        before(() => agent.load(plugin, 'nest'))
        after(() => agent.close())

        afterEach(() => {})

        it('should instrument automatically', done => {
          let spans = []
          agent
            .use(traces => {
              traces[0].forEach(span => {   
                spans.push(span)
              })

              expect(spans[0]).to.have.property('service', 'test')
              expect(spans[0]).to.have.property('name', 'nest.factory.create')
              expect(spans[0].meta).to.have.property('component', 'nest')
              expect(spans[0].meta).to.have.property('nest.module', 'AppModule')
              if (semver.intersects(version, '>=3.0.2')) {
                expect(spans[1]).to.have.property('service', 'test')
                expect(spans[1]).to.have.property('name', 'nest.guard.canActivate.UsersController(getUsers)')
                expect(spans[1].meta).to.have.property('component', 'nest')
                expect(spans[1].meta).to.have.property('nest.controller.instance', 'UsersController')
                expect(spans[1].meta).to.have.property('request.url', '/users')
                // expect(spans[1].meta).to.have.property('request.route.path', '/users')
                expect(spans[1].meta).to.have.property('nest.callback', 'getUsers')
                expect(spans[1].parent_id.toString()).to.equal(spans[2].span_id.toString())

                expect(spans[2]).to.have.property('service', 'test')
                expect(spans[2]).to.have.property('name', 'UsersController(getUsers)')
                expect(spans[2].meta).to.have.property('component', 'nest')
                expect(spans[2].meta).to.have.property('request.method', 'GET')
                expect(spans[2].meta).to.have.property('request.url', '/users')
                // expect(spans[2].meta).to.have.property('request.route.path', '/users')
                expect(spans[2].meta).to.have.property('nest.callback', 'getUsers')

                // if (semver.intersects(version, '>=3.0.5')) {
                //   expect(spans[3]).to.have.property('service', 'test')
                //   expect(spans[3]).to.have.property('name', 'nest.interceptor.intercept')
                //   expect(spans[3].meta).to.have.property('component', 'nest')
                //   expect(spans[3].meta).to.have.property('request.method', 'GET')
                //   expect(spans[3].meta).to.have.property('nest.callback', 'getUsers')
                //   expect(spans[3].meta).to.have.property('request.url', '/users')
                //   // expect(spans[3].meta).to.have.property('request.route.path', '/users')
                //   expect(spans[3].meta).to.have.property('nest.controller.instance', 'UsersController')
                //   expect(spans[3].parent_id.toString()).to.equal(spans[2].span_id.toString())
                // }
            } else {
                expect(spans[1]).to.have.property('service', 'test')
                expect(spans[1]).to.have.property('name', 'UsersController(getUsers)')
                expect(spans[1].meta).to.have.property('component', 'nest')
                expect(spans[1].meta).to.have.property('request.method', 'GET')
                expect(spans[1].meta).to.have.property('request.url', '/users')
                // expect(spans[1].meta).to.have.property('request.route.path', '/users')
                expect(spans[1].meta).to.have.property('nest.callback', 'getUsers')
              }
            })
            .then(done)
            .catch(done)

        app.listen(port, 'localhost')
          .then((done) => {
            axios
              .get(`http://localhost:${port}/users`)
              .catch((error) => {})
          })
        }).timeout(5000)
      })
    })
  })
})
