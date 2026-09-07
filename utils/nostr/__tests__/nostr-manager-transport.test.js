/** @jest-environment node */
import { WebSocketServer } from "ws";
import { finalizeEvent, generateSecretKey } from "nostr-tools";
import { NostrManager } from "../nostr-manager";

// Exercise nostr-tools itself: its pool synthesizes EOSE on both subscription
// timeout and CLOSED, which a mock oneose() callback does not distinguish.
describe("NostrManager relay completion over WebSocket", () => {
  let server;
  let url;
  const managers = [];
  const event = finalizeEvent(
    {
      kind: 30409,
      tags: [
        ["d", "a".repeat(64)],
        ["decision", "release:seller"],
      ],
      content: "",
      created_at: Math.floor(Date.now() / 1000),
    },
    generateSecretKey()
  );

  beforeAll(async () => {
    server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
    await new Promise((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("No relay port");
    url = `ws://127.0.0.1:${address.port}`;
    server.on("connection", (socket, request) => {
      socket.on("message", (data) => {
        const [command, id] = JSON.parse(data.toString());
        if (command !== "REQ") return;
        socket.send(JSON.stringify(["EVENT", id, event]));
        if (request.url === "/closed")
          socket.send(
            JSON.stringify(["CLOSED", id, "error: lookup unavailable"])
          );
        else if (request.url !== "/silent")
          socket.send(JSON.stringify(["EOSE", id]));
      });
    });
  });

  afterEach(() => {
    for (const manager of managers.splice(0)) manager.close();
    for (const socket of server.clients) socket.terminate();
  });
  afterAll(async () => {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  });

  function manager(paths) {
    const instance = new NostrManager(paths.map((path) => url + path));
    managers.push(instance);
    return instance;
  }

  it("certifies genuine EOSE and deduplicates events across relays", async () => {
    const result = await manager(["/good", "/also-good"]).fetchWithStatus(
      [{ kinds: [30409] }],
      undefined,
      undefined,
      1000
    );
    expect(result).toEqual({ events: [event], complete: true });
  });

  it("does not certify the library's timeout-generated EOSE", async () => {
    const result = await manager(["/silent"]).fetchWithStatus(
      [{ kinds: [30409] }],
      { maxWait: 50 },
      undefined,
      300
    );
    expect(result).toEqual({ events: [event], complete: false });
  });

  it("does not certify a CLOSED response even when another relay completed", async () => {
    const result = await manager(["/good", "/closed"]).fetchWithStatus(
      [{ kinds: [30409] }],
      undefined,
      undefined,
      1000
    );
    expect(result).toEqual({ events: [event], complete: false });
  });
});
