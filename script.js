
const SAVE_KEY = "minhaFazendinhaSave";
const HOUSE_KEY = "minhaFazendinhaHouse";
const TIME_KEY = "minhaFazendinhaTime";

const DAY_LENGTH = 60;
const NIGHT_LENGTH = 60;
const CYCLE_LENGTH = DAY_LENGTH + NIGHT_LENGTH;

const crops = {
  carrot: {
    name: "Cenoura",
    icon: "🥕",
    growTime: 18,
    price: 12,
    seedPrice: 3
  },
  tomato: {
    name: "Tomate",
    icon: "🍅",
    growTime: 26,
    price: 18,
    seedPrice: 5
  },
  wheat: {
    name: "Trigo",
    icon: "🌾",
    growTime: 14,
    price: 9,
    seedPrice: 2
  }
};

const furnitureCatalog = {
  bed: { name: "Cama", icon: "🛏️", price: 50 },
  sofa: { name: "Sofá", icon: "🛋️", price: 40 },
  table: { name: "Mesa", icon: "🪑", price: 30 },
  plant: { name: "Vaso de planta", icon: "🪴", price: 20 },
  bear: { name: "Ursinho", icon: "🧸", price: 25 },
  rug: { name: "Tapete", icon: "🟫", price: 35 }
};

function newGame() {
  return {
    coins: 100,
    harvests: 0,
    xp: 0,
    inventory: {
      carrot: 0,
      tomato: 0,
      wheat: 0
    },
    plots: Array.from({ length: 12 }, () => ({
      crop: null,
      plantedAt: 0,
      wateredAt: 0
    })),
    upgrades: {
      watering: false,
      plots: false,
      chicken: false
    },
    lastChickenGift: Date.now(),
    lastMissionDay: 1,
    missionHarvests: 0
  };
}

let state = newGame();
let furnitureItems = [];
let nextFurnitureId = 1;
let selectedFurniture = null;
let houseOpen = false;
let noticeTimer;
let phaseStartedAt = Date.now();
let timeOffset = 0;
let currentDay = 1;
let timePhase = "day";
let remainingSeconds = DAY_LENGTH;

const $ = (selector) => document.querySelector(selector);

const plotGrid = $("#plotGrid");
const furnitureArea = $("#furnitureArea");

function notify(message) {
  $("#notice").textContent = message;
}

function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    localStorage.setItem(HOUSE_KEY, JSON.stringify({
      furnitureItems,
      nextFurnitureId
    }));
    localStorage.setItem(TIME_KEY, JSON.stringify({
      phaseStartedAt,
      timeOffset
    }));
  } catch (error) {
    console.warn("Não foi possível salvar o jogo.", error);
  }
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY));

    if (saved) {
      state = {
        ...newGame(),
        ...saved,
        inventory: {
          ...newGame().inventory,
          ...(saved.inventory || {})
        },
        upgrades: {
          ...newGame().upgrades,
          ...(saved.upgrades || {})
        },
        plots: Array.isArray(saved.plots)
          ? saved.plots
          : newGame().plots
      };
    }

    const savedHouse = JSON.parse(localStorage.getItem(HOUSE_KEY));
    if (savedHouse) {
      furnitureItems = Array.isArray(savedHouse.furnitureItems)
        ? savedHouse.furnitureItems
        : [];
      nextFurnitureId = savedHouse.nextFurnitureId || 1;
    }

    const savedTime = JSON.parse(localStorage.getItem(TIME_KEY));
    if (savedTime) {
      phaseStartedAt = savedTime.phaseStartedAt || Date.now();
      timeOffset = savedTime.timeOffset || 0;
    }
  } catch (error) {
    console.warn("O salvamento estava inválido. Um novo jogo será iniciado.", error);
    state = newGame();
  }
}

function getWorldSeconds() {
  return Math.max(
    0,
    timeOffset + (Date.now() - phaseStartedAt) / 1000
  );
}

