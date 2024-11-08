/* eslint-disable max-len */

'use strict';

const util = require('node:util');

const generateNames = require('./helper/generate-names');

const {
	consumerDefaultsValue,
	mainQueueDefaultsValue,
	delayQueueDefaultsValue,
	dlqConsumerDefaultsValue,
	dlqQueueDefaultsValue,
	baseArn,
	baseUrl
} = require('./helper/default');

const { defaultTags } = require('../utils/default-tags');
const { isObject } = require('../utils/is-object');
const fixFifoName = require('./helper/fix-fifo-name');
const generateArns = require('./helper/generate-arns');
const generateSnsArns = require('../sns-helper/helper/generate-arns');
const { SQSTypes } = require('./helper/sqs-types');

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
				'sqs:GetQueueAttributes'
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

		return [

			...this.getSQSUrlEnvVars(),

			this.buildConsumerFunction(this.consumerProperties, { mainConsumer: true }),

			this.buildQueueResource(this.mainQueueProperties, { mainQueue: true }),

			...delayHooks,

			this.buildQueueResource(this.dlqQueueProperties, { dlq: true }),

			...this.shouldAddConsumer(this.dlqConsumerProperties)
				? [this.buildConsumerFunction(this.dlqConsumerProperties, { dlqConsumer: true })]
				: [],

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
			['DLQ Consumer', configs.dlqConsumerProperties],
			['DLQ Queue', configs.dlqQueueProperties]
		].forEach(([type, properties]) => {
			if(properties && (typeof properties !== 'object' || Array.isArray(properties)))
				throw new Error(`${type} Properties must be an Object with configuration in SQS helper`);
		});

		if(configs.sourceSnsTopic) {

			if(typeof configs.sourceSnsTopic.name !== 'string')
				throw new Error(`sourceSnsTopic.name must be a String in SQS helper. Received ${util.inspect(configs.sourceSnsTopic.name)}`);

			if(configs.sourceSnsTopic.filterPolicy && !isObject(configs.sourceSnsTopic.filterPolicy))
				throw new Error(`sourceSnsTopic.filterPolicy must be an object in SQS helper. Received ${util.inspect(configs.sourceSnsTopic.filterPolicy)}`);

		}
	}

	static setConfigsWithDefaults(userConfigs) {

		this.consumerProperties = { ...consumerDefaultsValue, ...userConfigs.consumerProperties };
		this.mainQueueProperties = { ...mainQueueDefaultsValue, ...userConfigs.mainQueueProperties };

		// delay queue and consumer uses main config by default
		this.delayConsumerProperties = { ...consumerDefaultsValue, ...userConfigs.delayConsumerProperties };
		this.delayQueueProperties = { ...delayQueueDefaultsValue, ...userConfigs.delayQueueProperties };

		this.dlqConsumerProperties = userConfigs.dlqConsumerProperties ? { ...dlqConsumerDefaultsValue, ...userConfigs.dlqConsumerProperties } : null;
		this.dlqQueueProperties = { ...dlqQueueDefaultsValue, ...userConfigs.dlqQueueProperties };

		this.fifoQueue = !!userConfigs.mainQueueProperties?.fifoQueue;
		this.useDelayQueue = !!userConfigs.delayQueueProperties;

		this.sourceSnsTopic = userConfigs.sourceSnsTopic;

		this.names = generateNames(userConfigs.name);

		this.arns = generateArns(this.names, this.fifoQueue);
	}

	static shouldAddConsumer(consumerProperties) {
		return consumerProperties
			&& Object.keys(consumerProperties).length
			&& !consumerProperties.useMainHandler;
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
		eventProperties
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
				this.createEventSource(queueArn, { batchSize, maximumBatchingWindow, eventProperties }),
				...mainConsumer && this.delayConsumerProperties?.useMainHandler ? [this.createEventSource(this.arns.delayQueue, this.delayConsumerProperties)] : [],
				...mainConsumer && this.dlqConsumerProperties?.useMainHandler ? [this.createEventSource(this.arns.dlq, this.dlqConsumerProperties)] : []
			],
			...functionProperties
		}];
	}

	static createEventSource(arn, {
		batchSize,
		maximumBatchingWindow,
		eventProperties
	}) {
		return {
			sqs: {
				arn,
				functionResponseType: 'ReportBatchItemFailures',
				...batchSize && { batchSize },
				...maximumBatchingWindow && { maximumBatchingWindow },
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
		dlq,
		delayQueue
	}) {

		let name;
		let deadLetterTargetArn;
		let dependsOn;

		if(mainQueue) {
			name = this.names.mainQueue;
			deadLetterTargetArn = this.useDelayQueue ? this.arns.delayQueue : this.arns.dlq;
			dependsOn = this.useDelayQueue ? this.names.delayQueue : this.names.dlq;
		} else if(delayQueue) {
			name = this.names.delayQueue;
			deadLetterTargetArn = this.arns.dlq;
			dependsOn = this.names.dlq;
		} else {
			// dlq
			name = this.names.dlq;
		}

		let SQSType;
		if(dlq)
			SQSType = SQSTypes.DLQ;
		else if(delayQueue)
			SQSType = SQSTypes.Delay;
		else
			SQSType = SQSTypes.Main;

		const hasConsumer = this.queueHasConsumer(SQSType) ? 'true' : 'false';

		return ['resource', {
			name,
			resource: {
				Type: 'AWS::SQS::Queue',
				Properties: {
					QueueName: `\${self:custom.serviceName}${fixFifoName(name, this.fifoQueue)}`,
					ReceiveMessageWaitTimeSeconds: receiveMessageWaitTimeSeconds,
					VisibilityTimeout: visibilityTimeout,
					// eslint-disable-next-line max-len
					...deadLetterTargetArn && {
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
						{ Key: 'HasConsumer', Value: hasConsumer },
						...addTags || []
					],
					...extraProperties
				},
				...dependsOn && { DependsOn: [dependsOn] }
			}
		}];
	}

	static queueHasConsumer(queueType) {

		if(queueType === SQSTypes.Main)
			return true;

		if(queueType === SQSTypes.Delay)
			return this.shouldAddConsumer(this.delayConsumerProperties) || this.delayConsumerProperties?.useMainHandler;

		if(queueType === SQSTypes.DLQ)
			return this.shouldAddConsumer(this.dlqConsumerProperties) || this.dlqConsumerProperties?.useMainHandler;

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
										ArnEquals: {
											'aws:SourceArn': generateSnsArns(this.sourceSnsTopic.name).topic
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

		return [
			['resource', {
				name: `SubSNS${this.sourceSnsTopic.name}SQS${this.names.titleName}`,
				resource: {
					Type: 'AWS::SNS::Subscription',
					Properties: {
						Protocol: 'sqs',
						Endpoint: this.arns.mainQueue,
						RawMessageDelivery: true,
						TopicArn: generateSnsArns(this.sourceSnsTopic.name).topic,
						...this.sourceSnsTopic.filterPolicy && { FilterPolicy: this.sourceSnsTopic.filterPolicy }
					},
					DependsOn: [this.names.mainQueue]
				}
			}]
		];
	}
};
