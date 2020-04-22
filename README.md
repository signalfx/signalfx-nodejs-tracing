# SignalFx Tracing Library for JavaScript

[![npm (tag)](https://img.shields.io/npm/v/signalfx-tracing.svg)](https://www.npmjs.com/package/signalfx-tracing)
[![CircleCI](https://circleci.com/gh/signalfx/signalfx-nodejs-tracing.svg?style=shield)](https://circleci.com/gh/signalfx/signalfx-nodejs-tracing)

The SignalFx Tracing Library for JavaScript automatically instruments your Node.js application to capture and report distributed traces to SignalFx. The library configures an OpenTracing-compatible tracer to capture and export trace spans.

By default, the tracer has constant sampling (i.e., 100% chance of tracing) and reports every span. Where applicable, context propagation uses
[B3 headers](https://github.com/openzipkin/b3-propagation).

For more information about configuring and using the agent, see
the [examples](https://github.com/signalfx/tracing-examples/tree/master/signalfx-tracing/signalfx-nodejs-tracing).

For advanced configuration information, see [SignalFx Tracing Library for JavaScript - API](./docs/API.md)

## Requirements and supported software

The library supports Node.js versions 4.7+, 6.9+, and 8+.

These are the supported libraries. Instrumentation for each library is in beta.

| Library | Versions supported | Instrumentation name(s) | Notes |
| ---     | ---                | ---                     | ---   |
| [adonis](https://github.com/adonisjs) | 4+ | `use('adonis')` | |
| [amqp10](https://github.com/noodlefrenzy/node-amqp10) | 3+ | `use('amqp10')` | |
| [amqplib](http://www.squaremobius.net/amqp.node/) | 0.5+ | `use('amqplib')` | |
| [Bluebird](https://github.com/petkaantonov/bluebird) | 2+ | `use('bluebird')` | |
| [Bunyan](https://github.com/trentm/node-bunyan) | 1+ | `use('bunyan')`| |
| [cassandra-driver](https://github.com/datastax/nodejs-driver) | | `use('cassandra-driver')` | |
| [DNS](https://nodejs.org/api/dns.html) | | `use('dns')` | |
| [elasticsearch](https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/index.html) | 10+ | `use('elasticsearch')` | |
| [Express](http://expressjs.com/) | 4+ | `use('express')` | |
| [GraphQL](https://github.com/graphql/graphql-js) | 0.10+ | `use('graphql')` | |
| [hapi](https://hapijs.com/) | 2+ | `use('hapi')` | |
| [http/https](https://nodejs.org/api/http.html) | | `use('http')`, `use('https')` | |
| [ioredis](https://github.com/luin/ioredis)| 2+ | `use('ioredis')` | |
| [Koa](https://koajs.com/) | 2+ | `use('koa')` | |
| [Knex](https://knexjs.org/) | 0.10+ | `use('bluebird'); use('knex')` | Depends on bluebird instrumentation |
| [Memcached](https://github.com/3rd-Eden/memcached) | 2.2+ | `use('memcached')` | |
| [MongoDB-Core](https://github.com/mongodb-js/mongodb-core) | 2+ | `use('mongodb-core')` | |
| [mysql](https://github.com/mysqljs/mysql) | 2+ | `use('mysql')` | |
| [MySQL2](https://github.com/sidorares/node-mysql2) | 1+ | `use('mysql2')` | |
| [Nest](https://nestjs.com/) | | `use('nest')` | |
| [Net](https://nodejs.org/api/net.html) | | `use('net')` | |
| [node-postgres](https://github.com/brianc/node-postgres) | 4+ | `use('pg')` | |
| [Pino](http://getpino.io/#/) | 2+ | `use('pino')` | |
| [Q](https://github.com/kriskowal/q) | 1+ | `use('q')` | |
| [Redis](https://github.com/NodeRedis/node_redis) | 0.12+ | `use('redis')` | |
| [restify](http://restify.com/) | 3+ | `use('restify')` | |
| [Sails](https://sailsjs.com) | 1+ | `use('sails')` | |
| [Socket.IO](https://socket.io) | 1.2+ | `use('socket.io')` | |
| [when.js](https://github.com/cujojs/when) | 3+ | `use('when')` | |
| [winston](https://github.com/winstonjs/winston) | 1+ | `use('winston')` | |

## Configure the SignalFx Tracing Library for JavaScript

1. Install the tracing library. You can install directly from npm or directly
from the  GitHub repository.
      
      npm:
      ```bash
        $ npm install signalfx-tracing
      ```
      GitHub:
      ```bash
        $ git clone https://github.com/signalfx/signalfx-nodejs-tracing.git
        $ npm install ./signalfx-nodejs-tracing
      ```
2. Set the service name for your application:
      ```bash
        $ SIGNALFX_SERVICE_NAME=your_app_name node your_app.js
3. Configure the OpenTracing-compatible tracer to report traces to a Smart Agent or OpenTelemetry Collector. You have to include this before the target library require statements.
      ```javascript
      const tracer = require('signalfx-tracing').init({
        service: '${IGNALFX_SERVICE_NAME}',
      })

      const express = require('express')
      const app = express()

      app.get('/my_automatically_traced_endpoint', (req, res, next) => {
        res.status(200).send()
      })

      app.listen(3000)
      ```

## About
The SignalFx-Tracing Library for JavaScript is a fork of the DataDog APM JavaScript Tracer that has been modified to provide Zipkin v2 JSON formatting, B3 trace propagation functionality, and properly annotated trace data for handling by [SignalFx Microservices APM](https://docs.signalfx.com/en/latest/apm2/apm2-overview/apm2-overview.html).
