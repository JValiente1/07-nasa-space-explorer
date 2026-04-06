const startInput = document.getElementById('startDate');
const endInput = document.getElementById('endDate');
const includeVideosInput = document.getElementById('includeVideos');
const getImagesButton = document.querySelector('.filters button');
const resultCount = document.getElementById('resultCount');
const gallery = document.getElementById('gallery');
const SPACE_FACTS = [
	'One day on Venus is longer than one year on Venus.',
	'Neutron stars can spin faster than a kitchen blender, rotating hundreds of times each second.',
	'Jupiter has the shortest day in our solar system: about 10 hours.',
	'The footprints from Apollo astronauts can last for millions of years on the Moon.',
	'Saturn would float in water because it is mostly made of gas and has a low average density.',
	'Light from the Sun takes about 8 minutes and 20 seconds to reach Earth.',
	'There are more stars in the universe than grains of sand on all beaches on Earth.',
	'The International Space Station travels around Earth at about 17,500 miles per hour.'
];
const LOCAL_FALLBACK_ITEMS = [
	{
		date: 'NASA APOD Offline Mode',
		title: 'Mission Control Standby',
		explanation:
			'NASA APOD is temporarily unavailable right now. Your app is still working. Please try again in a few minutes to load the latest space photos.',
		url: 'img/nasa-worm-logo.png',
		media_type: 'image'
	},
	{
		date: 'Quick Link',
		title: 'Open NASA APOD Website',
		explanation:
			'You can still browse APOD directly at https://apod.nasa.gov/apod/ while API requests recover.',
		url: 'img/nasa-worm-logo.png',
		media_type: 'image'
	},
	{
		date: 'Status',
		title: 'Using Local Backup Content',
		explanation:
			'This backup keeps your gallery visible when the API has outages, timeouts, or network interruptions.',
		url: 'img/nasa-worm-logo.png',
		media_type: 'image'
	}
];

const NASA_API_KEY = 'aH4Uf99aBm4zRtlFD8BqA7pk0aeRexhbIcQj7HSR';
const APOD_ENDPOINT = 'https://api.nasa.gov/planetary/apod';
const APOD_MIN_DATE = '1995-06-16';
const DESCRIPTION_PREVIEW_LENGTH = 220;
const MAX_RETRIES = 1;
const FALLBACK_RANGE_DAYS = 3;
const REQUEST_TIMEOUT_MS = 3500;
const API_COOLDOWN_MS = 60 * 60 * 1000;
const APOD_CACHE_KEY = 'nasa-space-explorer-apod-cache-v1';
const APOD_API_STATUS_KEY = 'nasa-space-explorer-apod-status-v1';
const THEMES = {
	classic: {},
	bright: {
		'--space-navy': '#2b0b0b',
		'--space-blue': '#fc3d21',
		'--star-white': '#fff6ef',
		'--sky-glow': '#ffe7d2',
		'--panel': '#fff7f1',
		'--text-main': '#241814',
		'--text-soft': '#55332b',
		'--accent': '#f9aa43',
		'--accent-hover': '#ff7a21',
		'--highlight': '#fc3d21',
		'--line': '#f4b27e'
	}
};
const THEME_STORAGE_KEY = 'nasa-space-explorer-theme';
const THEME_VARIABLES = [
	'--space-navy',
	'--space-blue',
	'--star-white',
	'--sky-glow',
	'--panel',
	'--text-main',
	'--text-soft',
	'--accent',
	'--accent-hover',
	'--highlight',
	'--line'
];
let modalOverlay, modalMedia, modalTitle, modalDate, modalExplanation;
let apiCooldownUntil = 0;
let defaultThemeValues = null;
let themeStatusBadge;

function localGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function localSet(key, val) { try { localStorage.setItem(key, val); } catch {} }
function localRemove(key) { try { localStorage.removeItem(key); } catch {} }

window.addEventListener('error', () => renderEmergencyBackup('A startup error occurred. Showing backup content.'));
window.addEventListener('unhandledrejection', () => renderEmergencyBackup('A network error occurred. Showing backup content.'));

