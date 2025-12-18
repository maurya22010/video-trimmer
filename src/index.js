/**
 * Video Trimmer - A comprehensive video trimming and processing tool
 * Supports MP4 and WebM formats with FFmpeg processing
 */

import * as FilePond from 'filepond';
import FilePondPluginFileValidateType from 'filepond-plugin-file-validate-type';
import Toastify from 'toastify-js';
import closeModalButton from './assets/images/closeicon.svg';
import 'filepond/dist/filepond.min.css';
import 'toastify-js/src/toastify.css';
import './index.css';

// Color constants for notifications and UI feedback
const ERROR_COLOR = '#D91656';
const SUCCESS_COLOR = '#28A745';

/**
 * Dynamically loads the FFmpeg library from CDN
 * @returns {Promise} Resolves when FFmpeg script is loaded
 */

const loadFFmpegScript = () => {
    return new Promise((resolve, reject) => {
        // Check if FFmpeg is already loaded
        if (window.FFmpeg) {
            resolve();
            return;
        }

        // Create and configure script element
        const script = document.createElement('script');
        script.src =
            'https://unpkg.com/@ffmpeg/ffmpeg@0.11.0/dist/ffmpeg.min.js';
        script.onload = () => resolve();
        script.onerror = () =>
            reject(new Error('Failed to load FFmpeg script'));
        document.head.appendChild(script);
    });
};

// Configure FilePond file upload library
FilePond.registerPlugin(FilePondPluginFileValidateType);
FilePond.setOptions({
    labelFileTypeNotAllowed: 'The file type is invalid.',
});

/**
 * VideoTrimmer Class
 * Main class for video trimming functionality
 */
