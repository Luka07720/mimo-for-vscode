export const OFFICIAL_MIMO_API_HOST = 'api.xiaomimimo.com';
export const ANTHROPIC_API_VERSION = '2023-06-01';
export const MAX_DIAGNOSTIC_FIELD_LENGTH = 300;

export const API_PROVIDER_HTTP_ERROR_LINKS: Record<
	number | string,
	Record<string, { labelKey: string; url: string }>
> = {
	401: {
		mimo: {
			labelKey: 'error.action.createApiKey',
			url: 'https://platform.xiaomimimo.com/api_keys',
		},
	},
	402: {
		mimo: { labelKey: 'error.action.viewUsage', url: 'https://platform.xiaomimimo.com/usage' },
	},
	'5xx': {
		mimo: { labelKey: 'error.action.checkMiMoStatus', url: 'https://status.xiaomimimo.com' },
	},
};
