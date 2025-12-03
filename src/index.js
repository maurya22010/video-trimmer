import * as FilePond from 'filepond';
import FilePondPluginFileValidateType from 'filepond-plugin-file-validate-type';
import { createFFmpeg, fetchFile } from '@ffmpeg/ffmpeg';
import Toastify from 'toastify-js';
import closeModalButton from './assets/images/closeicon.svg';
import 'filepond/dist/filepond.min.css';
import 'toastify-js/src/toastify.css';
import './index.css';
FilePond.registerPlugin(FilePondPluginFileValidateType);
FilePond.setOptions({
    labelFileTypeNotAllowed: 'The file type is invalid.',
});

export default class VideoTrimmer {
    constructor(element, url, headers, siteType) {
        this.videoState = {
            link: '',
            file: null,
        };
        this.duration = 0;
        this.element = element;
        this.url = { ...url };
        this.trimmedVideos = [];
        this.sliders = [];
        this.siteType = siteType || 'normal';
        this.headers = headers || {};
        this.lessonResponseData = [];
        this.lessonResponseSend = false;
        this.init();
    }
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
        closeButton.addEventListener('click', this.resetTrimmerModal);
    }
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

                if (!allowedTypes.includes(videoFile.type)) {
                    setTimeout(() => {
                        Toastify({
                            text: 'Please upload a video in either MP4 or webm format.',
                            duration: 2500,
                            stopOnFocus: true,
                            style: { background: '#D91656' },
                        }).showToast();
                    }, 500);
                    return;
                }
                const MAX_SIZE_IN_BYTES = 1 * 1024 * 1024 * 1024;
                if (videoFile.size > MAX_SIZE_IN_BYTES) {
                    setTimeout(() => {
                        Toastify({
                            text: 'Oops! The file size exceeds 1GB. Try uploading a smaller one.',
                            duration: 2500,
                            stopOnFocus: true,
                            style: { background: '#D91656' },
                        }).showToast();
                    }, 500);
                    return;
                }
                const videoUrl = URL.createObjectURL(videoFile);
                this.videoState.link = videoUrl;
                this.videoState.file = file.file;
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
                videoElement.onloadedmetadata = this.videoDetails.bind(this);
                modalFooter.innerHTML = `<button id="trimvideo" type="button" class="modal-button">Save Trimmed Video</button>`;
                const trimVideo = document.getElementById('trimvideo');
                trimVideo.addEventListener('click', () => this.trimVideo());
            },
        });
    }
    videoDetails() {
        const video = window.document.querySelector('.view-video');
        const addButton = window.document.querySelector('#add-marker');
        this.sliders.push({ startTime: 0, endTime: video.duration });
        this.renderSliders();
        addButton.addEventListener('click', () => this.addNewSlider());
    }
    setLessonResponseSend(value) {
        this.lessonResponseSend = value;
        if (value === true) {
            window.document.dispatchEvent(
                new CustomEvent('lessonResponseReady'),
            );
        }
    }
    getColor(index) {
        const hue = (index * 137) % 360;
        const saturation = 70;
        const lightness = 50;
        const alpha = 0.8;
        return `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`;
    }
    renderSliders() {
        const video = window.document.querySelector('.view-video');
        const slidersContainer =
            window.document.querySelector('.sliders-container');
        slidersContainer.innerHTML = '';
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
    convertToHHMMSS(val) {
        const secNum = parseInt(val, 10);
        let hours = Math.floor(secNum / 3600);
        let minutes = Math.floor((secNum - hours * 3600) / 60);
        let seconds = secNum - hours * 3600 - minutes * 60;
        if (hours < 10) {
            hours = '0' + hours;
        }
        if (minutes < 10) {
            minutes = '0' + minutes;
        }
        if (seconds < 10) {
            seconds = '0' + seconds;
        }
        let time;
        if (hours === '00') {
            time = minutes + ':' + seconds;
        } else {
            time = hours + ':' + minutes + ':' + seconds;
        }
        return time;
    }
    makeGrabberDraggable(grabber, sliderIndex, isStartGrabber) {
        let isDragging = false;
        const video = window.document.querySelector('.view-video');
        this.duration = video.duration;
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
    addNewSlider() {
        if (this.sliders.length === 0) return;
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
    removeSlider(index) {
        this.sliders = this.sliders.filter((_, i) => index !== i);
        this.renderSliders();
    }
    renderResultsTable() {
        const modalContent =
            window.document.getElementsByClassName('modal-content')[0];

        let content = ``;

        for (let i = 0; i < this.trimmedVideos.length; i++) {
            content += `
      <tr key="${i}">
        <td class="video-preview-option">
          <video
            width="100%"
            height="161px"
            src="${this.trimmedVideos[i].url}"
            controls
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

        <!-- ⭐ Duration column – will be filled by JS -->
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
          <tbody>
            ${content}
          </tbody>
        </table>
      </div>
    </div>
  `;

        // Back button
        document
            .getElementById('backtoedit')
            .addEventListener('click', () => this.renderVideoPlayer());

        // Edit & Save buttons
        document.querySelectorAll('.editname').forEach((btn, index) => {
            btn.addEventListener('click', () => this.handleUpdateName(index));
        });

        document.querySelectorAll('.savebutton').forEach((btn, index) => {
            btn.addEventListener('click', () => this.handleSavingName(index));
        });

        // Remove buttons
        document.querySelectorAll('.removevideo').forEach((btn, index) => {
            btn.addEventListener('click', () => this.removeTrimmedVideo(index));
        });

        // ⭐ Load REAL duration from video metadata
        setTimeout(() => {
            for (let i = 0; i < this.trimmedVideos.length; i++) {
                const vid = document.createElement('video');
                vid.src = this.trimmedVideos[i].url;

                vid.onloadedmetadata = () => {
                    const sec = Math.floor(vid.duration);
                    const formatted = this.convertToHHMMSS(sec);

                    const td = document.getElementById(`duration-${i}`);
                    if (td) td.textContent = formatted;
                };
            }
        }, 0);
    }

    async loadFFmpeg() {
        if (!this.ffmpeg) {
            this.ffmpeg = createFFmpeg({
                log: false,
            });
        }
        if (!this.ffmpeg.isLoaded()) {
            await this.ffmpeg.load();
        }
    }
    async trimVideo() {
        try {
            const videoFile = this.videoState.file;

            let fileBuffer;
            try {
                fileBuffer = await fetchFile(videoFile);
            } catch (err) {
                console.error('File read error:', err);
                Toastify({
                    text: 'Please try again. The selected video was deleted from your device. Please re-upload.',
                    duration: 4000,
                    stopOnFocus: true,
                    style: { background: '#D91656' },
                }).showToast();

                this.resetTrimmerModal();
                return;
            }
            const modalContent =
                document.getElementsByClassName('modal-content')[0];
            const modalFooter =
                document.getElementsByClassName('modal-footer')[0];
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

            await this.loadFFmpeg();
            const videoFormat = this.videoState.file.type.split('/')[1];
            const accurateSliders = this.sliders.map((element) => ({
                startTime: parseInt(element.startTime),
                endTime: parseInt(element.endTime),
            }));
            this.totalClips = accurateSliders.length;
            this.trimmedVideos = [];

            const progressBar = document.getElementById('trim-progress-bar');
            const progressText = document.getElementById('trim-progress-text');
            let currentTotalPercentage = 0;

            progressBar.style.width = '0%';
            progressBar.textContent = '0%';
            progressText.textContent = `Overall Progress: 0 of ${this.totalClips} - 0%`;

            for (let i = 0; i < accurateSliders.length; i++) {
                const { startTime, endTime } = accurateSliders[i];
                const duration = endTime - startTime;
                this.currentClipIndex = i + 1;
                progressText.textContent = `Processing Clip: ${this.currentClipIndex} of ${this.totalClips}...`;

                // console.log(
                //   `[FFmpeg] Starting trim for Clip ${this.currentClipIndex}/${
                //     this.totalClips
                //   } (Duration: ${duration.toFixed(2)}s)`
                // );
                const inputFileName = `input_${i + 1}.${videoFormat}`;
                await this.ffmpeg.FS(
                    'writeFile',
                    inputFileName,
                    await fetchFile(this.videoState.file),
                );
                const trimmedVideoName = `video_${i + 1}.${videoFormat}`;
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
                const clipsCompleted = i + 1;
                currentTotalPercentage = Math.floor(
                    (clipsCompleted / this.totalClips) * 100,
                );

                progressBar.style.width = `${currentTotalPercentage}%`;
                progressBar.textContent = `${currentTotalPercentage}%`;
                progressText.textContent = `Overall Progress: ${clipsCompleted} of ${this.totalClips} - ${currentTotalPercentage}%`;

                // console.log(
                //   `[FFmpeg Progress] Total Progress: ${currentTotalPercentage}% (Clip ${clipsCompleted} finished)`
                // );
                const trimmedVideoData = this.ffmpeg.FS(
                    'readFile',
                    trimmedVideoName,
                );
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
            }
            progressBar.style.width = '100%';
            progressBar.textContent = '100%';
            progressText.textContent = `Processing Complete! All ${this.totalClips} clips finished.`;

            this.renderResultsTable();
            modalFooter.innerHTML = `<button id="addlessons" type="button" class="modal-button">Submit</button>`;
            document
                .getElementById('addlessons')
                .addEventListener('click', async () => {
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
                        await this.sendVideos(); // your normal site method
                    }
                });
        } catch (error) {
            Toastify({
                text: 'Please try again. The selected video was deleted or cannot be read.',
                duration: 4000,
                stopOnFocus: true,
                style: { background: '#D91656' },
            }).showToast();
            this.resetTrimmerModal();
        }
    }
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
    async sendVideosToSkillTriks() {
        try {
            const submitProgressBar = document.getElementById(
                'submit-progress-bar',
            );
            const submitProgressText = document.getElementById(
                'submit-progress-text',
            );

            const total = this.trimmedVideos.length;
            let completed = 0;

            // 🔹 Init progress UI
            if (submitProgressBar && submitProgressText) {
                submitProgressBar.style.width = '0%';
                submitProgressBar.textContent = '0%';
                submitProgressText.textContent = `Uploading 0 of ${total} - 0%`;
            }

            const uploads = this.trimmedVideos.map(async (video, index) => {
                const fileExtension = video.type.split('/')[1] || 'mp4';
                const fileName = `${
                    video.name || `trimmed-${index + 1}`
                }.${fileExtension}`;

                // 1️⃣ Upload media
                const formData = new FormData();
                formData.append('file', video.file, fileName);

                const mediaResponse = await fetch(this.url.media, {
                    method: 'POST',
                    headers: this.headers,
                    body: formData,
                });

                const mediaData = await mediaResponse.json();
                if (!mediaResponse.ok) {
                    throw new Error(
                        mediaData?.message || 'Failed to upload video.',
                    );
                }

                const videoId = mediaData?.id || mediaData?.video_id;
                const title = mediaData?.title?.raw;

                if (!videoId)
                    throw new Error('No video_id returned from media API.');
                if (!title)
                    throw new Error('No title found in media response.');

                // 2️⃣ Create lesson (+ course attach)
                const lessonPayload = {
                    title,
                    status: 'publish',
                    meta: {
                        _stlms_lesson_media: {
                            media_type: 'video',
                            video_id: videoId,
                        },
                        _stlms_lesson_settings:
                            this.calculateLessonTimeDuration(video.duration),
                        ...(this.url.courseId && {
                            _stlms_lesson_course: Number(this.url.courseId),
                        }),
                    },
                };

                const lessonResponse = await fetch(this.url.lesson, {
                    method: 'POST',
                    headers: {
                        ...this.headers,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(lessonPayload),
                });

                const lessonData = await lessonResponse.json();
                if (!lessonResponse.ok) {
                    throw new Error(
                        lessonData?.message || 'Failed to create lesson.',
                    );
                }

                const item = {
                    id: lessonData.id,
                    name: lessonData.title?.rendered || lessonData.title,
                };

                this.lessonResponseData.push(item);
                // console.log("Uploaded:", item);

                completed++;
                const percent = Math.floor((completed / total) * 100);

                if (submitProgressBar && submitProgressText) {
                    submitProgressBar.style.width = `${percent}%`;
                    submitProgressBar.textContent = `${percent}%`;
                    submitProgressText.textContent = `Uploading ${completed} of ${total} - ${percent}%`;
                }

                return { media: mediaData, lesson: lessonData };
            });

            // 4️⃣ Wait for all uploads to finish
            const results = await Promise.all(uploads);

            // Ensure final 100%
            if (submitProgressBar && submitProgressText) {
                submitProgressBar.style.width = '100%';
                submitProgressBar.textContent = '100%';
                submitProgressText.textContent = 'All uploads completed!';
            }

            const spinner = document.querySelector('.loading');
            if (spinner) spinner.style.display = 'none';

            this.setLessonResponseSend(true);

            const message =
                results.length > 1
                    ? `${results.length} lessons have been created successfully!`
                    : 'Your lesson has been created successfully!';

            Toastify({
                text: message,
                duration: 4000,
                style: { background: '#28A745' },
            }).showToast();

            setTimeout(() => this.resetTrimmerModal(), 800);

            return results;
        } catch (error) {
            console.error('Error uploading videos/lessons:', error);

            Toastify({
                text: error.message || 'Something went wrong while uploading.',
                duration: 4000,
                style: { background: '#D91656' },
            }).showToast();

            this.resetTrimmerModal();
        }
    }

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
                    background: '#D91656',
                    color: '#fff',
                },
            }).showToast();
            this.resetTrimmerModal();
        }
    }
    removeTrimmedVideo(index) {
        this.trimmedVideos = this.trimmedVideos.filter((_, i) => index !== i);
        this.sliders = this.sliders.filter((_, i) => index !== i);
        this.renderResultsTable();
    }
    handleUpdateName(index) {
        const editName = window.document.getElementsByClassName(
            'edit-trimmedvideoname',
        )[index];
        const openForm =
            window.document.getElementsByClassName('edit-name')[index];
        editName.style.display = 'none';
        openForm.style.display = 'flex';
    }
    handleSavingName(index) {
        const editName = document.getElementsByClassName(
            'edit-trimmedvideoname',
        )[index];
        const videoName = editName.querySelector('.trimmed-videoname');
        const openForm = document.getElementsByClassName('edit-name')[index];
        const inputValue = document.getElementsByClassName(
            'update-trimmed-video-name',
        )[index];
        if (inputValue.value === '') {
            Toastify({
                text: 'Please enter a valid video name.',
                duration: 2500,
                stopOnFocus: true,
                style: { background: '#D91656' },
            }).showToast();
            return;
        }
        this.trimmedVideos[index].name = inputValue.value;
        videoName.textContent = inputValue.value;
        editName.style.display = 'block';
        openForm.style.display = 'none';
    }
    calculateLessonTimeDuration(timeString) {
        const parts = timeString.split(':').map(Number);
        let totalSeconds = 0;
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
    resetTrimmerModal() {
        const trimmerModal = document.querySelector('.trimmer-modal');
        const backDrop = document.getElementById('backdrop');
        trimmerModal?.classList.add('hide-content');
        backDrop?.classList.add('hide-content');
        this.trimmedVideos = [];
        this.sliders = [];
        this.setLessonResponseSend(false);
        this.lessonResponseData = [];
        this.videoState = { file: null, link: null };
        document.body.classList.remove('no-scroll');
    }
}