export default class VideoTrimmer {
    /**
     * Constructor - Initializes the video trimmer
     * @param {string} element - CSS selector for the trimmer container
     * @param {Object} url - API endpoints for media and lesson operations
     * @param {Object} headers - HTTP headers for API requests
     * @param {string} siteType - Type of site ('skilltriks' or 'normal')
     */
    constructor(element, url, headers, siteType) {
        // Video state management
        this.videoState = {
            link: '', // Blob URL for video preview
            file: null, // Original video file object
        };

        // Core properties
        this.duration = 0; // Total video duration
        this.element = element; // DOM selector
        this.url = { ...url }; // API endpoints
        this.trimmedVideos = []; // Array of processed video clips
        this.sliders = []; // Array of time range sliders
        this.siteType = siteType || 'normal'; // Site configuration
        this.headers = headers || {}; // API request headers

        // Lesson/upload response tracking
        this.lessonResponseData = []; // Uploaded lesson data
        this.lessonResponseSend = false; // Upload completion flag

        // FFmpeg loading state
        this.ffmpegScriptLoaded = false; // Script tag loaded flag
        this.ffmpegLoaded = false; // FFmpeg core loaded flag
        this.preloadAttempts = 0; // Track preload retry attempts
        this.maxPreloadAttempts = 3; // Maximum retry attempts

        // Initialize the UI and preload FFmpeg
        this.init();
        this.preloadFFmpeg();
    }
    /**
     * Initializes the trimmer UI with modal structure
     * Creates the main interface for video upload and trimming
     */
    init() {
        const trimmerDiv = window.document.querySelector(`${this.element}`);
        trimmerDiv.innerHTML = `
    <div class="trimmer-modal-wrapper">
<div class="trimmer-modal ${
            this.siteType === 'skilltriks' ? 'skilltriks' : ''
        }">
        <div class="modal-header">
          <div class="modal-heading">
            <h1>${
                this.siteType === 'skilltriks'
                    ? 'Trim Video Lessons'
                    : 'Video Trimmer'
            }</h1>
          </div>
          <div class="modal-close-button">
            <button type="button" id="closeButton">
              <img
                width="25"
                height="25"
                src=${closeModalButton}
                alt="close-button"
              />
            </button>
          </div>
        </div>
        <div class="modal-content">
            <div class="video-upload-input-form">
        <div class="trimmer-container">
          <div class="video-upload-wrapper">
            <input type="file" id="filepond" accept="video/mp4,video/webm" />
          </div>
        </div>
        <div class="video-upload-instructions">
          <p>Maximum upload video size: 1GB.</p>
          <p>Supported: .mp4, .webm</p>
        </div>
      </div>
        </div>
        <div class="modal-footer"></div>
      </div>
      </div>
      <div id="backdrop" class="modal-backdrop"></div>
    `;
        this.initializeFilePond();
        document.body.classList.add('no-scroll');
        const closeButton = window.document.getElementById('closeButton');
        closeButton.addEventListener('click', () => this.resetTrimmerModal());
    }
    /**
     * Initializes FilePond file upload component
     * Handles file selection, validation, and preview generation
     */
    initializeFilePond() {
        const modalContent =
            document.getElementsByClassName('modal-content')[0];
        const modalFooter = document.getElementsByClassName('modal-footer')[0];
        const inputElement = document.querySelector('#filepond');
        FilePond.registerPlugin(FilePondPluginFileValidateType);
        FilePond.create(inputElement, {
            allowMultiple: false,
            acceptedFileTypes: ['video/mp4', 'video/webm'],
            maxFileSize: '1024MB',
            labelIdle: `
          <div class="file-upload-title"><p>Drag & Drop Video Here</p></div>
          <div class="file-upload-options"><p>or</p></div>
          <div><span class="filepond--label-action">Select Video</span></div>
        `,
            onaddfile: (_, file) => {
                const videoFile = file.file;
                const allowedTypes = ['video/mp4', 'video/webm'];
                // Validate file type
                if (!allowedTypes.includes(videoFile.type)) {
                    setTimeout(() => {
                        Toastify({
                            text: 'Please upload a video in either MP4 or webm format.',
                            duration: 2500,
                            stopOnFocus: true,
                            style: { background: ERROR_COLOR },
                        }).showToast();
                    }, 500);
                    return;
                }
                // Validate file size (max 1GB)
                const MAX_SIZE_IN_BYTES = 1 * 1024 * 1024 * 1024;
                if (videoFile.size > MAX_SIZE_IN_BYTES) {
                    setTimeout(() => {
                        Toastify({
                            text: 'Oops! The file size exceeds 1GB. Try uploading a smaller one.',
                            duration: 2500,
                            stopOnFocus: true,
                            style: { background: ERROR_COLOR },
                        }).showToast();
                    }, 500);
                    return;
                }
                // Create blob URL for video preview
                const videoUrl = URL.createObjectURL(videoFile);
                this.videoState.link = videoUrl;
                this.videoState.file = file.file;

                // Show loading placeholder while validating video
                modalContent.innerHTML = `
                <div class="validating-video-container">
                    <p>Validating video file...</p>
                    <div class="loading"></div>
                </div>
                `;

                // Create hidden video element to check if file is corrupted
                const hiddenVideo = document.createElement('video');
                hiddenVideo.src = this.videoState.link;
                hiddenVideo.preload = 'metadata';
                hiddenVideo.style.display = 'none';

                let corruptionCheckHandled = false;
                const corruptionTimeout = setTimeout(() => {
                    if (corruptionCheckHandled) return;
                    if (!hiddenVideo.duration || hiddenVideo.duration === 0) {
                        corruptionCheckHandled = true;

                        Toastify({
                            text: 'Video file is corrupted or invalid. Please upload a valid video.',
                            duration: 4000,
                            stopOnFocus: true,
                            style: { background: ERROR_COLOR },
                        }).showToast();

                        // Reset to upload state
                        this.videoState.link = '';
                        this.videoState.file = null;
                        modalContent.innerHTML = `
                        <div class="video-upload-input-form">
                          <div class="trimmer-container">
                            <div class="video-upload-wrapper">
                              <input type="file" id="filepond" accept="video/mp4,video/webm" />
                            </div>
                          </div>
                          <div class="video-upload-instructions">
                            <p>Maximum upload video size: 1GB.</p>
                            <p>Supported: .mp4, .webm</p>
                          </div>
                        </div>
                        `;
                        modalFooter.innerHTML = '';
                        this.initializeFilePond();
                    }
                }, 5000);

                // Error handler for corrupted files
                hiddenVideo.onerror = () => {
                    if (corruptionCheckHandled) return;
                    corruptionCheckHandled = true;
                    clearTimeout(corruptionTimeout);

                    Toastify({
                        text: 'Video file is corrupted or unreadable. Please upload a valid video.',
                        duration: 4000,
                        stopOnFocus: true,
                        style: { background: ERROR_COLOR },
                    }).showToast();

                    // Reset to upload state
                    this.videoState.link = '';
                    this.videoState.file = null;
                    modalContent.innerHTML = `
                    <div class="video-upload-input-form">
                      <div class="trimmer-container">
                        <div class="video-upload-wrapper">
                          <input type="file" id="filepond" accept="video/mp4,video/webm" />
                        </div>
                      </div>
                      <div class="video-upload-instructions">
                        <p>Maximum upload video size: 1GB.</p>
                        <p>Supported: .mp4, .webm</p>
                      </div>
                    </div>
                    `;
                    modalFooter.innerHTML = '';
                    this.initializeFilePond();
                };

                // When validation succeeds, render the trimming interface
                hiddenVideo.onloadedmetadata = () => {
                    if (corruptionCheckHandled) return;
                    corruptionCheckHandled = true;
                    clearTimeout(corruptionTimeout);

                    // Render video player interface only after validation passes
                    modalContent.innerHTML = `
              <div class="video-trimmer">
                <div class="trimmer-container">
                  <div class="video-player">
                    <div class="video-wrapper">
                      <video src=${this.videoState.link} controls class="view-video"></video>
                    </div>
                  </div>
                  <div class="video-timeline">
                    <div class="video-player-heading"><h2>Video Timeline</h2></div>
                    <div class="video-player-options"><button type="button" id="add-marker">Add Clip Marker</button></div>
                  </div>
                  <div class="video-duration">
                    <div class="video-player-heading add-spacing"><h2>Selected Clips</h2></div>
                    <ul class="sliders-container"></ul>
                  </div>
                </div>
              </div>
            `;
                    const videoElement = document.querySelector('.view-video');
                    videoElement.onloadedmetadata =
                        this.videoDetails.bind(this);
                    modalFooter.innerHTML = `<button id="trimvideo" type="button" class="modal-button">Save Trimmed Video</button>`;
                    const trimVideo = document.getElementById('trimvideo');
                    trimVideo.addEventListener('click', () => this.trimVideo());
                };
            },
        });
    }
    /**
     * Handles video metadata loading
     * Initializes the first slider to cover full video duration
     */
    videoDetails() {
        const video = window.document.querySelector('.view-video');
        const addButton = window.document.querySelector('#add-marker');

        // Create initial slider for full video duration
        this.sliders.push({ startTime: 0, endTime: video.duration });
        this.renderSliders();

        // Attach event listener for adding new clip markers
        addButton.addEventListener('click', () => this.addNewSlider());
    }
    /**
     * Sets lesson response status and dispatches event
     * @param {boolean} value - Response send status
     */
    setLessonResponseSend(value) {
        this.lessonResponseSend = value;
        // Dispatch custom event when lessons are ready
        if (value === true) {
            console.log('Executed');
            window.document.dispatchEvent(
                new CustomEvent('lessonResponseReady'),
            );
        }
    }
    /**
     * Generates a unique color for each slider using HSL
     * @param {number} index - Slider index
     * @returns {string} HSLA color string
     */
    getColor(index) {
        // Use golden ratio for evenly distributed hue values
        const hue = (index * 137) % 360;
        const saturation = 70;
        const lightness = 50;
        const alpha = 0.8;
        return `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`;
    }
    /**
     * Renders all slider elements with draggable controls
     * Displays clip markers on the video timeline
     */
    renderSliders() {
        const video = window.document.querySelector('.view-video');
        const slidersContainer =
            window.document.querySelector('.sliders-container');
        slidersContainer.innerHTML = '';

        // Create visual representation for each slider
        this.sliders.forEach((slider, index) => {
            const color =
                index === 0 ? 'rgba(102,102,102,0.9)' : this.getColor(index);

            const grabberStart = `
      <div class="grabber start-grabber" 
        style="left: ${
            (slider.startTime / video.duration) * 100
        }%; background:${color};">
      </div>
    `;
            const grabberEnd = `
      <div class="grabber end-grabber" 
        style="left: ${
            (slider.endTime / video.duration) * 100
        }%; background:${color};">
      </div>
    `;
            const progressMarker = `
      <div class="video-progress-markers">
        <div class="progress" 
          style="left: ${(slider.startTime / video.duration) * 100}%; 
                 width: ${
                     ((slider.endTime - slider.startTime) / video.duration) *
                     100
                 }%;
                 background:${color};">
        </div>
        <div class="video-details-and-options">
          <div class="video-information">
            <div class="video-name">
              <h3>Clip ${index + 1}</h3>
            </div>
            <div class="video-time">
              ${this.convertToHHMMSS(
                  slider.startTime,
              )} - ${this.convertToHHMMSS(slider.endTime)}
            </div>
          </div>
          <div class="video-player-options">
            ${
                this.sliders.length > 1
                    ? `<button type="button" class="remove-marker">Remove</button>`
                    : ''
            }
          </div>
        </div>
      </div>
    `;
            slidersContainer.insertAdjacentHTML(
                'beforeend',
                `<li>${grabberStart}${grabberEnd}${progressMarker}</li>`,
            );
            const startGrabber =
                slidersContainer.lastChild.querySelector('.start-grabber');
            const endGrabber =
                slidersContainer.lastChild.querySelector('.end-grabber');
            this.makeGrabberDraggable(startGrabber, index, true);
            this.makeGrabberDraggable(endGrabber, index, false);
        });
        const removeMarkers =
            window.document.querySelectorAll('.remove-marker');
        removeMarkers.forEach((_, i) => {
            removeMarkers[i].addEventListener('click', () =>
                this.removeSlider(i),
            );
        });
    }
    /**
     * Converts seconds to HH:MM:SS or MM:SS format
     * @param {number} val - Time in seconds
     * @returns {string} Formatted time string
     */
    convertToHHMMSS(val) {
        const secNum = Math.round(Number(val));

        let hours = Math.floor(secNum / 3600);
        let minutes = Math.floor((secNum % 3600) / 60);
        let seconds = secNum % 60;

        if (hours < 10) hours = '0' + hours;
        if (minutes < 10) minutes = '0' + minutes;
        if (seconds < 10) seconds = '0' + seconds;

        return hours === '00'
            ? `${minutes}:${seconds}`
            : `${hours}:${minutes}:${seconds}`;
    }

