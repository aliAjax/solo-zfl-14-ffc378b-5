import "./styles.css";

const STORAGE_KEY = "zfl-14-repairs";
const statuses = {
  all: "全部",
  todo: "待处理",
  doing: "处理中",
  done: "已完成"
};

const priorities = {
  high: "高优先级",
  medium: "中优先级",
  low: "低优先级"
};

let state = loadState();
let notice = null;
// 勾选状态仅保存在内存中，刷新页面后自动清空
let selectedIds = new Set();
let batchNotice = null;
// 最近一次单个移除的事项（含原位置），仅内存保存，刷新后撤销入口消失
let lastDeleted = null;
const app = document.querySelector("#app");

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) return JSON.parse(saved);
  return {
    filter: "all",
    repairs: [
      {
        id: crypto.randomUUID(),
        location: "厨房",
        title: "水槽下方渗水",
        priority: "high",
        cost: 260,
        status: "todo",
        photo: "",
        note: "先检查软管接口"
      }
    ]
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function render() {
  const repairs = filteredRepairs();
  const unfinished = state.repairs.filter((repair) => repair.status !== "done");
  const totalCost = unfinished.reduce((total, repair) => total + Number(repair.cost || 0), 0);
  const doing = state.repairs.filter((repair) => repair.status === "doing").length;

  app.innerHTML = `
    <main class="shell">
      <header class="header">
        <div>
          <p class="eyebrow">本地家庭维护台</p>
          <h1>家庭维修事项</h1>
        </div>
        <section class="stats">
          <div class="stat"><span>未完成</span><strong>${unfinished.length}</strong></div>
          <div class="stat"><span>处理中</span><strong>${doing}</strong></div>
          <div class="stat"><span>预计费用</span><strong>¥${totalCost}</strong></div>
        </section>
      </header>

      <section class="layout">
        <aside class="panel">
          <h2>新增维修事项</h2>
          <form class="form" id="repair-form">
            <label>位置<input name="location" required placeholder="例如卫生间"></label>
            <label>问题描述<textarea name="title" required placeholder="例如门锁松动"></textarea></label>
            <label>优先级<select name="priority">${renderPriorityOptions("medium")}</select></label>
            <label>预计费用<input name="cost" type="number" min="0" step="1" value="0"></label>
            <label>处理状态<select name="status">${renderStatusOptions("todo")}</select></label>
            <label>照片链接<input name="photo" type="url" placeholder="可选，粘贴图片地址"></label>
            <label>备注<textarea name="note" placeholder="师傅电话、材料或注意事项"></textarea></label>
            <button class="primary" type="submit">保存事项</button>
          </form>

          <div class="backup">
            <h2>数据备份</h2>
            <div class="backup-actions">
              <button class="ghost" type="button" id="export-btn">导出全部事项</button>
              <button class="ghost" type="button" id="import-btn">选择文件导入</button>
            </div>
            <input id="import-file" type="file" accept="application/json,.json" hidden>
            ${notice ? `<p class="backup-message ${notice.type}" role="status">${escapeHtml(notice.text)}</p>` : ""}
          </div>
        </aside>

        <section>
          <div class="toolbar">
            ${Object.entries(statuses).map(([value, label]) => `<button class="seg ${state.filter === value ? "active" : ""}" data-filter="${value}">${label}</button>`).join("")}
          </div>
          <div class="batchbar">
            <span class="batch-count">已选 ${selectedIds.size} 项</span>
            <button class="ghost" type="button" data-batch-status="todo">设为待处理</button>
            <button class="ghost" type="button" data-batch-status="doing">设为处理中</button>
            <button class="ghost" type="button" data-batch-status="done">设为已完成</button>
            <button class="ghost danger" type="button" id="batch-delete">删除所选</button>
            ${batchNotice ? `<span class="batch-message" role="status">${escapeHtml(batchNotice)}</span>` : ""}
          </div>
          ${lastDeleted ? `<div class="undobar"><span>已删除「${escapeHtml(lastDeleted.repair.location)}」</span><button class="ghost" type="button" id="undo-delete">撤销删除</button></div>` : ""}
          <div class="repairs">
            ${repairs.length ? repairs.map(renderRepair).join("") : `<div class="empty">当前状态下没有维修事项</div>`}
          </div>
        </section>
      </section>
    </main>
  `;

  bindEvents();
}

function renderRepair(repair) {
  return `
    <article class="repair">
      <div class="photo">${repair.photo ? `<img src="${escapeHtml(repair.photo)}" alt="${escapeHtml(repair.location)}维修照片">` : "未添加照片"}</div>
      <div class="content">
        <div class="row">
          <h3>${escapeHtml(repair.location)}</h3>
          <span class="priority ${repair.priority}">${priorities[repair.priority]}</span>
          <span class="status ${repair.status}">${statuses[repair.status]}</span>
        </div>
        <p>${escapeHtml(repair.title)}</p>
        <div class="row">
          <span class="chip">预计 ¥${Number(repair.cost || 0)}</span>
          <span class="chip">${escapeHtml(repair.note || "暂无备注")}</span>
        </div>
        <div class="actions">
          <label class="check"><input type="checkbox" data-select="${repair.id}" ${selectedIds.has(repair.id) ? "checked" : ""}>选择</label>
          <select data-status="${repair.id}">${renderStatusOptions(repair.status)}</select>
          <button class="ghost" data-delete="${repair.id}">删除</button>
        </div>
      </div>
    </article>
  `;
}

function renderStatusOptions(selected) {
  return Object.entries(statuses)
    .filter(([value]) => value !== "all")
    .map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`)
    .join("");
}

function renderPriorityOptions(selected) {
  return Object.entries(priorities)
    .map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`)
    .join("");
}

