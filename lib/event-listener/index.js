'use strict';

const logger = require('lllog')();

const startCase = require('lodash.startcase');
const kebabCase = require('lodash.kebabcase');

const INTEGRATION = 'lambda';

const eventListener = ({ entityName, eventName, mustHaveClient, listenersDirName }) => {

	const entityNameAsTitle = startCase(entityName);
	const entityNameAsKebab = kebabCase(entityName);

	const eventNameAsTitle = startCase(eventName);
	const eventNameAsKebab = kebabCase(eventName);

	const authorizer = mustHaveClient ? 'ServiceAuthorizer' : 'ServiceNoClientAuthorizer';

	const listenerName = `${entityNameAsTitle}${eventNameAsTitle}Listener`.replace(/ /g, '');

	return {
		[listenerName]: {
			handler: `src/${listenersDirName}/${entityNameAsKebab}/${eventNameAsKebab}.handler`,
			description: `${entityNameAsTitle} ${eventNameAsTitle} Listener`,
			events: [
				{
					http: {
						integration: INTEGRATION,
						path: `/listener/${entityNameAsKebab}/${eventNameAsKebab}`,
						method: 'post',
						authorizer: `\${file(./serverless/functions/subtemplates/authorizers.yml):${authorizer}}`,
						request: {
							template: '${self:custom.apiRequestTemplate}'
						},
						response: '${self:custom.apiResponseTemplate}',
						responses: '${self:custom.apiOfflineResponseTemplate}'
					}
				}
			]
		}
	};
};

const defaultParams = {
	mustHaveClient: false,
	listenersDirName: 'event-listeners'
};

module.exports = ({ functions, ...serviceConfig }, hookParams) => {

	const params = {
		...defaultParams,
		...hookParams
	};

	if(!params.entityName)
		throw new Error('Missing or empty entityName in janis.eventListener hook.');

	if(!params.eventName)
		throw new Error('Missing or empty eventName in janis.eventListener hook.');

	/* istanbul ignore next */
	if(!serviceConfig.custom || !serviceConfig.custom.apiRequestTemplate)
		logger.warn('Missing custom.apiRequestTemplate property. Add janis.templates hook first.');

	/* istanbul ignore next */
	if(!serviceConfig.custom || !serviceConfig.custom.apiResponseTemplate)
		logger.warn('Missing custom.apiResponseTemplate property. Add janis.templates hook first.');

	/* istanbul ignore next */
	if(!serviceConfig.custom || !serviceConfig.custom.apiOfflineResponseTemplate)
		logger.warn('Missing custom.apiOfflineResponseTemplate property. Add janis.templates hook first.');

	return {
		...serviceConfig,
		functions: [
			...(functions || []),
			eventListener(params)
		]
	};
};