function initializeApp() {
	if (!startInput || !endInput || !includeVideosInput || !getImagesButton || !resultCount || !gallery) {
		renderEmergencyBackup('Required page elements are missing. Showing backup content.');
		return;
	}

	// Theme controls should always initialize, even if later startup steps fail.
	setupThemeSwitcher();

	try {
		setupDateInputs(startInput, endInput);
		setupModal();
		loadPersistedApiCooldown();
		renderRandomFact();
		renderOfflineFirstGallery();
		resultCount.textContent = 'Ready. Showing local backup content. Click Get Space Images to fetch live NASA results.';
		getImagesButton.addEventListener('click', loadImages);
		includeVideosInput.addEventListener('change', loadImages);
	} catch (error) {
		setupThemeSwitcher();
		renderEmergencyBackup('Could not start the app. Showing backup content.');
	}
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', initializeApp);
} else {
	initializeApp();
}

async function loadImages() {
	const startDate = startInput.value;
	const endDate = endInput.value;

	if (startDate > endDate) {
		showMessage('Please choose a start date that is before the end date.');
		return;
	}

	if (isApiCooldownActive()) {
		const cachedItems = getCachedApodItems();
		resultCount.textContent = cachedItems
			? `NASA API is timing out. Retrying in ${getCooldownSecondsRemaining()}s. Showing cached APOD results.`
			: `NASA API is timing out. Retrying in ${getCooldownSecondsRemaining()}s. Showing local backup content.`;
		renderGallery(cachedItems || LOCAL_FALLBACK_ITEMS);
		return;
	}

	if (hasVisibleCards()) {
		resultCount.textContent = 'Loading latest NASA images... Keeping current results visible.';
	} else {
		showLoading();
	}

	try {
		const apodData = await fetchApodWithRecovery(startDate, endDate);

		const items = Array.isArray(apodData) ? apodData.reverse() : [apodData];
		saveApodCache(items, startDate, endDate);

		renderGallery(items);
	} catch (error) {
		const cachedItems = getCachedApodItems();
		resultCount.textContent = cachedItems
			? 'NASA API is unavailable (504 timeout). Showing cached APOD results.'
			: 'NASA API is unavailable (504 timeout). Showing local backup content.';
		renderGallery(cachedItems || LOCAL_FALLBACK_ITEMS);
	}
}

function renderOfflineFirstGallery() {
	const cachedItems = getCachedApodItems();

	if (cachedItems) {
		resultCount.textContent = 'Showing cached APOD results. Click Get Space Images to refresh live data.';
		renderGallery(cachedItems);
		return;
	}

	resultCount.textContent = 'Showing local backup content. Click Get Space Images to fetch live NASA results.';
	renderGallery(LOCAL_FALLBACK_ITEMS);
}

async function fetchApodWithRecovery(startDate, endDate) {
	if (isApiCooldownActive()) {
		resultCount.textContent = `NASA API is still recovering. Retrying in ${getCooldownSecondsRemaining()}s.`;
		return getCachedApodItems() || LOCAL_FALLBACK_ITEMS;
	}

	try {
		return await fetchApodRange(startDate, endDate, MAX_RETRIES);
	} catch (error) {
		if (shouldEnterCooldown(error)) {
			startApiCooldown();
			resultCount.textContent = `NASA API timed out. Waiting ${getCooldownSecondsRemaining()}s before next retry.`;
			return getCachedApodItems() || LOCAL_FALLBACK_ITEMS;
		}

		const safeFallbackEndDate = getSafeFallbackEndDate(endDate);
		const fallbackStartDate = getFallbackStartDate(safeFallbackEndDate, FALLBACK_RANGE_DAYS);

		try {
			const fallbackData = await fetchApodRange(fallbackStartDate, safeFallbackEndDate, MAX_RETRIES);
			resultCount.textContent = `NASA API is busy. Showing a smaller ${FALLBACK_RANGE_DAYS}-day range.`;
			return fallbackData;
		} catch (fallbackError) {
			startApiCooldown();
			resultCount.textContent = 'NASA API is currently unavailable. Showing local backup content.';
			return getCachedApodItems() || LOCAL_FALLBACK_ITEMS;
		}
	}
}