function bindEvents() {
  document.querySelector("#repair-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    state.repairs.unshift({
      id: crypto.randomUUID(),
      location: data.location.trim(),
      title: data.title.trim(),
      priority: data.priority,
      cost: Number(data.cost || 0),
      status: data.status,
      photo: data.photo.trim(),
      note: data.note.trim()
    });
    notice = null;
    batchNotice = null;
    saveState();
    render();
  });

  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      notice = null;
      batchNotice = null;
      saveState();
      render();
    });
  });

  document.querySelectorAll("[data-status]").forEach((select) => {
    select.addEventListener("change", () => {
      const repair = state.repairs.find((item) => item.id === select.dataset.status);
      repair.status = select.value;
      notice = null;
      batchNotice = null;
      saveState();
      render();
    });
  });

  document.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = state.repairs.findIndex((repair) => repair.id === button.dataset.delete);
      if (index === -1) return;
      lastDeleted = { repair: state.repairs[index], index };
      state.repairs.splice(index, 1);
      selectedIds.delete(button.dataset.delete);
      notice = null;
      batchNotice = null;
      saveState();
      render();
    });
  });

  const undoButton = document.querySelector("#undo-delete");
  if (undoButton) {
    undoButton.addEventListener("click", () => {
      if (!lastDeleted) return;
      const index = Math.min(lastDeleted.index, state.repairs.length);
      state.repairs.splice(index, 0, lastDeleted.repair);
      lastDeleted = null;
      saveState();
      render();
    });
  }

  document.querySelectorAll("[data-select]").forEach((box) => {
    box.addEventListener("change", () => {
      if (box.checked) selectedIds.add(box.dataset.select);
      else selectedIds.delete(box.dataset.select);
      batchNotice = null;
      render();
    });
  });

  document.querySelectorAll("[data-batch-status]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!selectedIds.size) {
        batchNotice = "请先勾选要操作的事项";
        render();
        return;
      }
      state.repairs.forEach((repair) => {
        if (selectedIds.has(repair.id)) repair.status = button.dataset.batchStatus;
      });
      selectedIds = new Set();
      batchNotice = null;
      saveState();
      render();
    });
  });

  document.querySelector("#batch-delete").addEventListener("click", () => {
    if (!selectedIds.size) {
      batchNotice = "请先勾选要操作的事项";
      render();
      return;
    }
    if (!window.confirm(`确定删除选中的 ${selectedIds.size} 条事项吗？`)) return;
    state.repairs = state.repairs.filter((repair) => !selectedIds.has(repair.id));
    selectedIds = new Set();
    batchNotice = null;
    lastDeleted = null;
    saveState();
    render();
  });

  document.querySelector("#export-btn").addEventListener("click", exportBackup);

  const fileInput = document.querySelector("#import-file");
  document.querySelector("#import-btn").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (file) importBackup(file);
    fileInput.value = "";
  });
}

function exportBackup() {
  const payload = {
    app: "zfl-14-home-repair",
    version: 1,
    exportedAt: new Date().toISOString(),
    repairs: state.repairs
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `home-repairs-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  notice = { type: "ok", text: `已导出 ${state.repairs.length} 条事项到本地文件` };
  render();
}

async function importBackup(file) {
  try {
    const text = await file.text();
    const repairs = parseBackup(text);
    state.repairs = repairs;
    // 恢复后回到全部视图，避免旧筛选把导入内容过滤掉，看起来像导入失败
    state.filter = "all";
    selectedIds = new Set();
    batchNotice = null;
    lastDeleted = null;
    notice = { type: "ok", text: `导入成功，已恢复 ${repairs.length} 条事项` };
    saveState();
  } catch (error) {
    notice = { type: "error", text: `导入失败：${error.message}，已保留原有数据` };
  }
  render();
}

function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("文件不是有效的 JSON");
  }
  const list = Array.isArray(data) ? data : data && data.repairs;
  if (!Array.isArray(list)) throw new Error("文件中缺少事项列表");
  const usedIds = new Set();
  return list.map((item, index) => normalizeRepair(item, index, usedIds));
}

function normalizeRepair(item, index, usedIds) {
  if (!item || typeof item !== "object") throw new Error(`第 ${index + 1} 条事项格式不正确`);
  const location = String(item.location ?? "").trim();
  const title = String(item.title ?? "").trim();
  if (!location || !title) throw new Error(`第 ${index + 1} 条事项缺少位置或问题描述`);
  if (!priorities[item.priority]) throw new Error(`第 ${index + 1} 条事项优先级无效`);
  if (!statuses[item.status] || item.status === "all") throw new Error(`第 ${index + 1} 条事项状态无效`);
  const cost = Number(item.cost || 0);
  if (!Number.isFinite(cost) || cost < 0) throw new Error(`第 ${index + 1} 条事项费用无效`);
  let id = typeof item.id === "string" && item.id ? item.id : crypto.randomUUID();
  if (usedIds.has(id)) id = crypto.randomUUID();
  usedIds.add(id);
  return {
    id,
    location,
    title,
    priority: item.priority,
    cost,
    status: item.status,
    photo: typeof item.photo === "string" ? item.photo : "",
    note: typeof item.note === "string" ? item.note : ""
  };
}

function filteredRepairs() {
  if (state.filter === "all") return state.repairs;
  return state.repairs.filter((repair) => repair.status === state.filter);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

render();
