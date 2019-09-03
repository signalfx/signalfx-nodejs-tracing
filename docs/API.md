# SignalFx-Tracing Library for JavaScript - API

The module exported by the `signalfx-tracing` library is an OpenTracing [Tracer](https://doc.esdoc.org/github.com/opentracing/opentracing-javascript/class/src/tracer.js~Tracer.html).  It has been modified to implement a [Scope Manager](https://github.com/opentracing/specification/blob/10497dfe0ffef806e97ccf3173ebbeba83f401be/rfc/scope_manager.md), which is not currently in the OpenTracing JavaScript reference API, but whose development is ongoing.

### Auto-Instrumentation

The SignalFx-Tracing Library for JavaScript provides auto-instrumentation for all its supported libraries and frameworks using [`require-in-the-middle`](https://www.npmjs.com/package/require-in-the-middle) and [`shimmer`](https://www.npmjs.com/package/shimmer).  To utilize this functionality, the tracer must be accessed and initialized before any target library or framework is imported:

```javascript
// init() invocation must occur before importing any traced library (e.g. Express)
const tracer = require('signalfx-tracing').init(
  // service name, also configurable via
  // SIGNALFX_SERVICE_NAME environment variable
  service: 'my-traced-service',
  // Smart Agent or Gateway endpoint, also configurable via
  // SIGNALFX_ENDPOINT_URL environment variable
  url: 'http://my_agent_or_gateway:9080/v1/trace', // http://localhost:9080/v1/trace by default
  // optional organization access token, also configurable via
  // SIGNALFX_ACCESS_TOKEN environment variable
  accessToken: 'myOptionalOrganizationAccessToken'
)

// auto-instrumented Express application
const express = require('express') 
const app = express()
```

### Custom Instrumentation

Regardless if you are using a [supported library instrumentation](#instrumentations), you may want to add custom instrumentation to your code.  This can be done using the [OpenTracing API](#opentracing-api) and [Scope](#scope) utility.

#### OpenTracing API

You can use the [OpenTracing API](https://doc.esdoc.org/github.com/opentracing/opentracing-javascript/) and the `signalfx-tracing` library to track execution state and duration for specific pieces of code. In the following example, a tracer is initialized and used as an OpenTracing global tracer:

```javascript
const tracer = require('signalfx-tracing').init()
const opentracing = require('opentracing')

opentracing.initGlobalTracer(tracer)

function myApplicationLogic() {
  const globalTracer =  opentracing.globalTracer()
  const span = globalTracer.startSpan('myApplicationLogic') 
  span.setTag('MyTag', 'MyTagValue')
  span.log({ event: 'Event Information' })

  // callback that will finish the current span upon completion
  return myAdditionalApplicationLogic(result => {
    span.setTag('MyResult', result)
    span.finish()
  })

}
```

##### Scope

In order to provide span context propagation within a Node.js application, this library
includes a scope manager. A scope manager is a utility for registering and providing a span
that can cross both synchronous and asynchronous contexts.  The span it provides has been
registered as active and can be used for noting an accessor's execution state and for parenting
child spans. This is helpful for being able to reference an existing span in a particular
section of traced functionality without having been explicitly passed the span as an argument.

```javascript
// explicit span reference as parameter
function myApplicationLogic (argOne, activeSpan) {
  activeSpan.setTag('MyArg', argOne)

  return myAdditionalApplicationLogic(result => {
    activeSpan.setTag('MyResult', result)
    activeSpan.finish()
  })
}
```

```javascript
// automatic context propagation via the scope manager

// Tracer initialization should occur once, and can
// be exported for usage in other modules.
const tracer = require('signalfx-tracing').init()

function myApplicationLogic (argOne) {
  activeSpan = tracer.scope().active()
  activeSpan.setTag('MyArg', argOne)

  return myAdditionalApplicationLogic(result => {
    activeSpan.setTag('MyResult', result)
    activeSpan.finish()
  })
}
```

Scope management is made possible by the [Async Hooks](https://nodejs.org/api/async_hooks.html)
or, if that's unavailable, the [AsyncWrap](http://blog.trevnorris.com/2015/02/asyncwrap-tutorial-introduction.html)
API.  These features provide the ability to register listeners for various lifetime events
associated with asynchronous resources.  There are potential performance implications
of enabling these internal features, so we strongly recommend using as recent a version of
Node.js as possible to ensure the most recent improvements from the Node community.  If you
do not want to enable this feature you can set the `SIGNALFX_CONTEXT_PROPAGATION` environment
variable to `false`.

**Note**: Disabling the scope manager will result in more division among trace contexts and require manual span management via modified function signatures or other custom mechanisms.

The scope manager is available via `tracer.scope()`, whose return value can be used
in a global context.  It has three methods that are useful for active span management, described below.

**Note**: Because the scope manager isn't defined in the current OpenTracing JavaScript API, the delegation pattern of the OpenTracing global tracer (`require('opentracing').globalTracer()`) isn't able to provide access to the scope manager (via `scope()` method).  For this reason, a reference to the tracer instance returned by `init()` should be made accessible where manual scope management is necessary.

###### scope.active()

This method returns the active span for the current function if one has been earlier
activated in some outer or local context.  Returns `null` otherwise.

###### scope.activate(span, fn)

This method activates the provided span in the tracer's scope for availability in
the context of the provided function, which is immediately invoked.  Any asynchronous
context stemming from the provided function will also have access to the span by calls
to `scope.active()`. The return value of `activate()` is that of the provided function.

```javascript
const tracer = require('signalfx-tracing').init()
const scope = tracer.scope()

const requestSpan = tracer.startSpan('web.request')
const promise = Promise.resolve()

function someFunction () {
  // Logs the current active span
  console.log(scope.active())
}

scope.activate(requestSpan, () => {
  console.log(scope.active()) // requestSpan because called in activated context

  someFunction() // requestSpan because called in activated context

  setTimeout(() => {
    setTimeout(() => {
      console.log(scope.active()) // requestSpan because setTimeout calls stem from activated context
    })
  })

  promise.then(() => {
    console.log(scope.active()) // requestSpan because then() called in activated context
  })
})

someFunction() // null because called in an unactivated context
console.log(scope.active()) // null
```

###### scope.bind(target, [span])

This method binds a target to the specified span, or to an active span if absent.
It supports binding functions, promises, and event emitters.  When a span is provided,
the target is always bound to that span. If a span isn't specified, the bound active
span will depend on the type of the provided target (detailed below).

Explicitly passing `null` as the span value will actually bind to `null` or no span.
This can be useful if isolated trace content is desired without modifying the active
span of the current trace context.

The return value of binding a function will be a traced wrapper of that function.  It's
important to note that the returned function is not the same function in terms of identity
and comparisons, but it can be treated as if it were otherwise.

The return value of binding a promise is the target promise, but its `then` and `catch`
methods are traced equivalents.  As with wrapped functions, these methods are not
the same as they were before `bind()` but can be treated as such outside of direct
comparison.

The return value of binding an event emitter is the target emitter but it will have had
its relevant listener registration and handling methods replaced with traced equivalents.

When a span is not provided to `bind()`, the binding uses the following rules for determining
the active span that will be bound:

* Functions are bound to the span that was active when `scope.bind(fn)` was called.
* Promise handlers are bound to the active span in the scope where `.then()` is
called. This also applies to any equivalent method such as `.catch()`.  This is the case
because implicit promises are created by these methods that assume the active span from the
current scope.
* Event emitter listeners are bound to the active span in the scope where
`.addEventListener()` is called. This also applies to any equivalent method
such as `.on()`

**Note**: Native promises and promises from `bluebird`, `q` and `when` are, by default,
already bound to the active span in activated contexts and don't need to be explicitly bound.

##### Examples

###### Function binding

```javascript
const tracer = require('signalfx-tracing').init()
const scope = tracer.scope()

const outerSpan = tracer.startSpan('web.request')

scope.activate(outerSpan, () => {
  const innerSpan = tracer.startSpan('web.middleware')

  const boundToInner = scope.bind(() => {
    console.log(scope.active())
  }, innerSpan)

  const boundToOuter = scope.bind(() => {
    console.log(scope.active())
  })

  boundToInner() // innerSpan because explicitly bound
  boundToOuter() // outerSpan because implicitly bound
})
```

###### Promise binding

```javascript
const tracer = require('signalfx-tracing').init()
const scope = tracer.scope()

const outerSpan = tracer.startSpan('web.request')
const innerPromise = Promise.resolve()
const outerPromise = Promise.resolve()

scope.activate(outerSpan, () => {
  const innerSpan = tracer.startSpan('web.middleware')

  scope.bind(innerPromise, innerSpan)
  scope.bind(outerPromise)

  innerPromise.then(() => {
    console.log(scope.active()) // innerSpan because it was explicitly bound
  })

  outerPromise.then(() => {
    console.log(scope.active()) // outerSpan because implicitly bound on `then()` call
  })
})
```

**Note**: `async/await` cannot be bound and always execute in the scope where
`await` was called. If binding `async/await` is needed, the promise must be
wrapped by a function.

###### Event emitter binding

```javascript
const tracer = require('signalfx-tracing').init()
const scope = tracer.scope()
const EventEmitter = require('events').EventEmitter

const outerSpan = tracer.startSpan('web.request')
const innerEmitter = new EventEmitter()
const outerEmitter = new EventEmitter()

scope.activate(outerSpan, async () => {
  const innerSpan = tracer.startSpan('web.middleware')

  scope.bind(innerEmitter, innerSpan)
  scope.bind(outerEmitter)

  innerEmitter.on('request', () => {
    console.log(scope.active()) // innerSpan because it was explicitly bound
  })

  outerEmitter.on('request', () => {
    console.log(scope.active()) // outerSpan because implicitly bound on `on()` call
  })
})

innerEmitter.emit('request')
outerEmitter.emit('request')
```

### Instrumentations

SignalFx-Tracing provides out-of-the-box instrumentations for many popular frameworks and libraries by using a plugin system. By default all built-in plugins are enabled. This behavior can be changed by setting the `plugins` option to `false` in the [tracer settings](#tracer-settings).

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

### Advanced Configuration

#### Tracer settings

Options can be configured as a parameter to the `init()` method or as environment variables.

| Config        | Environment Variable         | Default   | Description |
| ------------- | ---------------------------- | --------- | ----------- |
| service       | SIGNALFX_SERVICE_NAME        | unnamed-nodejs-service | The service name to be used for this program. |
| url           | SIGNALFX_ENDPOINT_URL        | http://localhost:9080/v1/trace | The url of the Agent or Gateway to which the tracer will submit traces. |
| accessToken   | SIGNALFX_ACCESS_TOKEN        |           | The optional organization access token for trace submission requests |
| enabled       | SIGNALFX_TRACING_ENABLED     | true      | Whether to enable the tracer. |
| debug         | SIGNALFX_TRACING_DEBUG       | false     | Enable debug logging in the tracer. |
| logInjection  | SIGNALFX_LOGS_INJECTION      | false     | Enable automatic injection of trace IDs in logs for supported logging libraries. |
| tags          |                              | {}        | Set global tags that should be applied to all spans. |
| sampleRate    |                              | 1         | Percentage of spans to sample as a float between 0 and 1. |
| flushInterval |                              | 2000      | Interval in milliseconds at which the tracer will submit traces to the agent. |
| experimental  |                              | {}        | Experimental features can be enabled all at once using boolean `true` or individually using key/value pairs. There are currently no experimental features available. |
| plugins       |                              | true      | Whether or not to enable automatic instrumentation of external libraries using the built-in plugins. |

#### Custom Logging

By default, logging from this library is disabled. In order to get debbuging information and errors sent to logs, the `debug` options should be set to `true` in the `init()` method.

The tracer will then log debug information to `console.log()` and errors to `console.error()`. This behavior can be changed by passing a custom logger to the tracer. The logger should contain a `debug()` and `error()` methods that can handle messages and errors, respectively.

For example:

```javascript
const bunyan = require('bunyan')
const logger = bunyan.createLogger({
  name: 'signalfx-tracing',
  level: 'trace'
})

const tracer = require('signalfx-tracing').init({
  logger: {
    debug: message => logger.trace(message),
    error: err => logger.error(err)
  },
  debug: true
})
```