function saveApodCache(items, startDate, endDate) {
	if (!Array.isArray(items) || items.length === 0) return;
	localSet(APOD_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), startDate, endDate, items }));
}

function getCachedApodItems() {
	try {
		const raw = localGet(APOD_CACHE_KEY);
		if (!raw) return null;
		const payload = JSON.parse(raw);
		if (!payload || !Array.isArray(payload.items) || payload.items.length === 0) return null;
		return payload.items;
	} catch {
		return null;
	}
}

function startApiCooldown() {
	apiCooldownUntil = Date.now() + API_COOLDOWN_MS;
	localSet(APOD_API_STATUS_KEY, JSON.stringify({ apiCooldownUntil }));
}

function isApiCooldownActive() {
	if (apiCooldownUntil !== 0 && Date.now() >= apiCooldownUntil) {
		apiCooldownUntil = 0;
		localRemove(APOD_API_STATUS_KEY);
		return false;
	}
	return Date.now() < apiCooldownUntil;
}

function getCooldownSecondsRemaining() {
	return Math.ceil(Math.max(apiCooldownUntil - Date.now(), 0) / 1000);
}

function loadPersistedApiCooldown() {
	try {
		const raw = localGet(APOD_API_STATUS_KEY);
		if (!raw) return;
		const payload = JSON.parse(raw);
		if (!payload || typeof payload.apiCooldownUntil !== 'number') {
			localRemove(APOD_API_STATUS_KEY);
			return;
		}
		apiCooldownUntil = payload.apiCooldownUntil;
		if (Date.now() >= apiCooldownUntil) {
			apiCooldownUntil = 0;
			localRemove(APOD_API_STATUS_KEY);
		}
	} catch {
		apiCooldownUntil = 0;
	}
}

function shouldEnterCooldown(error) {
	const message = (error && error.message ? error.message : '').toLowerCase();
	return ['status 504', 'status 502', 'status 503', 'network issue', 'failed to fetch', 'abort']
		.some(phrase => message.includes(phrase));
}

async function fetchApodRange(startDate, endDate, retryCount) {
	const url = `${APOD_ENDPOINT}?api_key=${NASA_API_KEY}&start_date=${startDate}&end_date=${endDate}&thumbs=true`;
	let response;

	try {
		response = await fetchWithTimeout(url, REQUEST_TIMEOUT_MS);
	} catch (error) {
		if (retryCount > 0) {
			await wait(700);
			return fetchApodRange(startDate, endDate, retryCount - 1);
		}

		throw new Error('Network issue while contacting NASA API.');
	}

	if (response.ok) return response.json();
	if (response.status === 504) throw new Error('NASA API request failed with status 504.');

	const apiErrorText = await readApiErrorText(response);

	if (retryCount > 0 && isRetriableStatus(response.status)) {
		await wait(700);
		return fetchApodRange(startDate, endDate, retryCount - 1);
	}

	throw new Error(apiErrorText || `NASA API request failed with status ${response.status}.`);
}

function hasVisibleCards() {
	return gallery.querySelector('.gallery-item') !== null;
}

async function fetchWithTimeout(url, timeoutMs) {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
	try {
		return await fetch(url, { signal: controller.signal });
	} finally {
		clearTimeout(timeoutId);
	}
}

const isRetriableStatus = statusCode => statusCode === 429 || statusCode >= 500;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function getFallbackStartDate(endDate, daysBack) {
	const end = new Date(endDate);
	const fallbackStart = new Date(endDate);
	fallbackStart.setDate(end.getDate() - (daysBack - 1));
	return formatDate(fallbackStart) < APOD_MIN_DATE ? APOD_MIN_DATE : formatDate(fallbackStart);
}

