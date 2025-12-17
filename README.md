# 🎬 VideoTrimmer  

**VideoTrimmer** is a lightweight and easy-to-use package that allows users to **upload a video, add trim markers, preview specific segments, and download the final trimmed clips**. It’s built with `ffmpeg.wasm` and `FilePond` to provide a smooth browser-based video editing experience—without needing any external software.  

---

## 📖 Description  

Editing videos shouldn’t be complicated. **VideoTrimmer** makes the process simple and efficient:  

- Upload a video with drag-and-drop functionality.  
- Add trim markers on the video timeline to define cut points.  
- Preview selected segments before finalizing cuts.  
- Download the trimmed clips directly to your device.  
- Easily remove or adjust markers and discard unwanted trimmed videos.  

With these features, **VideoTrimmer** streamlines video editing in the browser, giving users a hassle-free way to create polished clips.  

---

## ✨ Features  

- **Back to Edit** → Return anytime to adjust trim points.  
- **Preview Segments** → Check selected portions before cutting.  
- **Download Videos** → Export and save trimmed clips instantly.  
- **Add Trim Markers** → Mark exact start & end points for cutting.  
- **Remove Markers** → Adjust cuts by deleting markers with one click.  
- **Delete Trimmed Videos** → Discard unwanted clips easily.  

---

## 📦 Packages Used  

### 🔹 ffmpeg.wasm  
- **Purpose:** Video Trimming  
- **Usage:** Allows efficient, client-side trimming by specifying start and end timestamps.  

### 🔹 FilePond  
- **Purpose:** File Uploading  
- **Usage:** Drag-and-drop video uploads with file previews and feedback.  

---

## 🚀 Installation  

Install the package via npm:  

```bash
npm install video-trimmer
```

---

## ⚡ Usage  

Import and initialize **VideoTrimmer** in your project:  

```js
new VideoTrimmer('.trimmer', 'url'); 
```

### Parameters:  
- **`.trimmer`** → The selector for the container where VideoTrimmer will be mounted.  
- **`url`** → The backend endpoint where trimmed videos will be stored.  

---

## 🛠 Example Integration  

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Video Trimmer</title>
</head>
<body>
  <!-- Video Trimmer Mount Point -->
  <div class="trimmer"></div>

  <script type="module">
    import VideoTrimmer from "./node_modules/video-trimmer/dist/main.js";
    const trimmer = new VideoTrimmer('.trimmer', 'url');
  </script>
</body>
</html>
```

---

## 🖼 Screenshot
 
![Upload Video](https://portfolio-maurya-soni.vercel.app/_next/image?url=%2Fimages%2Fvideotrimmer-image.png&w=1080&q=75)   
---
<div align="center">
  <h3>🌟 MADE WITH ❤️ BY 
    <a style="color:#000;text-decoration:none;" target="_blank" href="https://www.linkedin.com/in/mauryasoni">
      MAURYA SONI
    </a>
  </h3>
</div>  