import Phaser from "phaser";
import { validateNativeEndpoints } from "./native.js";
validateNativeEndpoints();
import "./styles.css";
import { api, WS, escape as e, number as n } from "./api.js";
import { catalog, levelExp } from "../../../packages/content/src/index.js";
import { WorldScene, type Snapshot } from "./scene.js";
import type {
  CharacterState,
  Item,
} from "../../../packages/database/src/state.js";
const app = document.querySelector<HTMLDivElement>("#app")!;
let socket: WebSocket | null = null,
  game: Phaser.Game | null = null,
  scene: WorldScene | null = null,
  snapshot: Snapshot | null = null,
  selectedCharacter: string | null = null,
  signUp = false,
  currentPanel: string | null = null,
  intentionalClose = false,
  reconnectAttempt = 0;
const branches: { [key: string]: string } = {
  sword: "Kiếm Tu",
  mage: "Pháp Tu",
  body: "Thể Tu",
};
const subRealms = ["Sơ kỳ", "Trung kỳ", "Hậu kỳ", "Viên mãn"];
const errors: Record<string, string> = {
  IN_COMBAT: "Hãy rời chiến đấu trước khi thực hiện thao tác này.",
  INVALID_SLOT: "Ô trang bị không hợp lệ.",
  INVALID_NAME: "Tên cần 2–24 ký tự, chỉ dùng chữ, số, dấu cách.",
  UNAUTHORIZED: "Bạn cần đăng nhập.",
  ACCOUNT_ACTIVE: "Tài khoản đang có nhân vật khác hoạt động.",
  CHARACTER_LIMIT: "Bạn đã có đủ 4 nhân vật.",
  NPC_TOO_FAR: "Hãy quay về gặp NPC ở đầu khu vực.",
  RITUAL_LOCATION: "Nghi lễ diễn ra tại Thiên Mệnh Đài.",
  LEVEL_18_REQUIRED: "Cần đạt cấp 18 để thức tỉnh.",
  LEVEL_10_REQUIRED: "Cần đạt cấp 10 để chọn đạo.",
  TARGET_OUT_OF_RANGE: "Hãy tiến gần mục tiêu hơn.",
  CRAFT_EXPIRED: "Lượt kết luyện đã hết hạn. Hãy bắt đầu lại.",
  CRAFT_PENDING: "Lượt kết luyện trước vẫn đang mở.",
  SKILL_NOT_LEARNED: "Cần học kỹ năng hoặc trang bị pháp bảo phù hợp.",
  COOLDOWN: "Kỹ năng chưa hồi.",
  NOT_ENOUGH_MP: "Linh lực chưa đủ.",
  INSUFFICIENT_BALANCE: "Bạn chưa đủ tiền.",
  MATERIAL_REQUIRED: "Bạn chưa đủ nguyên liệu.",
  BAG_FULL: "Túi đã đầy. Hãy bán hoặc cất bớt đồ.",
  GEAR_REQUIREMENT: "Chưa đủ cấp, cảnh giới hoặc nhánh để mặc trang bị.",
  QUEST_INCOMPLETE: "Nhiệm vụ chưa hoàn thành.",
  ALREADY_CLAIMED: "Bạn đã nhận phần thưởng này.",
  CLUE_NOT_NEAR: "Hãy tìm đến vị trí gợi ý và tương tác trực tiếp.",
  BRANCH_REQUIREMENT: "Nội dung dành cho một nhánh khác.",
  TALENT_REQUIREMENT: "Cần thiên phú phù hợp để giải bí mật.",
  SYSTEM_REQUIREMENT: "Bí mật này cần hệ thống cá nhân phù hợp.",
  ALREADY_AWAKENED: "Thiên mệnh của nhân vật đã được xác định.",
  CHANGE_TOKEN_REQUIRED: "Cần Chuyển Đạo Lệnh để đổi nhánh lần nữa.",
  RECIPE_REQUIRED: "Cần tìm hoặc mua và học công thức rèn này.",
  SKILL_REQUIREMENT: "Chưa đủ cấp, tu vi hoặc nhánh để học kỹ năng.",
  BREAKTHROUGH_REQUIREMENT:
    "Cần đủ cấp, tu vi, Viên Mãn và hoàn thành thử thách chiến đấu.",
  TRIAL_REQUIRED: "Cần tự mình hạ boss thử thách của cảnh giới kế tiếp.",
  WRONG_ANSWER: "Câu trả lời chưa đúng. Hãy đọc gợi ý và thử lại.",
  TRADE_CHANGED: "Vật phẩm đã thay đổi. Hãy đề nghị và xác nhận lại.",
  PARTY_NOT_READY: "Mọi thành viên cần ở cùng khu vực và đã rời chiến đấu.",
  HIDDEN_REQUIREMENT: "Tắt tự chiến, đến đúng vị trí và khám phá trực tiếp.",
  WORLD_FULL: "Thế giới đang đủ người. Hãy thử lại sau.",
  COMMAND_QUEUE_FULL: "Thao tác đang xử lý. Hãy đợi một chút.",
  POTION_COOLDOWN: "Bình phục hồi chưa hồi.",
  ZONE_LOCKED: "Chưa đủ cấp để vào khu vực này.",
  ENHANCE_MAX: "Trang bị đã đạt +10.",
  QUALITY_CEILING: "Trang bị đã đạt phẩm chất tối đa của nhóm cấp.",
  SYSTEM_OBJECTIVE_INCOMPLETE: "Mục tiêu hệ thống chưa đủ.",
  CHARACTER_ACTIVE: "Thoát hoạt động trước khi xóa nhân vật.",
  LISTINGS_PENDING: "Thu hồi vật phẩm đang bán trước khi xóa.",
  CLAIMS_PENDING: "Nhận hết vật phẩm trong hộp chờ trước khi xóa.",
  EMAIL_NOT_VERIFIED: "Email chưa được xác minh.",
  INVALID_EMAIL_OR_PASSWORD: "Email hoặc mật khẩu không đúng.",
  "Too many requests. Please try again later.":
    "Bạn thao tác quá nhanh. Hãy đợi một phút rồi thử lại.",
  USER_ALREADY_EXISTS: "Email này đã có tài khoản.",
  PASSWORD_TOO_SHORT: "Mật khẩu cần ít nhất 10 ký tự.",
};
function toast(message: string) {
  let stack = document.querySelector(".toast-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.className = "toast-stack";
    document.body.append(stack);
  }
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  stack.append(node);
  setTimeout(() => node.remove(), 4500);
}
function error(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  toast(
    errors[message] ??
      (message.includes("password")
        ? "Kiểm tra email và mật khẩu (ít nhất 10 ký tự)."
        : "Chưa thể thực hiện thao tác này. Hãy thử lại sau."),
  );
}
function header() {
  return `<header class="topbar"><div class="brand"><div class="seal"><span>仙</span></div><div><strong>TIÊN LỘ</strong><small>DỊ MỆNH</small></div></div><div class="top-links"><span>VÂN HOANG GIỚI</span><span>THANH VÂN CHÂU</span><div class="connection"><i class="dot"></i><small id="connection">Đường tu hành mở lối</small></div><button class="ghost small" id="logout">Thoát</button></div></header>`;
}
function base(content: string) {
  app.innerHTML = `<div class="shell">${header()}${content}<footer class="footer"><span>TIÊN LỘ: DỊ MỆNH · VÂN HOANG GIỚI</span><span>MỘT NIỆM TU HÀNH, MỘT ĐỜI DỊ MỆNH.</span></footer></div>`;
  document.querySelector("#logout")?.addEventListener("click", async () => {
    intentionalClose = true;
    socket?.close();
    game?.destroy(true);
    game = null;
    await api("/auth/sign-out", {});
    signUp = false;
    snapshot = null;
    selectedCharacter = null;
    scene = null;
    login();
  });
}
function login() {
  base(
    `<main class="landing"><div><div class="eyebrow">TU TIÊN · THẾ GIỚI CHUNG · PIXEL ART</div><h1>Một đời tiên lộ.<br><em>Một mệnh khác thường.</em></h1><p class="story">Giữa Vân Hoang rộng lớn, mỗi bước chân là một lựa chọn. Tu luyện, kết bạn đồng hành, khám phá thiên phú và viết nên con đường của riêng mình.</p><div class="ornament">✦</div><div class="tags"><span class="tag">BA CON ĐƯỜNG</span><span class="tag">120 THIÊN PHÚ</span><span class="tag">THIÊN MỆNH CẤP 18</span></div></div><section class="login-card"><div class="eyebrow">BẮT ĐẦU HÀNH TRÌNH</div><h2>${signUp ? "Khai mở tiên duyên" : "Trở về Vân Hoang"}</h2><p class="muted" style="font-size:12px">${signUp ? "Tạo tài khoản để lưu hành trình tu luyện." : "Đăng nhập để tiếp tục con đường còn dang dở."}</p><form id="auth-form">${signUp ? '<div class="form-field"><label for="name">Danh xưng</label><input id="name" name="name" minlength="2" maxlength="24" placeholder="Thanh Vân" autocomplete="nickname" required></div>' : ""}<div class="form-field"><label for="email">Email</label><input id="email" name="email" type="email" placeholder="ban@example.com" autocomplete="email" required></div><div class="form-field"><label for="password">Mật khẩu</label><input id="password" name="password" type="password" minlength="10" placeholder="Ít nhất 10 ký tự" autocomplete="${signUp ? "new-password" : "current-password"}" required></div><p class="error-inline" id="auth-error" role="alert"></p><button class="primary" type="submit">${signUp ? "Tạo tài khoản" : "Bước vào tiên lộ"} &nbsp; →</button></form><button class="form-switch" id="switch">${signUp ? "Đã có tài khoản? Đăng nhập" : "Chưa có tài khoản? Kết tiên duyên"}</button><p class="hint">Tiến trình được lưu theo tài khoản. Một tài khoản có tối đa 4 nhân vật, chỉ một nhân vật hoạt động cùng lúc.</p></section></main>`,
  );
  document.querySelector("#switch")!.addEventListener("click", () => {
    signUp = !signUp;
    login();
  });
  document.querySelector<HTMLFormElement>("#auth-form")!.onsubmit = async (
    event,
  ) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement,
      data = new FormData(form),
      button = form.querySelector("button")!;
    button.disabled = true;
    try {
      await api(signUp ? "/auth/sign-up/email" : "/auth/sign-in/email", {
        email: data.get("email"),
        password: data.get("password"),
        ...(signUp ? { name: data.get("name") } : {}),
      });
      await characters();
    } catch (err) {
      document.querySelector("#auth-error")!.textContent =
        err instanceof Error
          ? (errors[err.message] ?? err.message)
          : "Đăng nhập chưa thành công.";
    } finally {
      button.disabled = false;
    }
  };
}
async function characters() {
  const list = await api<CharacterState[]>("/characters");
  base(
    `<main class="selection"><div class="eyebrow">LỰA CHỌN TIÊN DUYÊN</div><h1>Người sẽ bước tiếp là ai?</h1><p class="muted">Mỗi nhân vật có thiên mệnh và hành trình riêng.</p><div class="character-grid">${list.map((s) => `<article class="character-card"><div><small>${e(branches[s.branch ?? ""] ?? "Chưa chọn đạo")} · Cấp ${s.level}</small><h3>${e(s.name)}</h3><small>${e(catalog.realms[s.realm]?.name)}</small></div><button class="primary" data-enter="${s.id}">Tiếp tục tu hành →</button><button class="ghost small" data-delete="${s.id}">Xóa nhân vật</button></article>`).join("")}${Array.from({ length: Math.max(0, 4 - list.length) }, () => '<article class="character-card" style="border-style:dashed;opacity:.5"><div><h3>Chưa kết duyên</h3><small>Một con đường đang chờ bạn.</small></div></article>').join("")}</div>${list.length < 4 ? '<form class="create-form" id="create-character"><input name="name" placeholder="Đặt tên nhân vật" minlength="2" maxlength="24" required><button class="primary">Tạo nhân vật</button></form>' : ""}<p class="hint">Khởi đầu ở cấp 1, chọn nhánh ở cấp 10 và thức tỉnh ở cấp 18. Không giới hạn hành trình ở cấp 18.</p></main>`,
  );
  document
    .querySelectorAll<HTMLElement>("[data-enter]")
    .forEach(
      (button) => (button.onclick = () => void enter(button.dataset.enter!)),
    );
  document.querySelectorAll<HTMLElement>("[data-delete]").forEach(
    (b) =>
      (b.onclick = () => {
        const character = list.find((c) => c.id === b.dataset.delete)!;
        showModal(
          "Xóa nhân vật",
          `<p>Xóa ${e(character.name)} sẽ khóa ô nhân vật trong 12 giờ. Chỉ xóa khi nhân vật đã ngừng hoạt động, nhận hết đồ chờ và không còn ký gửi.</p><button class="primary" id="confirm-delete">Xác nhận xóa ${e(character.name)}</button>`,
        );
        document.querySelector<HTMLElement>("#confirm-delete")!.onclick =
          async () => {
            try {
              await api("/characters", { characterId: character.id }, "DELETE");
              document.querySelector(".modal-backdrop")?.remove();
              await characters();
            } catch (err) {
              error(err);
            }
          };
      }),
  );
  document
    .querySelector<HTMLFormElement>("#create-character")
    ?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget as HTMLFormElement;
      try {
        await api("/characters", { name: new FormData(form).get("name") });
        await characters();
      } catch (err) {
        error(err);
      }
    });
}
const nav = [
  ["character", "◈", "Nhân vật"],
  ["inventory", "▣", "Hành trang"],
  ["skills", "✧", "Công pháp"],
  ["quests", "☷", "Nhiệm vụ"],
  ["talent", "✦", "Thiên mệnh"],
  ["craft", "⚒", "Đan & Rèn"],
  ["pets", "♧", "Linh thú & Trận"],
  ["market", "◇", "Linh thị"],
  ["world", "⌘", "Thế giới"],
  ["offline", "☽", "Bế quan"],
];
function gameLayout() {
  base(
    `<div class="game-layout"><aside class="sidebar"><section class="character-info"><div class="avatar">仙</div><h2 id="char-name">Đang kết nối</h2><div class="realm" id="char-realm">Phàm Nhân</div><div class="exp-track"><i id="exp-fill" style="width:0"></i></div><div class="level-line"><span id="char-level">CẤP 1</span><span id="char-exp">0 / 92 EXP</span></div></section><nav class="side-nav">${nav.map(([id, icon, name]) => `<button class="nav-item ${id === "world" ? "active" : ""}" data-panel="${id}"><span class="nav-icon">${icon}</span><span>${name}</span><span>›</span></button>`).join("")}</nav><div class="side-note">✦ &nbsp; Thiên mệnh chờ ở cấp 18.<br>Hãy tự mình đến Thiên Mệnh Đài để khám phá.</div></aside><main class="main-game"><div class="area-header"><div><div class="eyebrow">THANH VÂN CHÂU · KHU VỰC CHUNG</div><h1 id="map-name">Thanh Khê Thôn</h1></div><div><div class="currency" id="currency">Đồng 200 · Linh Thạch 0</div><small id="map-state">Vùng an toàn · Người chơi chung thế giới</small></div></div><div class="scene-frame"><div id="arena"></div><div class="scene-hud"><div class="bar-label"><span>Sinh lực</span><span id="hp-text">200 / 200</span></div><div class="bar"><i id="hp-bar" style="width:100%"></i></div><div class="bar-label"><span>Linh lực</span><span id="mp-text">100 / 100</span></div><div class="bar mana"><i id="mp-bar" style="width:100%"></i></div></div><div class="scene-label">✦ &nbsp; <span id="scene-level">Thanh Khê · Phàm Nhân</span></div><div class="quest-pin"><h3 id="pin-title">Khởi hành vào tiên lộ</h3><p id="pin-progress">Hạ yêu thú ở phía đông (0/5)</p></div><div class="touch-controls"><button id="touch-left" aria-label="Sang trái">◀</button><button id="touch-right" aria-label="Sang phải">▶</button><button id="touch-jump" aria-label="Nhảy">↑</button></div></div><div class="hotbar"><div class="skills"><button class="skill" id="attack" title="Đánh thường — Space">⚔<span>SPACE</span></button><div class="hot-divider"></div>${[1, 2, 3, 4].map((i) => `<button class="skill" id="skill-${i}" title="Ô kỹ năng ${i}">✧<span>${i}</span></button>`).join("")}<div class="hot-divider"></div><button class="skill" id="artifact" title="Kích hoạt pháp bảo — F">◈<span>F</span></button><button class="skill" id="hp-potion" title="Bình HP — R" style="color:#cd7b67">♜<span>R</span></button><button class="skill" id="mp-potion" title="Bình MP — T" style="color:#80b5c5">♜<span>T</span></button></div><button class="auto-button" id="auto">◉ &nbsp; Tự chiến: TẮT</button></div><div class="keyboard-hint"><span>A D / ← → Di chuyển &nbsp; · &nbsp; W / ↑ Nhảy &nbsp; · &nbsp; SPACE Đánh &nbsp; · &nbsp; 1–4 Kỹ năng</span><span>Nhấn vào quái để chọn mục tiêu</span></div><div class="mobile-nav hidden">${nav.map(([id, icon, name]) => `<button data-panel="${id}" class="ghost">${icon} ${name}</button>`).join("")}</div><div class="below-game"><section class="card"><div class="card-title"><h2>Chuyện trong Vân Hoang</h2><small>KÊNH KHU VỰC</small></div><div class="chat-log" id="chat-log"><div><span class="chat-name">Dẫn Lộ Nhân</span> &nbsp; Chào mừng đến Thanh Khê. Tiến về phía đông và thử sức với yêu thú.</div></div><form class="chat-input" id="chat-form"><select name="channel" aria-label="Kênh trò chuyện"><option value="map">Khu vực</option><option value="party">Tổ đội</option></select><input name="text" maxlength="200" placeholder="Gửi lời đến người đồng hành…" autocomplete="off"><button class="ghost" aria-label="Gửi tin">↗</button></form></section><section class="card"><div class="card-title"><h2>Con đường hiện tại</h2><button class="ghost small" data-panel="quests">Xem sổ tay ↗</button></div><div class="quest-summary" id="quest-summary">Hạ yêu thú, thu thập linh khí và trở về gặp Dẫn Lộ Nhân.</div><div class="quest-progress" id="quest-progress">0 / 5 yêu thú</div><button class="ghost small" id="claim-quest">Nhận thưởng nhiệm vụ</button></section></div></main></div>`,
  );
  document
    .querySelectorAll<HTMLElement>("[data-panel]")
    .forEach(
      (button) => (button.onclick = () => void panel(button.dataset.panel!)),
    );
  document
    .querySelector("#attack")!
    .addEventListener("click", () => act("attack", scene?.selected));
  for (let i = 1; i <= 4; i++)
    document.querySelector(`#skill-${i}`)!.addEventListener("click", () => {
      const skill = snapshot?.you.loadout[i - 1];
      if (skill) act("cast", scene?.selected, skill);
      else void panel("skills");
    });
  document
    .querySelector("#artifact")!
    .addEventListener("click", () => act("cast", scene?.selected, "artifact"));
  document
    .querySelector("#hp-potion")!
    .addEventListener("click", () => act("potion", "pill-0"));
  document
    .querySelector("#mp-potion")!
    .addEventListener("click", () => act("potion", "pill-1"));
  document
    .querySelector("#auto")!
    .addEventListener("click", () =>
      act("auto", undefined, snapshot?.you.auto ? "off" : "on"),
    );
  document.querySelector("#claim-quest")!.addEventListener("click", () => {
    const q = currentQuest();
    if (q) act("quest", q.id);
  });
  document.querySelector<HTMLFormElement>("#chat-form")!.onsubmit = (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement,
      input = form.elements.namedItem("text") as HTMLInputElement;
    if (input.value.trim()) {
      act(
        "chat",
        (form.elements.namedItem("channel") as HTMLSelectElement).value,
        input.value.trim(),
      );
      input.value = "";
    }
  };
  for (const [selector, axis] of [
    ["#touch-left", -1],
    ["#touch-right", 1],
  ] as const) {
    const b = document.querySelector<HTMLElement>(selector)!;
    b.onpointerdown = (ev) => {
      ev.preventDefault();
      b.setPointerCapture(ev.pointerId);
      if (scene) scene.axis = axis;
    };
    b.onpointerup = b.onpointercancel = () => {
      if (scene) scene.axis = 0;
    };
  }
  document.querySelector<HTMLElement>("#touch-jump")!.onpointerdown = () => {
    if (scene) scene.touchJump = true;
  };
}
function send(message: unknown) {
  if (socket?.readyState === WebSocket.OPEN)
    socket.send(JSON.stringify(message));
}
function act(action: string, target?: string, value?: string) {
  send({
    type: "action",
    version: 1,
    requestId: crypto.randomUUID(),
    action,
    ...(target ? { target } : {}),
    ...(value !== undefined ? { value } : {}),
  });
}
async function enter(id: string) {
  selectedCharacter = id;
  intentionalClose = false;
  try {
    const { ticket } = await api<{ ticket: string }>("/ticket", {
      characterId: id,
    });
    if (!game) {
      gameLayout();
      scene = new WorldScene(send, act);
      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: "arena",
        width: 960,
        height: 540,
        backgroundColor: "#26493b",
        pixelArt: true,
        roundPixels: true,
        antialias: false,
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        scene: [scene],
      });
    }
    socket = new WebSocket(WS);
    socket.onopen = () => {
      reconnectAttempt = 0;
      send({ type: "hello", version: 1, ticket });
    };
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "snapshot") {
        const oldRevision = snapshot?.you.revision;
        snapshot = message;
        scene?.apply(message);
        updateHud();
        if (
          currentPanel &&
          oldRevision !== undefined &&
          oldRevision !== message.you.revision &&
          !document.querySelector(".modal input:focus")
        )
          void panel(currentPanel);
      } else if (message.type === "error") error(message.error);
      else if (message.type === "notice") toast(message.text);
      else if (message.type === "chat") {
        const line = document.createElement("div"),
          name = document.createElement("span");
        name.className = "chat-name";
        name.textContent = message.name;
        line.append(name, document.createTextNode("　" + message.text));
        const log = document.querySelector("#chat-log");
        log?.append(line);
        if (log) {
          while (log.children.length > 100) log.firstChild?.remove();
          log.scrollTop = log.scrollHeight;
        }
      } else if (message.type === "invite") {
        showModal(
          "Lời mời tổ đội",
          `<p>${e(message.from)} mời bạn đồng hành.</p><button class="primary" data-action="party" data-target="${e(message.party)}" data-value="accept">Tham gia</button>`,
        );
      } else if (message.type === "craft-challenge") {
        currentPanel = null;
        showModal(
          message.name,
          `<p>Nhấn kết luyện khi thanh sáng đến vạch vàng (2 giây). Bấm lệch vẫn nhận thành phẩm tiêu chuẩn.</p><div class="timing-track"><i id="timing-fill"></i><span></span></div><button class="primary" id="finish-craft">Kết luyện</button>`,
        );
        const fill = document.querySelector<HTMLElement>("#timing-fill")!,
          started = performance.now();
        const animate = () => {
          if (!fill.isConnected) return;
          fill.style.width =
            Math.min(100, (performance.now() - started) / 30) + "%";
          requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
        document.querySelector<HTMLElement>("#finish-craft")!.onclick = () => {
          act("craft", message.recipe, "finish:" + message.token);
          document.querySelector(".modal-backdrop")?.remove();
          void panel("craft");
        };
      } else if (message.type === "trade") {
        currentPanel = null;
        if (message.closed) {
          document.querySelector(".modal-backdrop")?.remove();
          toast(message.closed);
          return;
        }
        showModal(
          "Giao dịch trực tiếp",
          `<p>Kiểm tra hai lời đề nghị. Mỗi thay đổi sẽ hủy cả hai xác nhận.</p><div class="rows">${message.offers.map((o: { name: string; item: Item | null; confirmed: boolean; self: boolean }) => row(o.self ? "Bạn" : o.name, o.item ? `${e(itemName(o.item))} ×${o.item.quantity}` : "Chưa đề nghị vật phẩm", o.confirmed ? "<small>Đã xác nhận</small>" : "<small>Đang chờ</small>")).join("")}</div><h3 class="section-title">Chọn vật phẩm của bạn</h3><div class="rows">${snapshot?.you.inventory.map((i) => row(itemName(i), `Số lượng ${i.quantity}`, button("Đề nghị", "trade", message.id, "offer:" + i.id))).join("")}</div>${button("Xác nhận hai lời đề nghị", "trade", message.id, "confirm:" + message.revision)}${button("Hủy", "trade", message.id, "cancel")}`,
        );
      }
    };
    socket.onclose = (event) => {
      const connection = document.querySelector("#connection");
      if (connection) connection.textContent = "Kết nối đã ngắt";
      if (event.reason === "offline") {
        intentionalClose = true;
        toast("Đã bắt đầu bế quan. Trở lại để kết thúc và nhận báo cáo.");
        game?.destroy(true);
        game = null;
        scene = null;
        void characters();
        return;
      }
      if (!intentionalClose && selectedCharacter && reconnectAttempt < 5) {
        const delay = Math.min(10000, 1000 * 2 ** reconnectAttempt++);
        toast("Đang kết nối lại…");
        setTimeout(() => {
          if (!intentionalClose) void enter(selectedCharacter!);
        }, delay);
      }
    };
  } catch (err) {
    error(err);
  }
}
function currentQuest() {
  const s = snapshot?.you;
  if (!s) return;
  return (
    catalog.quests.find(
      (q) =>
        !q.hidden &&
        q.map === s.map &&
        s.quests[q.id] &&
        !s.quests[q.id]?.claimed,
    ) ?? catalog.quests.find((q) => !q.hidden && q.map === s.map)
  );
}
function updateHud() {
  if (!snapshot) return;
  const s = snapshot.you,
    st = snapshot.stats;
  const text = (selector: string, value: string) => {
    const el = document.querySelector(selector);
    if (el) el.textContent = value;
  };
  text("#char-name", s.name);
  text(
    "#char-realm",
    `${catalog.realms[s.realm]?.name} ${s.realm ? subRealms[s.subRealm] : ""} · ${branches[s.branch ?? ""] ?? "Chưa chọn đạo"}`,
  );
  text("#char-level", `CẤP ${s.level}`);
  text("#char-exp", `${n(s.exp)} / ${n(levelExp(s.level))} EXP`);
  text(
    "#map-name",
    catalog.maps.find((m) => m.id === s.map)?.name ?? "Vân Hoang",
  );
  text(
    "#map-state",
    `${catalog.maps.find((m) => m.id === s.map)?.safe ? "Vùng an toàn" : "Vùng chiến đấu"} · ${snapshot.players.length} người trong tầm nhìn`,
  );
  text("#currency", `Đồng ${n(s.coins)} · Linh Thạch ${n(s.spirit)}`);
  text("#scene-level", `${catalog.realms[s.realm]?.name} · Cấp ${s.level}`);
  text("#hp-text", `${n(s.hp)} / ${n(st.maxHp)}`);
  text("#mp-text", `${n(s.mp)} / ${n(st.maxMp)}`);
  text("#auto", `◉  Tự chiến: ${s.auto ? "BẬT" : "TẮT"}`);
  text("#connection", "Đã kết nối Vân Hoang");
  for (const [selector, value, max] of [
    ["#hp-bar", s.hp, st.maxHp],
    ["#mp-bar", s.mp, st.maxMp],
    ["#exp-fill", s.exp, levelExp(s.level)],
  ] as const) {
    const node = document.querySelector<HTMLElement>(selector);
    if (node)
      node.style.width = `${Math.min(100, Number((BigInt(value) * 100n) / BigInt(max)))}%`;
  }
  const q = currentQuest();
  if (q) {
    text("#pin-title", q.name);
    text(
      "#pin-progress",
      `Hạ yêu thú (${s.quests[q.id]?.progress ?? 0}/${q.required})`,
    );
    text("#quest-summary", q.description);
    text(
      "#quest-progress",
      `${s.quests[q.id]?.progress ?? 0} / ${q.required} yêu thú`,
    );
    const b = document.querySelector<HTMLButtonElement>("#claim-quest");
    if (b)
      b.disabled =
        Boolean(s.quests[q.id]?.claimed) ||
        (s.quests[q.id]?.progress ?? 0) < q.required;
  }
  for (let i = 1; i <= 4; i++) {
    const skill = catalog.allSkills.find((k) => k.id === s.loadout[i - 1]),
      b = document.querySelector<HTMLButtonElement>(`#skill-${i}`)!;
    const remain = skill
      ? Math.max(0, (snapshot.cooldowns[skill.id] ?? 0) - snapshot.tick)
      : 0;
    b.title = skill ? `${skill.name} · MP ${skill.mana}` : "Chọn công pháp";
    b.innerHTML = `${skill ? ["⚔", "↝", "♨", "❄"][i - 1] : "✧"}<span>${i}</span>${remain ? `<div class="cooldown">${Math.ceil(remain / 20)}</div>` : ""}`;
  }
}
function button(
  label: string,
  action: string,
  target?: string,
  value?: string,
  disabled = false,
) {
  return `<button class="small" data-action="${action}" ${target ? `data-target="${e(target)}"` : ""} ${value !== undefined ? `data-value="${e(value)}"` : ""} ${disabled ? "disabled" : ""}>${label}</button>`;
}
function row(title: string, description: string, actions = "") {
  return `<div class="row"><div><strong>${e(title)}</strong><p>${description}</p></div><div class="row-actions">${actions}</div></div>`;
}
function itemName(i: Item) {
  return (
    (catalog.gear.find((g) => g.id === i.template)?.name ??
      catalog.recipes.find((r) => r.id === i.template)?.name ??
      (i.template.startsWith("recipe:")
        ? "Công thức: " +
          (catalog.recipes.find((r) => r.id === i.template.slice(7))?.name ??
            "Luyện khí")
        : undefined) ??
      catalog.boards.find((b) => b.id === i.template)?.name ??
      {
        herb: "Linh Thảo",
        "spirit-stone": "Linh Thạch kết tinh",
        "breakthrough-pill": "Phá Cảnh Đan",
        "skill-manual": "Bí kíp công pháp",
        "branch-token": "Chuyển Đạo Lệnh",
        "element-stone": "Chuyển Linh Thạch",
        "pet-contract": "Khế ước linh thú",
      }[i.template] ??
      i.template) + (i.enhance ? ` +${i.enhance}` : "")
  );
}
const elementNames: Record<string, string> = {
  none: "Vô hệ",
  metal: "Kim",
  wood: "Mộc",
  water: "Thủy",
  fire: "Hỏa",
  earth: "Thổ",
  wind: "Phong",
  lightning: "Lôi",
  ice: "Băng",
  light: "Quang",
  dark: "Ám",
};
function gearTools(i: Item) {
  const gear = catalog.gear.find((g) => g.id === i.template);
  if (!gear || !snapshot) return "";
  const candidates = snapshot.you.inventory.filter(
    (other) =>
      snapshot!.you.inventory.some((source) => source.id === i.id) &&
      other.id !== i.id &&
      other.slot === i.slot &&
      (i.enhance ?? 0) > (other.enhance ?? 0),
  );
  return `<details><summary>Chuyển hệ / kế thừa</summary><p class="hint">Đổi hệ tốn 1 Chuyển Linh Thạch; giữ phẩm, cường hóa và thuộc tính. Rút cả hai trang bị vào túi để kế thừa cùng ô; mức + chuyển sang đích, nguồn trở về +0.</p><select data-element="${i.id}">${Object.entries(
    elementNames,
  )
    .map(
      ([id, name]) =>
        `<option value="${id}" ${i.element === id ? "selected" : ""}>${name}</option>`,
    )
    .join(
      "",
    )}</select>${button("Xác nhận đổi hệ", "element", i.id, i.element ?? "none")}${candidates.map((other) => button("Kế thừa sang " + itemName(other), "enhance", i.id, "transfer:" + other.id)).join("")}</details>`;
}
function showModal(title: string, html: string) {
  document.querySelector(".modal-backdrop")?.remove();
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `<section class="modal" role="dialog" aria-modal="true" aria-label="${e(title)}"><div class="modal-header"><h2>${e(title)}</h2><button class="close" aria-label="Đóng">×</button></div>${html}</section>`;
  document.body.append(backdrop);
  backdrop.querySelector(".close")!.addEventListener("click", () => {
    backdrop.remove();
    currentPanel = null;
  });
  backdrop.addEventListener("click", (ev) => {
    if (ev.target === backdrop) {
      backdrop.remove();
      currentPanel = null;
    }
  });
  backdrop.querySelectorAll<HTMLElement>("[data-action]").forEach(
    (b) =>
      (b.onclick = () => {
        if (b.dataset.action === "offline") {
          intentionalClose = true;
          backdrop.remove();
        }
        let value = b.dataset.value;
        if (b.dataset.action === "element")
          value = backdrop.querySelector<HTMLSelectElement>(
            `[data-element="${b.dataset.target}"]`,
          )?.value;
        if (b.dataset.action === "craft" && !value?.startsWith("finish:")) {
          const element =
            backdrop.querySelector<HTMLSelectElement>("#craft-element")
              ?.value ?? "none";
          value = value?.startsWith("manual:")
            ? "manual:" + element
            : "element:" + element;
        }
        act(b.dataset.action!, b.dataset.target, value);
        toast("Đã gửi thao tác.");
      }),
  );
  backdrop
    .querySelectorAll<HTMLElement>("[data-panel]")
    .forEach((b) => (b.onclick = () => void panel(b.dataset.panel!)));
}
async function panel(name: string) {
  if (!snapshot) return;
  currentPanel = name;
  const s = snapshot.you,
    st = snapshot.stats;
  let title = "",
    html = "";
  switch (name) {
    case "character":
      title = "Nhân vật & Cảnh giới";
      html = `<p class="muted">${e(s.name)} · ${branches[s.branch ?? ""] ?? "Chưa chọn đạo"} · Cấp ${s.level}</p><div class="panel-grid">${[
        ["Công kích", st.attack],
        ["Giáp", st.defense],
        ["Sinh lực tối đa", st.maxHp],
        ["Linh lực tối đa", st.maxMp],
        ["Tu vi", s.cultivation],
        ["Đồng", s.coins],
      ]
        .map(
          ([key, value]) =>
            `<div class="stat-row"><span>${key}</span><strong title="${value}">${n(value!)}</strong></div>`,
        )
        .join(
          "",
        )}</div><h3 class="section-title">Tự dùng bình</h3><p class="hint">Khi tự chiến, dùng bình thật khi HP hoặc MP dưới ${s.potionThreshold}%.</p>${[20, 30, 50, 70].map((t) => button(t + "%", "auto", undefined, "threshold:" + t)).join("")}<h3 class="section-title">Chọn con đường</h3><p class="hint">Chọn ở cấp 10. Một lần đổi miễn phí sau thức tỉnh; lần sau cần Chuyển Đạo Lệnh. Gặp NPC khi ngoài chiến đấu.</p><div class="row-actions">${Object.entries(
        branches,
      )
        .map(([id, n]) => button(n, "branch", undefined, id, s.level < 10))
        .join(
          "",
        )}</div><h3 class="section-title">Cảnh giới</h3><div class="rows">${catalog.realms.map((r) => row(r.name, `Cấp ${r.minLevel} · Tu vi ${n(r.cultivation)} · ${r.materialCount} Phá Cảnh Đan · ${r.challengeKills} yêu thú thử thách`, r.id === s.realm ? "<small>Hiện tại</small>" : r.id === s.realm + 1 ? button("Đột phá", "breakthrough") : r.id < s.realm ? "<small>Đã vượt qua</small>" : "")).join("")}</div>`;
      break;
    case "inventory":
      title = `Hành trang · ${s.inventory.length}/40`;
      html = `<p class="hint">Mọi vật phẩm vật lý đều có thể giao dịch. Rút trang bị hoặc linh thú trước khi bán.</p><h3 class="section-title">Đang trang bị</h3><div class="rows">${
        Object.entries(s.equipment)
          .map(([slot, i]) =>
            row(
              itemName(i),
              e(slot),
              button("Tháo", "equip", slot, "unequip") +
                button("Cường hóa", "enhance", i.id) +
                button("Nâng phẩm", "quality", i.id) +
                gearTools(i),
            ),
          )
          .join("") || '<p class="muted">Chưa có trang bị.</p>'
      }</div><h3 class="section-title">Trong túi</h3><div class="rows">${s.inventory.map((i) => row(itemName(i), `Số lượng ${i.quantity}${i.element ? " · Hệ " + e(i.element) : ""}`, catalog.gear.some((g) => g.id === i.template) ? button("Trang bị", "equip", i.id) + button("Cường hóa", "enhance", i.id) + button("Bán NPC", "interact", i.id, "sell") + gearTools(i) : i.template.startsWith("recipe:") ? button("Học công thức", "learn", i.id, "recipe") : i.petData ? button("Kết khế ước", "pet", i.id, "activate") : i.template === "spirit-stone" ? button("Tách Linh Thạch", "interact", undefined, "convert") : (catalog.recipes.some((r) => r.id === i.template && ["hp", "mp", "cultivation", "defense"].includes(r.effect)) ? button("Dùng", "potion", i.id) : "") + button("Bán NPC", "interact", i.id, "sell"))).join("")}</div><h3 class="section-title">Hộp chờ · ${s.claims.length} · Lưu 7 ngày</h3>${button("Nhận vật phẩm chờ", "market-claim")}`;
      break;
    case "skills":
      title = "Công pháp & Kỹ năng";
      html = `<p class="hint">Kỹ năng cơ bản tự học khi đủ cấp và tu vi. Chỉ công pháp của nhánh hiện tại có hiệu lực. Tối đa 4 kỹ năng chủ động; bị động đã học không giới hạn ô.</p><div class="rows">${catalog.allSkills
        .filter((k) => !s.branch || k.branch === s.branch)
        .map((k) =>
          row(
            k.name,
            `Cấp ${k.level} · MP ${k.mana} · Hồi ${k.cooldown / 20}s · Tu vi ${k.cultivation} · ${catalog.realms[k.requiredRealm]?.name}${k.manual ? " · Cần 1 bí kíp" : ""}`,
            s.skills.includes(k.id)
              ? "<small>Đã học</small>" +
                  [0, 1, 2, 3]
                    .map((slot) =>
                      button("Ô " + (slot + 1), "learn", k.id, "slot:" + slot),
                    )
                    .join("")
              : button(
                  "Học",
                  "learn",
                  undefined,
                  k.id,
                  s.level < k.level || s.realm < k.requiredRealm,
                ),
          ),
        )
        .join(
          "",
        )}</div><h3 class="section-title">Bí kíp bị động</h3>${s.branch ? button("Học Tâm Pháp Công Kích (+5%)", "learn", undefined, s.branch + "-attack") + button("Học Tâm Pháp Hộ Thể (+5%)", "learn", undefined, s.branch + "-defense") : "Chọn nhánh trước khi học bí kíp."}`;
      break;
    case "quests":
      title = "Sổ tay hành trình";
      html = `<div class="rows">${Object.entries(s.quests)
        .map(([id, p]) => {
          const q = catalog.quests.find((q) => q.id === id)!;
          return row(
            q.name,
            `${e(q.description)}<br>${p.progress}/${q.required} · EXP ${n(q.exp)} · Đồng ${n(q.coins)}`,
            p.claimed
              ? "<small>Đã hoàn thành</small>"
              : q.hidden && p.progress < q.required && q.condition === "dialog"
                ? (q.options ?? [])
                    .map((option, index) =>
                      button(option, "interact", q.id, "solve:" + index),
                    )
                    .join(" ")
                : q.hidden && p.progress < q.required && q.condition === "item"
                  ? button(
                      `Dâng ${q.itemCount} ${q.item === "herb" ? "Linh Thảo" : q.item}`,
                      "interact",
                      q.id,
                      "solve:",
                    )
                  : button(
                      "Nhận thưởng",
                      "quest",
                      q.id,
                      undefined,
                      p.progress < q.required,
                    ),
          );
        })
        .join(
          "",
        )}</div><h3 class="section-title">Dấu vết bí mật</h3><p class="hint">Nhiệm vụ ẩn chỉ khám phá trực tiếp. Tìm đúng vị trí, nhánh hoặc thiên mệnh phù hợp.</p><div class="rows">${catalog.hiddenQuests
        .filter((q) => q.map === s.map && !s.quests[q.id])
        .map((q) =>
          row(
            "Một lời đồn chưa giải",
            `${e(q.clue)}<br>Gợi ý: tọa độ ${q.location}`,
            button("Tìm hiểu", "interact", q.id, "discover"),
          ),
        )
        .join("")}</div>`;
      break;
    case "talent": {
      title = "Thiên mệnh & Dị mệnh";
      const t = catalog.talents.find((t) => t.id === s.talent);
      html = t
        ? `<div class="eyebrow">THIÊN PHÚ BẬC ${t.tier}</div><h3 class="section-title">${e(t.name)}</h3><p>${e(t.description)}</p>`
        : `<p>Đạt cấp 18 và đến Thiên Mệnh Đài để thực hiện nghi lễ. Mỗi nhân vật chỉ thức tỉnh một lần; không chọn theo nhánh, không rút lại.</p>${button("Thực hiện nghi lễ", "awaken", undefined, undefined, s.level < 18)}`;
      if (!s.system && s.systemOffers.length)
        html += `<h3 class="section-title">Bạn là người xuyên không</h3><p class="hint">Chọn một trong ba hệ thống. Lựa chọn được lưu vĩnh viễn.</p><div class="rows">${s.systemOffers
          .map((id) => {
            const sys = catalog.systems.find((x) => x.id === id)!;
            return row(
              sys.name,
              e(sys.description),
              button("Chọn hệ thống", "system", id),
            );
          })
          .join("")}</div>`;
      if (s.system) {
        const sys = catalog.systems.find((x) => x.id === s.system)!;
        html += `<h3 class="section-title">${e(sys.name)} · Bậc ${s.systemLevel}/5</h3><p>${e(sys.description)}</p><p class="muted">Điểm hệ thống: ${s.systemPoints} · Tiến độ ${s.systemProgress}/${sys.levels[s.systemLevel - 1]?.required}</p>${button("Nhận thưởng cấp hệ thống", "system", undefined, "claim")}${s.system === "system-0" ? button("Điểm danh hôm nay", "system", undefined, "checkin") : ""}`;
      } else if (t && !s.systemOffers.length)
        html +=
          '<p class="hint">Thiên mệnh đã thức tỉnh. Nhân vật này không nhận hệ thống xuyên không (tỷ lệ 3% một lần mỗi nhân vật).</p>';
      html += `<h3 class="section-title">Các bậc thiên phú</h3><p class="hint">F 22% · E 22% · D 20% · C 15% · B 10% · A 6% · S 3,5% · SS 1,2% · SSS 0,3%</p>`;
      break;
    }
    case "craft":
      title = "Đan đạo & Luyện khí";
      html = `<p class="hint">Luyện đan ${s.profession.alchemy} · Rèn ${s.profession.forge}. Dùng Linh Thảo và Đồng; trang bị trên cấp 100 đến từ chế tạo và chiến đấu.</p><label>Hệ khi rèn <select id="craft-element">${Object.entries(
        elementNames,
      )
        .map(([id, name]) => `<option value="${id}">${name}</option>`)
        .join("")}</select></label><div class="rows">${catalog.recipes
        .filter(
          (r) =>
            r.kind === "alchemy" || r.kind === "board" || r.branch === s.branch,
        )
        .map((r) =>
          row(
            r.name,
            `Cấp ${r.requiredLevel} · ${r.materialCount} Linh Thảo · ${n(r.coins)} Đồng`,
            button(
              "Chế tạo",
              "craft",
              r.id,
              undefined,
              s.level < r.requiredLevel ||
                (r.kind === "forge" &&
                  r.requiredLevel > 100 &&
                  !s.knownRecipes?.includes(r.id)),
            ) +
              button(
                "Kết luyện trực tiếp",
                "craft",
                r.id,
                "manual:none",
                s.level < r.requiredLevel ||
                  (r.kind === "forge" &&
                    r.requiredLevel > 100 &&
                    !s.knownRecipes?.includes(r.id)),
              ),
          ),
        )
        .join("")}</div>`;
      break;
    case "pets":
      title = "Linh thú & Trận pháp";
      html = `<p class="hint">Mỗi nhân vật có một linh thú hoạt động và một trận pháp đặt. Rút linh thú về khế ước để giao dịch.</p><div class="rows">${s.pets.map((p) => row(catalog.pets.find((t) => t.id === p.petData?.species)?.name ?? "Linh thú", `Cấp ${p.petData?.level}`, button(p.id === s.activePet ? "Đang đồng hành" : "Triệu hồi", "pet", p.id) + button("Rút khế ước", "pet", p.id, "withdraw"))).join("")}</div><h3 class="section-title">Kết tiên duyên</h3><div class="rows">${catalog.pets.map((p) => row(p.name, `${n(p.price)} Đồng · Công kích ${p.attackBps / 100}%`, button("Mua khế ước", "pet", p.id, "buy"))).join("")}</div><h3 class="section-title">Trận pháp</h3><div class="rows">${catalog.boards.map((b) => row(b.name, `Cần 1 trận bàn đã khắc · ${b.duration / 20}s · Tầm ${b.radius}`, button("Đặt trận", "board", b.id))).join("")}</div>`;
      break;
    case "market": {
      title = "Linh thị";
      const listings =
        await api<{ id: string; item: Item; price: string }[]>("/market");
      html = `<p class="hint">Giá bằng Linh Thạch. Phí khi bán thành công 5% (làm tròn lên), tối đa 20 tin/tài khoản, hết hạn sau 48 giờ. Vật phẩm ký gửi không thể dùng cùng lúc.</p><div class="rows">${listings.map((l) => row(itemName(l.item), `${n(l.price)} Linh Thạch`, button("Mua", "market-buy", l.id))).join("") || '<p class="muted">Linh thị đang chờ những món hàng đầu tiên.</p>'}</div><h3 class="section-title">Ký gửi vật phẩm</h3><form id="list-form" class="create-form"><select id="listing-item">${s.inventory.map((i) => `<option value="${i.id}">${e(itemName(i))} ×${i.quantity}</option>`).join("")}</select><input id="listing-price" type="text" inputmode="numeric" pattern="[0-9]+" placeholder="Giá Linh Thạch" required><button class="primary">Ký gửi</button></form><p class="hint">Nhận lại đồ hết hạn trong hộp chờ.</p>${button("Nhận vật phẩm chờ", "market-claim")}`;
      break;
    }
    case "world":
      title = "Vân Hoang Giới";
      html = `${snapshot.party ? `<p>Tổ đội: ${snapshot.party.members.map((p) => e(p.name) + (p.connected ? "" : " (mất kết nối)")).join(" · ")}</p>${button("Rời tổ đội", "party", undefined, "leave")}` : ""}${button("Tắt chat", "chat", "mute", "on")}${button("Bật chat", "chat", "mute", "off")}<p class="hint">Gặp Dẫn Lộ Nhân ở đầu khu vực để di chuyển, mua đồ và nhận thưởng nhiệm vụ.</p><div class="rows">${catalog.maps.map((m) => row(m.name, `Cấp ${m.minLevel}+ · ${m.safe ? "Khu vực an toàn" : "Khu vực chiến đấu"}`, button(s.map === m.id ? "Đang ở đây" : "Đến khu vực", "interact", m.id, "travel", s.level < m.minLevel || s.map === m.id))).join("")}</div><h3 class="section-title">Người trong tầm nhìn</h3><div class="rows">${
        snapshot.players
          .filter((p) => p.id !== s.id)
          .map((p) =>
            row(
              p.name,
              `Cấp ${p.level} · ${branches[p.branch ?? ""] ?? "Phàm Nhân"}`,
              button("Mời tổ đội", "party", p.id) +
                button("Giao dịch", "trade", p.id, "invite") +
                button("Chặn chat", "chat", "block:" + p.id) +
                button("Bỏ chặn", "chat", "unblock:" + p.id) +
                button("Báo cáo", "chat", "report:" + p.id),
            ),
          )
          .join("") || '<p class="muted">Chưa có người đồng hành gần đây.</p>'
      }</div>${button("Vào huyễn cảnh cá nhân/đội", "instance")}${button("Rời tổ đội", "party", undefined, "leave")}<h3 class="section-title">Tiệm Thanh Khê</h3><div class="rows">${Object.entries(
        {
          "pill-0": "Hồi Huyết Đan · 20 Đồng",
          "pill-1": "Hồi Linh Đan · 20 Đồng",
          herb: "Linh Thảo · 5 Đồng",
          "breakthrough-pill": "Phá Cảnh Đan · 200 Đồng",
          "skill-manual": "Bí kíp · 300 Đồng",
          "branch-token": "Chuyển Đạo Lệnh · 1000 Đồng",
          "element-stone": "Chuyển Linh Thạch · 200 Đồng",
        },
      )
        .map(([id, name]) =>
          row(name, "", button("Mua", "interact", id, "buy")),
        )
        .join("")}${catalog.gear
        .filter(
          (g) =>
            g.npc &&
            g.branch === s.branch &&
            g.level <= Math.ceil(s.level / 10) * 10,
        )
        .map((g) =>
          row(
            g.name,
            `${n(g.price)} Đồng · Cấp ${g.level} · ${g.slot}`,
            button("Mua", "interact", g.id, "buy"),
          ),
        )
        .join("")}</div>`;
      break;
    case "offline":
      title = "Bế quan tu luyện";
      html = `<p>Rời thế giới chung để tu luyện riêng. Lượt bế quan tối đa 8 giờ, hiệu suất thưởng cơ bản 70% so với chiến đấu tương đương.</p><p class="hint">Dùng bình và nguyên liệu thực tế. Dừng khi tử trận hoặc túi đầy. Không khám phá bí mật, đánh boss thế giới hoặc đột phá đại cảnh giới. Đăng nhập lại kết thúc lượt và về điểm an toàn.</p><p class="muted">Khu vực: ${e(catalog.maps.find((m) => m.id === s.map)?.name)} · Bình HP ${s.inventory.filter((i) => i.template === "pill-0").reduce((x, i) => x + i.quantity, 0)} · Túi ${s.inventory.length}/40</p>${button("Bắt đầu bế quan và thoát", "offline", s.map, currentQuest()?.id)}${s.offlineReport ? `<h3 class="section-title">Báo cáo lượt trước</h3><pre style="white-space:pre-wrap;font-size:12px">${e(JSON.stringify(s.offlineReport, null, 2))}</pre>` : ""}`;
      break;
  }
  showModal(title, html);
  if (name === "market")
    document.querySelector<HTMLFormElement>("#list-form")!.onsubmit = (ev) => {
      ev.preventDefault();
      act(
        "market-list",
        document.querySelector<HTMLSelectElement>("#listing-item")!.value,
        document.querySelector<HTMLInputElement>("#listing-price")!.value,
      );
      toast("Đã gửi yêu cầu ký gửi.");
    };
}
window.addEventListener(
  "open-panel",
  (event) => void panel((event as CustomEvent<string>).detail),
);
window.addEventListener("blur", () => {
  if (scene) {
    scene.axis = 0;
    send({ type: "input", version: 1, seq: ++scene.seq, axis: 0, jump: false });
  }
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    document.querySelector(".modal-backdrop")?.remove();
    currentPanel = null;
  }
});
try {
  await api("/auth/get-session");
  const session = await api("/auth/get-session");
  if (session) await characters();
  else login();
} catch {
  login();
}
