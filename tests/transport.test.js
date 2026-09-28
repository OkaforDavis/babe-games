// Tests the connection layer against a fake message broker: two endpoints
// running the real online.js, talking to each other the way two phones
// would. Run with: node tests/transport.test.js
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const assert = require("assert");

const onlineSrc = fs.readFileSync(path.join(__dirname, "../js/online.js"), "utf8");

let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
  } catch (err) {
    failed++;
    failures.push(`${name}\n    ${err.message}`);
  }
}

const settle = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));

// ---- a stand-in for a public MQTT broker ----

function makeBroker() {
  const topics = new Map();
  return {
    subscribe(topic, client) {
      if (!topics.has(topic)) topics.set(topic, new Set());
      topics.get(topic).add(client);
    },
    publish(topic, payload) {
      const subscribers = topics.get(topic);
      if (!subscribers) return;
      // A real broker echoes to every subscriber including the sender.
      [...subscribers].forEach((client) => setTimeout(() => client.deliver(topic, payload), 0));
    },
    drop(client) {
      topics.forEach((set) => set.delete(client));
    },
  };
}

// `reachable` lists which broker URLs this fake will accept, so we can
// simulate a blocked one.
function makeMqtt(broker, reachable) {
  return {
    connect(url) {
      const handlers = {};
      const client = {
        connected: false,
        on(event, cb) {
          (handlers[event] = handlers[event] || []).push(cb);
          return client;
        },
        subscribe(topic, opts, cb) {
          broker.subscribe(topic, client);
          cb(null);
        },
        publish(topic, payload) {
          broker.publish(topic, payload);
        },
        end() {
          broker.drop(client);
        },
        deliver(topic, payload) {
          (handlers.message || []).forEach((cb) => cb(topic, payload));
        },
      };
      setTimeout(() => {
        if (reachable && !reachable.includes(url)) {
          (handlers.error || []).forEach((cb) => cb(new Error("blocked")));
          return;
        }
        client.connected = true;
        (handlers.connect || []).forEach((cb) => cb());
      }, 0);
      return client;
    },
  };
}

function makeEndpoint(broker, reachable) {
  const sandbox = {
    console,
    Date, Math, JSON, URL,
    setTimeout, clearTimeout, setInterval, clearInterval,
    mqtt: makeMqtt(broker, reachable),
    document: { getElementById: () => null, addEventListener() {}, body: { appendChild() {} }, createElement: () => ({ style: {}, classList: { add() {} }, addEventListener() {} }) },
    navigator: {},
    location: { href: "https://example.test/games/ncho.html", search: "" },
  };
  vm.createContext(sandbox);
  vm.runInContext(onlineSrc + "\nglobalThis.BabeOnline = BabeOnline;", sandbox);

  const received = [];
  const states = [];
  sandbox.BabeOnline.onData((d) => received.push(d));
  sandbox.BabeOnline.onState((s, detail) => states.push({ s, detail }));
  return { api: sandbox.BabeOnline, received, states };
}

(async () => {
  await test("transport: host and guest find each other over the relay", async () => {
    const broker = makeBroker();
    const host = makeEndpoint(broker);
    const guest = makeEndpoint(broker);

    const hosting = host.api.createRoom();
    const code = host.api.roomCode;
    assert.ok(code && code.length === 5, "the code exists immediately, before connecting");

    const joining = guest.api.joinRoom(code);
    await settle();

    await hosting;
    await joining;
    assert.strictEqual(host.api.connected, true, "host is connected");
    assert.strictEqual(guest.api.connected, true, "guest is connected");
    assert.strictEqual(host.api.via, "relay", "over the relay, not peer-to-peer");
    assert.strictEqual(host.api.isHost, true);
    assert.strictEqual(guest.api.isHost, false);
  });

  await test("transport: messages get through both ways and nobody hears themselves", async () => {
    const broker = makeBroker();
    const host = makeEndpoint(broker);
    const guest = makeEndpoint(broker);

    const hosting = host.api.createRoom();
    const joining = guest.api.joinRoom(host.api.roomCode);
    await settle();
    await Promise.all([hosting, joining]);

    host.received.length = 0;
    guest.received.length = 0;

    host.api.send({ t: "state", n: 1 });
    await settle();
    assert.deepStrictEqual(guest.received, [{ t: "state", n: 1 }], "guest got the host's message");
    assert.deepStrictEqual(host.received, [], "host does not hear its own echo");

    guest.api.send({ t: "action", pit: 3 });
    await settle();
    assert.deepStrictEqual(host.received, [{ t: "action", pit: 3 }], "host got the guest's message");
  });

  await test("transport: a blocked broker is skipped for the next one", async () => {
    const broker = makeBroker();
    // Only the second broker in the list accepts connections.
    const reachable = ["wss://broker.emqx.io:8084/mqtt"];
    const host = makeEndpoint(broker, reachable);
    const guest = makeEndpoint(broker, reachable);

    const hosting = host.api.createRoom();
    const joining = guest.api.joinRoom(host.api.roomCode);
    await settle(150);
    await Promise.all([hosting, joining]);

    assert.strictEqual(host.api.connected, true, "fell through to a broker that works");
    assert.strictEqual(guest.api.connected, true);
  });

  await test("transport: both sides walk the broker list the same way, so they meet", async () => {
    const broker = makeBroker();
    const reachable = ["wss://test.mosquitto.org:8081/mqtt"]; // only the third
    const host = makeEndpoint(broker, reachable);
    const guest = makeEndpoint(broker, reachable);

    const hosting = host.api.createRoom();
    const joining = guest.api.joinRoom(host.api.roomCode);
    await settle(200);
    await Promise.all([hosting, joining]);

    assert.strictEqual(host.api.connected, true);
    assert.strictEqual(guest.api.connected, true);
  });

  await test("transport: joining the wrong code does not connect you to someone else's room", async () => {
    const broker = makeBroker();
    const host = makeEndpoint(broker);
    const guest = makeEndpoint(broker);

    host.api.createRoom().catch(() => {});
    guest.api.joinRoom("ZZZZZ").catch(() => {});
    await settle(120);

    assert.strictEqual(host.api.connected, false, "host is still waiting for the right code");
    assert.strictEqual(guest.api.connected, false, "guest found nobody");
  });

  await test("transport: the status line reports progress", async () => {
    const broker = makeBroker();
    const host = makeEndpoint(broker);
    host.api.createRoom().catch(() => {});
    await settle();
    const statuses = host.states.filter((s) => s.s === "status").map((s) => s.detail);
    assert.ok(statuses.length > 0, "something is reported while connecting");
    assert.ok(
      statuses.some((s) => /waiting/i.test(s)),
      `the host is told it is waiting, got: ${JSON.stringify(statuses)}`
    );
  });

  await test("transport: disconnecting clears the room", async () => {
    const broker = makeBroker();
    const host = makeEndpoint(broker);
    const guest = makeEndpoint(broker);
    const hosting = host.api.createRoom();
    const joining = guest.api.joinRoom(host.api.roomCode);
    await settle();
    await Promise.all([hosting, joining]);

    host.api.disconnect();
    assert.strictEqual(host.api.connected, false);
    assert.strictEqual(host.api.roomCode, null);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log("\nFailures:");
    failures.forEach((f) => console.log("  - " + f));
    process.exit(1);
  }
})();
