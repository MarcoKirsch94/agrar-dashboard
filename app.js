// ===== Produkt-Stammdaten =====
const productData = {
  "Weizen":      { optimalHumidityMax: 60, optimalTempMin: 22, optimalTempMax: 26, comment: "Unter 18 % Kornfeuchte, sonst Gefahr von Lager- und Qualitätsverlusten" },
  "Mais":        { optimalHumidityMax: 20, optimalTempMin: 15, optimalTempMax: 30, comment: "Bei zu hoher Luftfeuchte steigt Schimmelrisiko" },
  "Raps":        { optimalHumidityMax: 40, optimalTempMin: 20, optimalTempMax: 25, comment: "Sehr empfindlich, zu feucht = Auswuchsgefahr" },
  "Gerste":      { optimalHumidityMax: 17, optimalTempMin: 18, optimalTempMax: 24, comment: "Malzqualität leidet bei zu hoher Feuchtigkeit" },
  "Kartoffeln":  { optimalHumidityMax: 75, optimalTempMin: 10, optimalTempMax: 18, comment: "Schalenfestigkeit wichtig, zu heiß = Fäulnisrisiko" },
  "Zuckerrüben": { optimalHumidityMax: 80, optimalTempMin: 8,  optimalTempMax: 15, comment: "Müssen kühl geerntet werden, sonst Lagerverluste" },
  "Sonnenblumen":{ optimalHumidityMax: 15, optimalTempMin: 22, optimalTempMax: 28, comment: "Ölqualität sinkt bei zu hoher Kornfeuchte" }
};

// ===== State =====
let selectedProducts = [];
let todayChartInstance = null;
let tomorrowChartInstance = null;
let latestWeather = null;

// ===== Helpers =====
function getStatus(actualTemp, actualHumidity, optimal) {
  const tempOK = actualTemp >= optimal.optimalTempMin && actualTemp <= optimal.optimalTempMax;
  const humidityOK = actualHumidity <= optimal.optimalHumidityMax;
  if (tempOK && humidityOK) return "green";
  if (tempOK || humidityOK) return "orange";
  return "red";
}

function drawWeatherChart(canvasId, labels, temps, rainProb, chartInstanceName) {
  const ctx = document.getElementById(canvasId).getContext("2d");
  if (chartInstanceName === "today" && todayChartInstance) todayChartInstance.destroy();
  if (chartInstanceName === "tomorrow" && tomorrowChartInstance) tomorrowChartInstance.destroy();

  const newChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: "Temperatur (°C)", data: temps, borderColor: "red", backgroundColor: "rgba(255,0,0,0.1)", yAxisID: 'y' },
        { label: "Regenwahrscheinlichkeit (%)", data: rainProb, borderColor: "blue", backgroundColor: "rgba(0,0,255,0.1)", yAxisID: 'y1' }
      ]
    },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { ticks: { maxTicksLimit: 12 } },
        y: { type: 'linear', position: 'left', title: { display: true, text: '°C' } },
        y1: { type: 'linear', position: 'right', min: 0, max: 100, grid: { drawOnChartArea: false }, title: { display: true, text: '%' } }
      }
    }
  });

  if (chartInstanceName === "today") todayChartInstance = newChart;
  if (chartInstanceName === "tomorrow") tomorrowChartInstance = newChart;
}

function findNextOptimalDate(product, weather) {
  const optimal = productData[product];
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const temp = weather.daily.temperature_2m_max[i];
    const humidity = weather.daily.relative_humidity_2m_max[i];
    const rain = weather.daily.precipitation_sum[i];
    if (temp >= optimal.optimalTempMin && temp <= optimal.optimalTempMax && humidity <= optimal.optimalHumidityMax && rain === 0) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      return date.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "2-digit" });
    }
  }
  return "Kein optimaler Tag in den nächsten 7 Tagen";
}

function getHourlyForDay(weather, dayIso) {
  const labels = [];
  const tempSeries = [];
  const probSeries = [];
  for (let i = 0; i < weather.hourly.time.length; i++) {
    const t = weather.hourly.time[i];
    if (t.startsWith(dayIso)) {
      const hour = new Date(t).getHours().toString().padStart(2, "0") + ":00";
      labels.push(hour);
      tempSeries.push(weather.hourly.temperature_2m[i]);
      probSeries.push(weather.hourly.precipitation_probability[i]);
    }
  }
  return { labels, tempSeries, probSeries };
}

