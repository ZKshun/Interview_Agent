export async function request(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers:
      options.body === undefined || options.body instanceof FormData
        ? options.headers
        : { "Content-Type": "application/json", ...options.headers },
    body:
      options.body && !(options.body instanceof FormData)
        ? JSON.stringify(options.body)
        : options.body,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(data.error || `请求失败 (${response.status})`);
  return data;
}

export function subscribeTask(id, onTask, onConnection) {
  const events = new EventSource(`/api/tasks/${id}/events`);
  events.addEventListener("snapshot", (event) => {
    onConnection(true);
    onTask(JSON.parse(event.data));
  });
  events.onerror = () => onConnection(false);
  return () => events.close();
}
