import vscode from 'vscode';
import { logger } from '../logger';
import { MiMoChatProvider } from '../provider';

export async function registerProvider(
	context: vscode.ExtensionContext,
): Promise<MiMoChatProvider> {
	const provider = new MiMoChatProvider(context);

	context.subscriptions.push(
		vscode.commands.registerCommand('mimo-copilot.setApiKey', () => provider.configureApiKey()),
		vscode.commands.registerCommand('mimo-copilot.clearApiKey', () => provider.clearApiKey()),
		vscode.commands.registerCommand('mimo-copilot.setVisionModel', () =>
			provider.setVisionProxyModel(),
		),
		vscode.lm.registerLanguageModelChatProvider('mimo', provider),
	);

	// Copilot Chat can serve cached model info without configurationSchema.
	// Activate it first so this refresh reaches a live listener and re-queries the provider.
	await activateCopilotChat();
	provider.refreshModelPicker();

	return provider;
}

async function activateCopilotChat(): Promise<void> {
	try {
		await vscode.extensions.getExtension('github.copilot-chat')?.activate();
	} catch (error) {
		logger.warn('Copilot Chat activation unavailable; model picker refresh may be delayed', error);
	}
}
