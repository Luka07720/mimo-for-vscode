import vscode from 'vscode';
import { t } from '../../i18n';
import type { MiMoMessage, MiMoTool } from '../../types';
import { convertTools } from '../convert';
import { MIMO_TOOLS_LIMIT } from './consts';

export function prepareRequestTools(
	toolCallingCapability: boolean | number | undefined,
	options: vscode.ProvideLanguageModelChatResponseOptions,
): MiMoTool[] | undefined {
	const tools = toolCallingCapability ? convertTools(options.tools) : undefined;
	const toolLimit = getToolCallingLimit(toolCallingCapability);
	const toolsCount = tools?.length ?? 0;
	if (toolsCount > toolLimit) {
		throw new Error(t('request.toolsLimitExceeded', toolLimit, toolsCount));
	}
	return tools;
}

export function collectTrailingToolResultIds(messages: readonly MiMoMessage[]): string[] {
	const trailingToolResultIds: string[] = [];
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index];
		if (message.role !== 'user' || !Array.isArray(message.content)) {
			break;
		}
		const toolResult = message.content.find((block) => block.type === 'tool_result');
		if (!toolResult) {
			break;
		}
		trailingToolResultIds.push(toolResult.tool_use_id as string);
	}
	return trailingToolResultIds.reverse();
}

function getToolCallingLimit(toolCallingCapability: boolean | number | undefined): number {
	return typeof toolCallingCapability === 'number' ? toolCallingCapability : MIMO_TOOLS_LIMIT;
}