'use strict'

const log = require('../../log')

const urlFilter = {
  getFilter (config) {
    if (typeof config.filter === 'function') {
      return config.filter
    } else if (config.hasOwnProperty('filter')) {
      log.error('Expected `filter` to be a function. Overriding filter property to default.')
    }

    const include = config.include || /.*/
    const exclude = config.exclude || []

    return uri => {
      const included = applyFilter(include, uri)
      const excluded = applyFilter(exclude, uri)
      return included && !excluded
    }

    function applyFilter (filter, uri) {
      if (typeof filter === 'function') {
        return filter(uri)
      } else if (filter instanceof RegExp) {
        return filter.test(uri)
      } else if (filter instanceof Array) {
        return filter.some(filter => applyFilter(filter, uri))
      }

      return filter === uri
    }
  }
}

module.exports = urlFilter
