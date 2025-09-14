export async function pushNtfy(messages: string | string[], env: Env): Promise<void> {
	if (!env.NTFY_URL) {
		throw new Error('NTFY_URL missing from env or empty');
	}
	
	let message: string;
	if (Array.isArray(messages)) {
		if (messages.length === 0) {
			return; // No messages to send
		}
		if (messages.length === 1) {
			message = messages[0];
		} else {
			message = `DNS Records Updated:\n${messages.map(msg => `• ${msg}`).join('\n')}`;
		}
	} else {
		message = messages;
	}
	
	try {
		await fetch(env.NTFY_URL, {
			method: 'POST',
			body: message,
			headers: { 'Content-Type': 'text/plain' },
		});
	} catch (e) {
		console.error('Failed to send ntfy push: ', e);
	}
}
