'use strict'

// TODO: fix tests failing when re-running in watch mode

const agent = require('./agent')
const plugin = require('../../src/plugins/knex')

wrapIt()

describe('Plugin', () => {
  let knex
  let client
  let tracer

  describe('knex', () => {
    withVersions(plugin, 'knex', version => {
      beforeEach(() => {
        tracer = require('../..')
      })

      after(() => {
        return agent.close()
      })

      describe('without configuration', () => {
        beforeEach(() => {
          return agent.load(plugin, ['knex'])
            .then(() => {
              knex = require(`../../versions/knex@${version}`).get()
              client = knex({
                client: 'sqlite3',
                connection: {
                  filename: ':memory:'
                },
                useNullAsDefault: true
              })
            })
      })

        afterEach(() => {
          client.schema.dropTableIfExists('testTable')
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

        it('should automatically instrument schema builds', done => {
          agent.use(traces => {
            expect(traces[0][0]).to.have.property('service', 'test')
            expect(traces[0][0]).to.have.property('name', 'knex.SchemaBuilder.toSQL')
            expect(traces[0][0].meta).to.have.property('component', 'knex')
            expect(traces[0][0].meta).to.have.property('schema.methods', 'createTable')
            expect(traces[0][0].meta).to.have.property('db.type', 'sqlite3')

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

            const spans = traces[0]

            expect(spans).to.have.length(4)

            expect(spans[0]).to.have.property('service', 'test')
            expect(spans[0]).to.have.property('name', 'knex.SchemaBuilder.toSQL')
            expect(spans[0].meta).to.have.property('component', 'knex')
            expect(spans[0].meta).to.have.property('db.type', 'sqlite3')
            expect(spans[0].meta).to.have.property('schema.methods', 'createTable')
            expect(spans[0].parent_id.toString()).to.equal(spans[3].span_id.toString())

            expect(spans[1]).to.have.property('service', 'test')
            expect(spans[1]).to.have.property('name', 'knex.QueryBuilder.toSQL(insert)')
            expect(spans[1].meta).to.have.property('component', 'knex')
            expect(spans[1].meta).to.have.property('db.type', 'sqlite3')
            expect(spans[1].parent_id.toString()).to.equal(spans[3].span_id.toString())

            expect(spans[2]).to.have.property('service', 'test')
            expect(spans[2]).to.have.property('name', 'knex.QueryBuilder.toSQL(select)')
            expect(spans[2].meta).to.have.property('component', 'knex')
            expect(spans[2].meta).to.have.property('db.type', 'sqlite3')
            expect(spans[2].parent_id.toString()).to.equal(spans[3].span_id.toString())

            expect(spans[3]).to.have.property('service', 'test')
            expect(spans[3]).to.have.property('name', 'testSpan')
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
              return client.insert({id: 1, title: 'knex test'}).into('testTable');
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
          agent.use(traces => {
            const spans = traces[0]

            expect(spans).to.have.length(5)

            expect(spans[0]).to.have.property('service', 'test')
            expect(spans[0]).to.have.property('name', 'knex.SchemaBuilder.toSQL')
            expect(spans[0].meta).to.have.property('component', 'knex')
            expect(spans[0].meta).to.have.property('db.type', 'sqlite3')
            expect(spans[0].meta).to.have.property('schema.methods', 'createTable,createTable')
            expect(spans[0].parent_id.toString()).to.equal(spans[4].span_id.toString())

            expect(spans[1]).to.have.property('service', 'test')
            expect(spans[1]).to.have.property('name', 'knex.QueryBuilder.toSQL(insert)')
            expect(spans[1].meta).to.have.property('component', 'knex')
            expect(spans[1].meta).to.have.property('db.type', 'sqlite3')
            expect(spans[1].parent_id.toString()).to.equal(spans[4].span_id.toString())

            expect(spans[2]).to.have.property('service', 'test')
            expect(spans[2]).to.have.property('name', 'knex.QueryBuilder.toSQL(insert)')
            expect(spans[2].meta).to.have.property('component', 'knex')
            expect(spans[2].meta).to.have.property('db.type', 'sqlite3')
            expect(spans[2].parent_id.toString()).to.equal(spans[4].span_id.toString())

            expect(spans[3]).to.have.property('service', 'test')
            expect(spans[3]).to.have.property('name', 'knex.QueryBuilder.toSQL(select)')
            expect(spans[3].meta).to.have.property('component', 'knex')
            expect(spans[3].meta).to.have.property('db.type', 'sqlite3')
            expect(spans[3].parent_id.toString()).to.equal(spans[4].span_id.toString())

            expect(spans[4]).to.have.property('service', 'test')
            expect(spans[4]).to.have.property('name', 'testSpan')

            done()
          })
        .catch(done)

          const span = tracer.startSpan('testSpan')
          tracer.scope().activate(span, () => {
            client.schema
              .createTable('users', function(table) {
                table.increments('id');
                table.string('user_name');
              })
              .createTable('accounts', function(table) {
                table.increments('id');
                table.string('account_name');
                table.integer('user_id').unsigned().references('users.id');
              })
              .then(function() {
                return client.insert({user_name: 'Tim'}).into('users');
              })
              .then(function(rows) {
                return client.table('accounts').insert({account_name: 'knex', user_id: rows[0]});
              })
              .then(function() {
                return client('users')
                  .join('accounts', 'users.id', 'accounts.user_id')
                  .select('users.user_name as user', 'accounts.account_name as account')
                  .then (() => {
                    span.finish()
                  })
               })
            })
        })

        it('should propagate context to callbacks', done => {
          if (process.env.SIGNALFX_CONTEXT_PROPAGATION === 'false') return done()

          const span = tracer.startSpan('test')

          tracer.scope().activate(span, () => {
            const span = tracer.scope().active()
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
