'use strict';

const configHelper = require('./helper/config');
const generateArns = require('./helper/generate-arns');
const { upperSnakeCase } = require('../utils/string');

module.exports = class SNSHelper {

	/**
	 * @param {import('./types/config').SNSConfig} config
	 * @returns {Array} An array of SLS Helper hooks
	 */
	static buildHooks(config = {}) {

		this.validateConfigs(config);

		this.setConfigsWithDefaults(config);

		return [

			// Topic definition
			this.buildTopic(),

			// Topic publish permissions
			this.buildTopicPermissions()

		];
	}

	static getEnvVar(topicName) {
		return {
			[`${upperSnakeCase(topicName)}_SNS_TOPIC_ARN`]: generateArns(topicName).topic
		};
	}

	/**
	 * @param {import('./types/config').SNSConfig} config
	 * @private
	 */
	static validateConfigs(config) {
		configHelper.validate(config);
	}

	/**
	 * @param {import('./types/config').SNSConfig} userConfig
	 * @private
	 */
	static setConfigsWithDefaults(userConfig) {
		/** @private */
		this.topicProperties = userConfig.topic;
	}

	/**
	 * @private
	 */
	static buildTopic() {
		return ['resource', {
			name: `${this.topicProperties.name}Topic`,
			resource: {
				Type: 'AWS::SNS::Topic',
				Properties: {
					TopicName: this.topicProperties.name,
					DisplayName: `\${self:custom.serviceName} ${this.topicProperties.name}`
				}
			}
		}];
	}

	/**
	 * @private
	 */
	static buildTopicPermissions() {
		return ['iamStatement', {
			action: [
				'sns:Publish'
			],
			resource: generateArns(this.topicProperties.name).topic
		}];
	}

};
