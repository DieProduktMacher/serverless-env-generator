'use strict'

const fs = require('fs-extra')
const yaml = require('js-yaml')

// Returns a promise to read YAML files
module.exports.read = (filePath) => {
  return fs.readFile(filePath, 'utf-8').then(fileBody => {
    let doc = yaml.safeLoad(fileBody)
    if (!doc) {
      console.warn(`YAML-file ${filePath} seems to be empty or invalid`)
    }
    return doc
  })
}

// Returns a promise to write YAML files
module.exports.write = (filePath, doc) => {
  let fileBody = yaml.safeDump(doc)
  return fs.writeFile(filePath, fileBody)
}