    /**
     * Makes slider handles draggable for adjusting clip boundaries
     * @param {HTMLElement} grabber - The draggable handle element
     * @param {number} sliderIndex - Index of the slider
     * @param {boolean} isStartGrabber - True if start handle, false if end handle
     */
    makeGrabberDraggable(grabber, sliderIndex, isStartGrabber) {
        let isDragging = false;
        const video = window.document.querySelector('.view-video');
        this.duration = video.duration;

        // Add click handler for start grabber to preview clip
        if (isStartGrabber) {
            grabber.addEventListener('click', () => {
                video.currentTime = this.sliders[sliderIndex].startTime;
                video.play();
                const checkEndTime = () => {
                    if (
                        video.currentTime >= this.sliders[sliderIndex].endTime
                    ) {
                        video.pause();
                        video.currentTime = this.sliders[sliderIndex].startTime;
                        video.removeEventListener('timeupdate', checkEndTime);
                    }
                };
                video.addEventListener('timeupdate', checkEndTime);
            });
        }
        grabber.addEventListener('mousedown', (e) => {
            isDragging = true;
            window.document.addEventListener('mousemove', handleMouseMove);
        });
        window.document.addEventListener('mouseup', () => {
            isDragging = false;
            window.document.removeEventListener('mousemove', handleMouseMove);
        });
        const handleMouseMove = (e) => {
            if (!isDragging) return;
            const rect = video.getBoundingClientRect();
            const offsetX = e.clientX - rect.left;
            const newTime = (offsetX / rect.width) * video.duration;
            if (isStartGrabber) {
                if (newTime < this.sliders[sliderIndex].endTime) {
                    this.sliders[sliderIndex].startTime = Math.max(newTime, 0);
                    video.currentTime = this.sliders[sliderIndex].startTime;
                }
            } else {
                if (newTime > this.sliders[sliderIndex].startTime) {
                    this.sliders[sliderIndex].endTime = Math.min(
                        newTime,
                        video.duration,
                    );
                }
            }
            this.renderSliders();
        };
    }
    /**
     * Adds a new slider by splitting the longest existing clip
     * Creates a new clip marker in the middle of the longest segment
     */
    addNewSlider() {
        if (this.sliders.length === 0) return;

        // Find the longest slider to split
        let longestSlider = this.sliders[0];
        this.sliders.forEach((slider) => {
            if (
                slider.endTime - slider.startTime >
                longestSlider.endTime - longestSlider.startTime
            ) {
                longestSlider = slider;
            }
        });
        const midTime = (longestSlider.startTime + longestSlider.endTime) / 2;
        const newSlider = {
            startTime:
                midTime -
                0.25 * (longestSlider.endTime - longestSlider.startTime),
            endTime:
                midTime +
                0.25 * (longestSlider.endTime - longestSlider.startTime),
        };
        this.sliders.push(newSlider);
        this.renderSliders();
    }
    /**
     * Removes a slider at the specified index
     * @param {number} index - Index of slider to remove
     */
    removeSlider(index) {
        this.sliders = this.sliders.filter((_, i) => index !== i);
        this.renderSliders();
    }
    /**
     * Renders the results table showing all trimmed video clips
     * Displays preview, name, duration, and action buttons for each clip
     */
    renderResultsTable() {
        const modalContent =
            window.document.getElementsByClassName('modal-content')[0];
        let content = ``;
        for (let i = 0; i < this.trimmedVideos.length; i++) {
            content += `
      <tr key="${i}">
        <td class="video-preview-option">
          <video
            id="video-${i}"
            width="100%"
            height="161px"
            src="${this.trimmedVideos[i].url}"
            controls
            preload="metadata"
          ></video>
        </td>
        <td class="video-edit-name">
          <div class="edit-trimmedvideoname">
            <div class="trimmed-videoname">${this.trimmedVideos[i].name}</div>
            <div class="edit-toggle">
              <button type="button" class="editname">Edit</button>
            </div>
          </div>
          <div style="display:none;" class="edit-name">
            <input
              placeholder="Enter lesson name"
              class="update-trimmed-video-name"
              type="text"
              value="${this.trimmedVideos[i].name}"
              required
            />
            <div class="edit-toggle">
              <button type="button" class="savebutton">Save</button>
            </div>
          </div>
        </td>
        <td class="duration" id="duration-${i}">Loading...</td>
        ${
            this.trimmedVideos.length > 1
                ? `
        <td class="options">
          <div class="video-trimming-options">
            <div class="video-player-options">
              <button type="button" class="removevideo">Remove</button>
            </div>
          </div>
        </td>`
                : ''
        }
      </tr>
    `;
        }
        modalContent.innerHTML = `
    <div class="results-table-wrapper">
      <div class="trimmer-container">
        <div class="video-timeline trimmed-videos">
          <div class="video-player-heading">
            <h2>${
                this.siteType === 'skilltriks'
                    ? 'Trimmed Lessons'
                    : 'Trimmed Videos'
            }</h2>
          </div>
          <div class="video-player-options">
            <button type="button" id="backtoedit">Back To Edit</button>
          </div>
        </div>
        <table id="results">
          <thead>
            <tr>
              <th>Video Preview</th>
              <th>${
                  this.siteType === 'skilltriks' ? 'Lesson Name' : 'Video Name'
              }</th>
              <th>Duration</th>
              ${this.trimmedVideos.length > 1 ? '<th>Options</th>' : ''}
            </tr>
          </thead>
          <tbody>${content}</tbody>
        </table>
      </div>
    </div>
  `;
        document
            .getElementById('backtoedit')
            .addEventListener('click', () => this.renderVideoPlayer());
        document.querySelectorAll('.editname').forEach((btn, index) => {
            btn.addEventListener('click', () => this.handleUpdateName(index));
        });
        document.querySelectorAll('.savebutton').forEach((btn, index) => {
            btn.addEventListener('click', () => this.handleSavingName(index));
        });
        document.querySelectorAll('.removevideo').forEach((btn, index) => {
            btn.addEventListener('click', () => this.removeTrimmedVideo(index));
        });
        let hasError = false;
        let loadedCount = 0;
        const totalVideos = this.trimmedVideos.length;
        const modalFooter = document.getElementsByClassName('modal-footer')[0];
        if (modalFooter) modalFooter.innerHTML = '';
        const finalize = () => {
            if (loadedCount !== totalVideos) return;
            if (hasError) return;
            modalFooter.innerHTML = `
      <button id="addlessons" type="button" class="modal-button">
        Submit
      </button>
    `;
            document
                .getElementById('addlessons')
                .addEventListener('click', async (e) => {
                    if (hasError) {
                        e.preventDefault();
                        return;
                    }
                    modalContent.innerHTML = `
          <div class="loader-container">
            <p class="progress-info" id="submit-progress-text"></p>
            <div class="progress-bar-wrapper">
              <div class="progress-bar" id="submit-progress-bar">0%</div>
            </div>
            <div class="loading"></div>
          </div>
        `;
                    modalFooter.innerHTML = '';
                    if (this.siteType === 'skilltriks') {
                        await this.sendVideosToSkillTriks();
                    } else {
                        await this.sendVideos();
                    }
                });
        };
        for (let i = 0; i < totalVideos; i++) {
            const vid = document.getElementById(`video-${i}`);
            if (!vid) continue;
            const success = () => {
                if (!Number.isFinite(vid.duration)) return;
                const td = document.getElementById(`duration-${i}`);
                if (td) {
                    td.textContent = this.convertToHHMMSS(vid.duration);
                }
                loadedCount++;
                finalize();
            };
            vid.onloadedmetadata = success;
            vid.oncanplay = success;
            vid.onerror = () => {
                hasError = true;
                const td = document.getElementById(`duration-${i}`);
                if (td) td.textContent = 'Error loading';
                if (modalFooter) modalFooter.innerHTML = '';
                loadedCount++;
                finalize();
            };
            vid.load();
        }
    }