function getSafeFallbackEndDate(endDate) {
	const requestedEnd = new Date(endDate);
	const latestLikelyPublished = new Date();
	latestLikelyPublished.setHours(0, 0, 0, 0);
	latestLikelyPublished.setDate(latestLikelyPublished.getDate() - 1);
	if (requestedEnd > latestLikelyPublished) return formatDate(latestLikelyPublished);
	if (formatDate(requestedEnd) < APOD_MIN_DATE) return APOD_MIN_DATE;
	return formatDate(requestedEnd);
}

const formatDate = dateObject => dateObject.toISOString().split('T')[0];

async function readApiErrorText(response) {
	try {
		const payload = await response.json();
		if (payload && typeof payload.msg === 'string') return payload.msg;
		if (payload && payload.error && typeof payload.error.message === 'string') return payload.error.message;
	} catch {
		return '';
	}
	return '';
}

function renderGallery(items) {
	const shouldIncludeVideos = includeVideosInput.checked;
	const visibleItems = items.filter(item => item.media_type === 'image' || shouldIncludeVideos);

	if (visibleItems.length === 0) {
		setResultCount(0);
		showMessage('No images found in this date range. Try a different range.');
		return;
	}

	setResultCount(visibleItems.length);
	gallery.innerHTML = '';

	visibleItems.forEach((item) => {
		const card = document.createElement('article');
		card.className = 'gallery-item';
		card.setAttribute('role', 'button');
		card.setAttribute('tabindex', '0');
		card.setAttribute('aria-label', `Open details for ${item.title}`);

		const cardContent = document.createElement('div');
		cardContent.className = 'card-content';

		const dateParagraph = document.createElement('p');
		dateParagraph.className = 'photo-date';
		dateParagraph.textContent = item.date;

		const titleHeading = document.createElement('h2');
		titleHeading.className = 'photo-title';
		titleHeading.textContent = item.title;

		cardContent.appendChild(dateParagraph);
		cardContent.appendChild(titleHeading);
		addDescription(cardContent, item.explanation);

		if (item.media_type !== 'image' && item.url) {
			cardContent.appendChild(createMediaLink(item.url, 'Open media in a new tab'));
		}

		card.appendChild(createMediaElement(item));
		card.appendChild(cardContent);

		card.addEventListener('click', (event) => {
			if (!event.target.closest('.read-more-btn')) openModal(item);
		});

		card.addEventListener('keydown', (event) => {
			if (event.key === 'Enter' || event.key === ' ') {
				event.preventDefault();
				openModal(item);
			}
		});

		gallery.appendChild(card);
	});
}

function setupModal() {
	injectModalStyles();

	modalOverlay = document.createElement('div');
	modalOverlay.className = 'apod-modal-overlay';
	modalOverlay.innerHTML = `
		<div class="apod-modal" role="dialog" aria-modal="true" aria-label="NASA photo details">
			<button class="apod-modal-close" type="button" aria-label="Close photo details">Close</button>
			<div class="apod-modal-media"></div>
			<div class="apod-modal-content">
				<p class="apod-modal-date"></p>
				<h2 class="apod-modal-title"></h2>
				<p class="apod-modal-explanation"></p>
			</div>
		</div>
	`;

	document.body.appendChild(modalOverlay);

	modalMedia = modalOverlay.querySelector('.apod-modal-media');
	modalTitle = modalOverlay.querySelector('.apod-modal-title');
	modalDate = modalOverlay.querySelector('.apod-modal-date');
	modalExplanation = modalOverlay.querySelector('.apod-modal-explanation');

	modalOverlay.querySelector('.apod-modal-close').addEventListener('click', closeModal);
	modalOverlay.addEventListener('click', (event) => { if (event.target === modalOverlay) closeModal(); });
	document.addEventListener('keydown', (event) => {
		if (event.key === 'Escape' && modalOverlay.classList.contains('is-open')) closeModal();
	});
}