function meanHumidityForPeriod(weather, dayIso, startHour = 8, endHour = 20) {
  let sum = 0, count = 0;
  for (let i = 0; i < weather.hourly.time.length; i++) {
    const t = weather.hourly.time[i];
    if (t.startsWith(dayIso)) {
      const h = new Date(t).getHours();
      if (h >= startHour && h <= endHour) {
        sum += weather.hourly.relative_humidity_2m[i];
        count++;
      }
    }
  }
  return count ? Math.round(sum / count) : null;
}

// ===== Weather I/O =====
async function loadWeather(city) {
  try {
    // Geocoding
    const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(city)}`, {
      headers: { "Accept-Language": "de" }
    });
    const geoData = await geoRes.json();
    if (!geoData.length) throw new Error("Ort nicht gefunden");
    const lat = geoData[0].lat;
    const lon = geoData[0].lon;

    // Forecast
    const weatherRes = await fetch(
  `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&timezone=Europe/Berlin` +
  `&forecast_days=9` + // <— mehr Tage anfordern
  `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,relative_humidity_2m_max` +
  `&hourly=temperature_2m,precipitation_probability,relative_humidity_2m`
);
    const weather = await weatherRes.json();
    latestWeather = weather;

    const todayIso = weather.daily.time[0];
    const tomorrowIso = weather.daily.time[1];

    const todayHumAvg = meanHumidityForPeriod(weather, todayIso);
    const tomorrowHumAvg = meanHumidityForPeriod(weather, tomorrowIso);

    // Info-Boxen
    document.getElementById("todayInfo").innerHTML = `<strong>Heute (${city})</strong><br>
      Temp: ${weather.daily.temperature_2m_max[0]}°C / ${weather.daily.temperature_2m_min[0]}°C<br>
      Niederschlag: ${weather.daily.precipitation_sum[0]} mm<br>
      Regenwahrscheinlichkeit: ${weather.daily.precipitation_probability_max[0]}%<br>
      Luftfeuchtigkeit: Ø ${todayHumAvg ?? "–"}% (max ${weather.daily.relative_humidity_2m_max[0]}%)`;

    document.getElementById("tomorrowInfo").innerHTML = `<strong>Morgen (${city})</strong><br>
      Temp: ${weather.daily.temperature_2m_max[1]}°C / ${weather.daily.temperature_2m_min[1]}°C<br>
      Niederschlag: ${weather.daily.precipitation_sum[1]} mm<br>
      Regenwahrscheinlichkeit: ${weather.daily.precipitation_probability_max[1]}%<br>
      Luftfeuchtigkeit: Ø ${tomorrowHumAvg ?? "–"}% (max ${weather.daily.relative_humidity_2m_max[1]}%)`;

    // Charts (stündlich)
    const todayHourly = getHourlyForDay(weather, todayIso);
    const tomorrowHourly = getHourlyForDay(weather, tomorrowIso);
    drawWeatherChart("todayChart", todayHourly.labels, todayHourly.tempSeries, todayHourly.probSeries, "today");
    drawWeatherChart("tomorrowChart", tomorrowHourly.labels, tomorrowHourly.tempSeries, tomorrowHourly.probSeries, "tomorrow");

    // 7-Tage-Block
    const weatherIcons = { sun: "☀️", rain: "🌧️" };
    let weekHtml = "";
for (let i = 2; i < 9; i++) { // 2..8 => 7 Tage
  const date = new Date(weather.daily.time[i]);
  const formattedDate = date.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
  const icon = weather.daily.precipitation_sum[i] > 0 ? "🌧️" : "☀️";
  weekHtml += `
    <div class="day-box">
      <strong>${formattedDate}</strong><br>${icon}<br>
      ${weather.daily.temperature_2m_max[i]}°C / ${weather.daily.temperature_2m_min[i]}°C<br>
      Niederschlag: ${weather.daily.precipitation_sum[i]} mm<br>
      Regenwahrscheinlichkeit: ${weather.daily.precipitation_probability_max[i]} %
    </div>`;
}
document.getElementById("weather-week").innerHTML = weekHtml;

  } catch (err) {
    console.error(err);
    alert("Fehler beim Laden der Wetterdaten.");
  }
}

// ===== Produkte laden =====
function loadProducts() {
  if (!latestWeather) return;

  const todayIso = latestWeather.daily.time[0];
  const todayHumAvg = meanHumidityForPeriod(latestWeather, todayIso);
  const actualTemp = latestWeather.daily.temperature_2m_max[0];
  const actualHumidity = todayHumAvg;

  let html = "";
  selectedProducts.forEach(product => {
    const optimal = productData[product];
    const status = getStatus(actualTemp, actualHumidity, optimal);
    const nextDate = findNextOptimalDate(product, latestWeather);

    html += `<div class="product-chart" style="background-color:${status}; color:white">
      <h4>${product}</h4>
      <p>Status: ${status === 'green' ? 'Erntebereit' : status === 'orange' ? 'Akzeptabel' : 'Problematisch'}</p>
      <p><strong>Nächster empfohlener Erntetag:</strong> ${nextDate}</p>
      <p>Optimale Temperatur: ${optimal.optimalTempMin}°C – ${optimal.optimalTempMax}°C</p>
      <p>Max. Luftfeuchtigkeit: ${optimal.optimalHumidityMax}%</p>
      <p><em>${optimal.comment}</em></p>
    </div>`;
  });
  document.getElementById("product-status").innerHTML = html;
}

// ===== UI-Setup =====
window.addEventListener("DOMContentLoaded", () => {
  const citySelect = document.getElementById("citySelect");
  const modeSelect = document.getElementById("modeSelect");
  const productDropdownBtn = document.getElementById("productDropdownBtn");
  const productDropdownList = document.getElementById("productDropdownList");

  function renderProductList(mode) {
    // Single: Sicherstellen, dass nur 1 gewählt bleibt/ist
    if (mode === "single" && selectedProducts.length > 1) {
      selectedProducts = selectedProducts.slice(0, 1);
    }
    if (mode === "single" && selectedProducts.length === 0) {
      selectedProducts = [Object.keys(productData)[0]];
    }

    productDropdownList.innerHTML = "";
    Object.keys(productData).forEach(product => {
      const id = `product_${product}`;
      const checked = selectedProducts.includes(product) ? "checked" : "";
      const disabled = mode === "all" ? "disabled" : "";
      productDropdownList.innerHTML += `
        <label for="${id}">
          <input type="checkbox" id="${id}" name="products" value="${product}" ${checked} ${disabled}>
          ${product}
        </label>`;
    });
  }

  function updateSelectedProductsFromUI() {
    selectedProducts = Array.from(productDropdownList.querySelectorAll('input[type="checkbox"]:checked'))
      .map(i => i.value);
  }

  // Dropdown öffnen/schließen
  productDropdownBtn.addEventListener("click", () => {
    productDropdownList.style.display = productDropdownList.style.display === "block" ? "none" : "block";
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".custom-select")) {
      productDropdownList.style.display = "none";
    }
  });

  // Moduswechsel
  modeSelect.addEventListener("change", () => {
    const mode = modeSelect.value;
    if (mode === "all") {
      selectedProducts = Object.keys(productData);
    } else if (mode === "single" && selectedProducts.length > 1) {
      selectedProducts = selectedProducts.slice(0, 1);
    }
    renderProductList(mode);
  });

  // Auswahl in der Liste
  productDropdownList.addEventListener("change", (e) => {
    const mode = modeSelect.value;
    if (!(e.target instanceof HTMLInputElement) || e.target.type !== "checkbox") return;

    if (mode === "single") {
      // Exklusiv: nur ein Häkchen erlaubt
      productDropdownList.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        if (cb !== e.target) cb.checked = false;
      });
    }
    updateSelectedProductsFromUI();
  });

  // Laden-Button
  document.getElementById("loadBtn").addEventListener("click", async () => {
    const mode = modeSelect.value;
    const city = citySelect.value || "Hamburg";

    if (mode === "all") {
      selectedProducts = Object.keys(productData);
    } else {
      updateSelectedProductsFromUI();
      if (mode === "single") {
        if (selectedProducts.length === 0) {
          selectedProducts = [Object.keys(productData)[0]];
          productDropdownList.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.checked = (cb.value === selectedProducts[0]);
          });
        } else if (selectedProducts.length > 1) {
          selectedProducts = [selectedProducts[0]];
          productDropdownList.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.checked = (cb.value === selectedProducts[0]);
          });
        }
      }
    }

    if (selectedProducts.length === 0) {
      alert("Bitte wähle mindestens ein Produkt aus.");
      return;
    }

    await loadWeather(city);
    loadProducts();
  });

  // Initial: Modus "Alle", Stadt „Hamburg“
  modeSelect.value = "all";
  modeSelect.dispatchEvent(new Event("change"));
  citySelect.value = "Hamburg";
  loadWeather(citySelect.value);
});