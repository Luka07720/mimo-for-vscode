import { safeStringify } from '../json';
import { logger } from '../logger';
import type { MiMoRequest, MiMoStreamEvent, StreamCallbacks, MiMoToolUseBlock } from '../types';
import { classifyHttpError, classifyNetworkError, MiMoRequestError } from './error';
import { ANTHROPIC_API_VERSION } from './consts';

type StreamChatCompletionOptions = {
	signal?: AbortSignal;
};

export class MiMoClient {
	constructor(
		private readonly baseUrl: string,
		private readonly apiKey: string,
	) {}

	/**
	 * Stream a chat completion from MiMo API (Anthropic Messages API format).
	 *
	 * POST {baseUrl}/v1/messages with stream=true.
	 *
	 * The response is a stream of SSE events with named event types:
	 * - message_start, content_block_start, content_block_delta, content_block_stop, message_delta, message_stop
	 */
	async streamChatCompletion(
		request: MiMoRequest,
		callbacks: StreamCallbacks,
		cancellationToken?: StreamChatCompletionOptions['signal'],
	): Promise<void> {
		const controller = new AbortController();

		if (cancellationToken) {
			cancellationToken.addEventListener('abort', () => controller.abort());
		}

		// Extract system message from request and build Anthropic format
		const systemPrompt = request.system;
		const requestBody: Record<string, unknown> = {
			model: request.model,
			max_tokens: request.max_tokens,
			messages: request.messages,
			stream: true,
		};

		if (systemPrompt) {
			requestBody.system = systemPrompt;
		}
		if (request.thinking) {
			requestBody.thinking = request.thinking;
		}
		if (request.tools && request.tools.length > 0) {
			requestBody.tools = request.tools;
		}
		if (request.temperature !== undefined) {
			requestBody.temperature = request.temperature;
		}
		if (request.top_p !== undefined) {
			requestBody.top_p = request.top_p;
		}

		let response: Response;
		try {
			response = await fetch(`${this.baseUrl}/v1/messages`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-api-key': this.apiKey,
					'anthropic-version': ANTHROPIC_API_VERSION,
				},
				body: safeStringify(requestBody),
				signal: controller.signal,
			});
		} catch (error: unknown) {
			if (controller.signal.aborted) {
				callbacks.onDone();
				return;
			}
			callbacks.onError(new MiMoRequestError(classifyNetworkError(error), this.baseUrl, { cause: error }));
			return;
		}

		if (!response.ok) {
			callbacks.onError(await MiMoRequestError.fromHttpResponse(response, this.baseUrl));
			return;
		}

		if (!response.body) {
			callbacks.onDone();
			return;
		}

		this.parseSSEStream(response.body, callbacks, controller);
	}

	private parseSSEStream(
		stream: ReadableStream<Uint8Array>,
		callbacks: StreamCallbacks,
		controller: AbortController,
	): void {
		const decoder = new TextDecoder();
		let bufferedText = '';
		let currentEvent = '';
		const activeToolCalls = new Map<number, MiMoToolUseBlock>();

		const cancelAndExit = () => {
			controller.abort();
			callbacks.onDone();
		};

		void (async () => {
			try {
				for await (const chunk of stream) {
					bufferedText += decoder.decode(chunk, { stream: true });

					let newlineIndex: number;
					while ((newlineIndex = bufferedText.indexOf('\n')) !== -1) {
						const line = bufferedText.slice(0, newlineIndex);
						bufferedText = bufferedText.slice(newlineIndex + 1);

						if (line.startsWith('event: ')) {
							currentEvent = line.slice(7).trim();
							continue;
						}

						if (!line.startsWith('data: ')) {
							continue;
						}

						const data = line.slice(6);
						if (data === '[DONE]') {
							cancelAndExit();
							return;
						}

						let parsed: MiMoStreamEvent;
						try {
							parsed = JSON.parse(data) as MiMoStreamEvent;
						} catch {
							logger.warn('[SSE] Skipping malformed JSON:', data);
							continue;
						}

						switch (parsed.type) {
							case 'message_start':
								// Initial message metadata, usage available here
								if (parsed.message.usage) {
									callbacks.onUsage?.({
										input_tokens: parsed.message.usage.input_tokens,
										output_tokens: parsed.message.usage.output_tokens,
										cache_creation_input_tokens: parsed.message.usage.cache_creation_input_tokens,
										cache_read_input_tokens: parsed.message.usage.cache_read_input_tokens,
									});
								}
								break;

							case 'content_block_start': {
								const block = parsed.content_block;
								if (block.type === 'tool_use') {
									activeToolCalls.set(parsed.index, {
										type: 'tool_use',
										id: block.id,
										name: block.name,
										input: {},
									});
								}
								break;
							}

							case 'content_block_delta': {
								const delta = parsed.delta;
								if (delta.type === 'text_delta') {
									callbacks.onContent(delta.text);
								} else if (delta.type === 'thinking_delta') {
									callbacks.onThinking(delta.thinking);
								} else if (delta.type === 'input_json_delta') {
									const toolCall = activeToolCalls.get(parsed.index);
									if (toolCall) {
										// Accumulate partial JSON for tool input
										const existing = (toolCall as { _partialJson?: string })._partialJson || '';
										(toolCall as { _partialJson?: string })._partialJson = existing + delta.partial_json;
									}
								}
								break;
							}

							case 'content_block_stop': {
								const toolCall = activeToolCalls.get(parsed.index);
								if (toolCall) {
									// Parse accumulated JSON input
									const partialJson = (toolCall as { _partialJson?: string })._partialJson;
									if (partialJson) {
										try {
											toolCall.input = JSON.parse(partialJson) as Record<string, unknown>;
										} catch {
											logger.warn('[SSE] Failed to parse tool input JSON:', partialJson);
										}
									}
									delete (toolCall as { _partialJson?: string })._partialJson;
									callbacks.onToolCall(toolCall);
									activeToolCalls.delete(parsed.index);
								}
								break;
							}

							case 'message_delta': {
								if (parsed.usage) {
									callbacks.onUsage?.({
										input_tokens: parsed.usage.input_tokens,
										output_tokens: parsed.usage.output_tokens,
										cache_creation_input_tokens: parsed.usage.cache_creation_input_tokens,
										cache_read_input_tokens: parsed.usage.cache_read_input_tokens,
									});
								}
								break;
							}

							case 'message_stop':
								cancelAndExit();
								return;
						}
					}
				}
				callbacks.onDone();
			} catch (error: unknown) {
				if (controller.signal.aborted) {
					callbacks.onDone();
				} else {
					callbacks.onError(new MiMoRequestError(classifyNetworkError(error), this.baseUrl, { cause: error }));
				}
			}
		})();
	}
}