function injectModalStyles() {
	if (document.getElementById('apod-modal-styles')) return;

	const styleTag = document.createElement('style');
	styleTag.id = 'apod-modal-styles';
	styleTag.textContent = `
		.gallery-item {
			cursor: pointer;
		}

		.gallery-item img,
		.gallery-item .video-frame {
			transition: transform 0.35s ease;
			transform-origin: center;
		}

		.gallery-item:hover img,
		.gallery-item:hover .video-frame {
			transform: scale(1.05);
		}

		.gallery-item:focus-visible {
			outline: 3px solid var(--accent, #02bfe7);
			outline-offset: 2px;
		}

		.apod-modal-overlay {
			position: fixed;
			inset: 0;
			background: rgba(3, 8, 22, 0.8);
			backdrop-filter: blur(8px);
			display: flex;
			justify-content: center;
			align-items: center;
			padding: 20px;
			z-index: 999;
			opacity: 0;
			visibility: hidden;
			pointer-events: none;
			transition: opacity 0.22s ease;
		}

		.apod-modal-overlay.is-open {
			opacity: 1;
			visibility: visible;
			pointer-events: auto;
		}

		.apod-modal {
			width: min(920px, 100%);
			max-height: 92vh;
			overflow: auto;
			background: #ffffff;
			border: 1px solid #dce4ef;
			border-radius: 14px;
			box-shadow: 0 20px 45px rgba(0, 0, 0, 0.35);
			transform: translateY(12px) scale(0.98);
			opacity: 0.98;
			transition: transform 0.25s ease, opacity 0.25s ease;
		}

		.apod-modal-overlay.is-open .apod-modal {
			transform: translateY(0) scale(1);
			opacity: 1;
		}

		.apod-modal-close {
			display: block;
			margin: 14px 14px 0 auto;
			background: linear-gradient(120deg, #02bfe7, #0b3d91);
			color: #fff;
			border: none;
			border-radius: 8px;
			padding: 8px 12px;
			font-weight: 700;
			cursor: pointer;
		}

		.apod-modal-media {
			padding: 12px 14px 0;
		}

		.apod-modal-media img,
		.apod-modal-media iframe {
			display: block;
			width: 100%;
			max-height: 55vh;
			border: none;
			border-radius: 10px;
			object-fit: contain;
			background: #0a111f;
		}

		.apod-modal-content {
			padding: 14px;
			color: #1c2742;
		}

		.apod-modal-date {
			font-size: 0.82rem;
			font-weight: 700;
			text-transform: uppercase;
			letter-spacing: 0.6px;
			color: #205493;
			margin-bottom: 6px;
		}

		.apod-modal-title {
			font-size: 1.2rem;
			margin-bottom: 10px;
		}

		.apod-modal-explanation {
			line-height: 1.6;
			color: #323a45;
			padding-bottom: 8px;
		}

		@media (max-width: 640px) {
			.apod-modal-overlay {
				padding: 10px;
			}

			.apod-modal-title {
				font-size: 1.05rem;
			}
		}

		.nasa-loading-logo {
			width: 74px;
			height: 74px;
			object-fit: contain;
			display: block;
			margin: 0 auto 12px;
			animation: nasa-spin 1.8s linear infinite;
			filter: drop-shadow(0 0 10px rgba(225, 243, 248, 0.75));
		}

		@keyframes nasa-spin {
			to {
				transform: rotate(360deg);
			}
		}
	`;

	document.head.appendChild(styleTag);
}

function createVideoIframe(item) {
	const videoFrame = document.createElement('iframe');
	videoFrame.src = item.url;
	videoFrame.title = item.title;
	videoFrame.loading = 'lazy';
	videoFrame.allowFullscreen = true;
	return videoFrame;
}

function openModal(item) {
	if (!modalOverlay) return;

	modalMedia.innerHTML = '';

	if (item.media_type === 'video') {
		modalMedia.appendChild(createVideoIframe(item));
	} else {
		const image = document.createElement('img');
		image.src = item.hdurl || item.url;
		image.alt = item.title;
		image.loading = 'lazy';
		modalMedia.appendChild(image);
	}

	modalDate.textContent = item.date || 'Unknown date';
	modalTitle.textContent = item.title || 'Untitled';
	modalExplanation.textContent = item.explanation || 'No description available.';
	modalOverlay.classList.add('is-open');
	document.body.style.overflow = 'hidden';
}

