import { ClientError } from "../errors.ts";
import type { ContentBlock, LlmClient, LlmRequest, LlmResponse, Message } from "../types.ts";

interface OpenAiConfig {
	model?: string;
	apiKey?: string;
	baseURL?: string;
}

export class OpenAiClient implements LlmClient {
	readonly id = "openai-fetch";

	private readonly model: string | undefined;
	private readonly apiKey: string | undefined;
	private readonly baseURL: string | undefined;

	constructor(config?: OpenAiConfig) {
		this.model = config?.model;
		this.apiKey = config?.apiKey;
		this.baseURL = config?.baseURL;
	}

	estimateTokens(text: string): number {
		return Math.ceil(text.length / 4);
	}

	async call(request: LlmRequest): Promise<LlmResponse> {
		if (!this.apiKey) {
			throw new ClientError("Missing API key for OpenAI-compatible client", "SDK_AUTH_FAILED");
		}

		const baseURL = request.model?.startsWith("moonshotai")
			? "https://integrate.api.nvidia.com/v1"
			: (this.baseURL ?? "https://api.openai.com/v1");

		const url = `${baseURL}/chat/completions`;
		const model = request.model ?? this.model;

		if (!model) {
			throw new ClientError("No model specified", "SDK_MODEL_NOT_FOUND");
		}

		// Convert messages to OpenAI format
		const openaiMessages = request.messages.map((msg) => {
			if (typeof msg.content === "string") {
				return { role: msg.role, content: msg.content };
			}

			// Map Sapling ContentBlocks to OpenAI format
			const content = msg.content.map((block) => {
				if (block.type === "text") {
					return { type: "text", text: block.text };
				}
				if (block.type === "tool_use") {
					return {
						type: "function",
						function: {
							name: block.name,
							arguments: JSON.stringify(block.input),
						},
					};
				}
				// Handle tool_result which might be in messages from loop.ts
				if ((block as any).type === "tool_result") {
					return {
						role: "tool",
						tool_call_id: (block as any).tool_use_id,
						content: (block as any).content,
					};
				}
				return block;
			});
			return { role: msg.role, content };
		});

		// Flatten the messages if they contain tools/tool_results
		const finalMessages: any[] = [];
		// ... actually, OpenAI expects a specific sequence.
		// For now, let's simplify and follow the LlmRequest interface which is similar to Anthropic's.
		// We'll need to adapt the tool calls/results.

		// Re-implementing message conversion more carefully:
		const messages: any[] = [{ role: "system", content: request.systemPrompt }];

		for (const msg of request.messages) {
			if (typeof msg.content === "string") {
				messages.push({ role: msg.role, content: msg.content });
			} else {
				const toolCalls: any[] = [];
				const toolResults: any[] = [];
				let text = "";

				for (const block of msg.content) {
					if (block.type === "text") {
						text += block.text;
					} else if (block.type === "tool_use") {
						toolCalls.push({
							id: block.id,
							type: "function",
							function: {
								name: block.name,
								arguments: JSON.stringify(block.input),
							},
						});
					} else if ((block as any).type === "tool_result") {
						toolResults.push({
							role: "tool",
							tool_call_id: (block as any).tool_use_id,
							content: (block as any).content,
						});
					}
				}

				if (text || toolCalls.length > 0) {
					const pushMsg: any = { role: msg.role };
					if (text) pushMsg.content = text;
					if (toolCalls.length > 0) pushMsg.tool_calls = toolCalls;
					messages.push(pushMsg);
				}

				for (const result of toolResults) {
					messages.push(result);
				}
			}
		}

		// Adapt parameters for specific models
		const body: any = {
			model,
			messages,
			max_tokens: request.maxTokens ?? 4096,
		};

		if (request.tools && request.tools.length > 0) {
			body.tools = request.tools.map((t) => ({
				type: "function",
				function: {
					name: t.name,
					description: t.description,
					parameters: t.input_schema,
				},
			}));
		}

		// Model specific adaptations
		if (model.startsWith("moonshotai/kimi-k2") || model.startsWith("z-ai/glm4")) {
			(body as any).chat_template_kwargs = {
				thinking: true,
			};

			// GLM uses a slightly different key in some versions, but NVIDIA NIM doc says 'thinking' for kimi.
			// Re-checking NIM doc for GLM: it says {"enable_thinking":true,"clear_thinking":false} in example.
			if (model.startsWith("z-ai/glm4")) {
				(body as any).chat_template_kwargs = {
					enable_thinking: true,
					clear_thinking: false,
				};
			}
		}

		try {
			const response = await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${this.apiKey}`,
				},
				body: JSON.stringify(body),
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new ClientError(`OpenAI API error: ${response.status} ${errorText}`, "SDK_API_ERROR");
			}

			const data = await response.json();
			const choice = data.choices[0];
			const resultMessage = choice.message;

			const content: ContentBlock[] = [];
			if (resultMessage.content) {
				content.push({ type: "text", text: resultMessage.content });
			}

			if (resultMessage.tool_calls) {
				for (const call of resultMessage.tool_calls) {
					if (call.type === "function") {
						content.push({
							type: "tool_use",
							id: call.id,
							name: call.function.name,
							input: JSON.parse(call.function.arguments),
						});
					}
				}
			}

			const stopReasonMap: Record<string, "end_turn" | "tool_use" | "max_tokens"> = {
				stop: "end_turn",
				tool_calls: "tool_use",
				length: "max_tokens",
			};

			return {
				content,
				usage: {
					inputTokens: data.usage.prompt_tokens,
					outputTokens: data.usage.completion_tokens,
				},
				model: data.model,
				stopReason: stopReasonMap[choice.finish_reason] ?? "end_turn",
			};
		} catch (err) {
			if (err instanceof ClientError) throw err;
			throw new ClientError(
				`OpenAI request failed: ${err instanceof Error ? err.message : String(err)}`,
				"SDK_API_ERROR",
			);
		}
	}
}
