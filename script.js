
const $ = (selector) => document.querySelector(selector);

const audio = $("#audio");
const results = $("#results");
let toastTimer;

function notify(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
}

function safe(text = "") {
  return String(text).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;"
  })[char]);
}

async function searchMusic(query) {
  query = query.trim();
  if (!query) return notify("Введи название песни.");

  $("#query").value = query;
  $("#resultTitle").textContent = `Результаты: ${query}`;
  results.innerHTML = '<div class="empty"><div>♫</div><b>Ищем музыку...</b><p>Подожди немного.</p></div>';

  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=12`;
    const response = await fetch(url);
    if (!response.ok) throw new Error();
    const data = await response.json();
    renderTracks((data.results || []).filter(track => track.kind === "song"));
  } catch {
    results.innerHTML = '<div class="empty"><div>⌁</div><b>Не получилось загрузить музыку</b><p>Проверь подключение к интернету и попробуй ещё раз.</p></div>';
  }
}

function renderTracks(tracks) {
  if (!tracks.length) {
    results.innerHTML = '<div class="empty"><div>♫</div><b>Ничего не найдено</b><p>Попробуй другое название песни.</p></div>';
    return;
  }

  results.innerHTML = tracks.map((track, index) => `
    <article class="track">
      <img src="${safe(track.artworkUrl100 || "")}" alt="" loading="lazy">
      <h3 title="${safe(track.trackName)}">${safe(track.trackName)}</h3>
      <p title="${safe(track.artistName)}">${safe(track.artistName)}</p>
      <div class="track-actions">
        <button class="listen" data-play="${index}">
          ${track.previewUrl ? "▶ Слушать" : "Открыть трек ↗"}
        </button>
        <button class="open-track" data-open="${index}" aria-label="Открыть трек">↗</button>
      </div>
    </article>
  `).join("");

  results.querySelectorAll("[data-play]").forEach(button => {
    button.addEventListener("click", () => {
      const track = tracks[Number(button.dataset.play)];
      if (track.previewUrl) playTrack(track);
      else openTrack(track);
    });
  });

  results.querySelectorAll("[data-open]").forEach(button => {
    button.addEventListener("click", () => openTrack(tracks[Number(button.dataset.open)]));
  });
}

function openTrack(track) {
  if (track.trackViewUrl) {
    window.open(track.trackViewUrl, "_blank", "noopener,noreferrer");
  } else {
    notify("Ссылка на этот трек недоступна.");
  }
}

function playTrack(track) {
  if (!track.previewUrl) {
    openTrack(track);
    notify("Для этой песни нет короткого превью.");
    return;
  }

  audio.src = track.previewUrl;
  audio.volume = Number($("#volume").value);

  audio.play().then(() => {
    $("#trackName").textContent = track.trackName;
    $("#artistName").textContent = track.artistName;
    $("#cover").src = track.artworkUrl100 || "";
    $("#play").textContent = "Ⅱ";
    $("#seek").value = 0;
  }).catch(() => notify("Не удалось запустить трек. Попробуй ещё раз."));
}

$("#searchForm").addEventListener("submit", event => {
  event.preventDefault();
  searchMusic($("#query").value);
});

document.querySelectorAll("[data-song]").forEach(button => {
  button.addEventListener("click", () => searchMusic(button.dataset.song));
});

$("#play").addEventListener("click", () => {
  if (!audio.src) return notify("Сначала найди песню.");
  if (audio.paused) {
    audio.play().then(() => $("#play").textContent = "Ⅱ")
      .catch(() => notify("Не получилось включить музыку."));
  } else {
    audio.pause();
    $("#play").textContent = "▶";
  }
});

audio.addEventListener("timeupdate", () => {
  $("#seek").value = audio.currentTime;
  $("#currentTime").textContent = formatTime(audio.currentTime);
});

audio.addEventListener("loadedmetadata", () => {
  $("#seek").max = audio.duration || 30;
  $("#duration").textContent = formatTime(audio.duration || 30);
});

audio.addEventListener("ended", () => $("#play").textContent = "▶");

$("#seek").addEventListener("input", () => {
  if (Number.isFinite(audio.duration)) audio.currentTime = Number($("#seek").value);
});

$("#volume").addEventListener("input", () => {
  audio.volume = Number($("#volume").value);
});

function formatTime(seconds) {
  seconds = Math.floor(Number(seconds) || 0);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

// Погода через Open-Meteo
const weatherCodes = {
  0: ["Ясно", "☀"], 1: ["Преимущественно ясно", "🌤"],
  2: ["Переменная облачность", "⛅"], 3: ["Облачно", "☁"],
  45: ["Туман", "🌫"], 48: ["Туман", "🌫"],
  51: ["Лёгкая морось", "🌦"], 53: ["Морось", "🌦"],
  55: ["Сильная морось", "🌧"], 61: ["Небольшой дождь", "🌦"],
  63: ["Дождь", "🌧"], 65: ["Сильный дождь", "🌧"],
  71: ["Небольшой снег", "🌨"], 73: ["Снег", "🌨"],
  75: ["Сильный снег", "❄"], 80: ["Ливень", "🌦"],
  81: ["Ливень", "🌧"], 82: ["Сильный ливень", "⛈"],
  95: ["Гроза", "⛈"], 96: ["Гроза с градом", "⛈"],
  99: ["Сильная гроза", "⛈"]
};

async function loadWeather(city) {
  city = city.trim();
  if (!city) return notify("Введи название города.");

  $("#description").textContent = "Загружаем погоду...";
  try {
    const geoResponse = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=ru&format=json`
    );
    if (!geoResponse.ok) throw new Error();
    const geo = await geoResponse.json();

    if (!geo.results || !geo.results.length) throw new Error();

    const place = geo.results[0];
    const weatherResponse = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,apparent_temperature,is_day,weather_code,wind_speed_10m&timezone=auto`
    );
    if (!weatherResponse.ok) throw new Error();

    const data = await weatherResponse.json();
    const current = data.current;
    const condition = weatherCodes[current.weather_code] || ["Погодные условия", "🌤"];

    $("#cityName").textContent = [place.name, place.country].filter(Boolean).join(", ");
    $("#description").textContent = condition[0];
    $("#weatherIcon").textContent = current.is_day ? condition[1] : "🌙";
    $("#temperature").textContent = `${Math.round(current.temperature_2m)}°`;
    $("#feels").textContent = `${Math.round(current.apparent_temperature)}°`;
    $("#wind").textContent = `${Math.round(current.wind_speed_10m)} км/ч`;
    $("#updated").textContent = current.time ? `ОБНОВЛЕНО ${current.time.slice(11, 16)}` : "LIVE WEATHER";
  } catch {
    $("#description").textContent = "Не удалось загрузить погоду";
    $("#weatherIcon").textContent = "☁";
    notify("Город не найден или нет интернета. Попробуй ещё раз.");
  }
}

$("#weatherForm").addEventListener("submit", event => {
  event.preventDefault();
  loadWeather($("#city").value);
});

loadWeather("Tashkent");
