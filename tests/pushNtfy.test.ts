import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { pushNtfy } from '../src/pushNtfy';
import { createMockEnv } from './helpers/mocks';

describe('pushNtfy', () => {
	let env: Env;

	beforeEach(() => {
		env = createMockEnv();
		// Mock console methods
		vi.spyOn(console, 'error').mockImplementation(() => {});
		// Mock global fetch to prevent actual notifications
		vi.stubGlobal('fetch', vi.fn());
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	describe('Environment validation', () => {
		it('should throw error when NTFY_URL is missing', async () => {
			env.NTFY_URL = '';

			await expect(pushNtfy('test message', env)).rejects.toThrow('NTFY_URL missing from env or empty');
		});

		it('should throw error when NTFY_URL is undefined', async () => {
			// @ts-expect-error - Testing undefined scenario
			delete env.NTFY_URL;

			await expect(pushNtfy('test message', env)).rejects.toThrow('NTFY_URL missing from env or empty');
		});
	});

	describe('Message handling', () => {
		it('should handle single string message', async () => {
			const mockFetch = vi.mocked(fetch);
			mockFetch.mockResolvedValueOnce(new Response('OK'));

			await pushNtfy('Single notification message', env);

			expect(mockFetch).toHaveBeenCalledWith(env.NTFY_URL, {
				method: 'POST',
				body: 'Single notification message',
				headers: { 'Content-Type': 'text/plain' },
			});
			expect(mockFetch).toHaveBeenCalledTimes(1);
		});

		it('should handle empty array without sending notification', async () => {
			const mockFetch = vi.mocked(fetch);

			await pushNtfy([], env);

			expect(mockFetch).not.toHaveBeenCalled();
		});

		it('should handle array with single message', async () => {
			const mockFetch = vi.mocked(fetch);
			mockFetch.mockResolvedValueOnce(new Response('OK'));

			await pushNtfy(['Single message in array'], env);

			expect(mockFetch).toHaveBeenCalledWith(env.NTFY_URL, {
				method: 'POST',
				body: 'Single message in array',
				headers: { 'Content-Type': 'text/plain' },
			});
			expect(mockFetch).toHaveBeenCalledTimes(1);
		});

		it('should handle array with single undefined message', async () => {
			const mockFetch = vi.mocked(fetch);

			// @ts-expect-error - Testing undefined scenario
			await pushNtfy([undefined], env);

			expect(mockFetch).not.toHaveBeenCalled();
		});

		it('should handle array with multiple messages and format as grouped notification', async () => {
			const mockFetch = vi.mocked(fetch);
			mockFetch.mockResolvedValueOnce(new Response('OK'));

			const messages = ['First DNS update', 'Second DNS update', 'Third DNS update'];

			await pushNtfy(messages, env);

			const expectedBody = `DNS Records Updated:
• First DNS update
• Second DNS update
• Third DNS update`;

			expect(mockFetch).toHaveBeenCalledWith(env.NTFY_URL, {
				method: 'POST',
				body: expectedBody,
				headers: { 'Content-Type': 'text/plain' },
			});
			expect(mockFetch).toHaveBeenCalledTimes(1);
		});

		it('should handle array with two messages and format as grouped notification', async () => {
			const mockFetch = vi.mocked(fetch);
			mockFetch.mockResolvedValueOnce(new Response('OK'));

			const messages = ['First update', 'Second update'];

			await pushNtfy(messages, env);

			const expectedBody = `DNS Records Updated:
• First update
• Second update`;

			expect(mockFetch).toHaveBeenCalledWith(env.NTFY_URL, {
				method: 'POST',
				body: expectedBody,
				headers: { 'Content-Type': 'text/plain' },
			});
			expect(mockFetch).toHaveBeenCalledTimes(1);
		});
	});

	describe('Error handling', () => {
		it('should handle fetch network error gracefully', async () => {
			const mockFetch = vi.mocked(fetch);
			const networkError = new Error('Network error');
			mockFetch.mockRejectedValueOnce(networkError);

			// Should not throw, just log the error
			await expect(pushNtfy('Test message', env)).resolves.not.toThrow();

			// Verify the fetch was attempted
			expect(mockFetch).toHaveBeenCalledTimes(1);
		});

		it('should handle fetch HTTP error gracefully', async () => {
			const mockFetch = vi.mocked(fetch);
			mockFetch.mockResolvedValueOnce(
				new Response('Server Error', {
					status: 500,
					statusText: 'Internal Server Error',
				}),
			);

			// Should not throw even with HTTP error
			await expect(pushNtfy('Test message', env)).resolves.not.toThrow();

			// Verify the fetch was attempted
			expect(mockFetch).toHaveBeenCalledTimes(1);
		});

		it('should handle fetch timeout error gracefully', async () => {
			const mockFetch = vi.mocked(fetch);
			const timeoutError = new Error('Request timeout');
			mockFetch.mockRejectedValueOnce(timeoutError);

			// Should not throw even with timeout error
			await expect(pushNtfy('Test message', env)).resolves.not.toThrow();

			// Verify the fetch was attempted
			expect(mockFetch).toHaveBeenCalledTimes(1);
		});
	});

	describe('Integration scenarios', () => {
		it('should successfully send notification with valid configuration', async () => {
			const mockFetch = vi.mocked(fetch);
			mockFetch.mockResolvedValueOnce(
				new Response('Message sent', {
					status: 200,
					statusText: 'OK',
				}),
			);

			await pushNtfy('Integration test message', env);

			expect(mockFetch).toHaveBeenCalledWith('https://ntfy.example.com/test-topic', {
				method: 'POST',
				body: 'Integration test message',
				headers: { 'Content-Type': 'text/plain' },
			});
		});

		it('should handle custom NTFY_URL', async () => {
			const mockFetch = vi.mocked(fetch);
			mockFetch.mockResolvedValueOnce(new Response('OK'));

			env.NTFY_URL = 'https://custom.ntfy.server/my-topic';

			await pushNtfy('Custom server test', env);

			expect(mockFetch).toHaveBeenCalledWith('https://custom.ntfy.server/my-topic', {
				method: 'POST',
				body: 'Custom server test',
				headers: { 'Content-Type': 'text/plain' },
			});
		});
	});
});
