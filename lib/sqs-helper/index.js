/* eslint-disable max-len */

'use strict';

const util = require('node:util');

const generateNames = require('./helper/generate-names');

const {
	consumerDefaultsValue,
	mainQueueDefaultsValue,
	delayQueueDefaultsValue,
	dlqQueueDefaultsValue,
	dlqConsumerDefaultsValue,
	archiveDLQQueueDefaultsValue,
	baseArn,
	baseUrl
} = require('./helper/default');

const { defaultTags } = require('../utils/default-tags');
const { isObject } = require('../utils/is-object');
const fixFifoName = require('./helper/fix-fifo-name');
const generateArns = require('./helper/generate-arns');
const generateSnsArns = require('../sns-helper/helper/generate-arns');
const { SQSTypes } = require('./helper/sqs-types');
const { snsTopicScopes } = require('../utils/sns-topic-scopes');
const { isLocal } = require('../utils/is-local');
const { isLowEnv } = require('../utils/is-low-env');

module.exports = class SQSHelper {

	/** @private */
	static get setGlobalEnvVars() {
		return this._setGlobalEnvVars ?? true;
	}

	/** @private */
	static set setGlobalEnvVars(setGlobalEnvVars) {
		/** @private */
		this._setGlobalEnvVars = setGlobalEnvVars;
	}

	static get sqsPermissions() {
		return ['iamStatement', {
			action: [
				'sqs:SendMessage',
				'sqs:DeleteMessage',
				'sqs:ReceiveMessage',
				'sqs:GetQueueAttributes',
				'sqs:ChangeMessageVisibility'
			],
			// eslint-disable-next-line no-template-curly-in-string
			resource: `${baseArn}:*`
		}];
	}

	static shouldSetGlobalEnvVars(setGlobalEnvVars) {
		this.setGlobalEnvVars = setGlobalEnvVars;
	}

	static getEnvVar(queueName, isFifoQueue) {

		const { mainQueue, envVarName } = generateNames(queueName);

		return {
			[`${envVarName}_SQS_QUEUE_URL`]: `${baseUrl}\${self:custom.serviceName}${fixFifoName(mainQueue, isFifoQueue)}`
		};
	}

	static buildHooks(configs = {}) {

		this.validateConfigs(configs);

		this.setConfigsWithDefaults(configs);

		const delayHooks = [];

		if(this.useDelayQueue) {

			// is used this.delayConsumerProperties cause must have a consumer (the own consumer or the main consumer)
			// this.delayConsumerProperties has default mainConsumer configs
			if(this.shouldAddConsumer(this.delayConsumerProperties))
				delayHooks.push(this.buildConsumerFunction(this.delayConsumerProperties, { delayConsumer: true }));

			delayHooks.push(this.buildQueueResource(this.delayQueueProperties, { delayQueue: true }));
		}

		const dlqConsumerHooks = [];

		if(this.shouldAddConsumer(this.dlqConsumerProperties)) {
			dlqConsumerHooks.push(this.buildConsumerFunction(this.dlqConsumerProperties, { dlqConsumer: true }));
			dlqConsumerHooks.push(this.buildQueueResource(this.archiveDLQQueueProperties, { archiveDlq: true }));
		}

		return [

			...this.getSQSUrlEnvVars(),

			this.buildConsumerFunction(this.consumerProperties, { mainConsumer: true }),

			this.buildQueueResource(this.mainQueueProperties, { mainQueue: true }),

			...delayHooks,

			this.buildQueueResource(this.dlqQueueProperties, { dlq: true }),

			...dlqConsumerHooks,

			...this.buildSnsPublishPolicy(),

			...this.buildSnsToSqsSubscription()
		];
	}

	static validateConfigs(configs) {

		if(!configs.name?.length)
			throw new Error('Missing or empty name hook configuration in SQS helper');

		[
			['Main Consumer', configs.consumerProperties],
			['Main Queue', configs.mainQueueProperties],
			['Delay Consumer', configs.delayConsumerProperties],
			['Delay Queue', configs.delayQueueProperties],
			['DLQ Queue', configs.dlqQueueProperties],
			['DLQ Consumer', configs.dlqConsumerProperties],
			['Archive DLQ Queue', configs.archiveDLQQueueProperties]
		].forEach(([type, properties]) => {
			if(properties && (typeof properties !== 'object' || Array.isArray(properties)))
				throw new Error(`${type} Properties must be an Object with configuration in SQS helper`);
		});

		if(configs.sourceSnsTopic) {

			const sourceSnsTopics = Array.isArray(configs.sourceSnsTopic) ? configs.sourceSnsTopic : [configs.sourceSnsTopic];

			for(const sourceSnsTopic of sourceSnsTopics) {

				if(sourceSnsTopic.scope && !snsTopicScopes[sourceSnsTopic.scope])
					throw new Error(`sourceSnsTopic.scope must be one of [${Object.values(snsTopicScopes)}] in SQS helper. Received ${util.inspect(sourceSnsTopic.scope)}`);

				if(sourceSnsTopic.scope === snsTopicScopes.remote) {
					if(!sourceSnsTopic.serviceCode || typeof sourceSnsTopic.serviceCode !== 'string')
						throw new Error(`sourceSnsTopic.serviceCode must be a String in SQS helper. Received ${util.inspect(sourceSnsTopic.serviceCode)}`);
				} else if(sourceSnsTopic.serviceCode)
					throw new Error(`sourceSnsTopic.serviceCode is only allowed when scope is ${snsTopicScopes.remote} in SQS helper. Received ${util.inspect(sourceSnsTopic)}`);

				if(typeof sourceSnsTopic.name !== 'string')
					throw new Error(`sourceSnsTopic.name must be a String in SQS helper. Received ${util.inspect(sourceSnsTopic.name)}`);

				if(sourceSnsTopic.filterPolicy && !isObject(sourceSnsTopic.filterPolicy))
					throw new Error(`sourceSnsTopic.filterPolicy must be an object in SQS helper. Received ${util.inspect(sourceSnsTopic.filterPolicy)}`);

			}

		}
	}

	static setConfigsWithDefaults(userConfigs) {

		this.consumerProperties = { ...consumerDefaultsValue, ...userConfigs.consumerProperties };
		this.mainQueueProperties = { ...mainQueueDefaultsValue, ...userConfigs.mainQueueProperties };

		// delay queue and consumer uses main config by default
		this.delayConsumerProperties = { ...consumerDefaultsValue, ...userConfigs.delayConsumerProperties };
		this.delayQueueProperties = { ...delayQueueDefaultsValue, ...userConfigs.delayQueueProperties };

		this.dlqQueueProperties = { ...dlqQueueDefaultsValue, ...userConfigs.dlqQueueProperties };
		this.dlqConsumerProperties = userConfigs.dlqConsumerProperties ? { ...dlqConsumerDefaultsValue, ...userConfigs.dlqConsumerProperties } : null;
		this.archiveDLQQueueProperties = { ...archiveDLQQueueDefaultsValue, ...userConfigs.archiveDLQQueueProperties };

		if(isLowEnv()) {
			this.adjustConsumerForLowEnv(this.consumerProperties);
			this.adjustConsumerForLowEnv(this.delayConsumerProperties);
			this.adjustConsumerForLowEnv(this.dlqConsumerProperties);
		}

		this.fifoQueue = !!userConfigs.mainQueueProperties?.fifoQueue;
		this.useDelayQueue = !!userConfigs.delayQueueProperties;

		if(userConfigs.sourceSnsTopic)
			this.sourceSnsTopic = Array.isArray(userConfigs.sourceSnsTopic) ? userConfigs.sourceSnsTopic : [userConfigs.sourceSnsTopic];
		else
			// Clear static property
			this.sourceSnsTopic = null;

		this.names = generateNames(userConfigs.name);

		this.arns = generateArns(this.names, this.fifoQueue);
	}

	static shouldAddConsumer(consumerProperties) {
		return consumerProperties
			&& Object.keys(consumerProperties).length
			&& !consumerProperties.useMainHandler;
	}

	static adjustConsumerForLowEnv(consumerProperties) {

		if(!consumerProperties || consumerProperties.keepBatchingWindow)
			return;

		if(consumerProperties.maximumBatchingWindow) {
			consumerProperties.maximumBatchingWindow = 0;

			if(consumerProperties.batchSize > 10)
				consumerProperties.batchSize = 10;
		}
	}

	static getSQSUrlEnvVars() {

		if(!this.setGlobalEnvVars)
			return [];

		const globalEnvVars = {};

		if(this.mainQueueProperties.generateEnvVars)
			globalEnvVars[`${this.names.envVarName}_SQS_QUEUE_URL`] = `${baseUrl}\${self:custom.serviceName}${fixFifoName(this.names.mainQueue, this.fifoQueue)}`;

		if(this.delayQueueProperties.generateEnvVars)
			globalEnvVars[`${this.names.envVarName}_DELAY_QUEUE_URL`] = `${baseUrl}\${self:custom.serviceName}${fixFifoName(this.names.delayQueue, this.fifoQueue)}`;

		if(this.dlqQueueProperties.generateEnvVars)
			globalEnvVars[`${this.names.envVarName}_DLQ_QUEUE_URL`] = `${baseUrl}\${self:custom.serviceName}${fixFifoName(this.names.dlq, this.fifoQueue)}`;

		if(!Object.keys(globalEnvVars).length)
			return [];

		return [
			['envVars', globalEnvVars]
		];
	}

	static buildConsumerFunction({
		timeout,
		handler,
		description,
		maximumBatchingWindow,
		batchSize,
		prefixPath,
		functionProperties,
		rawProperties,
		eventProperties,
		maximumConcurrency
	}, {
		mainConsumer,
		delayConsumer
	}) {

		let { filename, titleName: functionName } = this.names;

		let queueArn;
		let dependsOn;

		if(mainConsumer) {
			queueArn = this.arns.mainQueue;
			dependsOn = this.names.mainQueue;
		} else if(delayConsumer) {
			queueArn = this.arns.delayQueue;
			dependsOn = this.names.delayQueue;
			functionName = `${functionName}Delay`;
			filename = `${filename}-delay`;
		} else {
			// dlq consumer
			queueArn = this.arns.dlq;
			dependsOn = this.names.dlq;
			functionName = `${functionName}DLQ`;
			filename = `${filename}-dlq`;
		}

		if(prefixPath)
			filename = `${prefixPath}/${filename}`;

		return ['function', {
			functionName: `${functionName}QueueConsumer`,
			handler: handler || `src/sqs-consumer/${filename}-consumer.handler`,
			description: description || `${functionName} SQS Queue Consumer`,
			timeout,
			rawProperties: {
				dependsOn: [dependsOn],
				...rawProperties
			},
			events: [
				this.createEventSource(queueArn, { batchSize, maximumBatchingWindow, maximumConcurrency, eventProperties }),
				...mainConsumer && this.delayConsumerProperties?.useMainHandler ? [this.createEventSource(this.arns.delayQueue, this.delayConsumerProperties)] : [],
				...mainConsumer && this.dlqConsumerProperties?.useMainHandler ? [this.createEventSource(this.arns.dlq, this.dlqConsumerProperties)] : []
			],
			...functionProperties
		}];
	}

	static createEventSource(arn, {
		batchSize,
		maximumBatchingWindow,
		maximumConcurrency, // Default
		eventProperties
	}) {
		return {
			sqs: {
				arn,
				functionResponseType: 'ReportBatchItemFailures',
				...batchSize && { batchSize },
				...Number.isInteger(maximumBatchingWindow) && { maximumBatchingWindow },
				...!eventProperties?.maximumConcurrency && { maximumConcurrency },
				...eventProperties
			}
		};
	}

	static buildQueueResource({
		maxReceiveCount,
		receiveMessageWaitTimeSeconds,
		visibilityTimeout,
		messageRetentionPeriod,
		delaySeconds,
		fifoQueue,
		fifoThroughputLimit,
		contentBasedDeduplication,
		deduplicationScope,
		addTags,
		generateEnvVars,
		...extraProperties
	}, {
		mainQueue,
		delayQueue,
		dlq,
		archiveDlq
	}) {

		let name;
		let deadLetterTargetArn;
		let dependsOn;

		let SQSType;
		if(dlq)
			SQSType = SQSTypes.DLQ;
		else if(delayQueue)
			SQSType = SQSTypes.Delay;
		else if(mainQueue)
			SQSType = SQSTypes.Main;
		else
			SQSType = SQSTypes.ArchiveDLQ;

		const hasConsumer = this.queueHasConsumer(SQSType);

		if(mainQueue) {
			name = this.names.mainQueue;
			deadLetterTargetArn = this.useDelayQueue ? this.arns.delayQueue : this.arns.dlq;
			dependsOn = this.useDelayQueue ? this.names.delayQueue : this.names.dlq;
		} else if(delayQueue) {
			name = this.names.delayQueue;
			deadLetterTargetArn = this.arns.dlq;
			dependsOn = this.names.dlq;
		} else if(archiveDlq)
			name = this.names.archiveDlq;
		else {
			// dlq
			name = this.names.dlq;
			deadLetterTargetArn = this.arns.archiveDlq;
			if(hasConsumer)
				dependsOn = this.names.archiveDlq;
		}

		return ['resource', {
			name,
			resource: {
				Type: 'AWS::SQS::Queue',
				Properties: {
					QueueName: `\${self:custom.serviceName}${fixFifoName(name, this.fifoQueue)}`,
					ReceiveMessageWaitTimeSeconds: receiveMessageWaitTimeSeconds,
					VisibilityTimeout: visibilityTimeout,
					// eslint-disable-next-line max-len
					...deadLetterTargetArn && hasConsumer && {
						RedrivePolicy: JSON.stringify({ maxReceiveCount, deadLetterTargetArn })
					},
					...messageRetentionPeriod && { MessageRetentionPeriod: messageRetentionPeriod },
					...delaySeconds && { DelaySeconds: delaySeconds },
					...this.fifoQueue && { FifoQueue: true },
					...this.fifoQueue && fifoThroughputLimit && { FifoThroughputLimit: fifoThroughputLimit },
					...this.fifoQueue && deduplicationScope && { DeduplicationScope: deduplicationScope },
					...this.fifoQueue && contentBasedDeduplication && { ContentBasedDeduplication: true },
					Tags: [
						...defaultTags,
						{ Key: 'ResourceSet', Value: this.names.titleName },
						{ Key: 'SQSType', Value: SQSType },
						{ Key: 'HasConsumer', Value: hasConsumer.toString() },
						...addTags || []
					],
					...extraProperties
				},
				...dependsOn && { DependsOn: [dependsOn] }
			}
		}];
	}

	/**
	 * @param {string} queueType
	 * @returns {boolean}
	 */
	static queueHasConsumer(queueType) {

		if(queueType === SQSTypes.Main)
			return true;

		if(queueType === SQSTypes.Delay)
			return !!(this.shouldAddConsumer(this.delayConsumerProperties) || this.delayConsumerProperties?.useMainHandler);

		/* istanbul ignore else */
		if(queueType === SQSTypes.DLQ)
			return !!(this.shouldAddConsumer(this.dlqConsumerProperties) || this.dlqConsumerProperties?.useMainHandler);

		/* istanbul ignore next */
		return false;
	}

	static buildSnsPublishPolicy() {

		if(!this.sourceSnsTopic)
			return [];

		return [
			['resource', {
				name: this.names.mainQueuePolicy,
				resource: {
					Type: 'AWS::SQS::QueuePolicy',
					Properties: {
						Queues: [
							`${baseUrl}\${self:custom.serviceName}${fixFifoName(this.names.mainQueue, this.fifoQueue)}`
						],
						PolicyDocument: {
							Version: '2012-10-17',
							Statement: [
								{
									Effect: 'Allow',
									Action: 'sqs:SendMessage',
									Resource: this.arns.mainQueue,
									Principal: {
										Service: 'sns.amazonaws.com'
									},
									Condition: {
										'ForAnyValue:StringLike': {
											'aws:SourceOrgPaths': '${env:AWS_ORGANIZATIONAL_UNIT_PATH}'
										}
									}
								}
							]
						}
					},
					DependsOn: [this.names.mainQueue]
				}
			}]
		];
	}

	static buildSnsToSqsSubscription() {

		if(!this.sourceSnsTopic)
			return [];

		return this.sourceSnsTopic
			.filter(sourceSnsTopic => !isLocal() || sourceSnsTopic.scope !== snsTopicScopes.remote)
			.map(sourceSnsTopic => ['resource', {
				name: `SubSNS${sourceSnsTopic.name}SQS${this.names.titleName}`,
				resource: {
					Type: 'AWS::SNS::Subscription',
					Properties: {
						Protocol: 'sqs',
						Endpoint: this.arns.mainQueue,
						RawMessageDelivery: true,
						TopicArn: generateSnsArns({
							...sourceSnsTopic,
							fifoTopic: this.fifoQueue // Automatically set FIFO based on SQS configuration. This ensures proper integration: FIFO SQS ↔ FIFO SNS, Standard SQS ↔ Standard SNS.
						}).topic,
						...sourceSnsTopic.filterPolicy && { FilterPolicy: sourceSnsTopic.filterPolicy }
					},
					DependsOn: [this.names.mainQueue]
				}
			}]);
	}
};
