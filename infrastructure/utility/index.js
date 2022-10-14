import { URL, fileURLToPath } from 'url'
import path from 'path'

class Utility {
  dirname(importMetaUrl) {
    const __filename = fileURLToPath(importMetaUrl)
    return path.dirname(__filename)
  }

  resolvePath(importMetaUrl, relativePath) {
    return path.resolve(this.dirname(importMetaUrl), relativePath)
  }

  trim(text, limit=90) {
    return !text ? '' : text.length > limit ? text.slice(0, limit) + '...' : text;
  }

  getOrigin(link) {
    if (link) {
      try {
        return (new URL(link)).origin
      }
      catch (e) {}
    }

    return ''
  }

  getHostName(link) {
    if (link) {
      try {
        const arr = (new URL(link)).hostname.replace('www.', '').split('.')
        arr.pop()
        return arr.join('.')
      }
      catch (e) {}
    }

    return ''
  }

  toUpperCaseFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
  }
}

export const utility = new Utility()
