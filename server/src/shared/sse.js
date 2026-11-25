/** Reconnect sends an authoritative snapshot; clients never depend on missed events. */
export function streamTask(request, reply, repository, id, connections) {
  const initial = repository.get(id); // 404 before hijacking the response
  reply.hijack();
  const response = reply.raw;
  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  let blocked = false,
    pending;
  const send = (task) => {
    if (response.destroyed) return;
    if (blocked) {
      pending = task;
      return;
    }
    blocked = !response.write(
      `id: ${task.revision}\nevent: snapshot\ndata: ${JSON.stringify(task)}\n\n`,
    );
  };
  const drain = () => {
    blocked = false;
    if (pending) {
      const latest = pending;
      pending = undefined;
      send(latest);
    }
  };
  response.on("drain", drain);
  const heartbeat = setInterval(() => {
    if (!response.destroyed && !blocked) response.write(": heartbeat\n\n");
  }, 15000);
  const cleanup = () => {
    clearInterval(heartbeat);
    repository.off(id, send);
    response.off("drain", drain);
    connections.delete(response);
  };
  response.once("close", cleanup);
  connections.add(response);
  repository.on(id, send);
  send(initial);
}
