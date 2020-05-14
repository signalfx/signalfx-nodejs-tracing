# Configuration options for supported libraries

The SignalFx Tracing Library for JavaScript provides automatically instrumentation many popular frameworks and libraries by using a plugin system. By default all built-in plugins are enabled. This behavior can be changed by setting the `plugins` option to `false` in the [tracer settings](#tracer-settings).

```javascript
const tracer = require('signalfx-tracing').init({ plugins: false })

// enable postgresql
tracer.use('pg')
// enable and configure express instrumentations
tracer.use('express', { headers: ['x-my-tagged-header'] })
```
* [adonis 4+](#adonisjs) - `use('adonis')`
* [amqp10 3+](#amqp10) - `use('amqp10')`
* [amqplib 0.5+](#amqplib) - `use('amqplib')`
* [Bluebird 2+](#Bluebird) - `use('bluebird')`
* [Bunyan 1+](#Bunyan) - `use('bunyan')`
* [cassandra-driver](#cassandra-driver) - `use('cassandra-driver')`
* [DNS](#DNS) - `use('dns')`
* [elasticsearch 10+](#elasticsearch) - `use('elasticsearch')`
* [Express 4+](#Express) - `use('express')`
* [GraphQL 0.10+](#GraphQL) - `use('graphql')`
* [hapi 2+](#hapi) - `use('hapi')`
* [http/https](#httphttps) - `use('http')`, `use('https')`
* [ioredis 2+](#ioredis) - `use('ioredis')`
* [Koa 2+](#Koa) - `use('koa')`
* [Memcached 2.2+](#Memcached) - `use('memcached')`
* [MongoDB-Core 2+](#MongoDB-Core) - `use('mongodb-core')`
* [mysql 2+](#mysql) - `use('mysql')`
* [MySQL2 1+](#MySQL2) - `use('mysql2')`
* [Nest 4.6 - 6.x](https://nestjs.com/) - `use('nest')`
* [Net](#Net) - `use('net')`
* [node-postgres 4+](#node-postgres) - `use('pg')`
* [Pino 2+](#pino) - `use('pino')`
* [Q 1+](#Q) - `use('q')`
* [Redis 0.12+](#Redis) - `use('redis')`
* [restify 3+](#restify) - `use('restify')`
* [Sails 1+](#Sails) - `use('sails')`
* [Socket.IO 1+](#SocketIO) - `use('socket.io')`
* [when.js 3+](#whenjs) - `use('when')`
* [winston 1+](#winston) - `use('winston')`

Each integration also has its own list of default tags. These tags get automatically added to the span created by the integration.  Some have additional configuration settings to determine traced behavior.  These are configured by providing an object of the form `{ optionOneName: optionOneValue, optionTwoName: optionsTwoValue }`.

#### adonisjs

##### Tags

| Tag              | Description                                               |
|------------------|-----------------------------------------------------------|
| http.url         | The complete URL of the request.                          |
| http.method      | The HTTP method of the request.                           |
| http.status_code | The HTTP status code of the response.                     |
| http.headers.*   | A recorded HTTP header. 


##### Configuration Options

| Option           | Default                   | Description                            |
|------------------|---------------------------|----------------------------------------|
| validateStatus   | `code => code < 500`      | Callback function to determine if there was an error. It should take a status code as its only parameter and return `true` for success or `false` for errors. |
| headers          | `[]`                      | An array of headers to include in the span tags. |

#### amqp10

##### Tags

| Tag                      | Description                                              |
|--------------------------|----------------------------------------------------------|
| peer.hostname            | The hostname of the AMQP server (if known).              |
| peer.ipv4                | The IPv4 address of the AMQP server (if known).          |
| peer.ipv6                | The IPv6 address of the AMQP server (if known).          |
| peer.port                | The port of the AMQP server.                             |
| span.kind                | Set to either `producer` or `consumer` where it applies. |
| amqp.connection.host     | The host of the AMQP peer.                               |
| amqp.connection.port     | The port of the AMQP peer.                               |
| amqp.connection.user     | The connected user                                       |
| amqp.link.handle         | The link's numeric handle                                |
| amqp.link.name           | The link's unique name                                   | 
| amqp.link.role           | The client's operational role (`sender` or `receiver`)   |
| amqp.link.source.address | The topic sourced from the command (when available).     |
| amqp.link.target.address | The topic targeted by the command (when available).      |

#### amqplib

##### Tags

| Tag              | Description                                               |
|------------------|-----------------------------------------------------------|
| peer.hostname    | The hostname of the AMQP server (if known).               |
| peer.ipv4        | The IPv4 address of the AMQP server (if known).           |
| peer.ipv6        | The IPv6 address of the AMQP server (if known).           |
| peer.port        | The port of the AMQP server.                              |
| span.kind        | Set to either `producer` or `consumer` where it applies.  |
| amqp.queue       | The queue targeted by the command (when available).       |
| amqp.exchange    | The exchange targeted by the command (when available).    |
| amqp.routingKey  | The routing key targeted by the command (when available). |
| amqp.consumerTag | The consumer tag (when available).                        |
| amqp.source      | The source exchange of the binding (when available).      |
| amqp.destination | The destination exchange of the binding (when available). |

#### Bluebird

Bluebird promises will automatically be instrumented to propagate active span context across
`.then()` callbacks.  Please note this does not mean each promise will automagically result in
traced execution, but instead adds to ease of custom instrumentation and enhanced
instrumentation compatibility.

#### Bunyan

The Bunyan instrumentation will automatically add fields for the current `trace_id` and active `span_id`, if applicable, for each logged statement.

#### cassandra-driver

##### Tags

| Tag                  | Description                                             |
|----------------------|---------------------------------------------------------|
| cassandra.keyspace   | The top-level namespace, if available                   |
| db.type              | Always set to `cassandra`.                              |
| db.statement         | The executed command or query (truncated to 1024 chars) |
| span.kind            | Always set to `client`.                                 |
| peer.hostname        | The hostname of the Cassandra server (if known).        |
| peer.ipv4            | The IPv4 address of the Cassandra server (if known).    |
| peer.ipv6            | The IPv6 address of the Cassandra server (if known).    |

#### DNS

##### Tags

| Tag                  | Description                          |
|----------------------|--------------------------------------|
| dns.address          | The address being looked up          |
| dns.hostname         | The looked up or resolved hostname   |
| dns.ip               | The ip address for a reverse loopkup |
| dns.port             | The port being looked up             |
| dns.rrtype           | The resolution resource record type  |
| span.kind            | Always set to `client`.              |

#### elasticsearch

##### Tags

| Tag                  | Description                                           |
|----------------------|-------------------------------------------------------|
| component            | Always set to `elasticsearch`.                        |
| db.type              | Always set to `elasticsearch`.                        |
| db.instance          | Always set to `elasticsearch`.                        |
| db.statement         | The body of the statement to elasticsearch.           |
| peer.hostname        | The host of the Elasticsearch server.                 |
| peer.port            | The port of the Elasticsearch server.                 |
| span.kind            | Always set to `client`.                               |
| elasticsearch.method | The underlying HTTP request verb.                     |
| elasticsearch.url    | The underlying HTTP request URL path.                 |
| elasticsearch.index  | The name of the index being queried                   |
| elasticsearch.params | The parameters of the query.                          |

#### Express

##### Tags

| Tag              | Description                                               |
|------------------|-----------------------------------------------------------|
| http.url         | The complete URL of the request.                          |
| http.method      | The HTTP method of the request.                           |
| http.status_code | The HTTP status code of the response.                     |
| http.headers.*   | A recorded HTTP header.                                   |

##### Configuration Options

| Option                    | Default                   | Description                            |
|-------------------------|---------------------------|----------------------------------------|
| validateStatus          | `code => code < 500`      | Callback function to determine if there was an error. It should take a status code as its only parameter and return `true` for success or `false` for errors. |
| headers                 | `[]`                      | An array of headers to include in the span tags. |
| expandRouteParameters | `{}`                      | An object of the form `{ '/exact/path/:paramOne/:paramTwo': { 'paramOne': true } }` that will expand parameter values for operation names for each request to that path.  Be sure to only use for low-cardinality parameters.  Omitted parameters default to `false`. |
| synthesizeRequestingContext | `{}`                      | An object of the form `{ '/exact/path/:paramOne/:paramTwo': true }` whose request handler spans will be "parented" by a synthesized requesting context.  Omitted paths default to `false`.  The synthesized context ids will be available in the [Request object](https://expressjs.com/en/api.html#req) as `Request.sfx.traceId` and `Request.sfx.spanId` to be used in response content for the purpose of retroactively reporting parent spans by separate, custom client logic.  Only intended for use cases where actual initiating client-instrumentation proves cumbersome (e.g. initial web browser request). |

```javascript
// expandRouteParameters:
// Span operation names would be distinct for each `path` parameter value
// GET /my/exact/version1/someValue -> '/my/exact/version1/:params'
// GET /my/exact/version2/otherValue -> '/my/exact/version2/:params'
const tracer = require('signalfx-tracing').init()
tracer.use('express', {
  expandRouteParameters : {
    '/my/exact/:path/:params': { 'path': true, 'params': false }
  }
})
const express = require('express')

app = express()
app.get('/my/exact/:path/:params', (req, res) => {
  res.status(200).send()
})

// synthesizeRequestingContext:
// Instrumentation-generated request handler spans will have a synthesized parent,
// to be created retroactively by the user in their own custom client instrumentation
const tracer = require('signalfx-tracing').init()
tracer.use('express', {
  synthesizeRequestingContext : {
    '/my/exact/:path/:params': true
  }
})
const express = require('express')

app = express()
app.get('/my/exact/:path/:params', (req, res) => {
  // Ids are available on modified Request object
  const traceId = req.sfx.traceId // 64bit hexadecimal
  const synthesizedParentId = req.sfx.spanId // 64bit hexadecimal
  // Trace and span ids to be sent for custom span creation (not shown).
  res.status(200).send(`<html>Trace ID: ${traceId}, Span ID: ${synthesizedParentId}</html>`)
})
```

#### GraphQL

If no query operation name is explicitly provided, the `graphql` span operation name will be just `query`, `mutation` or `subscription`.

```graphql
# good, the span operation name will be `query HelloWorld`
query HelloWorld {
  hello
  world
}

# bad, the span operation name will be `query`
{
  hello
  world
}
```

##### Tags

| Tag                 | Description                                               |
|---------------------|-----------------------------------------------------------|
| graphql.document    | The original GraphQL document.                            |
| graphql.variables.* | The variables applied to the document.                    | 

##### Configuration Options

| Option          | Default                                          | Description                                                            |
|-----------------|--------------------------------------------------|------------------------------------------------------------------------|
| variables       | []                                               | An array of variable names to record. Can also be a callback that returns the key/value pairs to record. For example, using `variables => variables` would record all variables. |
| depth           | -1                                               | The maximum depth of fields/resolvers to instrument. Set to `0` to only instrument the operation or to -1 to instrument all fields/resolvers. |
| collapse        | true                                             | Whether to collapse list items into a single element. (i.e. single `users.*.name` span instead of `users.0.name`, `users.1.name`, etc) |

#### hapi

##### Tags

| Tag              | Description                                               |
|------------------|-----------------------------------------------------------|
| http.url         | The complete URL of the request.                          |
| http.method      | The HTTP method of the request.                           |
| http.status_code | The HTTP status code of the response.                     |
| http.headers.*   | A recorded HTTP header.                                   |

##### Configuration Options

| Option           | Default                   | Description                            |
|------------------|---------------------------|----------------------------------------|
| validateStatus   | `code => code < 500`      | Callback function to determine if there was an error. It should take a status code as its only parameter and return `true` for success or `false` for errors. |
| headers          | `[]`                      | An array of headers to include in the span tags. |

#### http/https

##### Tags

| Tag              | Description                                               |
|------------------|-----------------------------------------------------------|
| http.url         | The complete URL of the request.                          |
| http.method      | The HTTP method of the request.                           |
| http.status_code | The HTTP status code of the response.                     |

##### Configuration Options

| Option           | Default                               | Description       |
|------------------|---------------------------------------|-------------------|
| splitByDomain    | false                                 | Use the remote endpoint host as the service name instead of the default. |
| validateStatus   | `code => code < 500 \|\| code >= 600` | Callback function to determine if an HTTP response should be recorded as an error. It should take a status code as its only parameter and return `true` for success or `false` for errors.
| blacklist        | []                                    | List of URLs that should not be instrumented. Can be a string, RegExp, callback that takes the URL as a parameter, or an array of any of these.
| whitelist        | /.*/                                  | List of URLs that should be instrumented. If this is set, other URLs will not be instrumented. Can be a string, RegExp, callback that takes the URL as a parameter, or an array of any of these.

#### ioredis

##### Tags

| Tag           | Description                                      |
|---------------|--------------------------------------------------|
| component     | `redis`                                          |
| db.type       | `redis`                                          |
| db.instance   | The index of the queried database.               |
| db.statement  | The statement used to query the database.        |
| peer.hostname | The hostname of the Redis server (if known).     |
| peer.ipv4     | The IPv4 address of the Redis server (if known). |
| peer.ipv6     | The IPv6 address of the Redis server (if known). |
| peer.port     | The port of the Redis server.                    |

#### Koa

##### Tags

| Tag              | Description                                               |
|------------------|-----------------------------------------------------------|
| http.url         | The complete URL of the request.                          |
| http.method      | The HTTP method of the request.                           |
| http.status_code | The HTTP status code of the response.                     |
| http.headers.*   | A recorded HTTP header.                                   |

#### Knex

##### Tags

| Tag              | Description                                                |
|------------------|------------------------------------------------------------|
| component        | `knex`                                                     |
| db.type          | The database driver being used such as sqlite3, etc        |
| db.user          | The database user used by the driver to connect to the db. |
| db.statement     | The SQL statement executed by the traced query.            |
| db.instance      | The name of the queried database instance.                 |

##### Configuration Options

| Option           | Default                   | Description                            |
|------------------|---------------------------|----------------------------------------|
| validateStatus   | `code => code < 500`      | Callback function to determine if there was an error. It should take a status code as its only parameter and return `true` for success or `false` for errors. |
| headers          | `[]`                      | An array of headers to include in the span tags. |

#### Memcached

##### Tags

| Tag              | Description                                               |
|------------------|-----------------------------------------------------------|
| memcached.query  | The query sent to the server.                             |
| peer.hostname    | The hostname of the Memcached server (if known).          |
| peer.ipv4        | The IPv4 address of the Memcached server (if known).      |
| peer.ipv6        | The IPv6 address of the Memcached server (if known).      |
| peer.port        | The port of the Memcached server.                         |

#### MongoDB-Core

##### Tags

| Tag                  | Description                                           |
|----------------------|-------------------------------------------------------|
| db.name              | The qualified name of the queried collection.         |
| peer.hostname        | The hostname of the MongoDB server (if known).        |
| peer.ipv4            | The IPv4 address of the MongoDB server (if known).    |
| peer.ipv6            | The IPv6 address of the MongoDB server (if known).    |
| peer.port            | The port of the MongoDB server.                       |
| mongodb.cursor.index | When using a cursor, the current index of the cursor. |

#### mysql

##### Tags

| Tag              | Description                                                       |
|------------------|-------------------------------------------------------------------|
| component        | Always set to `mysql`.                                            |
| db.type          | The type of the queried database.                                 |
| db.user          | The user who made the query.                                      |
| db.instance      | The name of the queried database instance.                        |
| db.statement     | The database statement for the queried database.                  |
| peer.hostname    | The hostname of the MySQL server (if known).                      |
| peer.ipv4        | The IPv4 address of the MySQL server (if known).                  |
| peer.ipv6        | The IPv6 address of the MySQL server (if known).                  |
| peer.port        | The port of the MySQL serve                                       |

#### MySQL2

##### Tags

| Tag              | Description                                                         |
|------------------|---------------------------------------------------------------------|
| component        | Always set to `mysql2`.                                             |
| db.type          | The type of the queried database.                                   |
| db.user          | The user who made the query.                                        |
| db.instance      | The name of the queried database instance.                          |
| db.statement     | The database statement for the queried database.                    |
| peer.hostname    | The hostname of the MySQL server (if known).                        |
| peer.ipv4        | The IPv4 address of the MySQL server (if known).                    |
| peer.ipv6        | The IPv6 address of the MySQL server (if known).                    |
| peer.port        | The port of the MySQL server.                                       |

#### Net

##### Tags

| Tag                | Description                                   |
|--------------------|-----------------------------------------------|
| ipc.path           | the IPC connection pathname                   |
| peer.hostname      | The remote hostname (if known).               |
| peer.ipv4          | The remote IPv4 address (if known).           |
| peer.ipv6          | The remote IPv6 address (if known).           |
| peer.port          | The remote port attempting to connect with    |
| tcp.family         | The IP family version                         |
| tcp.local.address  | Local address socket connected with           |
| tcp.local.port     | Local port socket connected to                |
| tcp.remote.host    | Remote hostname attempting to connection with |
| tcp.remote.port    | Remote port attempting to connect to          |

#### Nest

##### Tags

| Tag                      | Description                                               |
|--------------------------|-----------------------------------------------------------|
| component                | Always set to `nest`.                                     |            |
| http.url                 | The complete URL of the request.                          |
| http.method              | The HTTP method of the request.                           |
| nest.route.path          | The nest route path matched.                              |
| nest.controller.instance | The name of the nest controller that handled the request. |
| nest.callback            | The name of the callback invoked to handle the request.   |
| nest.interceptors        | Names of nest interceptors that were used.                |
| nest.pipes               | Names of the nest pipes that were used.                   |
| nest.guards              | Names of the nest guards that were used.                  |


#### node-postgres

##### Tags

| Tag              | Description                                                          |
|------------------|----------------------------------------------------------------------|
| component        | Always set to `postgres`.                                            |
| db.type          | The type of the queried database.                                    |
| db.user          | The user who made the query.                                         |
| db.instance      | The name of the queried database.                                    |
| db.statement     | The database statement for the queried database.                     |
| peer.hostname    | The host of the PostgreSQL server.                                   |
| peer.port        | The port of the PostgreSQL server.                                   |

#### Pino

The Pino instrumentation will automatically add fields for the current `trace_id` and active `span_id`, if applicable, for each logged statement.

#### Q

Q promises will automatically be instrumented to propagate active span context across
`.then()` and similar callbacks.  Please note this does not mean each promise will automagically
result in traced execution, but instead adds to ease of custom instrumentation and enhanced
instrumentation compatibility during chaining.

#### Redis

##### Tags

| Tag           | Description                               |
|---------------|-------------------------------------------|
| component     | `redis`                                   |
| db.type       | `redis`                                   |
| db.instance   | The index of the queried database.        |
| db.statement  | The statement used to query the database. |
| peer.hostname | The host of the Redis server.             |
| peer.port     | The port of the Redis server.             |

#### restify

##### Tags

| Tag              | Description                                               |
|------------------|-----------------------------------------------------------|
| http.url         | The complete URL of the request.                          |
| http.method      | The HTTP method of the request.                           |
| http.status_code | The HTTP status code of the response.                     |
| http.headers.*   | A recorded HTTP header.                                   |

##### Configuration Options

| Option           | Default                   | Description                            |
|------------------|---------------------------|----------------------------------------|
| validateStatus   | `code => code < 500`      | Callback function to determine if there was an error. It should take a status code as its only parameter and return `true` for success or `false` for errors. |
| headers          | `[]`                      | An array of headers to include in the span tags. |

#### Sails

This instrumentation only adds traces for Sails actions registered by your app.
The router and request handling is done by Express instrumentation.

#### Socket.IO

| Tag           | Description                          |
| ------------- | ----------------                     |
| component     | `socket.io`                          |
| namespace     | Namespace of the event. Default: `/` |
| path          | Path for the socket                  |
| clients.count | Number of current clients            |
| events.count  | Number of registered events          |

##### Configuration Options

| Option       | Default | Description                                                                          |
|--------------|---------|--------------------------------------------------------------------------------------|
| omitReserved | `false` | If `true`, skip tracing for reserved events: https://socket.io/docs/emit-cheatsheet/ |
| omitEvents   | `[]`    | A list of events that should not be traced                                           |

#### when.js

When.js promises will automatically be instrumented to propagate active span context across
`.then()` callbacks.  Please note this does not mean each promise will automagically result in
traced execution, but instead adds to ease of custom instrumentation and enhanced
instrumentation compatibility.

#### winston

The winston instrumentation will automatically add fields for the current `trace_id` and active `span_id`, if applicable, for each logged statement.
