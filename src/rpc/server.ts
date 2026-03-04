/**
 * RPC server — combines the stdin channel with the event emitter to send
 * acknowledgment events and expose a clean API for the agent loop.
 *
 * Abort requests are acknowledged immediately (status: "accepted").
 * Steer/followUp requests are acknowledged as queued (status: "queued")
 * on receipt; the loop dequeues and injects them between turns.
 * Invalid requests are acknowledged as rejected (status: "rejected").
 */

import type { EventEmitter } from "../hooks/events.ts";
import { RpcChannel } from "./channel.ts";
import type { FollowUpRequest, SteerRequest } from "./types.ts";

export class RpcServer {
	private readonly channel: RpcChannel;

	/** Resolves when the input stream is exhausted. Useful in tests. */
	readonly drained: Promise<void>;

	constructor(stream: ReadableStream<Uint8Array>, eventEmitter: EventEmitter) {
		this.channel = new RpcChannel(stream, (result) => {
			if (result.ok) {
				if (result.request.method === "abort") {
					// Abort is handled immediately — no queue, just ack+flag
					eventEmitter.emit({
						type: "rpc_request_ack",
						method: "abort",
						status: "accepted",
					});
				} else {
					// Steer/followUp queued — will be injected at next turn boundary
					eventEmitter.emit({
						type: "rpc_request_ack",
						method: result.request.method,
						status: "queued",
					});
				}
			} else {
				eventEmitter.emit({
					type: "rpc_request_ack",
					method: result.rawMethod ?? "unknown",
					status: "rejected",
					reason: result.error,
				});
			}
		});
		this.drained = this.channel.drained;
	}

	/** Dequeue the next steer/followUp request. Returns undefined if empty. */
	dequeue(): SteerRequest | FollowUpRequest | undefined {
		return this.channel.dequeue();
	}

	/** Returns true if an abort request has been received. */
	isAbortRequested(): boolean {
		return this.channel.isAbortRequested();
	}

	/** Close the stdin channel. */
	close(): void {
		this.channel.close();
	}
}