function updateDayNight() {
  const worldSeconds = getWorldSeconds();
  const cyclePosition = worldSeconds % CYCLE_LENGTH;

  currentDay = Math.floor(worldSeconds / CYCLE_LENGTH) + 1;

  const isDay = cyclePosition < DAY_LENGTH;
  timePhase = isDay ? "day" : "night";

  remainingSeconds = Math.ceil(
    isDay
      ? DAY_LENGTH - cyclePosition
      : CYCLE_LENGTH - cyclePosition
  );

  document.body.classList.toggle("night-mode", !isDay);

  $("#dayStatus").textContent = isDay
    ? `☀️ Dia ${currentDay}`
    : `🌙 Noite ${currentDay}`;

  $("#dayMessage").textContent = isDay
    ? "Aproveite o dia para plantar, regar e colher!"
    : "É noite! Você pode entrar em casa e decorar.";

  $("#dayTimer").textContent = `${remainingSeconds}s`;

  const progress = isDay
    ? (cyclePosition / DAY_LENGTH) * 100
    : ((cyclePosition - DAY_LENGTH) / NIGHT_LENGTH) * 100;

  $("#dayProgress").style.width = `${progress}%`;

  updateDailyReward();
  updateFarmAvailability();
}

function canWorkOnFarm() {
  if (timePhase === "night") {
    notify("🌙 É noite! Espere o dia chegar para cuidar da plantação.");
    return false;
  }
  return true;
}

function updateFarmAvailability() {
  const locked = timePhase === "night";

  document.querySelectorAll(".action, #sellAll, [data-upgrade]")
    .forEach(button => {
      button.disabled = locked;
      button.title = locked
        ? "Disponível durante o dia"
        : "";
    });

  $("#farmMessage").textContent = locked
    ? "🌙 A fazenda está descansando. Volte durante o dia!"
    : "Escolha uma ação e clique em um terreno.";

  updateFurnitureShop();
}

function selectedSeed() {
  return document.querySelector('input[name="seed"]:checked').value;
}

function setMode(mode) {
  document.querySelectorAll(".action").forEach(button => {
    button.classList.toggle("selected", button.dataset.mode === mode);
  });

  state.mode = mode;
}

function getCropStage(plot) {
  if (!plot.crop) return "empty";

  const crop = crops[plot.crop];
  const elapsed = (Date.now() - plot.plantedAt) / 1000;
  const growTime = crop.growTime *
    (state.upgrades.watering && plot.wateredAt ? 0.75 : 1);

  return elapsed >= growTime ? "ready" : "growing";
}

function getCropIcon(plot) {
  if (!plot.crop) return "🟫";

  const stage = getCropStage(plot);

  if (stage === "ready") return crops[plot.crop].icon;
  if (stage === "growing") return "🌱";

  return "🟫";
}

function renderPlots() {
  plotGrid.innerHTML = "";

  state.plots.forEach((plot, index) => {
    const stage = getCropStage(plot);
    const button = document.createElement("button");
    button.className = `plot ${stage}`;

    if (plot.wateredAt) button.classList.add("watered");

    const icon = document.createElement("span");
    icon.className = "crop-icon";
    icon.textContent = getCropIcon(plot);

    const label = document.createElement("span");
    label.className = "plot-label";

    if (!plot.crop) {
      label.textContent = "Terreno vazio";
    } else if (stage === "ready") {
      label.textContent = `${crops[plot.crop].name} pronta!`;
    } else {
      const elapsed = (Date.now() - plot.plantedAt) / 1000;
      const growTime = crops[plot.crop].growTime;
      label.textContent = `Crescendo ${Math.min(
        99,
        Math.floor((elapsed / growTime) * 100)
      )}%`;
    }

    button.append(icon, label);
    button.addEventListener("click", () => usePlot(index));
    plotGrid.appendChild(button);
  });
}

