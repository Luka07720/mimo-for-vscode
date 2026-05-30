import { URL } from 'node:url';

import { t } from '../i18n';
import { logger } from '../logger';
import { safeStringify } from '../json';
import { API_PROVIDER_HTTP_ERROR_LINKS, MAX_DIAGNOSTIC_FIELD_LENGTH, OFFICIAL_MIMO_API_HOST } from './consts';

const OFFICIAL_HOSTS = new Set([OFFICIAL_MIMO_API_HOST, `www.${OFFICIAL_MIMO_API_HOST}`]);

const actionUrls: Record<string, string | undefined> = {};

export function setErrorActionUrl(key: string, url: string): void {
	actionUrls[key] = url;
}

export function getErrorActionUrl(key: string): string | undefined {
	return actionUrls[key];
}

export function isOfficialEndpoint(host: string): boolean {
	return OFFICIAL_HOSTS.has(host);
}

export type HttpErrorKind = 'http';
export type NetworkErrorKind = 'network';
export type UnknownErrorKind = 'unknown';
export type ErrorKind = HttpErrorKind | NetworkErrorKind | UnknownErrorKind;

export type NetworkErrorClassification =
	| 'dns'
	| 'unreachable'
	| 'interrupted'
	| 'timeout'
	| 'tls'
	| 'aborted'
	| 'protocol'
	| 'configuration'
	| 'generic';

export type HttpErrorClassification = {
	status: number;
	code: string | undefined;
	message: string | undefined;
	bodyPreview: string | undefined;
	kind: 'client' | 'server' | 'proxy' | 'unknown';
};
export type ErrorClassification = HttpErrorClassification | NetworkErrorClassification;

interface ResponseLike {
	readonly status: number;
	readonly url: string;
	text(): Promise<string>;
}

export class MiMoRequestError extends Error {
	readonly kind: ErrorKind;
	readonly userSummary: string;
	readonly diagnosticMessage: string;
	readonly baseUrl: string | undefined;
	readonly status: number | undefined;
	readonly code: string | undefined;

	constructor(classification: ErrorClassification, baseUrl?: string, options?: ErrorOptions) {
		const isHttp = typeof classification === 'object';
		const kind: ErrorKind = isHttp ? 'http' : classification === 'generic' || classification === 'configuration' ? 'unknown' : 'network';
		const message = isHttp
			? buildHttpErrorMessage(classification as HttpErrorClassification, baseUrl)
			: buildNetworkErrorMessage(classification as NetworkErrorClassification, baseUrl);
		super(message, options);
		this.name = 'MiMoRequestError';
		this.kind = kind;
		this.userSummary = message;
		this.diagnosticMessage = message;
		this.baseUrl = baseUrl;
		this.status = isHttp ? (classification as HttpErrorClassification).status : undefined;
		this.code = isHttp ? (classification as HttpErrorClassification).code : undefined;
	}

	static async fromHttpResponse<T extends ResponseLike>(
		response: T,
		baseUrl: string,
	): Promise<MiMoRequestError> {
		const classification = await classifyHttpError(response);
		return new MiMoRequestError(classification, baseUrl, { cause: response });
	}
}

export async function classifyHttpError<T extends ResponseLike>(response: T): Promise<HttpErrorClassification> {
	let code: string | undefined;
	let message: string | undefined;
	let bodyPreview: string | undefined;

	try {
		const bodyText = await response.text();
		bodyPreview = truncateBody(bodyText);

		const contentType = (response as unknown as { headers?: Headers }).headers?.get?.('content-type') ?? '';
		const isJson = contentType.includes('json');

		if (isJson || looksLikeJson(bodyText)) {
			const json = JSON.parse(bodyText);
			if (json && typeof json === 'object') {
				code = typeof json.error?.code === 'string' ? json.error.code : typeof json.type === 'string' ? json.type : undefined;
				message =
					typeof json.error?.message === 'string'
						? json.error.message
						: typeof json.message === 'string'
							? json.message
							: undefined;
			}
		}
	} catch (error: unknown) {
		logger.warn(`Failed to read HTTP ${response.status} error body:`, error);
	}

	const kind = categorizeStatus(response.status);
	return { status: response.status, code, message, bodyPreview, kind };
}