function closeModal() {
	if (!modalOverlay) return;
	modalOverlay.classList.remove('is-open');
	document.body.style.overflow = '';
}

function renderRandomFact() {
	const existingFactBox = document.getElementById('spaceFactBox');
	if (existingFactBox) existingFactBox.remove();

	const randomFact = SPACE_FACTS[Math.floor(Math.random() * SPACE_FACTS.length)];

	const factBox = document.createElement('section');
	factBox.id = 'spaceFactBox';
	factBox.setAttribute('aria-live', 'polite');
	factBox.style.margin = '0 0 14px';
	factBox.style.padding = '12px 14px';
	factBox.style.background = 'rgba(225, 243, 248, 0.95)';
	factBox.style.border = '1px solid rgba(155, 218, 241, 0.9)';
	factBox.style.borderRadius = '12px';
	factBox.style.color = '#212121';
	factBox.style.boxShadow = '0 10px 22px rgba(6, 31, 74, 0.2)';

	factBox.innerHTML = `<strong>Did You Know?</strong> ${randomFact}`;

	gallery.parentNode.insertBefore(factBox, gallery);
}

function setupThemeSwitcher() {
	const filters = document.querySelector('.filters');

	if (!filters || document.getElementById('themeSwitcher')) {
		return;
	}

	const wrapper = document.createElement('label');
	wrapper.className = 'filter-toggle';
	wrapper.setAttribute('for', 'themeSwitcher');
	wrapper.style.gap = '10px';

	const labelText = document.createElement('span');
	labelText.textContent = 'Theme';

	const select = document.createElement('select');
	select.id = 'themeSwitcher';
	select.setAttribute('aria-label', 'Choose color theme');
	select.style.border = '1px solid var(--line)';
	select.style.borderRadius = '8px';
	select.style.padding = '6px 8px';
	select.style.fontFamily = 'Trebuchet MS, sans-serif';
	select.style.fontWeight = '700';
	select.style.minWidth = '130px';
	select.style.cursor = 'pointer';
	select.style.appearance = 'none';
	select.style.transition = 'box-shadow 0.2s ease, transform 0.2s ease';

	select.innerHTML = `
		<option value="classic">NASA Blue</option>
		<option value="bright">NASA Red</option>
	`;

	wrapper.appendChild(labelText);
	wrapper.appendChild(select);
	filters.insertBefore(wrapper, getImagesButton);

	const savedTheme = localGet(THEME_STORAGE_KEY) || 'classic';
	select.value = savedTheme;
	applyTheme(savedTheme);
	updateThemeStatus(savedTheme);

	select.addEventListener('change', () => {
		applyTheme(select.value);
		updateThemeStatus(select.value);
		localSet(THEME_STORAGE_KEY, select.value);
	});

	select.addEventListener('input', () => {
		applyTheme(select.value);
		updateThemeStatus(select.value);
		localSet(THEME_STORAGE_KEY, select.value);
	});

	select.addEventListener('focus', () => {
		select.style.transform = 'translateY(-1px)';
	});

	select.addEventListener('blur', () => {
		select.style.transform = 'translateY(0)';
	});
}

function applyTheme(themeName) {
	if (!defaultThemeValues) {
		defaultThemeValues = getCurrentCssThemeValues();
	}

	const selectedTheme = THEMES[themeName] || THEMES.classic;
	const theme = { ...defaultThemeValues, ...selectedTheme };

	Object.entries(theme).forEach(([variableName, value]) => {
		document.documentElement.style.setProperty(variableName, value);
	});

	applyThemeToKeyElements(theme, themeName);
}