    /**
     * Preloads FFmpeg on initialization with retry logic
     * Silently retries on failure without blocking the UI
     */
    async preloadFFmpeg() {
        try {
            await this.loadFFmpeg();
        } catch (err) {
            this.preloadAttempts++;
            console.warn(
                `FFmpeg preload attempt ${this.preloadAttempts} failed:`,
                err.message,
            );
            // Retry with exponential backoff
            if (this.preloadAttempts < this.maxPreloadAttempts) {
                const retryDelay = Math.min(
                    1000 * Math.pow(2, this.preloadAttempts - 1),
                    5000,
                );
                console.log(`Retrying in ${retryDelay}ms...`);
                setTimeout(() => this.preloadFFmpeg(), retryDelay);
            } else {
                console.warn(
                    'FFmpeg preload failed after max attempts. Will load on-demand when needed.',
                );
            }
        }
    }

    /**
     * Loads FFmpeg library (script and core)
     * Only loads once to avoid redundant loading
     * @returns {Promise} Resolves when FFmpeg is ready
     */
    async loadFFmpeg() {
        // Return immediately if already loaded
        if (this.ffmpegLoaded && this.ffmpeg && this.ffmpeg.isLoaded()) {
            return;
        }

        // Load FFmpeg script from CDN
        if (!this.ffmpegScriptLoaded) {
            try {
                await loadFFmpegScript();
                this.ffmpegScriptLoaded = true;
            } catch (err) {
                const errorMsg =
                    'Failed to load FFmpeg library from CDN. Please check your internet connection and try again.';
                console.error(errorMsg);
                throw new Error(errorMsg);
            }
        }
        if (!window.FFmpeg || !window.FFmpeg.createFFmpeg) {
            const errorMsg =
                'FFmpeg library failed to initialize. Please refresh the page and try again.';
            console.error(errorMsg);
            throw new Error(errorMsg);
        }
        if (!this.ffmpeg) {
            const { createFFmpeg } = window.FFmpeg;
            this.ffmpeg = createFFmpeg({
                log: false,
                corePath:
                    'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js',
            });
        }
        if (!this.ffmpeg.isLoaded()) {
            await this.ffmpeg.load();
            this.ffmpegLoaded = true;
        }
    }
    /**
     * Main video trimming function
     * Processes video clips using FFmpeg and creates trimmed segments
     * @returns {Promise} Resolves when all clips are processed
     */
    async trimVideo() {
        try {
            // Validate video file exists
            if (!this.videoState.file) {
                Toastify({
                    text: 'No video file selected. Please upload a video first.',
                    duration: 4000,
                    stopOnFocus: true,
                    style: { background: ERROR_COLOR },
                }).showToast();
                return;
            }
            if (!this.sliders || this.sliders.length === 0) {
                Toastify({
                    text: 'No clips selected. Please add at least one clip marker.',
                    duration: 4000,
                    stopOnFocus: true,
                    style: { background: ERROR_COLOR },
                }).showToast();
                return;
            }
            const videoFile = this.videoState.file;
            const modalContent =
                document.getElementsByClassName('modal-content')[0];
            const modalFooter =
                document.getElementsByClassName('modal-footer')[0];
            if (!modalContent || !modalFooter) {
                throw new Error('Modal elements not found');
            }
            modalContent.innerHTML = `
            <div class="loader-container">
                <p class="progress-info" id="trim-progress-text"></p>
                <div class="progress-bar-wrapper">
                    <div class="progress-bar" id="trim-progress-bar">0%</div>
                </div>
                <div class="loading"></div>
            </div>
        `;
            modalFooter.innerHTML = '';
            // Ensure FFmpeg is loaded before processing
            try {
                await this.loadFFmpeg();
            } catch (err) {
                console.error('FFmpeg loading error:', err);
                Toastify({
                    text: 'Failed to load video processing library. Please check your internet connection and try again.',
                    duration: 5000,
                    stopOnFocus: true,
                    style: { background: ERROR_COLOR },
                }).showToast();

                // Reset UI to allow retry
                const loadingSpinner = document.querySelector('.loading');
                if (loadingSpinner) loadingSpinner.remove();
                modalContent.innerHTML = `
                    <div class="error-container" style="text-align: center; padding: 20px;">
                        <p style="margin-bottom: 15px;">Unable to load video processing library.</p>
                        <button type="button" id="retry-ffmpeg" style="padding: 10px 20px; cursor: pointer;">
                            Retry Loading
                        </button>
                    </div>
                `;

                document
                    .getElementById('retry-ffmpeg')
                    ?.addEventListener('click', () => {
                        this.trimVideo();
                    });
                return;
            }
            let fileBuffer;
            try {
                const { fetchFile } = window.FFmpeg;
                fileBuffer = await fetchFile(videoFile);
            } catch (err) {
                console.error('File read error:', err);
                Toastify({
                    text: 'Cannot access the video file. It may have been deleted or moved. Please re-upload.',
                    duration: 4000,
                    stopOnFocus: true,
                    style: { background: ERROR_COLOR },
                }).showToast();
                this.resetTrimmerModal();
                return;
            }
            const videoFormat = this.videoState.file.type.split('/')[1];
            if (
                !videoFormat ||
                (videoFormat !== 'mp4' && videoFormat !== 'webm')
            ) {
                Toastify({
                    text: 'Unsupported video format. Please use MP4 or WebM.',
                    duration: 4000,
                    stopOnFocus: true,
                    style: { background: ERROR_COLOR },
                }).showToast();
                this.resetTrimmerModal();
                return;
            }
            const accurateSliders = this.sliders.map((element) => ({
                startTime: parseInt(element.startTime),
                endTime: parseInt(element.endTime),
            }));
            for (let i = 0; i < accurateSliders.length; i++) {
                const { startTime, endTime } = accurateSliders[i];
                if (startTime >= endTime) {
                    Toastify({
                        text: `Invalid clip ${
                            i + 1
                        }: Start time must be before end time.`,
                        duration: 4000,
                        stopOnFocus: true,
                        style: { background: ERROR_COLOR },
                    }).showToast();
                    this.renderVideoPlayer();
                    return;
                }
            }
            this.totalClips = accurateSliders.length;
            this.trimmedVideos = [];
            const progressBar = document.getElementById('trim-progress-bar');
            const progressText = document.getElementById('trim-progress-text');
            let currentTotalPercentage = 0;
            progressBar.style.width = '0%';
            progressBar.textContent = '0%';
            progressText.textContent = `Overall Progress: 0 of ${this.totalClips} - 0%`;

            for (let i = 0; i < accurateSliders.length; i++) {
                try {
                    const { startTime, endTime } = accurateSliders[i];
                    const duration = endTime - startTime;
                    this.currentClipIndex = i + 1;
                    progressText.textContent = `Processing Clip: ${this.currentClipIndex} of ${this.totalClips}...`;
                    const inputFileName = `input_${i + 1}.${videoFormat}`;
                    try {
                        const { fetchFile } = window.FFmpeg;
                        await this.ffmpeg.FS(
                            'writeFile',
                            inputFileName,
                            await fetchFile(this.videoState.file),
                        );
                    } catch (err) {
                        throw new Error(
                            `Failed to prepare video file for clip ${i + 1}`,
                        );
                    }
                    const trimmedVideoName = `video_${i + 1}.${videoFormat}`;
                    try {
                        if (videoFormat === 'webm') {
                            await this.ffmpeg.run(
                                '-i',
                                inputFileName,
                                '-ss',
                                `${startTime}`,
                                '-to',
                                `${endTime}`,
                                '-c',
                                'copy',
                                '-avoid_negative_ts',
                                'make_zero',
                                trimmedVideoName,
                            );
                        } else {
                            await this.ffmpeg.run(
                                '-ss',
                                `${startTime}`,
                                '-i',
                                inputFileName,
                                '-t',
                                `${duration}`,
                                '-c',
                                'copy',
                                trimmedVideoName,
                            );
                        }
                    } catch (err) {
                        throw new Error(
                            `Failed to trim clip ${
                                i + 1
                            }. The video segment may be corrupted.`,
                        );
                    }

                    const clipsCompleted = i + 1;
                    currentTotalPercentage = Math.floor(
                        (clipsCompleted / this.totalClips) * 100,
                    );

                    progressBar.style.width = `${currentTotalPercentage}%`;
                    progressBar.textContent = `${currentTotalPercentage}%`;
                    progressText.textContent = `Overall Progress: ${clipsCompleted} of ${this.totalClips} - ${currentTotalPercentage}%`;
                    let trimmedVideoData;
                    try {
                        trimmedVideoData = this.ffmpeg.FS(
                            'readFile',
                            trimmedVideoName,
                        );
                    } catch (err) {
                        throw new Error(
                            `Failed to read processed clip ${i + 1}`,
                        );
                    }

                    if (!trimmedVideoData || trimmedVideoData.length === 0) {
                        throw new Error(`Clip ${i + 1} is empty or corrupted`);
                    }

                    const trimmedBlob = new Blob([trimmedVideoData.buffer], {
                        type: this.videoState.file.type,
                    });
                    const trimmedFile = new File(
                        [trimmedBlob],
                        `video_${i + 1}.${videoFormat}`,
                        { type: this.videoState.file.type },
                    );
                    const videoUrl = URL.createObjectURL(trimmedBlob);

                    this.trimmedVideos.push({
                        name:
                            this.siteType === 'skilltriks'
                                ? `lesson${i + 1}`
                                : `video${i + 1}`,
                        url: videoUrl,
                        file: trimmedFile,
                        duration: this.convertToHHMMSS(duration),
                        type: this.videoState.file.type,
                    });
                    try {
                        this.ffmpeg.FS('unlink', inputFileName);
                        this.ffmpeg.FS('unlink', trimmedVideoName);
                    } catch (err) {
                        console.warn(
                            `Failed to clean up temporary files for clip ${
                                i + 1
                            }:`,
                            err,
                        );
                    }
                } catch (clipError) {
                    console.error(`Error processing clip ${i + 1}:`, clipError);
                    Toastify({
                        text:
                            clipError.message ||
                            `Failed to process clip ${
                                i + 1
                            }. Please try again.`,
                        duration: 4000,
                        stopOnFocus: true,
                        style: { background: ERROR_COLOR },
                    }).showToast();
                    this.renderVideoPlayer();
                    return;
                }
            }
            progressBar.style.width = '100%';
            progressBar.textContent = '100%';
            progressText.textContent = `Processing Complete! All ${this.totalClips} clips finished.`;
            const loadingSpinner = document.querySelector('.loading');
            if (loadingSpinner) {
                loadingSpinner.style.display = 'none';
            }

            this.renderResultsTable();
        } catch (error) {
            console.error('Unexpected error in trimVideo:', error);
            const errorMessage =
                error.message ||
                'An unexpected error occurred during video processing.';
            Toastify({
                text: `${errorMessage} Please try again.`,
                duration: 4000,
                stopOnFocus: true,
                style: { background: ERROR_COLOR },
            }).showToast();
            this.resetTrimmerModal();
        }
    }
    /**
     * Renders the video player view for editing clip markers
     * Allows users to adjust trim points before final processing
     */
    renderVideoPlayer() {
        const modalContent =
            window.document.getElementsByClassName('modal-content')[0];
        const modalFooter =
            window.document.getElementsByClassName('modal-footer')[0];
        modalContent.innerHTML = `
          <div class="video-trimmer">
              <div class="trimmer-container">
                <div class="video-player">
                  <div class="video-wrapper">
                    <video src=${this.videoState.link} controls class="view-video"></video>
                  </div>
                </div>
                <div class="video-timeline">
                  <div class="video-player-heading">
                    <h2>Video Timeline</h2>
                  </div>
                  <div class="video-player-options">
                    <button type="button" id="add-marker">
                     Add Trim Marker
                    </button>
                  </div>
                </div>
                <div class="video-duration">
                  <ul class="sliders-container"></ul>
                </div>
              </div>
            </div>
      `;
        modalFooter.innerHTML = `<button id="trimvideo" type="button" class="modal-button">Trim Video</button>`;
        const trimVideo = window.document.getElementById('trimvideo');
        const addButton = window.document.querySelector('#add-marker');
        trimVideo.addEventListener('click', () => this.trimVideo());
        addButton.addEventListener('click', () => this.addNewSlider());
        this.trimmedVideos = [];
        const video = window.document.querySelector('.view-video');
        video.addEventListener('loadedmetadata', () => {
            this.renderSliders();
        });
    }
    /**
     * Uploads trimmed videos to SkillTriks platform
     * Creates media entries and lesson records via API
     * @returns {Promise} Resolves with upload results
     */
    async sendVideosToSkillTriks() {
        const submitProgressBar = document.getElementById(
            'submit-progress-bar',
        );
        const submitProgressText = document.getElementById(
            'submit-progress-text',
        );

        const total = this.trimmedVideos.length;
        let completed = 0;
        const results = [];

        if (submitProgressBar && submitProgressText) {
            submitProgressBar.style.width = '0%';
            submitProgressBar.textContent = '0%';
            submitProgressText.textContent = `Uploading 0 of ${total}`;
        }

        const uploadNext = (index) => {
            if (index >= total) {
                if (submitProgressBar && submitProgressText) {
                    submitProgressBar.style.width = '100%';
                    submitProgressBar.textContent = '100%';
                    submitProgressText.textContent = 'All uploads completed!';
                }

                const spinner = document.querySelector('.loading');
                if (spinner) spinner.style.display = 'none';

                this.setLessonResponseSend(true);

                Toastify({
                    text:
                        results.length > 1
                            ? `${results.length} lessons have been created successfully!`
                            : 'Your lesson has been created successfully!',
                    duration: 4000,
                    style: { background: SUCCESS_COLOR },
                }).showToast();

                setTimeout(() => this.resetTrimmerModal(), 800);
                return Promise.resolve(results);
            }

            const video = this.trimmedVideos[index];
            const fileExtension = video.type.split('/')[1] || 'mp4';
            const fileName = `${
                video.name || `trimmed-${index + 1}`
            }.${fileExtension}`;

            const formData = new FormData();
            formData.append('file', video.file, fileName);

            return fetch(this.url.media, {
                method: 'POST',
                headers: this.headers,
                body: formData,
            })
                .then((res) =>
                    res.json().then((data) => {
                        if (!res.ok) {
                            throw new Error(
                                data?.message || 'Failed to upload video.',
                            );
                        }
                        return data;
                    }),
                )
                .then((mediaData) => {
                    const videoId = mediaData?.id || mediaData?.video_id;
                    const title = mediaData?.title?.raw;

                    if (!videoId)
                        throw new Error('No video_id returned from media API.');
                    if (!title)
                        throw new Error('No title found in media response.');

                    const lessonPayload = {
                        title,
                        status: 'publish',
                        meta: {
                            _stlms_lesson_media: {
                                media_type: 'video',
                                video_id: videoId,
                            },
                            _stlms_lesson_settings:
                                this.calculateLessonTimeDuration(
                                    video.duration,
                                ),
                            ...(this.url.courseId && {
                                _stlms_lesson_course: Number(this.url.courseId),
                            }),
                        },
                    };

                    return fetch(this.url.lesson, {
                        method: 'POST',
                        headers: {
                            ...this.headers,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(lessonPayload),
                    }).then((res) =>
                        res.json().then((data) => {
                            if (!res.ok) {
                                throw new Error(
                                    data?.message || 'Failed to create lesson.',
                                );
                            }
                            return { mediaData, lessonData: data };
                        }),
                    );
                })
                .then(({ mediaData, lessonData }) => {
                    const item = {
                        id: lessonData.id,
                        name: lessonData.title?.rendered || lessonData.title,
                    };

                    this.lessonResponseData.push(item);
                    results.push({ media: mediaData, lesson: lessonData });

                    completed++;
                    const percent = Math.floor((completed / total) * 100);

                    if (submitProgressBar && submitProgressText) {
                        submitProgressBar.style.width = `${percent}%`;
                        submitProgressBar.textContent = `${percent}%`;
                        submitProgressText.textContent = `Uploading ${completed} of ${total}`;
                    }

                    return uploadNext(index + 1);
                });
        };

        return uploadNext(0).catch(() => {
            Toastify({
                text: 'Something went wrong while uploading. Please try again later.',
                duration: 4000,
                close: true,
                stopOnFocus: true,
                style: { background: ERROR_COLOR },
            }).showToast();
            this.resetTrimmerModal();
            return Promise.reject();
        });
    }

    /**
     * Uploads trimmed videos to generic endpoint
     * Sends all video files as FormData
     * @returns {Promise} Resolves when upload completes
     */
    async sendVideos() {
        try {
            const modalContent =
                document.getElementsByClassName('modal-content')[0];
            const modalFooter =
                document.getElementsByClassName('modal-footer')[0];
            modalContent.innerHTML = `
            <div class="loader-container">
                <div class="loading"></div>
            </div>
        `;
            modalFooter.innerHTML = '';
            const formData = new FormData();
            this.trimmedVideos.forEach((video, index) => {
                const fileExtension = video.type.split('/')[1];
                formData.append(
                    `video-${index + 1}`,
                    video.file,
                    `${video.name}.${fileExtension}`,
                );
            });
            const response = await fetch(this.url, {
                method: 'POST',
                body: formData,
                headers: this.headers,
            });
            if (!response.ok) {
                throw new Error(`Upload failed: ${response.statusText}`);
            }
            Toastify({
                text: 'Videos uploaded successfully!',
                duration: 3000,
                gravity: 'top',
                position: 'right',
                style: {
                    background: '#28a745',
                    color: '#fff',
                },
            }).showToast();
            setTimeout(() => this.resetTrimmerModal(), 1000);
        } catch (error) {
            console.error('Error uploading videos:', error);
            Toastify({
                text: 'Failed to upload videos. Please try again.',
                duration: 3000,
                gravity: 'top',
                position: 'right',
                style: {
                    background: ERROR_COLOR,
                    color: '#fff',
                },
            }).showToast();
            this.resetTrimmerModal();
        }
    }
    /**
     * Removes a trimmed video from the results
     * @param {number} index - Index of video to remove
     */
    removeTrimmedVideo(index) {
        this.trimmedVideos = this.trimmedVideos.filter((_, i) => index !== i);
        this.sliders = this.sliders.filter((_, i) => index !== i);
        this.renderResultsTable();
    }
    /**
     * Shows the name edit form for a trimmed video
     * @param {number} index - Index of video to edit
     */
    handleUpdateName(index) {
        const editName = window.document.getElementsByClassName(
            'edit-trimmedvideoname',
        )[index];
        const openForm =
            window.document.getElementsByClassName('edit-name')[index];
        editName.style.display = 'none';
        openForm.style.display = 'flex';
    }
    /**
     * Saves the updated name for a trimmed video
     * @param {number} index - Index of video to update
     */
    handleSavingName(index) {
        const editName = document.getElementsByClassName(
            'edit-trimmedvideoname',
        )[index];
        const videoName = editName.querySelector('.trimmed-videoname');
        const openForm = document.getElementsByClassName('edit-name')[index];
        const inputValue = document.getElementsByClassName(
            'update-trimmed-video-name',
        )[index];

        // Validate name is not empty
        if (inputValue.value === '') {
            Toastify({
                text: 'Please enter a valid video name.',
                duration: 2500,
                stopOnFocus: true,
                style: { background: ERROR_COLOR },
            }).showToast();
            return;
        }
        this.trimmedVideos[index].name = inputValue.value;
        videoName.textContent = inputValue.value;
        editName.style.display = 'block';
        openForm.style.display = 'none';
    }
    /**
     * Calculates lesson duration from HH:MM:SS or MM:SS format
     * Converts to hour or minute duration type for API
     * @param {string} timeString - Time in HH:MM:SS or MM:SS format
     * @returns {Object} Duration object with value and type
     */
    calculateLessonTimeDuration(timeString) {
        const parts = timeString.split(':').map(Number);
        let totalSeconds = 0;

        // Parse MM:SS format
        if (parts.length === 2) {
            const [minutes, seconds] = parts;
            totalSeconds = minutes * 60 + seconds;
        } else if (parts.length === 3) {
            const [hours, minutes, seconds] = parts;
            totalSeconds = hours * 3600 + minutes * 60 + seconds;
        } else {
            return { duration: 0, duration_type: 'minute' };
        }
        if (totalSeconds >= 3600) {
            const hours = Math.floor(totalSeconds / 3600);
            return {
                duration: hours,
                duration_type: 'hour',
            };
        }
        const minutes = Math.ceil(totalSeconds / 60);
        return {
            duration: minutes,
            duration_type: 'minute',
        };
    }
    /*reset trimmer: it reset all data and hide modal*/
    /**
     * Resets the trimmer modal to initial state
     * Clears all data and hides the modal
     */
    resetTrimmerModal() {
        const trimmerModal = document.querySelector('.trimmer-modal');
        const backDrop = document.getElementById('backdrop');

        // Hide modal UI
        trimmerModal?.classList.add('hide-content');
        backDrop?.classList.add('hide-content');

        // Clear all state
        this.trimmedVideos = [];
        this.sliders = [];
        this.setLessonResponseSend(false);
        this.lessonResponseData = [];
        this.videoState = { file: null, link: null };
        // Re-enable scrolling
        document.body.classList.remove('no-scroll');
    }
}
