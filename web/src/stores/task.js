import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { request, subscribeTask } from "../api/client.js";

export const useTaskStore = defineStore("tasks", () => {
  const current = ref(null),
    history = ref([]),
    health = ref(null),
    error = ref("");
  const loading = ref(false),
    acting = ref(false),
    connected = ref(true);
  let unsubscribe,
    activeId,
    generation = 0;
  const busy = computed(
    () =>
      acting.value ||
      ["PARSING", "PLANNING", "GENERATING", "VALIDATING"].includes(
        current.value?.status,
      ),
  );
  function accept(task) {
    if (
      task.id !== activeId ||
      (current.value?.id === task.id && current.value.revision > task.revision)
    )
      return;
    current.value = task;
    const entry = history.value.find((item) => item.id === task.id);
    if (entry)
      Object.assign(entry, {
        status: task.status,
        title: task.title,
        updatedAt: task.updatedAt,
      });
  }
  async function refreshHistory() {
    history.value = await request("/tasks");
  }
  async function initialize() {
    try {
      [health.value] = await Promise.all([
        request("/health"),
        refreshHistory(),
      ]);
    } catch (failure) {
      error.value = failure.message;
    }
  }
  async function open(id) {
    const token = ++generation;
    unsubscribe?.();
    activeId = id;
    current.value = null;
    loading.value = true;
    error.value = "";
    try {
      const task = await request(`/tasks/${id}`);
      if (token !== generation) return;
      accept(task);
      unsubscribe = subscribeTask(id, accept, (value) => {
        connected.value = value;
      });
    } catch (failure) {
      if (token === generation) error.value = failure.message;
    } finally {
      if (token === generation) loading.value = false;
    }
  }
  function close() {
    generation++;
    unsubscribe?.();
    unsubscribe = null;
    activeId = null;
    current.value = null;
  }
  async function create(input) {
    error.value = "";
    acting.value = true;
    try {
      const task = await request("/tasks", { method: "POST", body: input });
      await refreshHistory();
      return task;
    } catch (failure) {
      error.value = failure.message;
      throw failure;
    } finally {
      acting.value = false;
    }
  }
  async function action(suffix, method = "POST", body) {
    error.value = "";
    acting.value = true;
    try {
      accept(await request(`/tasks/${activeId}${suffix}`, { method, body }));
      await refreshHistory();
      return true;
    } catch (failure) {
      error.value = failure.message;
      return false;
    } finally {
      acting.value = false;
    }
  }
  return {
    current,
    history,
    health,
    error,
    loading,
    acting,
    connected,
    busy,
    initialize,
    refreshHistory,
    open,
    close,
    create,
    action,
  };
});
