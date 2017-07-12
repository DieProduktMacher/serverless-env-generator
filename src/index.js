'use strict'

const fs = require('fs-extra')
const path = require('path')
const helper = require('./helper.js')

class ServerlessPlugin {
  constructor (serverless, options) {
    this.serverless = serverless
    this.options = options || {}

    this.commands = {
      env: {
        usage: 'Configures environment variables',
        lifecycleEvents: [ 'env' ],
        options: {
          attribute: { usage: 'Name of the attribute', shortcut: 'a' },
          value: { usage: 'Value of the attribute', shortcut: 'v' },
          encrypt: { usage: 'Denotes that a variable should be encrypted', shortcut: 'e' },
          decrypt: { usage: 'Denotes that variables should be decrypted', shortcut: 'd' }
        }
      },
      'env-generate': {
        usage: 'Creates the .env file manually (DEPRECATED)',
        lifecycleEvents: [ 'write' ]
      }
    }

    this.hooks = {
      'env:env': this.envCommand.bind(this),
      'env-generate:write': this.writeDotEnvFile.bind(this),
      'before:deploy:function:packageFunction': this.writeDotEnvFile.bind(this),
      'after:deploy:function:packageFunction': this.removeDotEnvFile.bind(this),
      'before:deploy:createDeploymentArtifacts': this.writeDotEnvFile.bind(this),
      'after:deploy:createDeploymentArtifacts': this.removeDotEnvFile.bind(this),
      'before:invoke:local:invoke': this.addToProviderEnvironment.bind(this),
      'before:local-dev-server:start': this.addToProviderEnvironment.bind(this)
    }
  }

  envCommand () {
    let config = this.getConfig()
    if (this.options.value && this.options.attribute) {
      return helper.setEnvVar(this.options.attribute, this.options.value, !!this.options.encrypt, config).then(_ => {
        this.serverless.cli.log(`Successfuly set ${this.options.attribute} 🎉`)
      })
    } else if (this.options.value) {
      return Promise.reject(new Error('Setting a value requires --attribute'))
    } else {
      return helper.getEnvVars(this.options.attribute, !!this.options.decrypt, config).then(envFiles => {
        envFiles.forEach(envFile => {
          this.serverless.cli.log(`${envFile.file}:`)
          envFile.vars.forEach(envVar => {
            let valueText = envVar.encrypted ? (this.options.decrypt ? `${envVar.value} (encrypted)` : '******') : envVar.value
            this.serverless.cli.log(`  ${envVar.attribute}: ${valueText}`)
          })
        })
      })
    }
  }

  writeDotEnvFile () {
    let config = this.getConfig()
    this.serverless.cli.log('Creating .env file...')
    return helper.getEnvVars(undefined, true, config).then(envFiles => {
      var lines = []
      envFiles.forEach(envFile => {
        envFile.vars.forEach(envVar => {
          lines.push(`${envVar.attribute}=${envVar.value}`)
        })
      })
      return fs.writeFile(config.dotEnvPath, lines.join('\n'))
    })
  }

  removeDotEnvFile () {
    let config = this.getConfig()
    return fs.remove(config.dotEnvPath).then(_ => {
      this.serverless.cli.log('Removed .env file')
    })
  }

  addToProviderEnvironment () {
    let config = this.getConfig()
    var providerEnvironment = this.serverless.service.provider.environment || {}
    var yamlEnvironment = {}
    this.serverless.cli.log('Integrating YAML environemnt variables…')
    return helper.getEnvVars(undefined, true, config).then(envFiles => {
      envFiles.forEach(envFile => {
        envFile.vars.forEach(envVar => {
          if (!(envVar.attribute in providerEnvironment)) {
            yamlEnvironment[envVar.attribute] = envVar.value
          } else {
            this.serverless.cli.log(`Warning: Variable '${envVar.attribute}' is already defined in serverless.yml`)
          }
        })
      })
      this.serverless.service.provider.environment = Object.assign({}, yamlEnvironment, providerEnvironment)
    })
  }

  getConfig () {
    if (!this.config) {
      let servicePath = this.serverless.config.servicePath || '/'
      let stage = this.serverless.processedInput.options.stage || this.serverless.service.provider.stage
      let keyId = this.serverless.service.custom.envEncryptionKeyId
      this.config = {
        region: this.serverless.processedInput.options.region || this.serverless.service.provider.region,
        profile: this.serverless.processedInput.options.profile || this.serverless.service.provider.profile,
        stage: stage,
        yamlPaths: this.serverless.service.custom.envFiles.map(envFile =>
          path.join(servicePath, envFile)
        ),
        dotEnvPath: path.join(servicePath, '.env'),
        kmsKeyId: (typeof keyId === 'object') ? keyId[stage] : keyId
      }
    }
    return this.config
  }
}

module.exports = ServerlessPlugin
