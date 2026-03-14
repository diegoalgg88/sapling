declare module "@mariozechner/pi-coding-agent" {
	export interface ExtensionContext {
		ui: {
			notify(message: string, type?: "info" | "warning" | "error" | "success"): void;
			showInformationMessage(message: string): Promise<string | undefined>;
			showErrorMessage(message: string): Promise<string | undefined>;
			select(title: string, options: string[], opts?: any): Promise<string | undefined>;
			confirm(title: string, message: string, opts?: any): Promise<boolean>;
			input(title: string, placeholder?: string, opts?: any): Promise<string | undefined>;
		};
		log(message: string): void;
		cwd: string;
		sessionManager: any;
		modelRegistry: any;
		model: any;
	}

	export interface ExtensionAPI {
		on(
			event: "session_start",
			handler: (payload: any, ctx: ExtensionContext) => Promise<void> | void,
		): void;
		on(
			event: "session_shutdown",
			handler: (payload: any, ctx: ExtensionContext) => Promise<void> | void,
		): void;
		on(
			event: "tool_call",
			handler: (payload: any, ctx: ExtensionContext) => Promise<void> | void,
		): void;
		on(
			event: "tool_result",
			handler: (payload: any, ctx: ExtensionContext) => Promise<void> | void,
		): void;
		on(event: string, handler: (payload: any, ctx: ExtensionContext) => Promise<void> | void): void;

		events: {
			emit(event: string, payload: any): void;
			on(
				event: string,
				handler: (payload: any, ctx: ExtensionContext) => Promise<void> | void,
			): void;
		};

		registerCommand(
			name: string,
			options: {
				description: string;
				getArgumentCompletions?: (prefix: string) => Array<{ value: string; label: string }> | null;
				handler: (args: string, ctx: any) => Promise<void> | void;
			},
		): void;

		registerTool(options: {
			name: string;
			label: string;
			description: string;
			parameters: any;
			execute: (
				toolCallId: string,
				params: any,
				signal: any,
				onUpdate: any,
				ctx: ExtensionContext,
			) => Promise<any>;
		}): void;

		sendMessage(message: any, options?: any): void;
		sendUserMessage(content: any, options?: any): void;
		exec(command: string, args: string[], options?: any): Promise<any>;
	}
}
