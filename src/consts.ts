import { MIMO_TOOLS_LIMIT } from './provider/tools/consts';
import type { ModelDefinition } from './types';

export const CONFIG_SECTION = 'mimo-copilot';

export const EXTERNAL_URLS = {
	mimo: {
		apiKeys: 'https://platform.xiaomimimo.com/api_keys',
		usage: 'https://platform.xiaomimimo.com/usage',
		status: 'https://status.xiaomimimo.com',
	},
} as const;

export const SHOW_LOGS_URI_PATH = '/showLogs';
export const CONFIGURE_API_KEY_URI_PATH = '/setApiKey';
export const LANGUAGE_MODEL_CHAT_SYSTEM_ROLE = 3;
export const API_KEY_SECRET = 'mimo-copilot.apiKey';
export const WELCOME_SHOWN_KEY = 'mimo-copilot.welcomeShown';
export const WALKTHROUGH_ID = 'Vizards.mimo-for-copilot#mimoGettingStarted';

/** Model registry */
export const MODELS: ModelDefinition[] = [
	{
		id: 'mimo-v2-flash',
		name: 'MiMo V2 Flash',
		family: 'mimo',
		version: 'v2',
		detail: 'Fast, general-purpose model',
		maxInputTokens: 200000,
		maxOutputTokens: 65536,
		capabilities: {
			toolCalling: MIMO_TOOLS_LIMIT,
			imageInput: false,
			thinking: false,
		},
		requiresThinkingParam: false,
	},
	{
		id: 'mimo-v2.5',
		name: 'MiMo V2.5',
		family: 'mimo',
		version: 'v2.5',
		detail: 'Balanced performance and speed',
		maxInputTokens: 200000,
		maxOutputTokens: 65536,
		capabilities: {
			toolCalling: MIMO_TOOLS_LIMIT,
			imageInput: true,
			thinking: false,
		},
		requiresThinkingParam: false,
	},
	{
		id: 'mimo-v2.5-pro',
		name: 'MiMo V2.5 Pro',
		family: 'mimo',
		version: 'v2.5-pro',
		detail: 'Most capable reasoning model with thinking',
		maxInputTokens: 200000,
		maxOutputTokens: 65536,
		capabilities: {
			toolCalling: MIMO_TOOLS_LIMIT,
			imageInput: false,
			thinking: true,
		},
		requiresThinkingParam: true,
	},
];