function usePlot(index) {
  if (!canWorkOnFarm()) return;

  const plot = state.plots[index];
  const mode = state.mode || "plant";

  if (mode === "plant") {
    if (plot.crop) {
      notify("Esse terreno já tem uma plantação!");
      return;
    }

    const seed = selectedSeed();
    const crop = crops[seed];

    if (state.coins < crop.seedPrice) {
      notify("Você não tem moedas suficientes para comprar essa semente.");
      return;
    }

    state.coins -= crop.seedPrice;
    plot.crop = seed;
    plot.plantedAt = Date.now();
    plot.wateredAt = 0;

    notify(`${crop.icon} Você plantou ${crop.name.toLowerCase()}!`);
  }

  if (mode === "water") {
    if (!plot.crop) {
      notify("Plante alguma coisa antes de regar!");
      return;
    }

    plot.wateredAt = Date.now();
    notify("💧 Plantação regada!");

    if (state.upgrades.watering) {
      plot.plantedAt -= 3000;
      notify("💧 Seu regador melhorado acelerou o crescimento!");
    }
  }

  if (mode === "harvest") {
    if (!plot.crop) {
      notify("Esse terreno está vazio.");
      return;
    }

    if (getCropStage(plot) !== "ready") {
      notify("Ainda está crescendo! Espere mais um pouquinho. 🌱");
      return;
    }

    const crop = plot.crop;
    state.inventory[crop]++;
    state.harvests++;
    state.xp += 10;
    state.missionHarvests++;

    Object.assign(plot, {
      crop: null,
      plantedAt: 0,
      wateredAt: 0
    });

    notify(`🎉 Você colheu ${crops[crop].name.toLowerCase()}!`);
  }

  render();
  save();
}

function renderStats() {
  $("#coins").textContent = state.coins;
  $("#level").textContent = Math.floor(state.xp / 50) + 1;
  $("#harvests").textContent = state.harvests;

  $("#carrots").textContent = state.inventory.carrot;
  $("#tomatoes").textContent = state.inventory.tomato;
  $("#wheat").textContent = state.inventory.wheat;

  const progress = Math.min(100, state.missionHarvests * 20);
  $("#missionProgress").style.width = `${progress}%`;

  $("#missionText").textContent =
    `Colha 5 plantações: ${Math.min(state.missionHarvests, 5)}/5.`;

  if (state.missionHarvests >= 5) {
    $("#missionText").textContent = "Missão concluída! 🎉";
  }
}

function render() {
  renderPlots();
  renderStats();
  updateFarmAvailability();
  updateFurnitureShop();
}

function updateFurnitureShop() {
  document.querySelectorAll("[data-furniture]").forEach(button => {
    const item = furnitureCatalog[button.dataset.furniture];
    if (!item) return;

    button.disabled = state.coins < item.price;
  });
}

function sellAll() {
  if (!canWorkOnFarm()) return;

  let earned = 0;

  Object.keys(crops).forEach(key => {
    earned += state.inventory[key] * crops[key].price;
    state.inventory[key] = 0;
  });

  if (earned === 0) {
    $("#sellMessage").textContent = "Você ainda não tem colheitas para vender.";
    return;
  }

  state.coins += earned;
  $("#sellMessage").textContent = `Você ganhou ${earned} moedas! 🪙`;
  notify(`🪙 Colheitas vendidas por ${earned} moedas!`);

  render();
  save();
}

function buyUpgrade(type) {
  if (!canWorkOnFarm()) return;

  const upgrades = {
    watering: { price: 60, name: "Regador melhorado" },
    plots: { price: 80, name: "Novos terrenos" },
    chicken: { price: 100, name: "Galinha" }
  };

  const upgrade = upgrades[type];

  if (!upgrade || state.upgrades[type]) {
    notify("Você já comprou essa melhoria!");
    return;
  }

  if (state.coins < upgrade.price) {
    notify("Você não tem moedas suficientes!");
    return;
  }

  state.coins -= upgrade.price;
  state.upgrades[type] = true;

  if (type === "plots") {
    for (let i = 0; i < 4; i++) {
      state.plots.push({
        crop: null,
        plantedAt: 0,
        wateredAt: 0
      });
    }
  }

  const button = document.querySelector(`[data-upgrade="${type}"]`);
  if (button) {
    button.disabled = true;
    button.textContent = `✅ ${upgrade.name} comprado`;
  }

  $("#upgradeMessage").textContent =
    `${upgrade.name} comprado com sucesso!`;

  notify(`🎉 Você comprou: ${upgrade.name}!`);
  render();
  save();
}