function applyThemeToKeyElements(theme, themeName) {
	const isRedTheme = themeName === 'bright';

	document.body.style.background = `
		radial-gradient(circle at 12% 18%, ${isRedTheme ? 'rgba(255, 206, 160, 0.34)' : 'rgba(255, 255, 255, 0.26)'}, transparent 32%),
		radial-gradient(circle at 84% 12%, rgba(249, 170, 67, 0.3), transparent 38%),
		radial-gradient(circle at 52% 84%, ${isRedTheme ? 'rgba(252, 61, 33, 0.24)' : 'rgba(2, 191, 231, 0.26)'}, transparent 44%),
		linear-gradient(160deg, ${theme['--space-navy']} 0%, ${theme['--space-blue']} 55%, ${theme['--accent']} 100%)
	`;

	const heading = document.querySelector('h1');
	if (heading) {
		heading.style.color = theme['--space-blue'];
		heading.style.textShadow = isRedTheme ? '0 2px 8px rgba(255, 247, 235, 0.45)' : '';
	}

	const actionButton = document.querySelector('.filters button');
	if (actionButton) {
		actionButton.style.background = `linear-gradient(120deg, ${theme['--accent']}, ${theme['--space-blue']})`;
		actionButton.style.color = isRedTheme ? '#2b0b0b' : '#ffffff';
	}

	const themeSwitcher = document.getElementById('themeSwitcher');
	if (themeSwitcher) {
		themeSwitcher.style.background = `linear-gradient(120deg, ${theme['--space-blue']}, ${theme['--accent']})`;
		themeSwitcher.style.color = isRedTheme ? '#2b0b0b' : '#ffffff';
		themeSwitcher.style.border = `1px solid ${theme['--line']}`;
		themeSwitcher.style.textShadow = isRedTheme ? 'none' : '0 1px 1px rgba(6, 31, 74, 0.45)';
		themeSwitcher.style.boxShadow = isRedTheme
			? '0 8px 16px rgba(252, 61, 33, 0.28)'
			: '0 8px 16px rgba(11, 61, 145, 0.28)';
	}

	const themeSwitcherLabel = document.querySelector('label[for="themeSwitcher"]');
	if (themeSwitcherLabel) {
		themeSwitcherLabel.style.borderColor = theme['--line'];
		themeSwitcherLabel.style.background = isRedTheme ? 'rgba(255, 240, 227, 0.94)' : 'rgba(249, 253, 255, 0.94)';
		themeSwitcherLabel.style.color = theme['--text-main'];
		themeSwitcherLabel.style.boxShadow = `inset 4px 0 0 ${theme['--space-blue']}`;
	}

	const header = document.querySelector('.site-header');
	if (header) {
		header.style.background = isRedTheme ? 'rgba(255, 241, 229, 0.96)' : 'rgba(255, 255, 255, 0.93)';
		header.style.borderColor = theme['--line'];
	}

	const filtersPanel = document.querySelector('.filters');
	if (filtersPanel) {
		filtersPanel.style.background = isRedTheme ? 'rgba(255, 246, 236, 0.96)' : 'rgba(255, 255, 255, 0.92)';
		filtersPanel.style.borderColor = theme['--line'];
	}

	document.querySelectorAll('.gallery-item').forEach((element) => {
		element.style.borderColor = theme['--line'];
		element.style.background = theme['--panel'];
	});

	document.querySelectorAll('.photo-date').forEach((element) => {
		element.style.color = theme['--space-blue'];
	});

	document.querySelectorAll('.read-more-btn').forEach((element) => {
		element.style.color = theme['--space-blue'];
		element.style.background = theme['--sky-glow'];
		element.style.borderColor = theme['--line'];
	});

	if (resultCount) {
		resultCount.style.color = isRedTheme ? '#fff3e6' : '';
	}
}

