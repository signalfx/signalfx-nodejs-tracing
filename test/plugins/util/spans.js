'use strict'

module.exports = {
  sortByStartTime (spans) {
    return spans.sort((a, b) => a.start.toString() >= b.start.toString() ? 1 : -1)
  }
}