function categorizeStatus(status: number): HttpErrorClassification['kind'] {
	if (status >= 400 && status < 500) return 'client';
	if (status >= 500 && status < 600) return 'server';
	if (status === 502 || status === 504) return 'proxy';
	return 'unknown';
}

function truncateBody(body: string): string {
	if (body.length > MAX_DIAGNOSTIC_FIELD_LENGTH) {
		return `${body.slice(0, MAX_DIAGNOSTIC_FIELD_LENGTH)}…`;
	}
	return body;
}

function looksLikeJson(body: string): boolean {
	return body.startsWith('{') || body.startsWith('[');
}

function buildHttpErrorMessage(classification: HttpErrorClassification, baseUrl: string | undefined): string {
	const host = extractHostLabel(baseUrl);
	const service = isOfficialEndpoint(host) ? t('service.miMo') : host;
	const actionBlock = buildActionBlock(classification.status);

	if (classification.status === 401) return t('error.http.401', service) + actionBlock;
	if (classification.status === 402) return t('error.http.402', service) + actionBlock;
	if (classification.status === 422) return buildUnprocessableEntityMessage(classification, service);
	if (classification.status === 429) return t('error.http.429', service);
	if (classification.status >= 500 && classification.status < 600) {
		return t('error.http.5xx', service, classification.status) + actionBlock;
	}
	return buildGenericHttpMessage(classification, service);
}

function buildUnprocessableEntityMessage(classification: HttpErrorClassification, service: string): string {
	const code = classification.code ?? '';
	const message = classification.message ?? '';

	if (/model_not_found|model.*not.*exist|not.*found/i.test(`${code} ${message}`)) {
		return t('error.http.422.modelNotFound', service, message);
	}

	if (/max_tokens|context_length|token.*limit/i.test(message)) {
		return t('error.http.422.tokenLimit', service);
	}

	if (code === 'invalid_request_error' || code === 'request_too_large') {
		return t('error.http.422.badRequest', service, message);
	}

	return t('error.http.422', service, message || code);
}

function buildGenericHttpMessage(classification: HttpErrorClassification, service: string): string {
	if (classification.code || classification.message) {
		return t('error.http.withBody', service, classification.status, classification.message ?? classification.code!);
	}

	return t('error.http.noBody', service, classification.status);
}

function buildActionBlock(status: number): string {
	const links = collectActionLinks(status);
	if (!links.length) {
		return '';
	}

	return `\n\n${links.map(({ label, url }) => `* [${label}](${url})`).join('\n')}`;
}

function collectActionLinks(status: number): Array<{ label: string; url: string }> {
	const entries: Array<{ label: string; url: string }> = [];
	const seen = new Set<string>();

	const providers = status >= 500 ? API_PROVIDER_HTTP_ERROR_LINKS['5xx'] : API_PROVIDER_HTTP_ERROR_LINKS[status];
	if (providers) {
		for (const { labelKey, url } of Object.values(providers)) {
			if (seen.has(url)) continue;
			seen.add(url);
			entries.push({ label: t(labelKey), url });
		}
	}

	return entries;
}