function updateDailyReward() {
  const alreadyClaimed = state.lastRewardDay === currentDay;
  const reward = 25 + (currentDay - 1) * 5;

  $("#dailyMessage").textContent = alreadyClaimed
    ? `Você já recebeu a recompensa do dia ${currentDay}.`
    : `Receba ${reward} moedas no dia ${currentDay}!`;

  $("#claimDaily").disabled = alreadyClaimed;
  $("#claimDaily").textContent = alreadyClaimed
    ? "Recompensa recebida"
    : `Receber ${reward} moedas`;
}

function claimDailyReward() {
  if (state.lastRewardDay === currentDay) {
    notify("Você já recebeu a recompensa de hoje!");
    return;
  }

  const reward = 25 + (currentDay - 1) * 5;
  state.coins += reward;
  state.lastRewardDay = currentDay;

  notify(`🎁 Você recebeu ${reward} moedas!`);
  render();
  save();
}

function openHouse() {
  houseOpen = true;
  $("#houseScreen").classList.add("active");
  $("#farmScreen").classList.remove("active");

  document.querySelectorAll(".tab").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.screen === "houseScreen");
  });

  renderFurniture();
  notify("🏡 Bem-vinda à sua casinha!");
}

function exitHouse() {
  houseOpen = false;
  $("#houseScreen").classList.remove("active");
  $("#farmScreen").classList.add("active");

  document.querySelectorAll(".tab").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.screen === "farmScreen");
  });

  notify(timePhase === "night"
    ? "🌙 Você voltou para a fazenda. A plantação continua descansando."
    : "🌱 Você voltou para a fazenda!");

  render();
}

function renderFurniture() {
  furnitureArea.innerHTML = "";

  furnitureItems.forEach(item => {
    const definition = furnitureCatalog[item.type];
    if (!definition) return;

    const piece = document.createElement("div");
    piece.className = "furniture-piece";
    piece.dataset.type = item.type;
    piece.dataset.id = item.id;
    piece.textContent = definition.icon;
    piece.title = `${definition.name} — arraste para mover`;

    piece.style.left = `${item.x}%`;
    piece.style.top = `${item.y}%`;

    if (selectedFurniture === item.id) {
      piece.classList.add("selected");
    }

    piece.addEventListener("pointerdown", event => {
      if (event.button !== 0) return;

      event.preventDefault();
      selectedFurniture = item.id;

      furnitureArea.querySelectorAll(".furniture-piece").forEach(el => {
        el.classList.toggle("selected", el.dataset.id == item.id);
      });

      const roomRect = furnitureArea.getBoundingClientRect();
      const pieceRect = piece.getBoundingClientRect();

      const offsetX = event.clientX - pieceRect.left;
      const offsetY = event.clientY - pieceRect.top;

      piece.setPointerCapture(event.pointerId);

      function movePiece(moveEvent) {
        const newLeft = moveEvent.clientX - roomRect.left - offsetX;
        const newTop = moveEvent.clientY - roomRect.top - offsetY;

        const maxLeft = Math.max(0, roomRect.width - piece.offsetWidth);
        const maxTop = Math.max(0, roomRect.height - piece.offsetHeight);

        const clampedLeft = Math.max(0, Math.min(maxLeft, newLeft));
        const clampedTop = Math.max(0, Math.min(maxTop, newTop));

        item.x = (clampedLeft / roomRect.width) * 100;
        item.y = (clampedTop / roomRect.height) * 100;

        piece.style.left = `${item.x}%`;
        piece.style.top = `${item.y}%`;
      }

      function stopMoving() {
        piece.removeEventListener("pointermove", movePiece);
        piece.removeEventListener("pointerup", stopMoving);
        piece.removeEventListener("pointercancel", stopMoving);
        save();
      }

      piece.addEventListener("pointermove", movePiece);
      piece.addEventListener("pointerup", stopMoving);
      piece.addEventListener("pointercancel", stopMoving);
    });

    furnitureArea.appendChild(piece);
  });
}

