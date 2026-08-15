const debugPort = process.env.DSH_DEBUG_PORT ?? "9333";
const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then(
  (response) => response.json(),
);
const target = targets.find((entry) => entry.type === "page");

if (!target) throw new Error("No DeepSeek Harness page target was found.");

const socket = new WebSocket(target.webSocketDebuggerUrl);
let nextId = 0;
const pending = new Map();

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;

  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result);
});

await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

function send(method, params = {}) {
  const id = ++nextId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });

  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? "Page evaluation failed.");
  }
  return result.result.value;
}

await send("Runtime.enable");

const shouldTrigger = process.env.DSH_TRIGGER_PICKER !== "0";
const clickResult = shouldTrigger
  ? await evaluate(`
      (() => {
        const button = [...document.querySelectorAll('button')].find((candidate) =>
          (candidate.textContent?.trim() === '选择工作区' ||
            candidate.getAttribute('aria-label') === '添加工作区') &&
          candidate.getClientRects().length > 0
        );
        if (!button) return { clicked: false };
        button.click();
        return { clicked: true, ariaLabel: button.getAttribute('aria-label') };
      })()
    `)
  : { clicked: false, skipped: true };

await new Promise((resolve) => setTimeout(resolve, 1_000));

const pageText = await evaluate("document.body.innerText");

console.log("Native picker trigger:", JSON.stringify(clickResult));
console.log(
  "Has picker error:",
  /win32 folder dialog worker|directory picker failed/i.test(pageText),
);
if (process.env.DSH_EXPECT_TEXT) {
  console.log(
    "Expected text present:",
    pageText.includes(process.env.DSH_EXPECT_TEXT),
  );
}

socket.close();
