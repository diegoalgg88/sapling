/**
 * Tests for RpcServer.
 */

import { describe, expect, it } from "bun:test";
import { EventEmitter } from "../hooks/events.ts";
import { RpcServer } from "./server.ts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeStream(lines: string[]): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	return new ReadableStream<Uint8Array>({
		start(controller) {
			for (const line of lines) {
				controller.enqueue(encoder.encode(`${line}\n`));
			}
			controller.close();
		},
	});
}

interface CapturedEvent {
	type: string;
	method?: string;
	status?: string;
	reason?: string;
	[key: string]: unknown;
}

/** EventEmitter that captures emitted events for assertions. */
function makeCaptureEmitter(): { emitter: EventEmitter; events: CapturedEvent[] } {
	const events: CapturedEvent[] = [];
	const emitter = new EventEmitter(false); // disabled = no stdout write
	// Override emit to capture events
	emitter.emit = (event: Record<string, unknown>) => {
		events.push(event as CapturedEvent);
	};
	return { emitter, events };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("RpcServer", () => {
	it("emits queued ack for steer request", async () => {
		const { emitter, events } = makeCaptureEmitter();
		const stream = makeStream([JSON.stringify({ method: "steer", params: { content: "go" } })]);
		const server = new RpcServer(stream, emitter);
		await server.drained;

		const ack = events.find((e) => e.type === "rpc_request_ack");
		expect(ack).toBeDefined();
		expect(ack?.method).toBe("steer");
		expect(ack?.status).toBe("queued");
	});

	it("emits queued ack for followUp request", async () => {
		const { emitter, events } = makeCaptureEmitter();
		const stream = makeStream([
			JSON.stringify({ method: "followUp", params: { content: "next" } }),
		]);
		const server = new RpcServer(stream, emitter);
		await server.drained;

		const ack = events.find((e) => e.type === "rpc_request_ack");
		expect(ack?.method).toBe("followUp");
		expect(ack?.status).toBe("queued");
	});

	it("emits accepted ack for abort request", async () => {
		const { emitter, events } = makeCaptureEmitter();
		const stream = makeStream([JSON.stringify({ method: "abort" })]);
		const server = new RpcServer(stream, emitter);
		await server.drained;

		const ack = events.find((e) => e.type === "rpc_request_ack");
		expect(ack?.method).toBe("abort");
		expect(ack?.status).toBe("accepted");
	});

	it("emits rejected ack for invalid JSON", async () => {
		const { emitter, events } = makeCaptureEmitter();
		const stream = makeStream(["not valid json"]);
		const server = new RpcServer(stream, emitter);
		await server.drained;

		const ack = events.find((e) => e.type === "rpc_request_ack");
		expect(ack?.status).toBe("rejected");
		expect(ack?.reason).toBe("Invalid JSON");
	});

	it("emits rejected ack with rawMethod for unknown method", async () => {
		const { emitter, events } = makeCaptureEmitter();
		const stream = makeStream([JSON.stringify({ method: "explode" })]);
		const server = new RpcServer(stream, emitter);
		await server.drained;

		const ack = events.find((e) => e.type === "rpc_request_ack");
		expect(ack?.status).toBe("rejected");
		expect(ack?.method).toBe("explode");
	});

	it("dequeue returns queued steer request", async () => {
		const { emitter } = makeCaptureEmitter();
		const stream = makeStream([JSON.stringify({ method: "steer", params: { content: "focus" } })]);
		const server = new RpcServer(stream, emitter);
		await server.drained;

		const req = server.dequeue();
		expect(req).toBeDefined();
		expect(req?.method).toBe("steer");
		if (req) {
			expect(req.params.content).toBe("focus");
		}
	});

	it("dequeue returns undefined when queue is empty", async () => {
		const { emitter } = makeCaptureEmitter();
		const stream = makeStream([]);
		const server = new RpcServer(stream, emitter);
		await server.drained;

		expect(server.dequeue()).toBeUndefined();
	});

	it("isAbortRequested returns false initially", async () => {
		const { emitter } = makeCaptureEmitter();
		const stream = makeStream([JSON.stringify({ method: "steer", params: { content: "ok" } })]);
		const server = new RpcServer(stream, emitter);
		await server.drained;

		expect(server.isAbortRequested()).toBe(false);
	});

	it("isAbortRequested returns true after abort", async () => {
		const { emitter } = makeCaptureEmitter();
		const stream = makeStream([JSON.stringify({ method: "abort" })]);
		const server = new RpcServer(stream, emitter);
		await server.drained;

		expect(server.isAbortRequested()).toBe(true);
	});

	it("abort is not enqueued — dequeue returns undefined", async () => {
		const { emitter } = makeCaptureEmitter();
		const stream = makeStream([JSON.stringify({ method: "abort" })]);
		const server = new RpcServer(stream, emitter);
		await server.drained;

		expect(server.dequeue()).toBeUndefined();
	});
});
