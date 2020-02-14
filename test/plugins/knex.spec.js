'use strict'

// TODO: fix tests failing when re-running in watch mode

const agent = require('./agent')
const plugin = require('../../src/plugins/knex')
const spanUtils = require('./util/spans')

function normalizeDBStatement (statement) {
  return statement.replace(/"/g, '`')
}

wrapIt()

describe('Plugin', () => {
  let knex
  let client
  let tracer

  describe('knex', () => {
    beforeEach(() => {
      // older versions of knex depend on bluebird
      return agent.load(plugin, ['knex', 'bluebird'])
    })
    afterEach(() => {
      return agent.reset()
    })
    withVersions(plugin, 'knex', version => {
      describe('without configuration', () => {
        beforeEach(() => {
          tracer = require('../..')
          knex = require(`../../versions/knex@${version}`).get()
          client = knex({
            client: 'sqlite3',
            connection: {
              filename: ':memory:'
            },
            useNullAsDefault: true
          })
        })

        afterEach(() => {
          client.schema.dropTableIfExists('testTable')
          client.schema.dropTableIfExists('testTable1')
          client.schema.dropTableIfExists('testTable2')
          client.destroy()
        })

        it('should propagate context in the parent context', (done) => {
          if (process.env.SIGNALFX_CONTEXT_PROPAGATION === 'false') return
          const span = {}
          tracer.scope().activate(span, () => {
            client.raw('PRAGMA user_version')
              .then(() => {
                expect(tracer.scope().active()).to.equal(span)
                done()
              })
          })
        })

        it('should propagate separate context to concurrent queries', (done) => {
          setTimeout(() => {
            done(new Error('timed out while waiting for concurrent traces to arrive'))
          }, 3000)

          function testTraces (traces, test) {
            expect(traces).to.have.length(1)

            const trace = traces[0]
            expect(trace).to.have.length(4)
            const spans = spanUtils.sortByStartTime(trace)

            expect(spans[0]).to.have.property('service', 'test')
            expect(spans[0]).to.have.property('name', test.name)
            expect(spans[0]).to.not.have.property('parent_id')

            expect(spans[1]).to.have.property('name', 'knex.client.runner')
            expect(normalizeDBStatement(spans[1].meta['db.statement'])).to.be.equal(test.createQuery)
            expect(spans[1].parent_id.toString()).to.equal(spans[0].span_id.toString())

            expect(spans[2]).to.have.property('name', 'knex.client.runner.insert')
            expect(normalizeDBStatement(spans[2].meta['db.statement'])).to.be.equal(test.insertQuery)
            expect(spans[2].parent_id.toString()).to.equal(spans[0].span_id.toString())

            expect(spans[3]).to.have.property('name', 'knex.client.runner.select')
            expect(normalizeDBStatement(spans[3].meta['db.statement'])).to.be.equal(test.selectQuery)
            expect(spans[3].parent_id.toString()).to.equal(spans[0].span_id.toString())
          }

          function testRequests () {
            const receivedRequests = agent.receivedRequests()
            testTraces(receivedRequests[0], {
              name: 'testOpA',
              title: 'test1',
              createQuery: 'create table `testTable1` (`title` varchar(255))',
              insertQuery: 'insert into `testTable1` (`title`) values (?)',
              selectQuery: 'select * from `testTable1`'
            })

            testTraces(receivedRequests[1], {
              name: 'testOpB',
              title: 'test2',
              createQuery: 'create table `testTable2` (`title` varchar(255))',
              insertQuery: 'insert into `testTable2` (`title`) values (?)',
              selectQuery: 'select * from `testTable2`'
            })
            done()
          }

          // insert timeouts to increase chances of the two ops running concurrently
          const spanA = tracer.startSpan('testOpA')
          tracer.scope().activate(spanA, () => {
            client.schema
              .createTable('testTable1', (table) => {
                table.string('title')
              })
              .then(setTimeout(() => {
                client.insert({ title: 'test1' }).into('testTable1')
                  .then(setTimeout(() => {
                    client('testTable1').select('*')
                      .then(() => {
                        spanA.finish()
                        setTimeout(testRequests, 30)
                      })
                  }), 50)
              }), 50)
          })

          const spanB = tracer.startSpan('testOpB')
          tracer.scope().activate(spanB, () => {
            client.schema
              .createTable('testTable2', (table) => {
                table.string('title')
              })
              .then(() => {
                client.insert({ title: 'test2' }).into('testTable2')
                  .then(() => {
                    return client('testTable2').select('*')
                      .then(() => {
                        spanB.finish()
                      })
                  })
              })
          })
        })

        it('should automatically instrument schema builds', done => {
          agent.use(traces => {
            const spans = spanUtils.sortByStartTime(traces[0])
            expect(spans[0]).to.have.property('service', 'test')
            expect(spans[0]).to.have.property('name', 'knex.client.runner')
            expect(spans[0].meta).to.have.property('component', 'knex')
            expect(spans[0].meta).to.have.property('db.type', 'sqlite3')
            expect(spans[0].meta).to.have.property('db.statement')
            expect(spans[0].meta).to.have.property('db.instance', ':memory:')
            expect(normalizeDBStatement(spans[0].meta['db.statement'])).to.be.equal(
              'create table `testTable` (`id` integer, `title` varchar(255))'
            )
            done()
          })
            .catch(done)

          client.schema.createTable('testTable', (table) => {
            table.integer('id')
            table.string('title')
          }).then(() => {})
        })

        it('should automatically instrument simple queries', done => {
          agent.use(traces => {
            const spans = spanUtils.sortByStartTime(traces[0])
            expect(spans).to.have.length(4)
            const rootSpan = spans[0]

            expect(spans[0]).to.have.property('service', 'test')
            expect(spans[0]).to.have.property('name', 'testSpan')

            expect(spans[1]).to.have.property('service', 'test')
            expect(spans[1]).to.have.property('name', 'knex.client.runner')
            expect(spans[1].meta).to.have.property('component', 'knex')
            expect(spans[1].meta).to.have.property('db.type', 'sqlite3')
            expect(spans[1].meta).to.have.property('db.instance', ':memory:')
            expect(spans[1].meta).to.have.property('db.statement')
            expect(normalizeDBStatement(spans[1].meta['db.statement'])).to.be.equal(
              'create table `testTable` (`id` integer, `title` varchar(255))'
            )
            expect(spans[1].parent_id.toString()).to.equal(rootSpan.span_id.toString())

            expect(spans[2]).to.have.property('service', 'test')
            expect(spans[2]).to.have.property('name', 'knex.client.runner.insert')
            expect(spans[2].meta).to.have.property('component', 'knex')
            expect(spans[2].meta).to.have.property('db.type', 'sqlite3')
            expect(spans[2].meta).to.have.property('db.instance', ':memory:')
            expect(spans[2].meta).to.have.property('db.statement')
            expect(normalizeDBStatement(spans[2].meta['db.statement'])).to.be.equal(
              'insert into `testTable` (`id`, `title`) values (?, ?)'
            )
            expect(spans[2].parent_id.toString()).to.equal(rootSpan.span_id.toString())

            expect(spans[3]).to.have.property('service', 'test')
            expect(spans[3]).to.have.property('name', 'knex.client.runner.select')
            expect(spans[3].meta).to.have.property('component', 'knex')
            expect(spans[3].meta).to.have.property('db.type', 'sqlite3')
            expect(spans[3].meta).to.have.property('db.instance', ':memory:')
            expect(spans[3].meta).to.have.property('db.statement')
            expect(normalizeDBStatement(spans[3].meta['db.statement'])).to.be.equal('select * from `testTable`')
            expect(spans[3].parent_id.toString()).to.equal(rootSpan.span_id.toString())

            done()
          })
            .catch(done)

          const span = tracer.startSpan('testSpan')

          tracer.scope().activate(span, () => {
            client.schema
              .createTable('testTable', (table) => {
                table.integer('id')
                table.string('title')
              })
              .then(() => {
                return client.insert({ id: 1, title: 'knex test' }).into('testTable')
              })
              .then(() => {
                return client('testTable').select('*')
                  .then(() => {
                    span.finish()
                  })
              })
          })
        })

        it('should automatically instrument complex queries', done => {
          const span = tracer.startSpan('testSpan')

          agent.use(traces => {
            const spans = spanUtils.sortByStartTime(traces[0])
            expect(spans).to.have.length(6)
            const rootSpan = spans[0]

            expect(spans[0]).to.have.property('service', 'test')
            expect(spans[0]).to.have.property('name', 'testSpan')

            expect(spans[1]).to.have.property('service', 'test')
            expect(spans[1]).to.have.property('name', 'knex.client.runner')
            expect(spans[1].meta).to.have.property('component', 'knex')
            expect(spans[1].meta).to.have.property('db.type', 'sqlite3')
            expect(spans[1].meta).to.have.property('db.instance', ':memory:')
            expect(spans[1].meta).to.have.property('db.statement')
            expect(normalizeDBStatement(spans[1].meta['db.statement'])).to.be.equal(
              'create table `users` (`id` integer not null primary key autoincrement, `user_name` varchar(255))'
            )
            expect(spans[1].trace_id.toString()).to.equal((rootSpan.span_id.toString()))

            expect(spans[2]).to.have.property('service', 'test')
            expect(spans[2]).to.have.property('name', 'knex.client.runner')
            expect(spans[2].meta).to.have.property('component', 'knex')
            expect(spans[2].meta).to.have.property('db.type', 'sqlite3')
            expect(spans[2].meta).to.have.property('db.instance', ':memory:')
            expect(spans[2].meta).to.have.property('db.statement')
            expect(normalizeDBStatement(spans[2].meta['db.statement'])).to.be.equal(
              'create table `accounts` (`id` integer not null primary key autoincrement,' +
              ' `account_name` varchar(255), `user_id` integer, foreign key(`user_id`) ' +
              'references `users`(`id`))')
            expect(spans[2].trace_id.toString()).to.equal((rootSpan.span_id.toString()))

            expect(spans[3]).to.have.property('service', 'test')
            expect(spans[3]).to.have.property('name', 'knex.client.runner.insert')
            expect(spans[3].meta).to.have.property('component', 'knex')
            expect(spans[3].meta).to.have.property('db.type', 'sqlite3')
            expect(spans[3].meta).to.have.property('db.instance', ':memory:')
            expect(spans[3].meta).to.have.property('db.statement')
            expect(normalizeDBStatement(spans[3].meta['db.statement'])).to.be.equal(
              'insert into `users` (`user_name`) values (?)'
            )
            expect(spans[3].trace_id.toString()).to.equal((rootSpan.span_id.toString()))

            expect(spans[4]).to.have.property('service', 'test')
            expect(spans[4]).to.have.property('name', 'knex.client.runner.insert')
            expect(spans[4].meta).to.have.property('component', 'knex')
            expect(spans[4].meta).to.have.property('db.type', 'sqlite3')
            expect(spans[4].meta).to.have.property('db.instance', ':memory:')
            expect(spans[4].meta).to.have.property('db.statement')
            expect(normalizeDBStatement(spans[4].meta['db.statement'])).to.be.equal(
              'insert into `accounts` (`account_name`, `user_id`) values (?, ?)'
            )
            expect(spans[4].trace_id.toString()).to.equal((rootSpan.span_id.toString()))

            expect(spans[5]).to.have.property('service', 'test')
            expect(spans[5]).to.have.property('name', 'knex.client.runner.select')
            expect(spans[5].meta).to.have.property('component', 'knex')
            expect(spans[5].meta).to.have.property('db.type', 'sqlite3')
            expect(spans[5].meta).to.have.property('db.instance', ':memory:')
            expect(spans[5].meta).to.have.property('db.statement')
            expect(normalizeDBStatement(spans[5].meta['db.statement'])).to.be.equal(
              'select `users`.`user_name` as `user`, `accounts`.`account_name` as `account`' +
              ' from `users` inner join `accounts` on `users`.`id` = `accounts`.`user_id`'
            )
            expect(spans[5].trace_id.toString()).to.equal((rootSpan.span_id.toString()))

            done()
          })
            .catch(done)

          tracer.scope().activate(span, () => {
            client.schema
              .createTable('users', function (table) {
                table.increments('id')
                table.string('user_name')
              })
              .createTable('accounts', function (table) {
                table.increments('id')
                table.string('account_name')
                table.integer('user_id').unsigned().references('users.id')
              })
              .then(function () {
                return client.insert({ user_name: 'Tim' }).into('users')
              })
              .then(function (rows) {
                return client.table('accounts').insert({ account_name: 'knex', user_id: rows[0] })
              })
              .then(function () {
                return client('users')
                  .join('accounts', 'users.id', 'accounts.user_id')
                  .select('users.user_name as user', 'accounts.account_name as account')
                  .then(() => {
                    span.finish()
                  })
              })
          })
        })
        it('should work with nested custom spans', done => {
          agent.use(traces => {
            const spans = spanUtils.sortByStartTime(traces[0])
            expect(spans).to.have.length(5)
            const rootSpan = spans[0]

            expect(spans[0]).to.have.property('service', 'test')
            expect(spans[0]).to.have.property('name', 'outerSpan')

            expect(spans[1]).to.have.property('service', 'test')
            expect(spans[1]).to.have.property('name', 'knex.client.runner')
            expect(spans[1].meta).to.have.property('component', 'knex')
            expect(spans[1].meta).to.have.property('db.type', 'sqlite3')
            expect(spans[1].meta).to.have.property('db.instance', ':memory:')
            expect(spans[1].meta).to.have.property('db.statement')
            expect(normalizeDBStatement(spans[1].meta['db.statement'])).to.be.equal(
              'create table `testTable` (`id` integer, `title` varchar(255))'
            )
            expect(spans[1].parent_id.toString()).to.equal(rootSpan.span_id.toString())

            expect(spans[2]).to.have.property('service', 'test')
            expect(spans[2]).to.have.property('name', 'innerSpan')
            const innerSpan = spans[2]

            expect(spans[3]).to.have.property('service', 'test')
            expect(spans[3]).to.have.property('name', 'knex.client.runner.insert')
            expect(spans[3].meta).to.have.property('component', 'knex')
            expect(spans[3].meta).to.have.property('db.type', 'sqlite3')
            expect(spans[3].meta).to.have.property('db.instance', ':memory:')
            expect(spans[3].meta).to.have.property('db.statement')
            expect(normalizeDBStatement(spans[3].meta['db.statement'])).to.be.equal(
              'insert into `testTable` (`id`, `title`) values (?, ?)'
            )
            expect(spans[3].parent_id.toString()).to.equal(innerSpan.span_id.toString())

            expect(spans[4]).to.have.property('service', 'test')
            expect(spans[4]).to.have.property('name', 'knex.client.runner.select')
            expect(spans[4].meta).to.have.property('component', 'knex')
            expect(spans[4].meta).to.have.property('db.type', 'sqlite3')
            expect(spans[4].meta).to.have.property('db.instance', ':memory:')
            expect(spans[4].meta).to.have.property('db.statement')
            expect(normalizeDBStatement(spans[4].meta['db.statement'])).to.be.equal('select * from `testTable`')
            expect(spans[4].parent_id.toString()).to.equal(innerSpan.span_id.toString())

            done()
          })
            .catch(done)

          const outerSpan = tracer.startSpan('outerSpan')

          tracer.scope().activate(outerSpan, () => {
            client.schema
              .createTable('testTable', (table) => {
                table.integer('id')
                table.string('title')
              })
              .then(() => {
                const innerSpan = tracer.startSpan('innerSpan', { childOf: outerSpan })
                tracer.scope().activate(innerSpan, () => {
                  return client.insert({ id: 1, title: 'knex test' }).into('testTable')
                    .then(() => {
                      return client('testTable').select('*')
                        .then(() => {
                          innerSpan.finish()
                          outerSpan.finish()
                        })
                    })
                })
              })
          })
        })

        it('should propagate context to callbacks', done => {
          if (process.env.SIGNALFX_CONTEXT_PROPAGATION === 'false') return done()

          const span = tracer.startSpan('test')

          tracer.scope().activate(span, () => {
            client.schema.createTable('testTable', (table) => {
              table.integer('id')
              table.string('title')
            })
              .asCallback((err) => {
                if (err) throw err
                expect(tracer.scope().active()).to.equal(span)
                span.finish()
                done()
              })
          })
        })
      })
    })
  })
})