export function classifyNetworkError(error: unknown): NetworkErrorClassification {
	if (!error || typeof error !== 'object') return 'generic';
	if (error instanceof AggregateError && error.message === 'All promises were rejected') return 'interrupted';
	const code = normalizeErrorCode((error as NodeJS.ErrnoException).code);

	switch (code) {
		case 'ENOTFOUND':
			return 'dns';
		case 'ECONNREFUSED':
		case 'ENETUNREACH':
		case 'EHOSTUNREACH':
		case 'ECONNRESET':
			return 'unreachable';
		case 'ETIMEDOUT':
		case 'UND_ERR_HEADERS_TIMEOUT':
			return 'timeout';
		case 'DEPTH_ZERO_SELF_SIGNED_CERT':
		case 'ERR_TLS_CERT_ALTNAME_INVALID':
		case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
		case 'UNABLE_TO_GET_ISSUER_CERT':
		case 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY':
		case 'CERT_HAS_EXPIRED':
		case 'CERT_NOT_YET_VALID':
		case 'ERR_TLS_HANDSHAKE_TIMEOUT':
			return 'tls';
		case 'ECONNABORTED':
		case 'UND_ERR_ABORTED':
			return 'aborted';
		case 'ERR_NETWORK':
			return 'unreachable';
		case 'EAI_AGAIN':
			return 'dns';
		case 'CERT_REJECTED':
		case 'ERR_SOCKET_CLOSED_BEFORE_CONNECTION':
			return 'tls';
		case 'ERR_CONNECTION_REFUSED':
		case 'ERR_SOCKET_CONNECTION_TIMEOUT':
			return 'unreachable';
		case 'EPIPE':
		case 'EHOSTDOWN':
		case 'EADDRNOTAVAIL':
		case 'EADDRINUSE':
		case 'ECONNRESET':
		case 'EPROTO':
		case 'ELOOP':
		case 'EBADF':
			return 'protocol';
		case 'DEPTH_ZERO_SELF_SIGNED_CERT':
		case 'ERR_TLS_CERT_ALTNAME_INVALID':
			return 'configuration';
		case 'ABORT_ERR':
		case 'ERR_ABORTED':
		case 'ECONNABORTED':
		case 'UND_ERR_ABORTED':
			return 'aborted';
		case 'ENETDOWN':
		case 'ENETUNREACH':
		case 'EHOSTUNREACH':
			return 'unreachable';
		default:
			if (typeof (error as { type?: unknown }).type === 'string') {
				const type = ((error as { type?: unknown }).type as string).toLowerCase();
				if (type.includes('timeout')) return 'timeout';
				if (type.includes('aborted') || type.includes('abort')) return 'aborted';
			}
			return 'generic';
	}
}

export function buildNetworkErrorMessage(kind: NetworkErrorClassification, baseUrl?: string): string {
	const host = extractHostLabel(baseUrl);
	const service = isOfficialEndpoint(host) ? t('service.miMo') : host;

	switch (kind) {
		case 'dns':
			return t('error.network.dns', service);
		case 'unreachable':
			return t('error.network.unreachable', service);
		case 'timeout':
			return t('error.network.timeout', service);
		case 'tls':
			return t('error.network.tls', service);
		case 'aborted':
			return t('error.network.aborted');
		case 'interrupted':
			return t('error.network.interrupted');
		case 'protocol':
			return t('error.network.protocol', service);
		case 'configuration':
			return t('error.network.configuration', host);
		case 'generic':
			return t('error.network.generic', service);
	}
}

export function buildMiMoCustomEndpointMessage(error: MiMoRequestError): string {
	if (!error.baseUrl) return '';

	try {
		const url = new URL(error.baseUrl);
		if (isOfficialEndpoint(url.hostname)) return '';
	} catch {
		return '';
	}

	if (error.status === 401) {
		return t('error.customEndpoint.auth');
	}
	if (error.status === 403) {
		return t('error.customEndpoint.forbidden');
	}
	if (error.status && error.status >= 500) {
		return t('error.customEndpoint.unavailable', error.baseUrl);
	}

	return '';
}

function extractHostLabel(baseUrl: string | undefined): string {
	if (!baseUrl) {
		return t('provider.miMo');
	}

	try {
		return new URL(baseUrl).hostname;
	} catch {
		return baseUrl;
	}
}

function normalizeErrorCode(code: unknown): string {
	if (code === undefined || code === null) return '';
	if (typeof code === 'string') return code;
	if (code instanceof Error && typeof code.message === 'string') return code.message;
	return String(code);
}

export function buildFailureSummary(error: unknown): string {
	if (error instanceof MiMoRequestError) {
		return `**${error.name}** · ${error.kind} · ${error.diagnosticMessage}`;
	}

	if (error instanceof Error) {
		return `**${error.name}** · ${error.message}`;
	}

	return `**UnknownError**`;
}

export function createUserFacingError(error: unknown): Error {
	if (error instanceof MiMoRequestError) {
		return new Error(error.userSummary, { cause: error });
	}
	if (error instanceof Error) {
		return error;
	}
	return new Error(String(error));
}
