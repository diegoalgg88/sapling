/**
 * Type definitions for the JSON-RPC stdin control channel.
 *
 * Incoming requests arrive as NDJSON lines on stdin (one per line).
 * Outgoing acknowledgments are NDJSON events emitted to stdout.
 */

export interface SteerRequest {
	method: "steer";
	params: { content: string };
}

export interface FollowUpRequest {
	method: "followUp";
	params: { content: string };
}

export interface AbortRequest {
	method: "abort";
}

export type RpcRequest = SteerRequest | FollowUpRequest | AbortRequest;

export type RpcAckStatus = "queued" | "accepted" | "rejected";