function buyFurniture(type) {
  const item = furnitureCatalog[type];
  if (!item) return;

  if (state.coins < item.price) {
    $("#houseMessage").textContent = "Você não tem moedas suficientes para esse móvel.";
    return;
  }

  state.coins -= item.price;

  furnitureItems.push({
    id: nextFurnitureId++,
    type,
    x: 38 + Math.random() * 18,
    y: 38 + Math.random() * 18
  });

  selectedFurniture = furnitureItems[furnitureItems.length - 1].id;

  $("#houseMessage").textContent =
    `${item.name} comprado! Arraste-o para o lugar que preferir.`;

  notify(`🏡 Você comprou: ${item.name}!`);
  renderFurniture();
  renderStats();
  updateFurnitureShop();
  save();
}

function tick() {
  updateDayNight();

  // Recompensa da galinha: 10 moedas a cada 45 segundos reais.
  if (state.upgrades.chicken) {
    const now = Date.now();

    if (now - state.lastChickenGift >= 45000) {
      state.coins += 10;
      state.lastChickenGift = now;
      notify("🐔 Sua galinha trouxe 10 moedas!");
      renderStats();
      save();
    }
  }

  // Atualiza o crescimento das plantas.
  if (!houseOpen && timePhase === "day") {
    renderPlots();
  }
}

document.querySelectorAll(".action").forEach(button => {
  button.addEventListener("click", () => {
    if (!canWorkOnFarm()) return;
    setMode(button.dataset.mode);
  });
});

document.querySelectorAll("[data-upgrade]").forEach(button => {
  button.addEventListener("click", () => buyUpgrade(button.dataset.upgrade));
});

document.querySelectorAll("[data-furniture]").forEach(button => {
  button.addEventListener("click", () => buyFurniture(button.dataset.furniture));
});

document.querySelectorAll(".tab").forEach(button => {
  button.addEventListener("click", () => {
    if (button.dataset.screen === "houseScreen") {
      openHouse();
    } else {
      exitHouse();
    }
  });
});

$("#exitHouse").addEventListener("click", exitHouse);
$("#sellAll").addEventListener("click", sellAll);
$("#claimDaily").addEventListener("click", claimDailyReward);

$("#reset").addEventListener("click", () => {
  const confirmed = confirm("Tem certeza que deseja recomeçar? Todo o progresso será apagado.");

  if (!confirmed) return;

  localStorage.removeItem(SAVE_KEY);
  localStorage.removeItem(HOUSE_KEY);
  localStorage.removeItem(TIME_KEY);

  state = newGame();
  furnitureItems = [];
  nextFurnitureId = 1;
  selectedFurniture = null;
  timeOffset = 0;
  phaseStartedAt = Date.now();
  currentDay = 1;
  timePhase = "day";
  houseOpen = false;

  exitHouse();
  render();
  updateDayNight();
  save();
  notify("🌷 Uma nova fazendinha começou!");
});

// Inicia o jogo.
load();
setMode("plant");
render();
updateDayNight();
renderFurniture();

document.querySelectorAll("[data-upgrade]").forEach(button => {
  if (state.upgrades[button.dataset.upgrade]) {
    const names = {
      watering: "Regador melhorado",
      plots: "Novos terrenos",
      chicken: "Galinha"
    };

    button.disabled = true;
    button.textContent = `✅ ${names[button.dataset.upgrade]} comprado`;
  }
});

setInterval(tick, 250);
setInterval(save, 5000);