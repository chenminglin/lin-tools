const state = {
  fileId: null,
  selectedScale: "1.0",
  pollTimer: null,
};

const els = {
  dropzone: document.querySelector("#dropzone"),
  videoInput: document.querySelector("#videoInput"),
  preview: document.querySelector("#preview"),
  markStart: document.querySelector("#markStart"),
  markEnd: document.querySelector("#markEnd"),
  startTime: document.querySelector("#startTime"),
  endTime: document.querySelector("#endTime"),
  formatSelect: document.querySelector("#formatSelect"),
  includeAudio: document.querySelector("#includeAudio"),
  exportButton: document.querySelector("#exportButton"),
  fileState: document.querySelector("#fileState"),
  statusText: document.querySelector("#statusText"),
  progressText: document.querySelector("#progressText"),
  progressBar: document.querySelector("#progressBar"),
  downloadLink: document.querySelector("#downloadLink"),
  durationHint: document.querySelector("#durationHint"),
  infoName: document.querySelector("#infoName"),
  infoDuration: document.querySelector("#infoDuration"),
  infoResolution: document.querySelector("#infoResolution"),
  infoVideoCodec: document.querySelector("#infoVideoCodec"),
  infoAudioCodec: document.querySelector("#infoAudioCodec"),
  infoSize: document.querySelector("#infoSize"),
};

els.dropzone.addEventListener("click", () => els.videoInput.click());
els.dropzone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    els.videoInput.click();
  }
});

["dragenter", "dragover"].forEach((eventName) => {
  els.dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    els.dropzone.classList.add("active");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  els.dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    els.dropzone.classList.remove("active");
  });
});

els.dropzone.addEventListener("drop", (event) => {
  const file = event.dataTransfer.files?.[0];
  if (file) uploadFile(file);
});

els.videoInput.addEventListener("change", () => {
  const file = els.videoInput.files?.[0];
  if (file) uploadFile(file);
});

els.markStart.addEventListener("click", () => {
  els.startTime.value = formatTime(els.preview.currentTime || 0);
});

els.markEnd.addEventListener("click", () => {
  els.endTime.value = formatTime(els.preview.currentTime || 0);
});

document.querySelectorAll("[data-scale]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-scale]").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    state.selectedScale = button.dataset.scale;
  });
});

els.formatSelect.addEventListener("change", () => {
  const option = els.formatSelect.selectedOptions[0];
  const supportsAudio = option?.dataset.audio === "1";
  const isAudioOnly = option?.dataset.kind === "audio";
  els.includeAudio.disabled = !supportsAudio || isAudioOnly;
  els.includeAudio.checked = supportsAudio && !isAudioOnly;
});

els.exportButton.addEventListener("click", startExport);

async function uploadFile(file) {
  state.fileId = null;
  clearPolling();
  setProgress(0, "正在上传并读取视频信息...");
  els.exportButton.disabled = true;
  els.downloadLink.hidden = true;
  els.fileState.textContent = "上传中";

  const localUrl = URL.createObjectURL(file);
  els.preview.src = localUrl;
  els.preview.classList.add("ready");

  const body = new FormData();
  body.append("video", file);

  try {
    const response = await fetch("/api/upload", { method: "POST", body });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "上传失败");

    state.fileId = payload.file_id;
    renderInfo(payload.filename, payload.info);
    els.exportButton.disabled = false;
    els.fileState.textContent = "已就绪";
    setProgress(0, "视频已读取，可以开始裁剪");
  } catch (error) {
    els.fileState.textContent = "失败";
    setProgress(0, error.message);
  }
}

async function startExport() {
  if (!state.fileId) return;
  clearPolling();
  els.exportButton.disabled = true;
  els.downloadLink.hidden = true;
  setProgress(0, "正在创建处理任务...");

  const payload = {
    file_id: state.fileId,
    start: els.startTime.value,
    end: els.endTime.value,
    format: els.formatSelect.value,
    scale: state.selectedScale,
    include_audio: els.includeAudio.checked,
  };

  try {
    const response = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "任务创建失败");

    pollJob(data.job_id);
  } catch (error) {
    els.exportButton.disabled = false;
    setProgress(0, error.message);
  }
}

function pollJob(jobId) {
  state.pollTimer = window.setInterval(async () => {
    try {
      const response = await fetch(`/api/jobs/${jobId}`);
      const job = await response.json();
      if (!response.ok) throw new Error(job.error || "读取任务状态失败");

      setProgress(job.progress || 0, job.message || "处理中");

      if (job.status === "done") {
        clearPolling();
        els.exportButton.disabled = false;
        els.downloadLink.href = job.download_url;
        els.downloadLink.download = job.output_name || "";
        els.downloadLink.hidden = false;
        setProgress(100, "处理完成，可以下载");
      } else if (job.status === "failed") {
        clearPolling();
        els.exportButton.disabled = false;
        setProgress(job.progress || 0, job.error || "处理失败");
      }
    } catch (error) {
      clearPolling();
      els.exportButton.disabled = false;
      setProgress(0, error.message);
    }
  }, 700);
}

function clearPolling() {
  if (state.pollTimer) {
    window.clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
}

function renderInfo(filename, info) {
  els.infoName.textContent = filename || "-";
  els.infoDuration.textContent = info.duration ? formatTime(info.duration) : "-";
  els.infoResolution.textContent = info.resolution || "-";
  els.infoVideoCodec.textContent = info.video_codec || "-";
  els.infoAudioCodec.textContent = info.audio_codec || "无";
  els.infoSize.textContent = formatSize(info.size || 0);
  els.durationHint.textContent = info.duration ? `总时长 ${formatTime(info.duration)}` : "读取完成";
  els.endTime.value = info.duration ? formatTime(info.duration) : "";
}

function setProgress(percent, message) {
  const value = Math.max(0, Math.min(100, Number(percent) || 0));
  els.progressBar.style.width = `${value}%`;
  els.progressText.textContent = `${Math.round(value)}%`;
  els.statusText.textContent = message;
}

function formatTime(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const ms = Math.round((total - Math.floor(total)) * 1000);
  const base = h > 0
    ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${base}.${String(ms).padStart(3, "0")}`;
}

function formatSize(bytes) {
  const value = Number(bytes) || 0;
  if (!value) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[index]}`;
}
