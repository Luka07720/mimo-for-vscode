import vscode from 'vscode';
import { safeStringify } from '../json';
import type { MiMoContentBlock, MiMoMessage, MiMoTool, MiMoToolUseBlock } from '../types';
import { parseFirstReplayMarker } from './replay';

export function convertMessages(
	messages: readonly vscode.LanguageModelChatRequestMessage[],
	isThinkingModel: boolean,
): MiMoMessage[] {
	const result: MiMoMessage[] = [];

	for (const message of messages) {
		const role = mapRole(message.role);

		let content = '';
		let thinkingContent = '';
		const toolUseBlocks: MiMoToolUseBlock[] = [];
		const toolResults: Array<{ callId: string; content: string }> = [];

		for (const part of message.content) {
			if (part instanceof vscode.LanguageModelTextPart) {
				content += part.value;
			} else if (isLanguageModelThinkingPart(part)) {
				thinkingContent += normalizeThinkingPartText(part.value);
			} else if (part instanceof vscode.LanguageModelToolCallPart) {
				toolUseBlocks.push({
					type: 'tool_use',
					id: part.callId,
					name: part.name,
					input: part.input as Record<string, unknown>,
				});
			} else if (part instanceof vscode.LanguageModelToolResultPart) {
				let toolContent = '';
				for (const item of part.content) {
					if (item instanceof vscode.LanguageModelTextPart) {
						toolContent += item.value;
					}
				}
				toolResults.push({
					callId: part.callId,
					content: toolContent || safeStringify(part.content),
				});
			}
		}

		if (role === 'assistant') {
			if (content || toolUseBlocks.length > 0 || thinkingContent) {
				const replayMarker = isThinkingModel ? parseFirstReplayMarker(message) : undefined;
				const contentBlocks: MiMoContentBlock[] = [];

				if (isThinkingModel) {
					const reasoningContent = getReasoningContent(replayMarker, thinkingContent);
					if (reasoningContent) {
						contentBlocks.push({
							type: 'thinking',
							thinking: reasoningContent,
						});
					}
				}

				if (content) {
					contentBlocks.push({
						type: 'text',
						text: content,
					});
				}

				for (const toolUse of toolUseBlocks) {
					contentBlocks.push({
						type: 'tool_use',
						id: toolUse.id,
						name: toolUse.name,
						input: toolUse.input,
					});
				}

				if (contentBlocks.length > 0) {
					result.push({
						role: 'assistant',
						content: contentBlocks,
					});
				}
			}
		} else {
			if (content) {
				result.push({
					role: 'user',
					content: content,
				});
			}
		}

		for (const tr of toolResults) {
			result.push({
				role: 'user',
				content: [
					{
						type: 'tool_result',
						tool_use_id: tr.callId,
						content: tr.content,
					},
				],
			});
		}
	}

	return result;
}

function getReasoningContent(
	replayMarker: ReturnType<typeof parseFirstReplayMarker>,
	thinkingContent: string,
): string {
	if (replayMarker?.valid && replayMarker.reasoningText) {
		return replayMarker.reasoningText;
	}
	return thinkingContent;
}

function isLanguageModelThinkingPart(part: unknown): part is vscode.LanguageModelThinkingPart {
	return (
		typeof vscode.LanguageModelThinkingPart === 'function' &&
		part instanceof vscode.LanguageModelThinkingPart
	);
}

function normalizeThinkingPartText(value: string | string[]): string {
	return Array.isArray(value) ? value.join('') : value;
}

function mapRole(role: vscode.LanguageModelChatMessageRole): 'user' | 'assistant' {
	switch (role) {
		case vscode.LanguageModelChatMessageRole.User:
			return 'user';
		case vscode.LanguageModelChatMessageRole.Assistant:
			return 'assistant';
		default:
			return 'user';
	}
}

export function convertTools(
	tools: readonly vscode.LanguageModelChatTool[] | undefined,
): MiMoTool[] | undefined {
	if (!tools || tools.length === 0) {
		return undefined;
	}

	return tools.map((tool) => ({
		name: tool.name,
		description: tool.description,
		input_schema: (tool.inputSchema as Record<string, unknown>) ?? {},
	}));
}

export function countMessageChars(messages: MiMoMessage[]): number {
	let total = 0;
	for (const msg of messages) {
		if (typeof msg.content === 'string') {
			total += msg.content.length;
		} else if (Array.isArray(msg.content)) {
			for (const block of msg.content) {
				if (block.type === 'text') {
					total += (block as { text: string }).text?.length ?? 0;
				} else if (block.type === 'thinking') {
					total += (block as { thinking: string }).thinking?.length ?? 0;
				} else if (block.type === 'tool_use') {
					total += (block as { name: string }).name?.length ?? 0;
					total += safeStringify((block as { input: unknown }).input)?.length ?? 0;
				}
			}
		}
	}
	return total;
}
