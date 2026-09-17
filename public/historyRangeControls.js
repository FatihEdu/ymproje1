const qs = (selector) => document.querySelector(selector);
const pad = (value) => String(value).padStart(2, '0');

function toInputDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function configureTenYearRange() {
  const startInput = qs('#range-start-date');
  const endInput = qs('#range-end-date');
  const loadButton = qs('#range-load-btn');
  if (!startInput || !endInput || !loadButton) return;

  const todayDate = new Date();
  const tenYearsAgo = new Date(todayDate);
  tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);

  const today = toInputDate(todayDate);
  const tenYearStart = toInputDate(tenYearsAgo);

  startInput.min = tenYearStart;
  endInput.min = tenYearStart;
  startInput.max = today;
  endInput.max = today;

  if (!endInput.value || endInput.value > today) {
    endInput.value = today;
  }

  // The chart loader initializes a 30-day range. For this project we want
  // the full available ten-year window ready by default.
  if (!startInput.dataset.tenYearInitialized) {
    startInput.value = tenYearStart;
    endInput.value = today;
    startInput.dataset.tenYearInitialized = '1';
  }

  if (!qs('#range-10y-btn')) {
    const button = document.createElement('button');
    button.id = 'range-10y-btn';
    button.type = 'button';
    button.className = 'btn btn-sm';
    button.textContent = 'Son 10 Yıl';
    button.title = 'Son 10 yıllık banka geçmişini getir';
    button.style.background = '#eef4ff';
    button.style.color = '#1d4ed8';
    button.style.border = '1px solid #c7d7fe';

    button.addEventListener('click', () => {
      startInput.value = tenYearStart;
      endInput.value = today;
      loadButton.click();
    });

    loadButton.parentElement?.insertBefore(button, loadButton);
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    // historyDataLoader performs a second date-input setup shortly after load;
    // apply this afterwards so the 10-year range remains authoritative.
    setTimeout(configureTenYearRange, 1000);
  });
}
