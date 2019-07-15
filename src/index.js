'use strict'

const fs = require('fs-extra')
const path = require('path')
const helper = require('./helper.js')
const dotenv = require('dotenv')

class ServerlessEnvGeneratorPlugin {
  constructor(serverless, options) {
    this.serverless = serverless
    this.options = options || {}

    this.commands = {
      env: {
        usage: 'Configures environment variables',
        lifecycleEvents: ['env'],
        options: {
          attribute: {
            usage: 'Name of the attribute',
            shortcut: 'a'
          },
          value: {
            usage: 'Value of the attribute',
            shortcut: 'v'
          },
          encrypt: {
            usage: 'Denotes that a variable should be encrypted',
            shortcut: 'e'
          },
          decrypt: {
            usage: 'Denotes that variables should be decrypted',
            shortcut: 'd'
          }
        },
        commands: {
          generate: {
            usage: 'Creates the .env file manually',
            lifecycleEvents: ['write']
          }
        }
      }
    }

    this.hooks = {
      'env:env': this.envCommand.bind(this),
      'env:generate:write': this.writeDotEnvFile.bind(this),
      'invoke:test:test': this.writeDotEnvFile.bind(this),
      'before:deploy:function:packageFunction': this.writeDotEnvFile.bind(this),
      'after:deploy:function:packageFunction': this.removeDotEnvFile.bind(this),
      'before:deploy:createDeploymentArtifacts': this.writeDotEnvFile.bind(this),
      'after:deploy:createDeploymentArtifacts': this.removeDotEnvFile.bind(this),
      'before:offline:start:init': this.setEnvironment.bind(this),
      'before:invoke:local:invoke': this.writeDotEnvFile.bind(this),
      'after:invoke:local:invoke': this.removeDotEnvFile.bind(this),
      'local-dev-server:loadEnvVars': this.setEnvironment.bind(this)
    }
  }

  envCommand() {
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

  writeDotEnvFile() {
    let config = this.getConfig()
    this.serverless.cli.log('Creating .env file...')
    process
      .on('exit', () => {
        if (fs.existsSync(config.dotEnvPath)) {
          fs.removeSync(config.dotEnvPath);
            this.serverless.cli.log('Removed .env file')
        }
      })
    return helper.getEnvVars(undefined, true, config).then(envFiles => {
      const environment = {}
      envFiles.forEach(envFile => {
        envFile.vars.forEach(envVar => {
          environment[envVar.attribute] = envVar.value
        })
      })
      const lines = Object.keys(environment).map(key => `${key}=${environment[key]}`)
      return fs.writeFile(config.dotEnvPath, lines.join('\n'))
    })
  }

  removeDotEnvFile() {
    let config = this.getConfig()
    return fs.remove(config.dotEnvPath).then(_ => {
      this.serverless.cli.log('Removed .env file')
    })
  }

  // Sets options.environment used by serverless-local-dev-server
  setEnvironment() {
    const config = this.getConfig()
    this.serverless.cli.log('Setting YAML environment variables …')
    return helper.getEnvVars(undefined, true, config).then(envFiles => {
      const environment = {}
      envFiles.forEach(envFile => {
        envFile.vars.forEach(envVar => {
          environment[envVar.attribute] = envVar.value
        })
      })
      this.options.environment = Object.assign(this.serverless.service.provider.environment, environment, dotenv.config({ path: path.join(config.servicePath, '.env.local') }).parsed)
    })
  }

  getConfig() {
    if (!this.config) {
      let servicePath = this.serverless.config.servicePath || './'
      let stage = this.serverless.processedInput.options.stage || this.serverless.service.provider.stage
      let keyId = this.serverless.service.custom.envEncryptionKeyId
      this.config = {
        region: this.serverless.processedInput.options.region || this.serverless.service.provider.region,
        profile: this.serverless.processedInput.options.profile || this.serverless.service.provider.profile,
        stage,
        servicePath,
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

module.exports = ServerlessEnvGeneratorPlugin
