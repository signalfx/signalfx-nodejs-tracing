'use strict'

module.exports = {
  isHostName (name) {
    if (typeof name !== 'string') {
      return false
    }

    let hasHostChar = false

    for (let i = 0; i < Math.min(name.length, 5); i++) {
      const c = name.charCodeAt(i)

      // ':'
      if (c === 58) {
        return false
      }

      // 'a' to 'z' or 'A' to 'Z' or '-'
      if ((c >= 97 && c <= 122) || (c >= 65 && c <= 90) || c === 45) {
        hasHostChar = true
      }
    }

    return hasHostChar
  }
}