function updateThemeStatus(themeName) {
	if (!themeStatusBadge) {
		themeStatusBadge = document.createElement('p');
		themeStatusBadge.id = 'themeStatusBadge';
		themeStatusBadge.style.margin = '0 4px 10px';
		themeStatusBadge.style.fontWeight = '700';
		themeStatusBadge.style.fontSize = '0.9rem';
		themeStatusBadge.style.color = '#ffffff';
		themeStatusBadge.style.textShadow = '0 2px 8px rgba(6, 31, 74, 0.32)';

		if (resultCount && resultCount.parentNode) {
			resultCount.parentNode.insertBefore(themeStatusBadge, resultCount);
		}
	}

	themeStatusBadge.textContent = `Active theme: ${themeName}`;
}

function getCurrentCssThemeValues() {
	const computed = getComputedStyle(document.documentElement);
	const values = {};

	THEME_VARIABLES.forEach((variableName) => {
		const value = computed.getPropertyValue(variableName).trim();
		if (value) {
			values[variableName] = value;
		}
	});

	return values;
}

function createMediaElement(item) {
	if (item.media_type === 'video') {
		const videoFrame = createVideoIframe(item);
		videoFrame.className = 'video-frame';
		return videoFrame;
	}

	if (item.media_type !== 'image') {
		const fallbackBox = document.createElement('div');
		fallbackBox.className = 'photo-description';
		fallbackBox.style.padding = '18px 14px 10px';
		fallbackBox.textContent = `This APOD entry is media type: ${item.media_type}.`;
		return fallbackBox;
	}

	const image = document.createElement('img');
	image.src = item.url;
	image.alt = item.title;
	image.loading = 'lazy';
	return image;
}

function createMediaLink(url, label) {
	const link = document.createElement('a');
	link.href = url;
	link.target = '_blank';
	link.rel = 'noopener noreferrer';
	link.className = 'read-more-btn';
	link.style.display = 'inline-block';
	link.textContent = label;
	return link;
}

function addDescription(container, fullText) {
	const safeText = fullText || 'No description available.';
	const descriptionParagraph = document.createElement('p');
	descriptionParagraph.className = 'photo-description';

	if (safeText.length <= DESCRIPTION_PREVIEW_LENGTH) {
		descriptionParagraph.textContent = safeText;
		container.appendChild(descriptionParagraph);
		return;
	}

	const shortText = `${safeText.slice(0, DESCRIPTION_PREVIEW_LENGTH).trim()}...`;
	let isExpanded = false;

	descriptionParagraph.textContent = shortText;
	container.appendChild(descriptionParagraph);

	const readMoreButton = document.createElement('button');
	readMoreButton.className = 'read-more-btn';
	readMoreButton.type = 'button';
	readMoreButton.textContent = 'Read more';

	readMoreButton.addEventListener('click', () => {
		isExpanded = !isExpanded;
		descriptionParagraph.textContent = isExpanded ? safeText : shortText;
		readMoreButton.textContent = isExpanded ? 'Show less' : 'Read more';
	});

	container.appendChild(readMoreButton);
}

function setResultCount(count) {
	resultCount.textContent = `Showing ${count} ${count === 1 ? 'result' : 'results'}`;
}

function showLoading() {
	resultCount.textContent = 'Loading results...';
	gallery.innerHTML = `
		<div class="placeholder">
			<img src="img/nasa-worm-logo.png" alt="NASA emblem" class="nasa-loading-logo" />
			<p>Traveling through the galaxy at E=mc²...</p>
		</div>
	`;
}

function showMessage(message) {
	setResultCount(0);
	gallery.innerHTML = `<div class="placeholder"><p>${message}</p></div>`;
}

function renderEmergencyBackup(message) {
	if (!gallery || !resultCount) return;

	resultCount.textContent = 'Showing local backup content.';

	const cardsHtml = LOCAL_FALLBACK_ITEMS.map(item => `
		<article class="gallery-item">
			<img src="${item.url}" alt="${item.title}" loading="lazy" />
			<div class="card-content">
				<p class="photo-date">${item.date}</p>
				<h2 class="photo-title">${item.title}</h2>
				<p class="photo-description">${item.explanation}</p>
			</div>
		</article>
	`).join('');

	gallery.innerHTML = `<div class="placeholder"><p>${message}</p></div>${cardsHtml}`;
}
