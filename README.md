# SignalFx-Tracing Library for JavaScript

[![npm (tag)](https://img.shields.io/npm/v/signalfx-tracing.svg)](https://www.npmjs.com/package/signalfx-tracing)
[![CircleCI](https://circleci.com/gh/signalfx/signalfx-nodejs-tracing.svg?style=shield)](https://circleci.com/gh/signalfx/signalfx-nodejs-tracing)

This library provides an OpenTracing-compatible tracer and automatically configurable instrumentations for many popular JavaScript libraries and frameworks.  It supports Node.js versions 4.7+, 6.9+, and 8+.

## Installation

```bash
  $ npm install signalfx-tracing
  # or from a cloned repository
  $ git clone https://github.com/signalfx/signalfx-nodejs-tracing.git
  $ npm install ./signalfx-nodejs-tracing
```

## Usage

```javascript
// Configure OpenTracing tracer to report traces to Smart Agent or Gateway and initiate
// auto-instrumentation.  Must occur before target library require statements.
const tracer = require('signalfx-tracing').init({
  // Service name also configurable via SIGNALFX_SERVICE_NAME environment variable
  service: 'my-traced-service',
})

// Auto-Instrumented Express
const express = require('express')
const app = express()

app.get('/my_automatically_traced_endpoint', (req, res, next) => {
  res.status(200).send()
})

app.listen(3000)
```

For detailed information about configuration and usage, please see the [API documentation](./docs/API.md).

## Supported Frameworks and Libraries

**All instrumentations are currently in Beta**

* [amqp10 3+](https://github.com/noodlefrenzy/node-amqp10) - `use('amqp10')`
* [amqplib 0.5+](http://www.squaremobius.net/amqp.node/) - `use('amqplib')`
* [Bluebird 2+](https://github.com/petkaantonov/bluebird) - `use('bluebird')`
* [Bunyan 1+](https://github.com/trentm/node-bunyan) - `use('bunyan')`
* [cassandra-driver](https://github.com/datastax/nodejs-driver) - `use('cassandra-driver')`
* [DNS](https://nodejs.org/api/dns.html) - `use('dns')`
* [elasticsearch 10+](https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/index.html) - `use('elasticsearch')`
* [Express 4+](http://expressjs.com/) - `use('express')`
* [GraphQL 0.10+](https://github.com/graphql/graphql-js) - `use('graphql')`
* [hapi 2+](https://hapijs.com/) - `use('hapi')`
* [http/https](https://nodejs.org/api/http.html) - `use('http')`, `use('https')`
* [ioredis 2+](https://github.com/luin/ioredis) - `use('ioredis')`
* [Koa 2+](https://koajs.com/) - `use('koa')`
* [Memcached 2.2+](https://github.com/3rd-Eden/memcached) - `use('memcached')`
* [MongoDB-Core 2+](https://github.com/mongodb-js/mongodb-core) - `use('mongodb-core')`
* [mysql 2+](https://github.com/mysqljs/mysql) - `use('mysql')`
* [MySQL2 1+](https://github.com/sidorares/node-mysql2) - `use('mysql2')`
* [Net](https://nodejs.org/api/net.html) - `use('net')`
* [node-postgres 4+](https://github.com/brianc/node-postgres) - `use('pg')`
* [Pino 2+](http://getpino.io/#/) - `use('pino')`
* [Q 1+](https://github.com/kriskowal/q) - `use('q')`
* [Redis 0.12+](https://github.com/NodeRedis/node_redis) - `use('redis')`
* [restify 3+](http://restify.com/) - `use('restify')`
* [Sails 1+](https://sailsjs.com) - `use('sails')`
* [Socket.IO 1.2+](https://socket.io) - `use('socket.io')`
* [when.js 3+](https://github.com/cujojs/when) - `use('when')`
* [winston 1+](https://github.com/winstonjs/winston) - `use('winston')`

#### About
The SignalFx-Tracing Library for JavaScript is a fork of the DataDog APM JavaScript Tracer that has been modified to provide Zipkin v2 JSON formatting, B3 trace propagation functionality, and properly annotated trace data for handling by [SignalFx Microservices APM](https://docs.signalfx.com/en/latest/apm/apm-overview/index.html).
