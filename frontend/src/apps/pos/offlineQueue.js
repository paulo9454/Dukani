const KEY = "dukani_pos_queue";

// =========================
// GET QUEUE
// =========================
export function getQueue() {
  return JSON.parse(localStorage.getItem(KEY) || "[]");
}

// =========================
// ADD TO QUEUE
// =========================
export function addToQueue(order) {
  const queue = getQueue();

  queue.push({
    ...order,
    temp_id: crypto.randomUUID(),
    status: "pending",
    created_at: new Date().toISOString(),
  });

  localStorage.setItem(KEY, JSON.stringify(queue));
}

// =========================
// REMOVE FROM QUEUE
// =========================
export function removeFromQueue(temp_id) {
  const queue = getQueue().filter((o) => o.temp_id !== temp_id);
  localStorage.setItem(KEY, JSON.stringify(queue));
}

// =========================
// UPDATE STATUS
// =========================
export function updateQueue(temp_id, updates) {
  const queue = getQueue().map((o) =>
    o.temp_id === temp_id ? { ...o, ...updates } : o
  );

  localStorage.setItem(KEY, JSON.stringify(queue));
}
