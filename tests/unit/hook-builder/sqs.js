'use strict';

const assert = require('assert').strict;

const SQSHelper = require('../../../lib/sqs-helper');
const { snsTopicScopes } = require('../../../lib/utils/sns-topic-scopes');

describe('Hook Builder Helpers', () => {

	const originalEnvs = { ...process.env };

	afterEach(() => {
		process.env = { ...originalEnvs };
	});

	describe('SQS', () => {

		context('Get Permission\'s Hook', () => {

			it('Should return the Permission Hook', () => {

				assert.deepStrictEqual(SQSHelper.sqsPermissions, ['iamStatement', {
					action: [
						'sqs:SendMessage',
						'sqs:DeleteMessage',
						'sqs:ReceiveMessage',
						'sqs:GetQueueAttributes',
						'sqs:ChangeMessageVisibility'
					],
					// eslint-disable-next-line no-template-curly-in-string
					resource: 'arn:aws:sqs:${aws:region}:${aws:accountId}:*'
				}]);
			});
		});

		context('Queue env var getter', () => {

			it('Should return the env var with the main queue URL based on the queue name', () => {

				assert.deepStrictEqual(SQSHelper.getEnvVar('Test'), {
					TEST_SQS_QUEUE_URL: 'https://sqs.${aws:region}.amazonaws.com/${aws:accountId}/${self:custom.serviceName}TestQueue'
				});
			});
		});

		context('SQS properties validations', () => {

			it('Should throw if SQS Helper not received name', () => {

				assert.throws(() => SQSHelper.buildHooks(), {
					message: 'Missing or empty name hook configuration in SQS helper'
				});
			});

			it('Should throw if SQS Helper received empty name ', () => {

				assert.throws(() => SQSHelper.buildHooks({ name: '' }), {
					message: 'Missing or empty name hook configuration in SQS helper'
				});
			});

			[
				['Main Consumer', { consumerProperties: 'invalid' }],
				['Main Queue', { mainQueueProperties: 'invalid' }],
				['Delay Consumer', { delayConsumerProperties: 'invalid' }],
				['Delay Queue', { delayQueueProperties: 'invalid' }],
				['DLQ Consumer', { dlqConsumerProperties: 'invalid' }],
				['DLQ Queue', { dlqQueueProperties: 'invalid' }]
			].forEach(([type, data]) => {

				it(`Should throw if SQS Helper received invalid ${type} data`, () => {

					assert.throws(() => SQSHelper.buildHooks({ name: 'test', ...data }), {
						message: `${type} Properties must be an Object with configuration in SQS helper`
					});
				});
			});

			[
				['Main Consumer', { consumerProperties: ['invalid'] }],
				['Main Queue', { mainQueueProperties: ['invalid'] }],
				['Delay Consumer', { delayConsumerProperties: ['invalid'] }],
				['Delay Queue', { delayQueueProperties: ['invalid'] }],
				['DLQ Consumer', { dlqConsumerProperties: ['invalid'] }],
				['DLQ Queue', { dlqQueueProperties: ['invalid'] }]
			].forEach(([type, data]) => {

				it(`Should throw if SQS Helper received an array ${type} data`, () => {

					assert.throws(() => SQSHelper.buildHooks({ name: 'test', ...data }), {
						message: `${type} Properties must be an Object with configuration in SQS helper`
					});
				});
			});

			it('Should throw if source SNS Topic name is not a string', () => {

				assert.throws(() => SQSHelper.buildHooks({
					name: 'test',
					sourceSnsTopic: {
						name: true
					}
				}), {
					message: 'sourceSnsTopic.name must be a String in SQS helper. Received true'
				});
			});

			it('Should throw if source SNS Topic scope is not a string', () => {

				assert.throws(() => SQSHelper.buildHooks({
					name: 'test',
					sourceSnsTopic: {
						name: 'TestTopic',
						scope: true
					}
				}), {
					message: 'sourceSnsTopic.scope must be one of [remote,local] in SQS helper. Received true'
				});
			});

			it('Should throw if source SNS Topic scope is not a valid option', () => {

				assert.throws(() => SQSHelper.buildHooks({
					name: 'test',
					sourceSnsTopic: {
						name: 'TestTopic',
						scope: 'unknownScope'
					}
				}), {
					message: 'sourceSnsTopic.scope must be one of [remote,local] in SQS helper. Received \'unknownScope\''
				});
			});

			it('Should throw if source SNS Topic remote serviceCode is not a string', () => {

				assert.throws(() => SQSHelper.buildHooks({
					name: 'test',
					sourceSnsTopic: {
						name: 'TestTopic',
						scope: snsTopicScopes.remote,
						serviceCode: true
					}
				}), {
					message: 'sourceSnsTopic.serviceCode must be a String in SQS helper. Received true'
				});
			});

			it('Should throw if source SNS Topic serviceCode is set but scope is not remote', () => {

				assert.throws(() => SQSHelper.buildHooks({
					name: 'test',
					sourceSnsTopic: {
						name: 'TestTopic',
						serviceCode: true
					}
				}), {
					message: 'sourceSnsTopic.serviceCode is only allowed when scope is remote in SQS helper. Received { name: \'TestTopic\', serviceCode: true }'
				});
			});

			it('Should throw if source SNS Topic filter policy is not an object', () => {

				assert.throws(() => SQSHelper.buildHooks({
					name: 'test',
					sourceSnsTopic: {
						name: 'TestTopic',
						filterPolicy: ['notAnObject']
					}
				}), {
					message: 'sourceSnsTopic.filterPolicy must be an object in SQS helper. Received [ \'notAnObject\' ]'
				});
			});

		});

		const mainConsumerFunctionHook = ['function', {
			functionName: 'TestQueueConsumer',
			handler: 'src/sqs-consumer/test-consumer.handler',
			description: 'Test SQS Queue Consumer',
			timeout: 15,
			rawProperties: {
				dependsOn: ['TestQueue']
			},
			events: [
				{
					sqs: {
						arn: 'arn:aws:sqs:${aws:region}:${aws:accountId}:${self:custom.serviceName}TestQueue',
						functionResponseType: 'ReportBatchItemFailures',
						batchSize: 10,
						maximumBatchingWindow: 20,
						maximumConcurrency: 10
					}
				}
			]
		}];

		const queueTags = name => [
			{
				Key: 'Owner',
				Value: 'Janis'
			},
			{
				Key: 'Microservice',
				Value: '${self:custom.serviceName}'
			},
			{
				Key: 'Stack',
				Value: '${param:humanReadableStage}'
			},
			{
				Key: 'ResourceSet',
				Value: name
			}
		];

		const mainQueueTags = name => [
			...queueTags(name),
			{
				Key: 'SQSType',
				Value: 'Main'
			},
			{
				Key: 'HasConsumer',
				Value: 'true'
			}
		];

		const dlqTags = (name, hasConsumer) => [
			...queueTags(name),
			{
				Key: 'SQSType',
				Value: 'DLQ'
			},
			{
				Key: 'HasConsumer',
				Value: hasConsumer?.toString() || 'false'
			}
		];

		const mainQueueHook = ['resource', {
			name: 'TestQueue',
			resource: {
				Type: 'AWS::SQS::Queue',
				Properties: {
					QueueName: '${self:custom.serviceName}TestQueue',
					ReceiveMessageWaitTimeSeconds: 20,
					VisibilityTimeout: 90,
					// eslint-disable-next-line max-len
					RedrivePolicy: '{"maxReceiveCount":5,"deadLetterTargetArn":"arn:aws:sqs:${aws:region}:${aws:accountId}:${self:custom.serviceName}TestDLQ"}',
					Tags: mainQueueTags('Test')
				},
				DependsOn: ['TestDLQ']
			}
		}];

		const dlqQueueHook = hasConsumer => ['resource', {
			name: 'TestDLQ',
			resource: {
				Type: 'AWS::SQS::Queue',
				...hasConsumer && { DependsOn: ['TestArchiveDLQ'] },
				Properties: {
					QueueName: '${self:custom.serviceName}TestDLQ',
					ReceiveMessageWaitTimeSeconds: 20,
					...hasConsumer && {
						RedrivePolicy: JSON.stringify({
							maxReceiveCount: 5,
							deadLetterTargetArn: 'arn:aws:sqs:${aws:region}:${aws:accountId}:${self:custom.serviceName}TestArchiveDLQ'
						})
					},
					VisibilityTimeout: 90,
					MessageRetentionPeriod: 864000,
					Tags: dlqTags('Test', hasConsumer)
				}
			}
		}];

		const sqsUrlEnvVarsHook = ['envVars', {
			TEST_SQS_QUEUE_URL: 'https://sqs.${aws:region}.amazonaws.com/${aws:accountId}/${self:custom.serviceName}TestQueue'
		}];

		const queuePolicyHook = ['resource', {
			name: 'TestQueuePolicy',
			resource: {
				Type: 'AWS::SQS::QueuePolicy',
				Properties: {
					Queues: [
						'https://sqs.${aws:region}.amazonaws.com/${aws:accountId}/${self:custom.serviceName}TestQueue'
					],
					PolicyDocument: {
						Version: '2012-10-17',
						Statement: [
							{
								Effect: 'Allow',
								Action: 'sqs:SendMessage',
								Resource: 'arn:aws:sqs:${aws:region}:${aws:accountId}:${self:custom.serviceName}TestQueue',
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
				DependsOn: ['TestQueue']
			}
		}];

		const snsSubscriptionHook = ['resource', {
			name: 'SubSNSTestTopicSQSTest',
			resource: {
				Type: 'AWS::SNS::Subscription',
				Properties: {
					Protocol: 'sqs',
					Endpoint: 'arn:aws:sqs:${aws:region}:${aws:accountId}:${self:custom.serviceName}TestQueue',
					RawMessageDelivery: true,
					TopicArn: 'arn:aws:sns:${aws:region}:${aws:accountId}:TestTopic'
				},
				DependsOn: ['TestQueue']
			}
		}];

		const secondSnsSubscriptionHook = ['resource', {
			name: 'SubSNSSecondTopicSQSTest',
			resource: {
				Type: 'AWS::SNS::Subscription',
				Properties: {
					Protocol: 'sqs',
					Endpoint: 'arn:aws:sqs:${aws:region}:${aws:accountId}:${self:custom.serviceName}TestQueue',
					RawMessageDelivery: true,
					TopicArn: 'arn:aws:sns:${aws:region}:${aws:accountId}:SecondTopic'
				},
				DependsOn: ['TestQueue']
			}
		}];

		const snsSubscriptionCrossAccountHook = ['resource', {
			name: 'SubSNSTestTopicSQSTest',
			resource: {
				Type: 'AWS::SNS::Subscription',
				Properties: {
					Protocol: 'sqs',
					Endpoint: 'arn:aws:sqs:${aws:region}:${aws:accountId}:${self:custom.serviceName}TestQueue',
					RawMessageDelivery: true,
					TopicArn: 'arn:aws:sns:${aws:region}:${self:custom.awsAccountsByService.another-service}:TestTopic'
				},
				DependsOn: ['TestQueue']
			}
		}];

		const snsSubscriptionHookWithFilterPolicy = ['resource', {
			name: 'SubSNSTestTopicSQSTest',
			resource: {
				Type: 'AWS::SNS::Subscription',
				Properties: {
					Protocol: 'sqs',
					Endpoint: 'arn:aws:sqs:${aws:region}:${aws:accountId}:${self:custom.serviceName}TestQueue',
					RawMessageDelivery: true,
					TopicArn: 'arn:aws:sns:${aws:region}:${aws:accountId}:TestTopic',
					FilterPolicy: {
						platform: ['fullcommerce']
					}
				},
				DependsOn: ['TestQueue']
			}
		}];

		// FIFO SQS with SNS FIFO Topic constants
		const fifoQueuePolicyHook = ['resource', {
			name: 'TestFifoQueuePolicy',
			resource: {
				Type: 'AWS::SQS::QueuePolicy',
				Properties: {
					Queues: [
						'https://sqs.${aws:region}.amazonaws.com/${aws:accountId}/${self:custom.serviceName}TestFifoQueue.fifo'
					],
					PolicyDocument: {
						Version: '2012-10-17',
						Statement: [
							{
								Effect: 'Allow',
								Action: 'sqs:SendMessage',
								Resource: 'arn:aws:sqs:${aws:region}:${aws:accountId}:${self:custom.serviceName}TestFifoQueue.fifo',
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
				DependsOn: ['TestFifoQueue']
			}
		}];

		const snsFifoTopicSubscriptionHook = ['resource', {
			name: 'SubSNSTestFifoTopicSQSTestFifo',
			resource: {
				Type: 'AWS::SNS::Subscription',
				Properties: {
					Protocol: 'sqs',
					Endpoint: 'arn:aws:sqs:${aws:region}:${aws:accountId}:${self:custom.serviceName}TestFifoQueue.fifo',
					RawMessageDelivery: true,
					TopicArn: 'arn:aws:sns:${aws:region}:${aws:accountId}:TestFifoTopic.fifo'
				},
				DependsOn: ['TestFifoQueue']
			}
		}];

		const snsFifoTopicCrossAccountSubscriptionHook = ['resource', {
			name: 'SubSNSTestFifoTopicSQSTestFifo',
			resource: {
				Type: 'AWS::SNS::Subscription',
				Properties: {
					Protocol: 'sqs',
					Endpoint: 'arn:aws:sqs:${aws:region}:${aws:accountId}:${self:custom.serviceName}TestFifoQueue.fifo',
					RawMessageDelivery: true,
					TopicArn: 'arn:aws:sns:${aws:region}:${self:custom.awsAccountsByService.another-service}:TestFifoTopic.fifo'
				},
				DependsOn: ['TestFifoQueue']
			}
		}];

		context('Create basic SQS Hooks', () => {

			it('Should create an SQS Hook for Main Queue, DLQ, and consumer for main queue using only a name', () => {

				assert.deepStrictEqual(SQSHelper.buildHooks({ name: 'Test' }), [
					sqsUrlEnvVarsHook,
					mainConsumerFunctionHook,
					mainQueueHook,
					dlqQueueHook()
				]);
			});

			it('Should create an SQS Hook for Main Queue, DLQ, and consumer for main queue using only a name in LowerCase', () => {

				assert.deepStrictEqual(SQSHelper.buildHooks({ name: 'test' }), [
					sqsUrlEnvVarsHook,
					mainConsumerFunctionHook,
					mainQueueHook,
					dlqQueueHook()
				]);
			});

			it('Should honor a custom maximum concurrency if it is set for main consumer', () => {

				assert.deepStrictEqual(SQSHelper.buildHooks({
					name: 'Test',
					consumerProperties: {
						maximumConcurrency: 100
					}
				}), [
					sqsUrlEnvVarsHook,
					['function', {
						...mainConsumerFunctionHook[1],
						events: [
							{
								sqs: { ...mainConsumerFunctionHook[1].events[0].sqs, maximumConcurrency: 100 }
							}
						]
					}],
					mainQueueHook,
					dlqQueueHook()
				]);
			});

			it('Should create an SQS Hook for Main Queue, DLQ, and both consumers for main queue using a name and some config for dlq consumer', () => {

				assert.deepStrictEqual(SQSHelper.buildHooks({ name: 'Test', dlqConsumerProperties: { batchSize: 10 } }), [
					sqsUrlEnvVarsHook,
					mainConsumerFunctionHook,
					mainQueueHook,
					dlqQueueHook(true),
					['function', {
						functionName: 'TestDLQQueueConsumer',
						handler: 'src/sqs-consumer/test-dlq-consumer.handler',
						description: 'TestDLQ SQS Queue Consumer',
						timeout: 15,
						rawProperties: {
							dependsOn: ['TestDLQ']
						},
						events: [
							{
								sqs: {
									arn: 'arn:aws:sqs:${aws:region}:${aws:accountId}:${self:custom.serviceName}TestDLQ',
									functionResponseType: 'ReportBatchItemFailures',
									batchSize: 10,
									maximumConcurrency: 10
								}
							}
						]
					}],
					['resource', {
						name: 'TestArchiveDLQ',
						resource: {
							Type: 'AWS::SQS::Queue',
							Properties: {
								QueueName: '${self:custom.serviceName}TestArchiveDLQ',
								ReceiveMessageWaitTimeSeconds: 20,
								VisibilityTimeout: 90,
								MessageRetentionPeriod: 864000,
								Tags: [
									...queueTags('Test'),
									{
										Key: 'SQSType',
										Value: 'ArchiveDLQ'
									},
									{
										Key: 'HasConsumer',
										Value: 'false'
									}
								]
							}
						}
					}]
				]);
			});

			it('Should honor a custom maximum concurrency if it is set for both main and dlq consumer', () => {

				assert.deepStrictEqual(SQSHelper.buildHooks({
					name: 'test',
					consumerProperties: {
						maximumConcurrency: 100
					},
					dlqConsumerProperties: {
						maximumConcurrency: 200
					}
				}), [
					sqsUrlEnvVarsHook,
					['function', {
						...mainConsumerFunctionHook[1],
						events: [
							{
								sqs: { ...mainConsumerFunctionHook[1].events[0].sqs, maximumConcurrency: 100 }
							}
						]
					}],
					mainQueueHook,
					dlqQueueHook(true),
					['function', {
						functionName: 'TestDLQQueueConsumer',
						handler: 'src/sqs-consumer/test-dlq-consumer.handler',
						description: 'TestDLQ SQS Queue Consumer',
						timeout: 15,
						rawProperties: {
							dependsOn: ['TestDLQ']
						},
						events: [
							{
								sqs: {
									arn: 'arn:aws:sqs:${aws:region}:${aws:accountId}:${self:custom.serviceName}TestDLQ',
									functionResponseType: 'ReportBatchItemFailures',
									maximumConcurrency: 200
								}
							}
						]
					}],
					['resource', {
						name: 'TestArchiveDLQ',
						resource: {
							Type: 'AWS::SQS::Queue',
							Properties: {
								QueueName: '${self:custom.serviceName}TestArchiveDLQ',
								ReceiveMessageWaitTimeSeconds: 20,
								VisibilityTimeout: 90,
								MessageRetentionPeriod: 864000,
								Tags: [
									...queueTags('Test'),
									{
										Key: 'SQSType',
										Value: 'ArchiveDLQ'
									},
									{
										Key: 'HasConsumer',
										Value: 'false'
									}
								]
							}
						}
					}]
				]);
			});

			it('Should generate generate environment variables for dlq consumer if the configuration is received', () => {

				const envVarsHook = ['envVars', {
					TEST_SQS_QUEUE_URL: 'https://sqs.${aws:region}.amazonaws.com/${aws:accountId}/${self:custom.serviceName}TestQueue',
					TEST_DLQ_QUEUE_URL: 'https://sqs.${aws:region}.amazonaws.com/${aws:accountId}/${self:custom.serviceName}TestDLQ'
				}];

				assert.deepStrictEqual(SQSHelper.buildHooks({ name: 'Test', dlqQueueProperties: { generateEnvVars: true } }), [
					envVarsHook,
					mainConsumerFunctionHook,
					mainQueueHook,
					dlqQueueHook()
				]);
			});

			it('Should create an SQS Hook for Main Queue, DLQ, and consumer for main queue using only a name in camelCase', () => {

				assert.deepStrictEqual(SQSHelper.buildHooks({ name: 'TestBegin', dlqConsumerProperties: { batchSize: 10 } }), [
					['envVars', {
						TEST_BEGIN_SQS_QUEUE_URL: 'https://sqs.${aws:region}.amazonaws.com/${aws:accountId}/${self:custom.serviceName}TestBeginQueue'
					}],
					['function', {
						functionName: 'TestBeginQueueConsumer',
						handler: 'src/sqs-consumer/test-begin-consumer.handler',
						description: 'TestBegin SQS Queue Consumer',
						timeout: 15,
						rawProperties: {
							dependsOn: ['TestBeginQueue']
						},
						events: [
							{
								sqs: {
									arn: 'arn:aws:sqs:${aws:region}:${aws:accountId}:${self:custom.serviceName}TestBeginQueue',
									functionResponseType: 'ReportBatchItemFailures',
									batchSize: 10,
									maximumConcurrency: 10,
									maximumBatchingWindow: 20
								}
							}
						]
					}],
					['resource', {
						name: 'TestBeginQueue',
						resource: {
							Type: 'AWS::SQS::Queue',
							Properties: {
								QueueName: '${self:custom.serviceName}TestBeginQueue',
								ReceiveMessageWaitTimeSeconds: 20,
								VisibilityTimeout: 90,
								// eslint-disable-next-line max-len
								RedrivePolicy: '{"maxReceiveCount":5,"deadLetterTargetArn":"arn:aws:sqs:${aws:region}:${aws:accountId}:${self:custom.serviceName}TestBeginDLQ"}',
								Tags: mainQueueTags('TestBegin')
							},
							DependsOn: ['TestBeginDLQ']
						}
					}],
					['resource', {
						name: 'TestBeginDLQ',
						resource: {
							Type: 'AWS::SQS::Queue',
							DependsOn: ['TestBeginArchiveDLQ'],
							Properties: {
								QueueName: '${self:custom.serviceName}TestBeginDLQ',
								ReceiveMessageWaitTimeSeconds: 20,
								RedrivePolicy: JSON.stringify({
									maxReceiveCount: 5,
									deadLetterTargetArn: 'arn:aws:sqs:${aws:region}:${aws:accountId}:${self:custom.serviceName}TestBeginArchiveDLQ'
								}),
								VisibilityTimeout: 90,
								MessageRetentionPeriod: 864000,
								Tags: dlqTags('TestBegin', true)
							}
						}
					}],
					['function', {
						functionName: 'TestBeginDLQQueueConsumer',
						handler: 'src/sqs-consumer/test-begin-dlq-consumer.handler',
						description: 'TestBeginDLQ SQS Queue Consumer',
						timeout: 15,
						rawProperties: {
							dependsOn: ['TestBeginDLQ']
						},
						events: [
							{
								sqs: {
									arn: 'arn:aws:sqs:${aws:region}:${aws:accountId}:${self:custom.serviceName}TestBeginDLQ',
									functionResponseType: 'ReportBatchItemFailures',
									batchSize: 10,
									maximumConcurrency: 10
								}
							}
						]
					}],
					['resource', {
						name: 'TestBeginArchiveDLQ',
						resource: {
							Type: 'AWS::SQS::Queue',
							Properties: {
								QueueName: '${self:custom.serviceName}TestBeginArchiveDLQ',
								ReceiveMessageWaitTimeSeconds: 20,
								VisibilityTimeout: 90,
								MessageRetentionPeriod: 864000,
								Tags: [
									...queueTags('TestBegin'),
									{
										Key: 'SQSType',
										Value: 'ArchiveDLQ'
									},
									{
										Key: 'HasConsumer',
										Value: 'false'
									}
								]
							}
						}
					}]
				]);
			});

			it('Should create an SQS Hook for Main Queue, DLQ and consumer used for both Queues', () => {

				const mainConsumerForBothQueuesFunctionHook = JSON.parse(JSON.stringify(mainConsumerFunctionHook));

				mainConsumerForBothQueuesFunctionHook[1].events.push({
					sqs: {
						arn: 'arn:aws:sqs:${aws:region}:${aws:accountId}:${self:custom.serviceName}TestDLQ',
						functionResponseType: 'ReportBatchItemFailures',
						batchSize: 50,
						maximumBatchingWindow: 30,
						maximumConcurrency: 10
					}
				});

				assert.deepStrictEqual(SQSHelper.buildHooks({
					name: 'Test',
					dlqConsumerProperties: { useMainHandler: true, batchSize: 50, maximumBatchingWindow: 30 }
				}), [
					sqsUrlEnvVarsHook,
					mainConsumerForBothQueuesFunctionHook,
					mainQueueHook,
					dlqQueueHook(true)
				]);
			});

			it('Should create an SQS Hook for Main Queue, DLQ and add custom tags for Queues when using addTags field', () => {

				const mainQueueHookTags = JSON.parse(JSON.stringify(mainQueueHook));
				mainQueueHookTags[1].resource.Properties.Tags = [...mainQueueHookTags[1].resource.Properties.Tags, { Key: 'isCritical', Value: true }];

				const dlqQueueHookTags = JSON.parse(JSON.stringify(dlqQueueHook()));
				dlqQueueHookTags[1].resource.Properties.Tags = [...dlqQueueHookTags[1].resource.Properties.Tags, { Key: 'isCritical', Value: true }];

				assert.deepStrictEqual(SQSHelper.buildHooks({
					name: 'Test',
					mainQueueProperties: {
						addTags: [{ Key: 'isCritical', Value: true }]
					},
					dlqQueueProperties: {
						addTags: [{ Key: 'isCritical', Value: true }]
					}
				}), [
					sqsUrlEnvVarsHook,
					mainConsumerFunctionHook,
					mainQueueHookTags,
					dlqQueueHookTags
				]);
			});
		});

		context('Create SQS Hooks with Custom Consumer configuration', () => {

			it('Should create an SQS Hook for Main Queue, DLQ, and consumer for main queue using custom main consumer properties', () => {

				assert.deepStrictEqual(SQSHelper.buildHooks({
					name: 'Test',
					consumerProperties: {
						timeout: 30,
						batchSize: 20,
						maximumBatchingWindow: 80
					}
				}), [
					sqsUrlEnvVarsHook,
					['function', {
						functionName: 'TestQueueConsumer',
						handler: 'src/sqs-consumer/test-consumer.handler',
						description: 'Test SQS Queue Consumer',
						timeout: 30,
						rawProperties: {
							dependsOn: ['TestQueue']
						},
						events: [
							{
								sqs: {
									arn: 'arn:aws:sqs:${aws:region}:${aws:accountId}:${self:custom.serviceName}TestQueue',
									functionResponseType: 'ReportBatchItemFailures',
									batchSize: 20,
									maximumBatchingWindow: 80,
									maximumConcurrency: 10
								}
							}
						]
					}],
					mainQueueHook,
					dlqQueueHook()
				]);
			});

			it('Should create an SQS Hook for Main Queue, DLQ, and both consumers for main queue using custom dlq consumer properties', () => {

				assert.deepStrictEqual(SQSHelper.buildHooks({
					name: 'Test',
					dlqConsumerProperties: {
						timeout: 30,
						batchSize: 20,
						maximumBatchingWindow: 80
					}
				}), [
					sqsUrlEnvVarsHook,
					mainConsumerFunctionHook,
					mainQueueHook,
					dlqQueueHook(true),
					['function', {
						functionName: 'TestDLQQueueConsumer',
						handler: 'src/sqs-consumer/test-dlq-consumer.handler',
						description: 'TestDLQ SQS Queue Consumer',
						timeout: 30,
						rawProperties: {
							dependsOn: ['TestDLQ']
						},
						events: [
							{
								sqs: {
									arn: 'arn:aws:sqs:${aws:region}:${aws:accountId}:${self:custom.serviceName}TestDLQ',
									functionResponseType: 'ReportBatchItemFailures',
									batchSize: 20,
									maximumConcurrency: 10,
									maximumBatchingWindow: 80
								}
							}
						]
					}],
					['resource', {
						name: 'TestArchiveDLQ',
						resource: {
							Type: 'AWS::SQS::Queue',
							Properties: {
								QueueName: '${self:custom.serviceName}TestArchiveDLQ',
								ReceiveMessageWaitTimeSeconds: 20,
								VisibilityTimeout: 90,
								MessageRetentionPeriod: 864000,
								Tags: [
									...queueTags('Test'),
									{
										Key: 'SQSType',
										Value: 'ArchiveDLQ'
									},
									{
										Key: 'HasConsumer',
										Value: 'false'
									}
								]
							}
						}
					}]
				]);
			});

			it('Should create an SQS Hook for Main Queue, DLQ, and consumer for main queue using custom consumer handler and description', () => {

				assert.deepStrictEqual(SQSHelper.buildHooks({
					name: 'Test',
					consumerProperties: {
						handler: 'src/sqs-listener/test.handler',
						description: 'SQS Listener'
					}
				}), [
					sqsUrlEnvVarsHook,
					['function', {
						functionName: 'TestQueueConsumer',
						handler: 'src/sqs-listener/test.handler',
						description: 'SQS Listener',
						timeout: 15,
						rawProperties: {
							dependsOn: ['TestQueue']
						},
						events: [
							{
								sqs: {
									arn: 'arn:aws:sqs:${aws:region}:${aws:accountId}:${self:custom.serviceName}TestQueue',
									functionResponseType: 'ReportBatchItemFailures',
									batchSize: 10,
									maximumBatchingWindow: 20,
									maximumConcurrency: 10
								}
							}
						]
					}],
					mainQueueHook,
					dlqQueueHook()
				]);
			});

			it('Should create an SQS Hook for Main Queue, DLQ, and consumer for main queue using custom consumer sqs events properties', () => {

				assert.deepStrictEqual(SQSHelper.buildHooks({
					name: 'Test',
					consumerProperties: {
						eventProperties: {
							functionResponseType: null
						}
					}
				}), [
					sqsUrlEnvVarsHook,
					['function', {
						functionName: 'TestQueueConsumer',
						handler: 'src/sqs-consumer/test-consumer.handler',
						description: 'Test SQS Queue Consumer',
						timeout: 15,
						rawProperties: {
							dependsOn: ['TestQueue']
						},
						events: [
							{
								sqs: {
									arn: 'arn:aws:sqs:${aws:region}:${aws:accountId}:${self:custom.serviceName}TestQueue',
									batchSize: 10,
									maximumBatchingWindow: 20,
									maximumConcurrency: 10,
									functionResponseType: null
								}
							}
						]
					}],
					mainQueueHook,
					dlqQueueHook()
				]);
			});

			it('Should create an SQS Hook for Main Queue, DLQ, and consumer for main queue using custom consumer function and changed raw properties', () => {

				assert.deepStrictEqual(SQSHelper.buildHooks({
					name: 'Test',
					consumerProperties: {
						functionProperties: {
							memorySize: 2048
						},
						rawProperties: {
							dependsOn: ['TestQueue', 'SecretFunction']
						}
					}
				}), [
					sqsUrlEnvVarsHook,
					['function', {
						functionName: 'TestQueueConsumer',
						handler: 'src/sqs-consumer/test-consumer.handler',
						description: 'Test SQS Queue Consumer',
						timeout: 15,
						memorySize: 2048,
						rawProperties: {
							dependsOn: ['TestQueue', 'SecretFunction']
						},
						events: [
							{
								sqs: {
									arn: 'arn:aws:sqs:${aws:region}:${aws:accountId}:${self:custom.serviceName}TestQueue',
									functionResponseType: 'ReportBatchItemFailures',
									batchSize: 10,
									maximumBatchingWindow: 20,
									maximumConcurrency: 10
								}
							}
						]
					}],
					mainQueueHook,
					dlqQueueHook()
				]);
			});
		});

		context('Create SQS Hooks with Custom Queue configuration', () => {

			it('Should not generate environment variables if it is specified in the configuration', () => {

				assert.deepStrictEqual(SQSHelper.buildHooks({
					name: 'Test',
					mainQueueProperties: {
						generateEnvVars: false
					}
				}), [
					mainConsumerFunctionHook,
					mainQueueHook,
					dlqQueueHook()
				]);
			});

			it('Should create an SQS Hook for Main Queue, DLQ, and consumer for main queue using custom main queue properties', () => {

				assert.deepStrictEqual(SQSHelper.buildHooks({
					name: 'Test',
					mainQueueProperties: {
						maxReceiveCount: 1,
						receiveMessageWaitTimeSeconds: 10,
						visibilityTimeout: 50
					}
				}), [
					sqsUrlEnvVarsHook,
					mainConsumerFunctionHook,
					['resource', {
						name: 'TestQueue',
						resource: {
							Type: 'AWS::SQS::Queue',
							Properties: {
								QueueName: '${self:custom.serviceName}TestQueue',
								ReceiveMessageWaitTimeSeconds: 10,
								VisibilityTimeout: 50,
								// eslint-disable-next-line max-len
								RedrivePolicy: '{"maxReceiveCount":1,"deadLetterTargetArn":"arn:aws:sqs:${aws:region}:${aws:accountId}:${self:custom.serviceName}TestDLQ"}',
								Tags: mainQueueTags('Test')
							},
							DependsOn: ['TestDLQ']
						}
					}],
					dlqQueueHook()
				]);
			});

			it('Should create an SQS Hook for Main Queue, DLQ, and consumer for main queue using custom dlq queue properties', () => {

				assert.deepStrictEqual(SQSHelper.buildHooks({
					name: 'Test',
					dlqQueueProperties: {
						receiveMessageWaitTimeSeconds: 10,
						visibilityTimeout: 50,
						messageRetentionPeriod: 432000
					}
				}), [
					sqsUrlEnvVarsHook,
					mainConsumerFunctionHook,
					mainQueueHook,
					['resource', {
						name: 'TestDLQ',
						resource: {
							Type: 'AWS::SQS::Queue',
							Properties: {
								QueueName: '${self:custom.serviceName}TestDLQ',
								ReceiveMessageWaitTimeSeconds: 10,
								VisibilityTimeout: 50,
								MessageRetentionPeriod: 432000,
								Tags: dlqTags('Test')
							}
						}
					}]
				]);
			});

			it('Should create an SQS Hook for Main Queue, DLQ, and consumer for main queue using custom queue extra properties', () => {

				assert.deepStrictEqual(SQSHelper.buildHooks({
					name: 'Test',
					mainQueueProperties: {
						extraProp: true
					}
				}), [
					sqsUrlEnvVarsHook,
					mainConsumerFunctionHook,
					['resource', {
						name: 'TestQueue',
						resource: {
							Type: 'AWS::SQS::Queue',
							Properties: {
								QueueName: '${self:custom.serviceName}TestQueue',
								ReceiveMessageWaitTimeSeconds: 20,
								VisibilityTimeout: 90,
								// eslint-disable-next-line max-len
								RedrivePolicy: '{"maxReceiveCount":5,"deadLetterTargetArn":"arn:aws:sqs:${aws:region}:${aws:accountId}:${self:custom.serviceName}TestDLQ"}',
								Tags: mainQueueTags('Test'),
								extraProp: true
							},
							DependsOn: ['TestDLQ']
						}
					}],
					dlqQueueHook()
				]);
			});
		});

		context('Create FIFO SQS', () => {

			it('Should create SQS hook for Main Queue, DLQ, and consumers', () => {

				assert.deepStrictEqual(SQSHelper.buildHooks({
					name: 'MyFifo',
					mainQueueProperties: {
						fifoQueue: true,
						fifoThroughputLimit: 'perMessageGroupId',
						deduplicationScope: 'messageGroup',
						contentBasedDeduplication: true
					},
					dlqQueueProperties: { generateEnvVars: true },
					consumerProperties: { prefixPath: 'my-custom-path' },
					dlqConsumerProperties: { prefixPath: 'my-custom-path' }
				}), [

					['envVars', {
						MY_FIFO_SQS_QUEUE_URL: 'https://sqs.${aws:region}.amazonaws.com/${aws:accountId}/${self:custom.serviceName}MyFifoQueue.fifo',
						MY_FIFO_DLQ_QUEUE_URL: 'https://sqs.${aws:region}.amazonaws.com/${aws:accountId}/${self:custom.serviceName}MyFifoDLQ.fifo'
					}],

					['function', {
						functionName: 'MyFifoQueueConsumer',
						handler: 'src/sqs-consumer/my-custom-path/my-fifo-consumer.handler',
						description: 'MyFifo SQS Queue Consumer',
						timeout: 15,
						rawProperties: {
							dependsOn: ['MyFifoQueue']
						},
						events: [
							{
								sqs: {
									arn: 'arn:aws:sqs:${aws:region}:${aws:accountId}:${self:custom.serviceName}MyFifoQueue.fifo',
									functionResponseType: 'ReportBatchItemFailures',
									batchSize: 10,
									maximumBatchingWindow: 20,
									maximumConcurrency: 10
								}
							}
						]
					}],

					['resource', {
						name: 'MyFifoQueue',
						resource: {
							Type: 'AWS::SQS::Queue',
							Properties: {
								QueueName: '${self:custom.serviceName}MyFifoQueue.fifo',
								ReceiveMessageWaitTimeSeconds: 20,
								VisibilityTimeout: 90,
								// eslint-disable-next-line max-len
								RedrivePolicy: JSON.stringify({
									maxReceiveCount: 5,
									deadLetterTargetArn: 'arn:aws:sqs:${aws:region}:${aws:accountId}:${self:custom.serviceName}MyFifoDLQ.fifo'
								}),
								FifoQueue: true,
								FifoThroughputLimit: 'perMessageGroupId',
								DeduplicationScope: 'messageGroup',
								ContentBasedDeduplication: true,
								Tags: mainQueueTags('MyFifo')
							},
							DependsOn: ['MyFifoDLQ']
						}
					}],

					['resource', {
						name: 'MyFifoDLQ',
						resource: {
							Type: 'AWS::SQS::Queue',
							DependsOn: ['MyFifoArchiveDLQ'],
							Properties: {
								QueueName: '${self:custom.serviceName}MyFifoDLQ.fifo',
								ReceiveMessageWaitTimeSeconds: 20,
								RedrivePolicy: JSON.stringify({
									maxReceiveCount: 5,
									deadLetterTargetArn: 'arn:aws:sqs:${aws:region}:${aws:accountId}:${self:custom.serviceName}MyFifoArchiveDLQ.fifo'
								}),
								VisibilityTimeout: 90,
								MessageRetentionPeriod: 864000,
								FifoQueue: true,
								Tags: dlqTags('MyFifo', true)
							}
						}
					}],

					['function', {
						functionName: 'MyFifoDLQQueueConsumer',
						handler: 'src/sqs-consumer/my-custom-path/my-fifo-dlq-consumer.handler',
						description: 'MyFifoDLQ SQS Queue Consumer',
						timeout: 15,
						rawProperties: {
							dependsOn: ['MyFifoDLQ']
						},
						events: [
							{
								sqs: {
									arn: 'arn:aws:sqs:${aws:region}:${aws:accountId}:${self:custom.serviceName}MyFifoDLQ.fifo',
									functionResponseType: 'ReportBatchItemFailures',
									maximumConcurrency: 10
								}
							}
						]
					}],

					['resource', {
						name: 'MyFifoArchiveDLQ',
						resource: {
							Type: 'AWS::SQS::Queue',
							Properties: {
								QueueName: '${self:custom.serviceName}MyFifoArchiveDLQ.fifo',
								ReceiveMessageWaitTimeSeconds: 20,
								VisibilityTimeout: 90,
								MessageRetentionPeriod: 864000,
								FifoQueue: true,
								Tags: [
									...queueTags('MyFifo'),
									{
										Key: 'SQSType',
										Value: 'ArchiveDLQ'
									},
									{
										Key: 'HasConsumer',
										Value: 'false'
									}
								]
							}
						}
					}]
				]);

			});
		});

		context('Create SQS Hooks with Delay Queue', () => {

			const envVarsHook = ['envVars', {
				TEST_SQS_QUEUE_URL: 'https://sqs.${aws:region}.amazonaws.com/${aws:accountId}/${self:custom.serviceName}TestQueue',
				TEST_DELAY_QUEUE_URL: 'https://sqs.${aws:region}.amazonaws.com/${aws:accountId}/${self:custom.serviceName}TestDelayQueue'
			}];

			const defaultDelayQueueProperties = {
				visibilityTimeout: 600,
				generateEnvVars: true
			};

			const delayQueueTags = (name, hasConsumer) => [
				...queueTags(name),
				{
					Key: 'SQSType',
					Value: 'Delay'
				},
				{
					Key: 'HasConsumer',
					Value: hasConsumer?.toString() || 'false'
				}
			];

			const delayQueueHook = hasConsumer => ['resource', {
				name: 'TestDelayQueue',
				resource: {
					Type: 'AWS::SQS::Queue',
					Properties: {
						QueueName: '${self:custom.serviceName}TestDelayQueue',
						ReceiveMessageWaitTimeSeconds: 20,
						VisibilityTimeout: 600,
						DelaySeconds: 300, // default values DelaySeconds
						RedrivePolicy: JSON.stringify({
							maxReceiveCount: 5,
							deadLetterTargetArn: 'arn:aws:sqs:${aws:region}:${aws:accountId}:${self:custom.serviceName}TestDLQ'
						}),
						Tags: delayQueueTags('Test', hasConsumer)
					},
					DependsOn: ['TestDLQ']
				}
			}];

			it('Should create SQS hook for Main Queue, DelayQueue, DLQ, using default consumers', () => {

				const mainQueueHookPointingDelayQueue = JSON.parse(JSON.stringify(mainQueueHook));

				mainQueueHookPointingDelayQueue[1].resource.Properties.RedrivePolicy = JSON.stringify({
					maxReceiveCount: 5,
					deadLetterTargetArn: 'arn:aws:sqs:${aws:region}:${aws:accountId}:${self:custom.serviceName}TestDelayQueue'
				});

				mainQueueHookPointingDelayQueue[1].resource.DependsOn = ['TestDelayQueue'];

				const delayConsumerFunctionHook = ['function', {
					functionName: 'TestDelayQueueConsumer',
					handler: 'src/sqs-consumer/test-delay-consumer.handler',
					description: 'TestDelay SQS Queue Consumer',
					timeout: 15,
					rawProperties: {
						dependsOn: ['TestDelayQueue']
					},
					events: [{
						sqs: {
							arn: 'arn:aws:sqs:${aws:region}:${aws:accountId}:${self:custom.serviceName}TestDelayQueue',
							functionResponseType: 'ReportBatchItemFailures',
							batchSize: 10,
							maximumBatchingWindow: 20,
							maximumConcurrency: 10
						}
					}]
				}];

				assert.deepStrictEqual(SQSHelper.buildHooks({
					name: 'Test',
					delayQueueProperties: defaultDelayQueueProperties
					// default consumer (with main consumer config)
				}), [
					envVarsHook,
					mainConsumerFunctionHook,
					mainQueueHookPointingDelayQueue,
					delayConsumerFunctionHook,
					delayQueueHook(true),
					dlqQueueHook()
				]);

			});

			it('Should create SQS hook for Main Queue, DelayQueue, DLQ, using main consumer for delay queue', () => {

				const mainQueueHookPointingDelayQueue = JSON.parse(JSON.stringify(mainQueueHook));

				mainQueueHookPointingDelayQueue[1].resource.Properties.RedrivePolicy = JSON.stringify({
					maxReceiveCount: 5,
					deadLetterTargetArn: 'arn:aws:sqs:${aws:region}:${aws:accountId}:${self:custom.serviceName}TestDelayQueue'
				});

				mainQueueHookPointingDelayQueue[1].resource.DependsOn = ['TestDelayQueue'];

				const mainConsumerForBothQueuesFunctionHook = JSON.parse(JSON.stringify(mainConsumerFunctionHook));

				mainConsumerForBothQueuesFunctionHook[1].events.push({
					sqs: {
						arn: 'arn:aws:sqs:${aws:region}:${aws:accountId}:${self:custom.serviceName}TestDelayQueue',
						functionResponseType: 'ReportBatchItemFailures',
						batchSize: 50,
						maximumBatchingWindow: 30,
						maximumConcurrency: 10
					}
				});

				const customDelayQueueHook = delayQueueHook(true);

				customDelayQueueHook[1].resource.Properties.DelaySeconds = 60; // custom DelaySeconds

				assert.deepStrictEqual(SQSHelper.buildHooks({
					name: 'Test',
					delayQueueProperties: {
						...defaultDelayQueueProperties,
						delaySeconds: 60 // custom DelaySeconds
					},
					delayConsumerProperties: {
						useMainHandler: true, // should use main consumer not creating another function
						batchSize: 50,
						maximumBatchingWindow: 30
					}
				}), [
					envVarsHook,
					mainConsumerForBothQueuesFunctionHook,
					mainQueueHookPointingDelayQueue,
					customDelayQueueHook,
					dlqQueueHook()
				]);

			});
		});

		context('Global environments variables', () => {

			it('Should set global env vars if the shouldSetGlobalEnvVars is set as true', () => {

				SQSHelper.shouldSetGlobalEnvVars(true);

				assert.deepStrictEqual(SQSHelper.buildHooks({ name: 'Test' }), [
					sqsUrlEnvVarsHook,
					mainConsumerFunctionHook,
					mainQueueHook,
					dlqQueueHook()
				]);

				// Reset the global env vars
				SQSHelper.shouldSetGlobalEnvVars(true);
			});

			it('Should not set global env vars if the shouldSetGlobalEnvVars is set as false', () => {

				SQSHelper.shouldSetGlobalEnvVars(false);

				assert.deepStrictEqual(SQSHelper.buildHooks({ name: 'Test' }), [
					mainConsumerFunctionHook,
					mainQueueHook,
					dlqQueueHook()
				]);

				// Reset the global env vars
				SQSHelper.shouldSetGlobalEnvVars(true);
			});
		});

		context('Create SQS Hooks with SNS Source Topic', () => {

			context('SNS Topics from the same account', () => {

				it('Should add a Queue Policy and SNS Subscription to publish messages from the given topic to the main queue', () => {

					assert.deepStrictEqual(SQSHelper.buildHooks({
						name: 'Test',
						sourceSnsTopic: {
							name: 'TestTopic'
						}
					}), [
						sqsUrlEnvVarsHook,
						mainConsumerFunctionHook,
						mainQueueHook,
						dlqQueueHook(),
						queuePolicyHook,
						snsSubscriptionHook
					]);
				});

				it('Should add a Queue Policy and SNS Subscription to publish messages from the given topic with a filter policy to the main queue', () => {

					assert.deepStrictEqual(SQSHelper.buildHooks({
						name: 'Test',
						sourceSnsTopic: {
							name: 'TestTopic',
							filterPolicy: {
								platform: ['fullcommerce']
							}
						}
					}), [
						sqsUrlEnvVarsHook,
						mainConsumerFunctionHook,
						mainQueueHook,
						dlqQueueHook(),
						queuePolicyHook,
						snsSubscriptionHookWithFilterPolicy
					]);
				});

				it('Should allow to subscribe a Queue to multiple SNS Topics', () => {

					assert.deepStrictEqual(SQSHelper.buildHooks({
						name: 'Test',
						sourceSnsTopic: [
							{
								name: 'TestTopic'
							},
							{
								name: 'SecondTopic'
							}
						]
					}), [
						sqsUrlEnvVarsHook,
						mainConsumerFunctionHook,
						mainQueueHook,
						dlqQueueHook(),
						queuePolicyHook,
						snsSubscriptionHook,
						secondSnsSubscriptionHook
					]);
				});
			});

			context('SNS Topics from the another account', () => {

				it('Should add a Queue Policy and SNS Subscription to publish messages from the given topic to the main queue (non local env)', () => {

					assert.deepStrictEqual(SQSHelper.buildHooks({
						name: 'Test',
						sourceSnsTopic: {
							scope: snsTopicScopes.remote,
							serviceCode: 'another-service',
							name: 'TestTopic'
						}
					}), [
						sqsUrlEnvVarsHook,
						mainConsumerFunctionHook,
						mainQueueHook,
						dlqQueueHook(),
						queuePolicyHook,
						snsSubscriptionCrossAccountHook
					]);
				});

				it('Should add a Queue Policy and omit SNS subscription in local environment', () => {

					process.env.JANIS_LOCAL = '1';

					const localMainConsumerFunctionHook = ['function', {
						...mainConsumerFunctionHook[1],
						events: [{
							sqs: {
								...mainConsumerFunctionHook[1].events[0].sqs,
								maximumBatchingWindow: 0
							}
						}]
					}];

					assert.deepStrictEqual(SQSHelper.buildHooks({
						name: 'Test',
						sourceSnsTopic: {
							scope: snsTopicScopes.remote,
							serviceCode: 'another-service',
							name: 'TestTopic'
						}
					}), [
						sqsUrlEnvVarsHook,
						localMainConsumerFunctionHook,
						mainQueueHook,
						dlqQueueHook(),
						queuePolicyHook
					]);
				});
			});

			context('SNS FIFO Topics', () => {

				it('Should add a Queue Policy and SNS Subscription for FIFO Topic from the same account to FIFO SQS', () => {

					assert.deepStrictEqual(SQSHelper.buildHooks({
						name: 'TestFifo',
						mainQueueProperties: {
							fifoQueue: true
						},
						dlqQueueProperties: { generateEnvVars: true },
						sourceSnsTopic: {
							name: 'TestFifoTopic'
						}
					}), [
						['envVars', {
							TEST_FIFO_SQS_QUEUE_URL: 'https://sqs.${aws:region}.amazonaws.com/${aws:accountId}/${self:custom.serviceName}TestFifoQueue.fifo',
							TEST_FIFO_DLQ_QUEUE_URL: 'https://sqs.${aws:region}.amazonaws.com/${aws:accountId}/${self:custom.serviceName}TestFifoDLQ.fifo'
						}],
						['function', {
							functionName: 'TestFifoQueueConsumer',
							handler: 'src/sqs-consumer/test-fifo-consumer.handler',
							description: 'TestFifo SQS Queue Consumer',
							timeout: 15,
							rawProperties: {
								dependsOn: ['TestFifoQueue']
							},
							events: [
								{
									sqs: {
										arn: 'arn:aws:sqs:${aws:region}:${aws:accountId}:${self:custom.serviceName}TestFifoQueue.fifo',
										functionResponseType: 'ReportBatchItemFailures',
										batchSize: 10,
										maximumBatchingWindow: 20,
										maximumConcurrency: 10
									}
								}
							]
						}],
						['resource', {
							name: 'TestFifoQueue',
							resource: {
								Type: 'AWS::SQS::Queue',
								Properties: {
									QueueName: '${self:custom.serviceName}TestFifoQueue.fifo',
									ReceiveMessageWaitTimeSeconds: 20,
									VisibilityTimeout: 90,
									// eslint-disable-next-line max-len
									RedrivePolicy: JSON.stringify({
										maxReceiveCount: 5,
										deadLetterTargetArn: 'arn:aws:sqs:${aws:region}:${aws:accountId}:${self:custom.serviceName}TestFifoDLQ.fifo'
									}),
									FifoQueue: true,
									Tags: mainQueueTags('TestFifo')
								},
								DependsOn: ['TestFifoDLQ']
							}
						}],
						['resource', {
							name: 'TestFifoDLQ',
							resource: {
								Type: 'AWS::SQS::Queue',
								Properties: {
									QueueName: '${self:custom.serviceName}TestFifoDLQ.fifo',
									ReceiveMessageWaitTimeSeconds: 20,
									VisibilityTimeout: 90,
									MessageRetentionPeriod: 864000,
									FifoQueue: true,
									Tags: dlqTags('TestFifo')
								}
							}
						}],
						fifoQueuePolicyHook,
						snsFifoTopicSubscriptionHook
					]);
				});

				it('Should add a Queue Policy and SNS Subscription for FIFO Topic from another account to FIFO SQS (non local env)', () => {

					assert.deepStrictEqual(SQSHelper.buildHooks({
						name: 'TestFifo',
						mainQueueProperties: {
							fifoQueue: true
						},
						dlqQueueProperties: { generateEnvVars: true },
						sourceSnsTopic: {
							scope: snsTopicScopes.remote,
							serviceCode: 'another-service',
							name: 'TestFifoTopic'
						}
					}), [
						['envVars', {
							TEST_FIFO_SQS_QUEUE_URL: 'https://sqs.${aws:region}.amazonaws.com/${aws:accountId}/${self:custom.serviceName}TestFifoQueue.fifo',
							TEST_FIFO_DLQ_QUEUE_URL: 'https://sqs.${aws:region}.amazonaws.com/${aws:accountId}/${self:custom.serviceName}TestFifoDLQ.fifo'
						}],
						['function', {
							functionName: 'TestFifoQueueConsumer',
							handler: 'src/sqs-consumer/test-fifo-consumer.handler',
							description: 'TestFifo SQS Queue Consumer',
							timeout: 15,
							rawProperties: {
								dependsOn: ['TestFifoQueue']
							},
							events: [
								{
									sqs: {
										arn: 'arn:aws:sqs:${aws:region}:${aws:accountId}:${self:custom.serviceName}TestFifoQueue.fifo',
										functionResponseType: 'ReportBatchItemFailures',
										maximumConcurrency: 10,
										batchSize: 10,
										maximumBatchingWindow: 20
									}
								}
							]
						}],
						['resource', {
							name: 'TestFifoQueue',
							resource: {
								Type: 'AWS::SQS::Queue',
								Properties: {
									QueueName: '${self:custom.serviceName}TestFifoQueue.fifo',
									ReceiveMessageWaitTimeSeconds: 20,
									VisibilityTimeout: 90,
									// eslint-disable-next-line max-len
									RedrivePolicy: JSON.stringify({
										maxReceiveCount: 5,
										deadLetterTargetArn: 'arn:aws:sqs:${aws:region}:${aws:accountId}:${self:custom.serviceName}TestFifoDLQ.fifo'
									}),
									FifoQueue: true,
									Tags: mainQueueTags('TestFifo')
								},
								DependsOn: ['TestFifoDLQ']
							}
						}],
						['resource', {
							name: 'TestFifoDLQ',
							resource: {
								Type: 'AWS::SQS::Queue',
								Properties: {
									QueueName: '${self:custom.serviceName}TestFifoDLQ.fifo',
									ReceiveMessageWaitTimeSeconds: 20,
									VisibilityTimeout: 90,
									MessageRetentionPeriod: 864000,
									FifoQueue: true,
									Tags: dlqTags('TestFifo')
								}
							}
						}],
						fifoQueuePolicyHook,
						snsFifoTopicCrossAccountSubscriptionHook
					]);
				});
			});
		});

		context('Low environment batching window override', () => {

			it('Should set maximumBatchingWindow to 0 and keep batchSize at 10 for main consumer in beta env', () => {

				process.env.ENV = 'beta';

				const hooks = SQSHelper.buildHooks({ name: 'Test' });
				const [, consumerHook] = hooks;
				const [, { events }] = consumerHook;

				assert.deepStrictEqual(events[0].sqs, {
					arn: 'arn:aws:sqs:${aws:region}:${aws:accountId}:${self:custom.serviceName}TestQueue',
					functionResponseType: 'ReportBatchItemFailures',
					batchSize: 10,
					maximumBatchingWindow: 0,
					maximumConcurrency: 10
				});
			});

			it('Should set maximumBatchingWindow to 0 and keep batchSize at 10 for main consumer in qa env', () => {

				process.env.ENV = 'qa';

				const hooks = SQSHelper.buildHooks({ name: 'Test' });
				const [, consumerHook] = hooks;
				const [, { events }] = consumerHook;

				assert.deepStrictEqual(events[0].sqs, {
					arn: 'arn:aws:sqs:${aws:region}:${aws:accountId}:${self:custom.serviceName}TestQueue',
					functionResponseType: 'ReportBatchItemFailures',
					batchSize: 10,
					maximumBatchingWindow: 0,
					maximumConcurrency: 10
				});
			});

			it('Should cap batchSize to 10 when it exceeds 10 and maximumBatchingWindow is overridden in beta env', () => {

				process.env.ENV = 'beta';

				const hooks = SQSHelper.buildHooks({
					name: 'Test',
					consumerProperties: { batchSize: 50 }
				});

				const [, consumerHook] = hooks;
				const [, { events }] = consumerHook;

				assert.deepStrictEqual(events[0].sqs, {
					arn: 'arn:aws:sqs:${aws:region}:${aws:accountId}:${self:custom.serviceName}TestQueue',
					functionResponseType: 'ReportBatchItemFailures',
					batchSize: 10,
					maximumBatchingWindow: 0,
					maximumConcurrency: 10
				});
			});

			it('Should not modify maximumBatchingWindow in prod env', () => {

				process.env.ENV = 'prod';

				const hooks = SQSHelper.buildHooks({ name: 'Test' });
				const [, consumerHook] = hooks;
				const [, { events }] = consumerHook;

				assert.deepStrictEqual(events[0].sqs, {
					arn: 'arn:aws:sqs:${aws:region}:${aws:accountId}:${self:custom.serviceName}TestQueue',
					functionResponseType: 'ReportBatchItemFailures',
					batchSize: 10,
					maximumBatchingWindow: 20,
					maximumConcurrency: 10
				});
			});

			it('Should set maximumBatchingWindow to 0 and keep batchSize at 10 for main consumer in local env', () => {

				process.env.JANIS_LOCAL = '1';

				const hooks = SQSHelper.buildHooks({ name: 'Test' });
				const [, consumerHook] = hooks;
				const [, { events }] = consumerHook;

				assert.deepStrictEqual(events[0].sqs, {
					arn: 'arn:aws:sqs:${aws:region}:${aws:accountId}:${self:custom.serviceName}TestQueue',
					functionResponseType: 'ReportBatchItemFailures',
					batchSize: 10,
					maximumBatchingWindow: 0,
					maximumConcurrency: 10
				});
			});

			it('Should not modify maximumBatchingWindow when ENV is not set', () => {

				delete process.env.ENV;

				const hooks = SQSHelper.buildHooks({ name: 'Test' });
				const [, consumerHook] = hooks;
				const [, { events }] = consumerHook;

				assert.deepStrictEqual(events[0].sqs, {
					arn: 'arn:aws:sqs:${aws:region}:${aws:accountId}:${self:custom.serviceName}TestQueue',
					functionResponseType: 'ReportBatchItemFailures',
					batchSize: 10,
					maximumBatchingWindow: 20,
					maximumConcurrency: 10
				});
			});

			it('Should keep maximumBatchingWindow when keepBatchingWindow is true in beta env', () => {

				process.env.ENV = 'beta';

				const hooks = SQSHelper.buildHooks({
					name: 'Test',
					consumerProperties: { keepBatchingWindow: true }
				});

				const [, consumerHook] = hooks;
				const [, { events }] = consumerHook;

				assert.deepStrictEqual(events[0].sqs, {
					arn: 'arn:aws:sqs:${aws:region}:${aws:accountId}:${self:custom.serviceName}TestQueue',
					functionResponseType: 'ReportBatchItemFailures',
					batchSize: 10,
					maximumBatchingWindow: 20,
					maximumConcurrency: 10
				});
			});

			it('Should keep custom maximumBatchingWindow and batchSize when keepBatchingWindow is true in beta env', () => {

				process.env.ENV = 'beta';

				const hooks = SQSHelper.buildHooks({
					name: 'Test',
					consumerProperties: { batchSize: 50, maximumBatchingWindow: 30, keepBatchingWindow: true }
				});

				const [, consumerHook] = hooks;
				const [, { events }] = consumerHook;

				assert.deepStrictEqual(events[0].sqs, {
					arn: 'arn:aws:sqs:${aws:region}:${aws:accountId}:${self:custom.serviceName}TestQueue',
					functionResponseType: 'ReportBatchItemFailures',
					batchSize: 50,
					maximumBatchingWindow: 30,
					maximumConcurrency: 10
				});
			});

			it('Should set maximumBatchingWindow to 0 for delay consumer in beta env', () => {

				process.env.ENV = 'beta';

				const hooks = SQSHelper.buildHooks({
					name: 'Test',
					delayQueueProperties: {}
				});

				const [, mainConsumerHook, , delayConsumerHook] = hooks;

				// Main consumer
				const [, { events: mainEvents }] = mainConsumerHook;
				assert.strictEqual(mainEvents[0].sqs.maximumBatchingWindow, 0);
				assert.strictEqual(mainEvents[0].sqs.batchSize, 10);

				// Delay consumer
				const [, { events: delayEvents }] = delayConsumerHook;
				assert.strictEqual(delayEvents[0].sqs.maximumBatchingWindow, 0);
				assert.strictEqual(delayEvents[0].sqs.batchSize, 10);
			});

			it('Should keep maximumBatchingWindow for delay consumer when keepBatchingWindow is true in beta env', () => {

				process.env.ENV = 'beta';

				const hooks = SQSHelper.buildHooks({
					name: 'Test',
					delayQueueProperties: {},
					delayConsumerProperties: { keepBatchingWindow: true }
				});

				const [, , , delayConsumerHook] = hooks;
				const [, { events: delayEvents }] = delayConsumerHook;

				assert.strictEqual(delayEvents[0].sqs.maximumBatchingWindow, 20);
				assert.strictEqual(delayEvents[0].sqs.batchSize, 10);
			});

			it('Should not affect DLQ consumer without maximumBatchingWindow in beta env', () => {

				process.env.ENV = 'beta';

				const hooks = SQSHelper.buildHooks({
					name: 'Test',
					dlqConsumerProperties: { batchSize: 10 }
				});

				const dlqConsumerHook = hooks.find(([type, config]) => type === 'function' && config.functionName === 'TestDLQQueueConsumer');
				const [, { events }] = dlqConsumerHook;

				assert.strictEqual(events[0].sqs.maximumBatchingWindow, undefined);
				assert.strictEqual(events[0].sqs.batchSize, 10);
			});

			it('Should set maximumBatchingWindow to 0 for DLQ consumer with explicit maximumBatchingWindow in beta env', () => {

				process.env.ENV = 'beta';

				const hooks = SQSHelper.buildHooks({
					name: 'Test',
					dlqConsumerProperties: { batchSize: 10, maximumBatchingWindow: 15 }
				});

				const dlqConsumerHook = hooks.find(([type, config]) => type === 'function' && config.functionName === 'TestDLQQueueConsumer');
				const [, { events }] = dlqConsumerHook;

				assert.strictEqual(events[0].sqs.maximumBatchingWindow, 0);
				assert.strictEqual(events[0].sqs.batchSize, 10);
			});

			it('Should cap DLQ consumer batchSize to 10 when maximumBatchingWindow is overridden in qa env', () => {

				process.env.ENV = 'qa';

				const hooks = SQSHelper.buildHooks({
					name: 'Test',
					dlqConsumerProperties: { batchSize: 25, maximumBatchingWindow: 15 }
				});

				const dlqConsumerHook = hooks.find(([type, config]) => type === 'function' && config.functionName === 'TestDLQQueueConsumer');
				const [, { events }] = dlqConsumerHook;

				assert.strictEqual(events[0].sqs.maximumBatchingWindow, 0);
				assert.strictEqual(events[0].sqs.batchSize, 10);
			});

			it('Should keep DLQ consumer maximumBatchingWindow when keepBatchingWindow is true in beta env', () => {

				process.env.ENV = 'beta';

				const hooks = SQSHelper.buildHooks({
					name: 'Test',
					dlqConsumerProperties: { batchSize: 25, maximumBatchingWindow: 15, keepBatchingWindow: true }
				});

				const dlqConsumerHook = hooks.find(([type, config]) => type === 'function' && config.functionName === 'TestDLQQueueConsumer');
				const [, { events }] = dlqConsumerHook;

				assert.strictEqual(events[0].sqs.maximumBatchingWindow, 15);
				assert.strictEqual(events[0].sqs.batchSize, 25);
			});
		});
	});
});
