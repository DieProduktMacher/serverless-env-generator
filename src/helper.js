'use strict'

const kms = require('./kms')
const path = require('path')
const yaml = require('./yaml')

const ENCRYPT_PREFIX = 'encrypted:'

// Reads & pre-processes env-vars for the specified stage from a YAML-document
const collectEnvVars = (doc, stage) => {
  var envVars = []
  if (doc && stage in doc) {
    Object.keys(doc[stage]).forEach(attribute => {
      var value = doc[stage][attribute]
      let encrypted = (typeof value === 'string' && value.indexOf(ENCRYPT_PREFIX) === 0)
      if (encrypted) value = value.substr(ENCRYPT_PREFIX.length)
      envVars.push({ attribute, value, encrypted })
    })
  }
  return envVars
}

// Reads environment files and returns the env-vars for the specified stage
const readEnvYamlFiles = (filePaths, stage) => {
  return Promise.all(filePaths.map(filePath => {
    return yaml.read(filePath).then(doc => {
      let file = path.basename(filePath)
      let vars = collectEnvVars(doc, stage)
      return { file, filePath, doc, vars }
    })
  }))
}

// Helper to filter env-vars by attribute
const filterEnvVars = (envFiles, attribute) => {
  envFiles.forEach(envFile => {
    envFile.vars = envFile.vars.filter(_ => _.attribute === attribute)
  })
  return envFiles.filter(_ => _.vars.length > 0)
}

// Helper to decrypt all env vars
const decryptEnvVars = (envFiles, config) => {
  return Promise.all(envFiles.map(envFile => {
    return Promise.all(envFile.vars.map(envVar =>
      envVar.encrypted
        ? kms.decrypt(envVar.value, config).then(value => Object.assign({}, envVar, { value }))
        : Promise.resolve(envVar)
    )).then(vars =>
      Object.assign({}, envFile, { vars })
    )
  }))
}

// Returns all env-files with the env-vars
// The optional attribute allows you to limit the returned env-vars to a single attribute
module.exports.getEnvVars = (attribute, decrypt, config) => {
  return readEnvYamlFiles(config.yamlPaths, config.stage).then(
    envFiles => (attribute) ? filterEnvVars(envFiles, attribute) : envFiles
  ).then(
    envFiles => (decrypt) ? decryptEnvVars(envFiles, config) : envFiles
  )
}

// Sets the env variable
module.exports.setEnvVar = (attribute, value, encrypt, config) => {
  let filePath = config.yamlPaths[0]
  if (!filePath) {
    return Promise.reject(new Error('No environment files specified in serverless.yml'))
  }
  return Promise.all([
    yaml.read(filePath).catch(error => error.code === 'ENOENT' ? {} : Promise.reject(error)),
    (encrypt) ? kms.encrypt(value, config) : Promise.resolve(value)
  ]).then(args => {
    let doc = Object.assign({}, args[0])
    let value = args[1]
    doc[config.stage] = Object.assign({}, doc[config.stage])
    doc[config.stage][attribute] = (encrypt) ? `${ENCRYPT_PREFIX}${value}` : value
    return yaml.write(filePath, doc)
  })
}
