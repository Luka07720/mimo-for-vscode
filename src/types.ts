/**
 * Shared types for the MiMo Copilot extension.
 * API format: Anthropic Messages API (compatible with xiaomimimo.com)
 */

// ---- API request/response types ----

export interface MiMoMessage {
	role: 'user' | 'assistant';
	content: string | MiMoContentBlock[];
}

export type MiMoContentBlock =
	| { type: 'text'; text: string }
	| { type: 'thinking'; thinking: string }
	| { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
	| { type: 'tool_result'; tool_use_id: string; content: string };

export interface MiMoToolUseBlock {
	type: 'tool_use';
	id: string;
	name: string;
	input: Record<string, unknown>;
}

export interface MiMoTool {
	name: string;
	description?: string;
	input_schema: Record<string, unknown>;
}

export interface MiMoUsage {
	input_tokens: number;
	output_tokens: number;
	cache_creation_input_tokens?: number;
	cache_read_input_tokens?: number;
}

export interface MiMoRequest {
	model: string;
	max_tokens: number;
	system?: string;
	messages: MiMoMessage[];
	stream: boolean;
	temperature?: number;
	top_p?: number;
	tools?: MiMoTool[];
	thinking?: {
		type: 'enabled' | 'disabled';
		budget_tokens?: number;
	};
}

// ---- Anthropic SSE stream event types ----

export interface MiMoStreamMessageStart {
	type: 'message_start';
	message: {
		id: string;
		type: 'message';
		role: 'assistant';
		content: [];
		model: string;
		usage: MiMoUsage;
	};
}

export interface MiMoStreamContentBlockStart {
	type: 'content_block_start';
	index: number;
	content_block:
		| { type: 'text'; text: string }
		| { type: 'thinking'; thinking: string }
		| { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> };
}

export interface MiMoStreamContentBlockDelta {
	type: 'content_block_delta';
	index: number;
	delta:
		| { type: 'text_delta'; text: string }
		| { type: 'thinking_delta'; thinking: string }
		| { type: 'input_json_delta'; partial_json: string };
}

export interface MiMoStreamContentBlockStop {
	type: 'content_block_stop';
	index: number;
}

export interface MiMoStreamMessageDelta {
	type: 'message_delta';
	delta: { stop_reason: string };
	usage: MiMoUsage;
}

export interface MiMoStreamMessageStop {
	type: 'message_stop';
}

export type MiMoStreamEvent =
	| MiMoStreamMessageStart
	| MiMoStreamContentBlockStart
	| MiMoStreamContentBlockDelta
	| MiMoStreamContentBlockStop
	| MiMoStreamMessageDelta
	| MiMoStreamMessageStop;

// ---- Stream callbacks ----

export interface StreamCallbacks {
	onContent: (content: string) => void;
	onThinking: (text: string) => void;
	onToolCall: (toolCall: MiMoToolUseBlock) => void;
	onError: (error: Error) => void;
	onDone: () => void;
	onUsage?: (usage: MiMoUsage) => void;
}

// ---- Model definitions ----

export interface ModelDefinition {
	id: string;
	name: string;
	family: string;
	version: string;
	detail: string;
	maxInputTokens: number;
	maxOutputTokens: number;
	capabilities: {
		toolCalling: boolean | number;
		imageInput: boolean;
		thinking: boolean;
	};
	requiresThinkingParam: boolean;
}
