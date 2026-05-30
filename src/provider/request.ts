import vscode from 'vscode';
import { AuthManager } from '../auth';
import { MiMoClient } from '../client';
import { getApiModelId, getBaseUrl, getMaxTokens } from '../config';
import { LANGUAGE_MODEL_CHAT_SYSTEM_ROLE, MODELS } from '../consts';
import { t } from '../i18n';
import type { MiMoRequest } from '../types';
import { convertMessages, countMessageChars } from './convert';
import {
	classifyMiMoRequest,
	dumpMiMoRequest,
	type CacheDiagnosticsRecorder,
	type CacheDiagnosticsRun,
	type RequestKind,
} from './debug';
import { getConfiguredThinkingEffort, type ModelConfigurationOptions } from './models';
import type { ReplayMarkerMetadata } from './replay';
import type { ConversationSegment } from './segment';
import { collectTrailingToolResultIds, prepareRequestTools } from './tools/request';
import { resolveImageMessages } from './vision/index';

export interface PreparedChatRequest {
	client: MiMoClient;
	request: MiMoRequest;
	isThinkingModel: boolean;
	totalRequestChars: number;
	trailingToolResultIds: string[];
	cacheDiagnostics: CacheDiagnosticsRun;
	requestKind: RequestKind;
	segment: ConversationSegment;
	replayMarkerMetadata: ReplayMarkerMetadata;
	visionMarkerTextChars?: number;
}

export interface PrepareChatRequestOptions {
	authManager: AuthManager;
	globalStorageUri: vscode.Uri;
	modelInfo: vscode.LanguageModelChatInformation;
	segment: ConversationSegment;
	messages: readonly vscode.LanguageModelChatRequestMessage[];
	options: vscode.ProvideLanguageModelChatResponseOptions;
	token: vscode.CancellationToken;
	cacheDiagnostics: CacheDiagnosticsRecorder;
	getVisionModel: () => Promise<vscode.LanguageModelChat | undefined>;
}

export async function prepareChatRequest({
	authManager,
	globalStorageUri,
	modelInfo,
	segment,
	messages,
	options,
	token,
	cacheDiagnostics,
	getVisionModel,
}: PrepareChatRequestOptions): Promise<PreparedChatRequest> {
	const apiKey = await authManager.getApiKey();
	if (!apiKey) {
		throw new Error(t('auth.notConfigured'));
	}

	const client = new MiMoClient(getBaseUrl(), apiKey);
	const modelDef = MODELS.find((m) => m.id === modelInfo.id);
	const isThinkingModel = modelDef?.capabilities.thinking ?? false;
	const thinkingEffort = getConfiguredThinkingEffort(options as ModelConfigurationOptions);
	const maxTokens = getMaxTokens() ?? 8192;

	const visionResolution = await resolveImageMessages(messages, token, getVisionModel);
	const resolvedMessages = visionResolution.messages;
	const mimoMessages = convertMessages(resolvedMessages, isThinkingModel);
	const tools = prepareRequestTools(modelDef?.capabilities.toolCalling, options);

	const totalRequestChars = countMessageChars(mimoMessages);

	let systemPrompt: string | undefined;
	const nonSystemMessages: typeof mimoMessages = [];
	for (let i = 0; i < mimoMessages.length; i++) {
		const msg = mimoMessages[i];
		const originalMsg = resolvedMessages[i];
		if (typeof msg.content === 'string' && msg.role === 'user' && !systemPrompt) {
			if ((originalMsg?.role as unknown as number) === LANGUAGE_MODEL_CHAT_SYSTEM_ROLE) {
				systemPrompt = msg.content;
				continue;
			}
		}
		nonSystemMessages.push(msg);
	}

	const request: MiMoRequest = {
		model: getApiModelId(modelInfo.id),
		max_tokens: maxTokens ?? 8192,
		stream: true,
		messages: nonSystemMessages,
		...(systemPrompt ? { system: systemPrompt } : {}),
		tools,
		...(isThinkingModel
			? {
					thinking: {
						type: thinkingEffort === 'none' ? ('disabled' as const) : ('enabled' as const),
						...(thinkingEffort !== 'none' ? { budget_tokens: 10000 } : {}),
					},
				}
			: {}),
	};
	const requestKind = classifyMiMoRequest({
		request,
		inputMessages: messages,
	});
	dumpMiMoRequest(request, {
		globalStorageUri,
		segment,
		requestKind,
		vscodeModelId: modelInfo.id,
		isThinkingModel,
		thinkingEffort,
		maxTokens,
		inputMessages: messages,
		resolvedMessages,
		requestOptions: options,
		visionModelId: visionResolution.visionModelId,
		visionStats: visionResolution.stats,
	});

	const diagnosticsRun = cacheDiagnostics.beginRequest({
		request,
		segment,
		requestKind,
		vscodeModelId: modelInfo.id,
		isThinkingModel,
		thinkingEffort,
		maxTokens,
		inputMessages: messages,
		resolvedMessages,
		visionModelId: visionResolution.visionModelId,
		visionStats: visionResolution.stats,
	});

	return {
		client,
		request,
		isThinkingModel,
		totalRequestChars,
		trailingToolResultIds: collectTrailingToolResultIds(mimoMessages),
		cacheDiagnostics: diagnosticsRun,
		requestKind,
		segment,
		replayMarkerMetadata: visionResolution.replayMarkerMetadata,
		visionMarkerTextChars: visionResolution.stats.markerVisionTextChars || undefined,
	};
}