// Find our date picker inputs on the page
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

// Personal NASA API key for this project
const NASA_API_KEY = 'aH4Uf99aBm4zRtlFD8BqA7pk0aeRexhbIcQj7HSR';
const APOD_ENDPOINT = 'https://api.nasa.gov/planetary/apod';
const DESCRIPTION_PREVIEW_LENGTH = 220;
let modalOverlay;
let modalMedia;
let modalTitle;
let modalDate;
let modalExplanation;

// Call the setupDateInputs function from dateRange.js
// This sets up the date pickers to:
// - Default to a range of 9 days (from 9 days ago to today)
// - Restrict dates to NASA's image archive (starting from 1995)
setupDateInputs(startInput, endInput);
setupModal();
renderRandomFact();

// Load images immediately for the default date range.
loadImages();

// Fetch new images whenever the button is clicked.
getImagesButton.addEventListener('click', loadImages);

// Update results instantly when the user toggles video visibility.
includeVideosInput.addEventListener('change', loadImages);

async function loadImages() {
	const startDate = startInput.value;
	const endDate = endInput.value;

	// Basic safety check in case the user selects an invalid range.
	if (startDate > endDate) {
		showMessage('Please choose a start date that is before the end date.');
		return;
	}

	showLoading();

	const url = `${APOD_ENDPOINT}?api_key=${NASA_API_KEY}&start_date=${startDate}&end_date=${endDate}&thumbs=true`;

	try {
		const response = await fetch(url);

		if (!response.ok) {
			throw new Error('Could not load images from NASA right now.');
		}

		const apodData = await response.json();

		// The API returns an array for date ranges. We reverse it so newest is first.
		const items = Array.isArray(apodData) ? apodData.reverse() : [apodData];

		renderGallery(items);
	} catch (error) {
		showMessage(error.message);
	}
}

function renderGallery(items) {
	const shouldIncludeVideos = includeVideosInput.checked;

	// Keep images by default. When videos are enabled, include all media entries.
	// Non-image media gets a clear external link so content is still accessible.
	const visibleItems = items.filter((item) => {
		if (item.media_type === 'image') {
			return true;
		}

		if (shouldIncludeVideos) {
			return true;
		}

		return false;
	});

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

		const mediaElement = createMediaElement(item);

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

		// For videos and other non-image media, provide an explicit open link.
		if (item.media_type !== 'image' && item.url) {
			cardContent.appendChild(createMediaLink(item.url, 'Open media in a new tab'));
		}

		card.appendChild(mediaElement);
		card.appendChild(cardContent);

		card.addEventListener('click', (event) => {
			if (event.target.closest('.read-more-btn')) {
				return;
			}

			openModal(item);
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

	const closeButton = modalOverlay.querySelector('.apod-modal-close');
	closeButton.addEventListener('click', closeModal);

	modalOverlay.addEventListener('click', (event) => {
		if (event.target === modalOverlay) {
			closeModal();
		}
	});

		document.addEventListener('keydown', (event) => {
		if (event.key === 'Escape' && modalOverlay.classList.contains('is-open')) {
			closeModal();
		}
	});
}

function injectModalStyles() {
	if (document.getElementById('apod-modal-styles')) {
		return;
	}

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
			outline: 3px solid var(--accent, #ff6f3c);
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
			border: 1px solid #dce5f5;
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
			background: linear-gradient(120deg, #ff6f3c, #ff9b54);
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
			color: #3f5684;
			margin-bottom: 6px;
		}

		.apod-modal-title {
			font-size: 1.2rem;
			margin-bottom: 10px;
		}

		.apod-modal-explanation {
			line-height: 1.6;
			color: #465f8e;
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
			filter: drop-shadow(0 0 10px rgba(255, 255, 255, 0.35));
		}

		@keyframes nasa-spin {
			to {
				transform: rotate(360deg);
			}
		}
	`;

	document.head.appendChild(styleTag);
}

function openModal(item) {
	if (!modalOverlay) {
		return;
	}

	modalMedia.innerHTML = '';

	if (item.media_type === 'video') {
		const videoFrame = document.createElement('iframe');
		videoFrame.src = item.url;
		videoFrame.title = item.title;
		videoFrame.loading = 'lazy';
		videoFrame.allowFullscreen = true;
		modalMedia.appendChild(videoFrame);
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
	if (!modalOverlay) {
		return;
	}

	modalOverlay.classList.remove('is-open');
	document.body.style.overflow = '';
}

function renderRandomFact() {
	const existingFactBox = document.getElementById('spaceFactBox');

	if (existingFactBox) {
		existingFactBox.remove();
	}

	const randomIndex = Math.floor(Math.random() * SPACE_FACTS.length);
	const randomFact = SPACE_FACTS[randomIndex];

	const factBox = document.createElement('section');
	factBox.id = 'spaceFactBox';
	factBox.setAttribute('aria-live', 'polite');
	factBox.style.margin = '0 0 14px';
	factBox.style.padding = '12px 14px';
	factBox.style.background = 'rgba(255, 255, 255, 0.87)';
	factBox.style.border = '1px solid rgba(255, 255, 255, 0.58)';
	factBox.style.borderRadius = '12px';
	factBox.style.color = '#1c2742';
	factBox.style.boxShadow = '0 8px 20px rgba(6, 18, 46, 0.14)';

	factBox.innerHTML = `<strong>Did You Know?</strong> ${randomFact}`;

	gallery.parentNode.insertBefore(factBox, gallery);
}

function createMediaElement(item) {
	if (item.media_type === 'video') {
		const videoFrame = document.createElement('iframe');
		videoFrame.className = 'video-frame';
		videoFrame.src = item.url;
		videoFrame.title = item.title;
		videoFrame.loading = 'lazy';
		videoFrame.allowFullscreen = true;
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
	const noun = count === 1 ? 'result' : 'results';
	resultCount.textContent = `Showing ${count} ${noun}`;
}

function showLoading() {
	resultCount.textContent = 'Loading results...';
	gallery.innerHTML = `
		<div class="placeholder">
			<img src="img/nasa-worm-logo.png" alt="NASA emblem" class="nasa-loading-logo" />
			<p>traveling through the galaxy at E=mc^2</p>
		</div>
	`;
}

function showMessage(message) {
	setResultCount(0);

	gallery.innerHTML = `
		<div class="placeholder">
			<p>${message}</p>
		</div>
	`;
}
