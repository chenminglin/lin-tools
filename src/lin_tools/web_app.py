from __future__ import annotations

import base64
import math
import fnmatch
import http.client
import re
import sys
import threading
import time
import uuid
from array import array
from dataclasses import asdict
import os
from pathlib import Path
import subprocess
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen

from flask import Flask, jsonify, render_template, request, send_file, send_from_directory
from PIL import Image, ImageOps, UnidentifiedImageError
from werkzeug.utils import secure_filename

from .ffmpeg_tools import build_audio_speed_command, build_audio_trim_command, build_clip_command, build_insert_silences_command, build_merge_command, find_ffmpeg, probe_media, run_ffmpeg
from .timecode import parse_timecode
from .video_formats import OUTPUT_FORMATS, VIDEO_INPUT_EXTENSIONS, get_output_format
from .watermark import WatermarkProcessingError, remove_gemini_watermark


BASE_DIR = Path(__file__).resolve().parents[2]
RUNTIME_DIR = BASE_DIR / "runtime"
UPLOAD_DIR = RUNTIME_DIR / "uploads"
OUTPUT_DIR = RUNTIME_DIR / "outputs"
MODEL_DIR = RUNTIME_DIR / "models"
FRONTEND_DIST = BASE_DIR / "frontend" / "dist"
FRONTEND_PUBLIC = BASE_DIR / "frontend" / "public"
HF_MIRROR_ENDPOINT = "https://hf-mirror.com"
MODEL_DOWNLOAD_RETRIES = 5
IMAGE_INPUT_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}
IMAGE_OUTPUT_FORMATS = {
    "png": ("PNG", ".png"),
    "jpeg": ("JPEG", ".jpg"),
    "webp": ("WEBP", ".webp"),
}
MODEL_REPO_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*(/[A-Za-z0-9][A-Za-z0-9._-]*)?$")

uploads: dict[str, dict[str, Any]] = {}
jobs: dict[str, dict[str, Any]] = {}
model_jobs: dict[str, dict[str, Any]] = {}
state_lock = threading.Lock()


def create_app() -> Flask:
    app = Flask(__name__)
    app.config["UPLOAD_DIR"] = UPLOAD_DIR
    app.config["OUTPUT_DIR"] = OUTPUT_DIR
    app.config["MODEL_DIR"] = MODEL_DIR
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    MODEL_DIR.mkdir(parents=True, exist_ok=True)

    @app.get("/")
    def index():
        if (FRONTEND_DIST / "index.html").exists():
            return send_file(FRONTEND_DIST / "index.html")
        return render_template(
            "index.html",
            formats=[
                {
                    "key": key,
                    "label": fmt.label,
                    "kind": fmt.kind,
                    "extension": fmt.extension,
                    "supports_audio": fmt.supports_audio,
                }
                for key, fmt in OUTPUT_FORMATS.items()
            ],
        )

    @app.get("/video")
    @app.get("/calculator")
    @app.get("/audio")
    @app.get("/audio-speed")
    @app.get("/extract-audio")
    @app.get("/merge")
    @app.get("/model")
    @app.get("/watermark")
    @app.get("/image-resize")
    @app.get("/downloader")
    def frontend_page():
        return index()

    @app.get("/assets/<path:filename>")
    def frontend_assets(filename: str):
        return send_from_directory(FRONTEND_DIST / "assets", filename)

    @app.get("/icons/<path:filename>")
    def frontend_icons(filename: str):
        return send_from_directory(FRONTEND_PUBLIC / "icons", filename)

    @app.get("/site.webmanifest")
    def frontend_manifest():
        return send_from_directory(
            FRONTEND_PUBLIC,
            "site.webmanifest",
            mimetype="application/manifest+json",
        )

    @app.get("/api/formats")
    def api_formats():
        return jsonify(
            [
                {
                    "key": key,
                    "label": fmt.label,
                    "kind": fmt.kind,
                    "extension": fmt.extension,
                    "supports_audio": fmt.supports_audio,
                }
                for key, fmt in OUTPUT_FORMATS.items()
            ]
        )

    @app.get("/api/filters")
    def api_filters():
        return jsonify(
            [
                {"key": "none", "label": "原图", "css": "none"},
                {"key": "grayscale", "label": "黑白", "css": "grayscale(100%)"},
                {"key": "sepia", "label": "复古棕", "css": "sepia(80%)"},
                {"key": "vintage", "label": "胶片", "css": "sepia(25%) contrast(108%) saturate(120%)"},
                {"key": "high-contrast", "label": "高对比", "css": "contrast(135%) saturate(110%)"},
                {"key": "warm", "label": "暖阳", "css": "sepia(16%) saturate(115%) hue-rotate(4deg)"},
                {"key": "cool", "label": "冷调", "css": "hue-rotate(180deg) saturate(90%) brightness(105%)"},
                {"key": "invert", "label": "反色", "css": "invert(100%)"},
            ]
        )

    @app.post("/api/upload")
    def upload_video():
        if "video" not in request.files:
            return jsonify({"error": "请选择一个视频文件。"}), 400

        file = request.files["video"]
        if not file.filename:
            return jsonify({"error": "文件名为空。"}), 400

        original_name = file.filename
        suffix = Path(original_name).suffix.lower()
        if suffix and suffix not in VIDEO_INPUT_EXTENSIONS:
            return jsonify({"error": f"暂不支持该输入格式：{suffix}"}), 400

        file_id = uuid.uuid4().hex
        safe_name = secure_filename(original_name) or f"video{suffix or '.mp4'}"
        stored_path = UPLOAD_DIR / f"{file_id}_{safe_name}"
        file.save(stored_path)

        try:
            info = probe_media(stored_path)
        except Exception as exc:
            stored_path.unlink(missing_ok=True)
            return jsonify({"error": f"读取视频信息失败：{exc}"}), 400

        payload = {
            "id": file_id,
            "original_name": original_name,
            "path": stored_path,
            "info": _media_info_payload(info),
        }
        with state_lock:
            uploads[file_id] = payload

        return jsonify(
            {
                "file_id": file_id,
                "filename": original_name,
                "info": payload["info"],
            }
        )

    @app.post("/api/audio")
    def upload_audio():
        if "audio" not in request.files:
            return jsonify({"error": "请选择一个音频文件。"}), 400

        file = request.files["audio"]
        if not file.filename:
            return jsonify({"error": "文件名为空。"}), 400

        original_name = file.filename
        suffix = Path(original_name).suffix.lower()

        file_id = uuid.uuid4().hex
        safe_name = secure_filename(original_name) or f"audio{suffix or '.bin'}"
        stored_path = UPLOAD_DIR / f"{file_id}_{safe_name}"
        file.save(stored_path)

        try:
            info = probe_media(stored_path)
        except Exception as exc:
            stored_path.unlink(missing_ok=True)
            return jsonify({"error": f"读取音频信息失败：{exc}"}), 400

        if not info.audio_codec:
            stored_path.unlink(missing_ok=True)
            return jsonify({"error": "文件中未检测到音频流，或当前 FFmpeg 不支持该格式。"}), 400

        payload = {
            "id": file_id,
            "original_name": original_name,
            "path": stored_path,
            "info": _media_info_payload(info),
        }
        with state_lock:
            uploads[file_id] = payload

        return jsonify({"file_id": file_id, "filename": original_name, "info": payload["info"]})

    @app.post("/api/audio/silence")
    def insert_audio_silence():
        data = request.get_json(silent=True) or {}
        file_id = str(data.get("file_id") or "").strip()
        with state_lock:
            upload = uploads.get(file_id)
        if not upload:
            upload = _restore_upload(file_id)
        if not upload:
            return jsonify({"error": "音频文件不存在或服务已重启，请重新上传。"}), 404

        source_path = Path(upload["path"])
        if not source_path.exists():
            return jsonify({"error": "音频文件不存在，请重新上传。"}), 404

        info = upload["info"]
        if not info.get("audio_codec"):
            return jsonify({"error": "未检测到可处理的音轨。"}), 400

        try:
            output_format = get_output_format(str(data.get("format") or "mp3"))
            if output_format.kind != "audio":
                raise ValueError("输出格式必须是音频格式。")
            silence_segments = _parse_silence_segments(data)
        except Exception as exc:
            return jsonify({"error": f"参数不正确：{exc}"}), 400

        source_duration = float(info.get("duration") or 0)
        for segment in silence_segments:
            if segment["duration"] <= 0:
                return jsonify({"error": "静音时长必须大于 0。"}), 400
            if source_duration and segment["insert_at"] > source_duration:
                return jsonify({"error": "插入位置不能超过音频时长。"}), 400

        base_name = Path(upload["original_name"]).stem
        job_id = uuid.uuid4().hex
        output_name = f"{secure_filename(base_name) or 'audio'}_silence_{job_id[:8]}{output_format.extension}"
        output_path = OUTPUT_DIR / output_name
        total_silence_duration = sum(segment["duration"] for segment in silence_segments)
        expected_duration = (source_duration + total_silence_duration) if source_duration else None

        try:
            command = build_insert_silences_command(
                input_path=source_path,
                output_path=output_path,
                output_format=output_format,
                silence_segments=silence_segments,
                media_info=info,
            )
        except Exception as exc:
            return jsonify({"error": f"生成音频处理命令失败：{exc}"}), 400

        with state_lock:
            jobs[job_id] = {
                "id": job_id,
                "status": "queued",
                "progress": 0.0,
                "message": "等待插入静音",
                "output_path": output_path,
                "output_name": output_name,
                "error": None,
            }

        thread = threading.Thread(
            target=_run_job,
            args=(job_id, command, expected_duration),
            daemon=True,
        )
        thread.start()

        return jsonify({"job_id": job_id})

    @app.post("/api/audio/trim")
    def trim_audio():
        data = request.get_json(silent=True) or {}
        file_id = str(data.get("file_id") or "").strip()
        with state_lock:
            upload = uploads.get(file_id)
        if not upload:
            upload = _restore_upload(file_id)
        if not upload:
            return jsonify({"error": "Audio file does not exist or the server was restarted. Please upload it again."}), 404

        source_path = Path(upload["path"])
        if not source_path.exists():
            return jsonify({"error": "Audio file no longer exists. Please upload it again."}), 404

        info = upload["info"]
        if not info.get("audio_codec"):
            return jsonify({"error": "No processable audio stream was detected."}), 400

        try:
            output_format = get_output_format(str(data.get("format") or "mp3"))
            if output_format.kind != "audio":
                raise ValueError("Output format must be an audio format.")
            start = parse_timecode(data.get("start")) or 0.0
            end = parse_timecode(data.get("end"))
        except Exception as exc:
            return jsonify({"error": f"Invalid parameters: {exc}"}), 400

        source_duration = float(info.get("duration") or 0)
        if end is None:
            end = source_duration or None
        if end is not None and end <= start:
            return jsonify({"error": "End time must be greater than start time."}), 400
        if source_duration and start >= source_duration:
            return jsonify({"error": "Start time cannot be greater than or equal to the audio duration."}), 400
        if source_duration and end is not None:
            end = min(end, source_duration)

        base_name = Path(upload["original_name"]).stem
        job_id = uuid.uuid4().hex
        output_name = f"{secure_filename(base_name) or 'audio'}_trim_{job_id[:8]}{output_format.extension}"
        output_path = OUTPUT_DIR / output_name
        expected_duration = (end - start) if end is not None else None
        if expected_duration is None and source_duration:
            expected_duration = max(0.0, source_duration - start)

        try:
            command = build_audio_trim_command(
                input_path=source_path,
                output_path=output_path,
                output_format=output_format,
                start=start,
                end=end,
            )
        except Exception as exc:
            return jsonify({"error": f"Failed to build audio trim command: {exc}"}), 400

        with state_lock:
            jobs[job_id] = {
                "id": job_id,
                "status": "queued",
                "progress": 0.0,
                "message": "Waiting to trim audio",
                "output_path": output_path,
                "output_name": output_name,
                "error": None,
            }

        thread = threading.Thread(
            target=_run_job,
            args=(job_id, command, expected_duration),
            daemon=True,
        )
        thread.start()

        return jsonify({"job_id": job_id})

    @app.post("/api/audio/speed")
    def change_audio_speed():
        data = request.get_json(silent=True) or {}
        file_id = str(data.get("file_id") or "").strip()
        with state_lock:
            upload = uploads.get(file_id)
        if not upload:
            upload = _restore_upload(file_id)
        if not upload or not Path(upload["path"]).exists():
            return jsonify({"error": "音频文件不存在，请重新上传。"}), 404
        if not upload["info"].get("audio_codec"):
            return jsonify({"error": "未检测到可处理的音轨。"}), 400
        try:
            speed = float(data.get("speed") or 1)
            output_format = get_output_format(str(data.get("format") or "mp3"))
            if output_format.kind != "audio":
                raise ValueError("输出格式必须是音频格式。")
            if not 0.25 <= speed <= 4.0:
                raise ValueError("倍速必须在 0.25x 到 4x 之间。")
        except Exception as exc:
            return jsonify({"error": f"参数不正确：{exc}"}), 400

        source_path = Path(upload["path"])
        base_name = secure_filename(Path(upload["original_name"]).stem) or "audio"
        job_id = uuid.uuid4().hex
        speed_label = f"{speed:g}".replace(".", "_")
        output_name = f"{base_name}_{speed_label}x_{job_id[:8]}{output_format.extension}"
        output_path = OUTPUT_DIR / output_name
        try:
            command = build_audio_speed_command(source_path, output_path, output_format, speed)
        except Exception as exc:
            return jsonify({"error": f"生成音频变速命令失败：{exc}"}), 400

        source_duration = float(upload["info"].get("duration") or 0)
        expected_duration = source_duration / speed if source_duration else None
        with state_lock:
            jobs[job_id] = {
                "id": job_id, "status": "queued", "progress": 0.0,
                "message": "等待处理音频变速", "output_path": output_path,
                "output_name": output_name, "error": None,
            }
        threading.Thread(target=_run_job, args=(job_id, command, expected_duration), daemon=True).start()
        return jsonify({"job_id": job_id})

    @app.post("/api/extract-audio/upload")
    def upload_extract_audio_source():
        if "video" not in request.files:
            return jsonify({"error": "请选择一个视频文件。"}), 400

        file = request.files["video"]
        if not file.filename:
            return jsonify({"error": "文件名为空。"}), 400

        original_name = file.filename
        suffix = Path(original_name).suffix.lower()
        if suffix and suffix not in VIDEO_INPUT_EXTENSIONS:
            return jsonify({"error": f"暂不支持该视频格式：{suffix}"}), 400

        file_id = uuid.uuid4().hex
        safe_name = secure_filename(original_name) or f"video{suffix or '.mp4'}"
        stored_path = UPLOAD_DIR / f"{file_id}_{safe_name}"
        file.save(stored_path)

        try:
            info = probe_media(stored_path)
        except Exception as exc:
            stored_path.unlink(missing_ok=True)
            return jsonify({"error": f"读取视频信息失败：{exc}"}), 400

        payload = {
            "id": file_id,
            "original_name": original_name,
            "path": stored_path,
            "info": _media_info_payload(info),
        }
        with state_lock:
            uploads[file_id] = payload

        return jsonify({"file_id": file_id, "filename": original_name, "info": payload["info"]})

    @app.get("/api/uploads/<file_id>/thumbnails")
    def thumbnails(file_id: str):
        with state_lock:
            upload = uploads.get(file_id)
        if not upload:
            return jsonify({"error": "上传文件不存在或服务已重启，请重新上传。"}), 404

        info = upload["info"]
        duration = float(info.get("duration") or 0)
        if duration <= 0:
            return jsonify({"thumbnails": []})

        count = _clamp_int(request.args.get("count"), 1, 16, 10)
        start = _clamp_float(request.args.get("start"), 0.0, duration, 0.0)
        end = _clamp_float(request.args.get("end"), start + 0.05, duration, duration)
        if end <= start:
            end = min(duration, start + 0.05)

        times = _thumbnail_times(start, end, count)
        thumbs = [_thumbnail_data_url(Path(upload["path"]), second) for second in times]
        return jsonify({"thumbnails": [thumb for thumb in thumbs if thumb], "start": start, "end": end})

    @app.get("/api/uploads/<file_id>/waveform")
    def waveform(file_id: str):
        with state_lock:
            upload = uploads.get(file_id)
        if not upload:
            upload = _restore_upload(file_id)
        if not upload:
            return jsonify({"error": "上传文件不存在或服务已重启，请重新上传。"}), 404

        path = Path(upload["path"])
        if not path.exists():
            return jsonify({"error": "文件不存在。"}), 404

        info = upload["info"]
        if not info.get("audio_codec"):
            return jsonify({"error": "未检测到可生成波形的音轨。"}), 400

        try:
            count = _clamp_int(request.args.get("count"), 32, 320, 160)
            peaks = _waveform_peaks(path, count)
        except Exception as exc:
            return jsonify({"error": f"生成声波图失败：{exc}"}), 400

        return jsonify({"peaks": peaks, "duration": float(info.get("duration") or 0)})

    @app.get("/media/<file_id>")
    def media(file_id: str):
        with state_lock:
            upload = uploads.get(file_id)
        if not upload:
            return jsonify({"error": "文件不存在。"}), 404
        path = Path(upload["path"])
        if not path.exists():
            return jsonify({"error": "文件不存在。"}), 404
        return send_file(path, conditional=True)

    @app.post("/api/watermark")
    def remove_watermark_image():
        if "image" not in request.files:
            return jsonify({"error": "请选择一张图片。"}), 400

        file = request.files["image"]
        if not file.filename:
            return jsonify({"error": "文件名为空。"}), 400

        original_name = file.filename
        suffix = Path(original_name).suffix.lower()
        if suffix and suffix not in IMAGE_INPUT_EXTENSIONS:
            return jsonify({"error": f"暂不支持该图片格式：{suffix}"}), 400

        adaptive_mode = str(request.form.get("adaptive_mode") or "auto").strip()
        if adaptive_mode not in {"auto", "always", "never", "off"}:
            adaptive_mode = "auto"
        max_passes = _clamp_int(request.form.get("max_passes"), 1, 8, 4)

        file_id = uuid.uuid4().hex
        safe_name = secure_filename(original_name) or f"image{suffix or '.png'}"
        stored_path = UPLOAD_DIR / f"{file_id}_{safe_name}"
        file.save(stored_path)

        base_name = secure_filename(Path(original_name).stem) or "image"
        job_id = uuid.uuid4().hex
        output_name = f"{base_name}_watermark_removed_{job_id[:8]}.png"
        output_path = OUTPUT_DIR / output_name

        with state_lock:
            uploads[file_id] = {
                "id": file_id,
                "original_name": original_name,
                "path": stored_path,
                "info": {},
            }
            jobs[job_id] = {
                "id": job_id,
                "status": "queued",
                "progress": 0.0,
                "message": "等待处理图片",
                "output_path": output_path,
                "output_name": output_name,
                "error": None,
                "meta": None,
            }

        thread = threading.Thread(
            target=_run_watermark_job,
            args=(job_id, stored_path, output_path, adaptive_mode, max_passes),
            daemon=True,
        )
        thread.start()

        return jsonify({"job_id": job_id, "file_id": file_id, "preview_url": f"/media/{file_id}"})

    @app.post("/api/image-resize")
    def resize_image():
        if "image" not in request.files:
            return jsonify({"error": "请选择一张图片。"}), 400

        file = request.files["image"]
        if not file.filename:
            return jsonify({"error": "文件名为空。"}), 400

        try:
            width = _parse_image_dimension(request.form.get("width"), "宽度")
            height = _parse_image_dimension(request.form.get("height"), "高度")
            scale_percent = _parse_image_scale_percent(request.form.get("scale_percent"))
            output_format = _parse_image_output_format(request.form.get("output_format"))
            quality = _parse_image_quality(request.form.get("quality"))
            keep_aspect = str(request.form.get("keep_aspect") or "true").lower() == "true"
            if scale_percent is None and not keep_aspect and (width is None or height is None):
                raise ValueError("不保持比例时必须同时填写宽度和高度。")
            if scale_percent is None and width is None and height is None:
                raise ValueError("请至少填写宽度或高度。")
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

        original_name = file.filename
        suffix = Path(original_name).suffix.lower()
        if suffix and suffix not in IMAGE_INPUT_EXTENSIONS:
            return jsonify({"error": f"暂不支持该图片格式：{suffix}"}), 400

        try:
            with Image.open(file.stream) as source:
                image = ImageOps.exif_transpose(source)
                source_width, source_height = image.size
                if source_width <= 0 or source_height <= 0:
                    raise ValueError("图片尺寸无效。")
                if scale_percent is not None:
                    target_width, target_height = _calculate_image_resize_by_percent(
                        source_width, source_height, scale_percent
                    )
                else:
                    target_width, target_height = _calculate_image_resize(
                        source_width, source_height, width, height, keep_aspect
                    )
                resized = image.resize((target_width, target_height), Image.Resampling.LANCZOS)
                if resized.mode not in {"RGB", "RGBA"}:
                    resized = resized.convert("RGBA" if "transparency" in image.info else "RGB")
        except UnidentifiedImageError:
            return jsonify({"error": "无法识别该图片文件。"}), 400
        except (OSError, ValueError) as exc:
            return jsonify({"error": f"处理图片失败：{exc}"}), 400

        job_id = uuid.uuid4().hex
        base_name = secure_filename(Path(original_name).stem) or "image"
        pillow_format, output_extension = IMAGE_OUTPUT_FORMATS[output_format]
        output_name = f"{base_name}_{target_width}x{target_height}_{job_id[:8]}{output_extension}"
        output_path = OUTPUT_DIR / output_name
        try:
            if output_format == "jpeg" and resized.mode != "RGB":
                if resized.mode == "RGBA":
                    flattened = Image.new("RGB", resized.size, "white")
                    flattened.paste(resized, mask=resized.getchannel("A"))
                    resized = flattened
                else:
                    resized = resized.convert("RGB")
            save_options: dict[str, Any] = {"format": pillow_format}
            if output_format in {"jpeg", "webp"}:
                save_options["quality"] = quality
                save_options["method"] = 6 if output_format == "webp" else None
                if save_options["method"] is None:
                    del save_options["method"]
            elif output_format == "png":
                save_options["optimize"] = True
            resized.save(output_path, **save_options)
        except OSError as exc:
            return jsonify({"error": f"保存图片失败：{exc}"}), 500

        with state_lock:
            jobs[job_id] = {
                "id": job_id,
                "status": "done",
                "progress": 100.0,
                "message": "图片尺寸调整完成",
                "output_path": output_path,
                "output_name": output_name,
                "error": None,
                "meta": {
                    "width": target_width,
                    "height": target_height,
                    "keep_aspect": keep_aspect,
                    "scale_percent": scale_percent,
                    "output_format": output_format,
                    "quality": quality,
                },
            }
        return jsonify({
            "job_id": job_id,
            "download_url": f"/download/{job_id}",
            "preview_url": f"/download/{job_id}?preview=1",
            "output_name": output_name,
            "width": target_width,
            "height": target_height,
        })

    @app.post("/api/export")
    def export_video():
        data = request.get_json(silent=True) or {}
        file_id = str(data.get("file_id") or "")
        with state_lock:
            upload = uploads.get(file_id)
        if not upload:
            return jsonify({"error": "上传文件不存在或服务已重启，请重新上传。"}), 404

        try:
            output_format = get_output_format(str(data.get("format") or "mp4"))
            range_mode = str(data.get("range") or "trim")
            if range_mode == "full":
                start = 0.0
                end = None
            else:
                start = parse_timecode(data.get("start")) or 0.0
                end = parse_timecode(data.get("end"))
            scale = float(data.get("scale") or 1.0)
            include_audio = bool(data.get("include_audio", True))
            video_filter = str(data.get("filter") or "none")
            audio_stream_index = int(data.get("audio_stream_index", 0))
        except Exception as exc:
            return jsonify({"error": f"参数不正确：{exc}"}), 400

        if end is not None and end <= start:
            return jsonify({"error": "结束时间必须大于开始时间。"}), 400

        source_path = Path(upload["path"])
        base_name = Path(upload["original_name"]).stem
        job_id = uuid.uuid4().hex
        output_name = f"{secure_filename(base_name) or 'video'}_{job_id[:8]}{output_format.extension}"
        output_path = OUTPUT_DIR / output_name
        info = upload["info"]
        audio_streams = info.get("audio_streams") or []
        if output_format.kind == "audio" and not 0 <= audio_stream_index < len(audio_streams):
            return jsonify({"error": "选择的音轨不存在，请重新上传视频后再试。"}), 400
        expected_duration = (end - start) if end is not None else None
        if expected_duration is None and info.get("duration"):
            expected_duration = max(0.0, float(info["duration"]) - start)

        try:
            command = build_clip_command(
                input_path=source_path,
                output_path=output_path,
                output_format=output_format,
                start=start,
                end=end,
                include_audio=include_audio,
                scale=scale,
                video_filter=video_filter,
                audio_stream_index=audio_stream_index,
            )
        except Exception as exc:
            return jsonify({"error": f"生成转码命令失败：{exc}"}), 400

        with state_lock:
            jobs[job_id] = {
                "id": job_id,
                "status": "queued",
                "progress": 0.0,
                "message": "等待处理",
                "output_path": output_path,
                "output_name": output_name,
                "error": None,
            }

        thread = threading.Thread(
            target=_run_job,
            args=(job_id, command, expected_duration),
            daemon=True,
        )
        thread.start()

        return jsonify({"job_id": job_id})

    @app.post("/api/merge")
    def merge_videos():
        data = request.get_json(silent=True) or {}
        raw_file_ids = data.get("file_ids")
        if not isinstance(raw_file_ids, list):
            return jsonify({"error": "请至少选择两个视频。"}), 400

        file_ids = [str(file_id or "").strip() for file_id in raw_file_ids if str(file_id or "").strip()]
        if len(file_ids) < 2:
            return jsonify({"error": "请至少选择两个视频。"}), 400

        include_audio = bool(data.get("include_audio", True))

        selected_uploads: list[dict[str, Any]] = []
        missing_ids: list[str] = []
        for file_id in file_ids:
            with state_lock:
                upload = uploads.get(file_id)
            if not upload:
                upload = _restore_upload(file_id)
            if upload:
                selected_uploads.append(upload)
            else:
                missing_ids.append(file_id)

        if missing_ids:
            return jsonify({"error": "部分视频不存在或服务已重启，请重新上传。"}), 404

        source_paths = [Path(upload["path"]) for upload in selected_uploads]
        missing_files = [path.name for path in source_paths if not path.exists()]
        if missing_files:
            return jsonify({"error": "部分视频文件不存在，请重新上传。"}), 404

        job_id = uuid.uuid4().hex
        output_name = f"merged_{len(source_paths)}_videos_{job_id[:8]}.mp4"
        output_path = OUTPUT_DIR / output_name
        media_infos = [upload["info"] for upload in selected_uploads]
        expected_duration = sum(float(info.get("duration") or 0) for info in media_infos) or None

        try:
            command = build_merge_command(
                input_paths=source_paths,
                output_path=output_path,
                media_infos=media_infos,
                include_audio=include_audio,
            )
        except Exception as exc:
            return jsonify({"error": f"生成合并命令失败：{exc}"}), 400

        with state_lock:
            jobs[job_id] = {
                "id": job_id,
                "status": "queued",
                "progress": 0.0,
                "message": "等待合并",
                "output_path": output_path,
                "output_name": output_name,
                "error": None,
            }

        thread = threading.Thread(
            target=_run_job,
            args=(job_id, command, expected_duration),
            daemon=True,
        )
        thread.start()

        return jsonify({"job_id": job_id})

    @app.get("/api/jobs/<job_id>")
    def get_job(job_id: str):
        with state_lock:
            job = jobs.get(job_id)
            if not job:
                return jsonify({"error": "任务不存在。"}), 404
            payload = {
                "id": job["id"],
                "status": job["status"],
                "progress": round(float(job["progress"]), 1),
                "message": job["message"],
                "error": job["error"],
                "download_url": f"/download/{job_id}" if job["status"] == "done" else None,
                "output_name": job["output_name"] if job["status"] == "done" else None,
                "meta": job.get("meta") if job["status"] == "done" else None,
            }
        return jsonify(payload)

    @app.post("/api/video-download")
    def start_video_download():
        data = request.get_json(silent=True) or {}
        url = str(data.get("url") or "").strip()
        quality = str(data.get("quality") or "best").strip()
        parsed_url = urlparse(url)
        if parsed_url.scheme not in {"http", "https"} or not parsed_url.netloc:
            return jsonify({"error": "请输入有效的视频页面链接（仅支持 HTTP 或 HTTPS）。"}), 400
        if quality not in {"best", "1080", "720", "480"}:
            return jsonify({"error": "不支持的清晰度选项。"}), 400

        job_id = uuid.uuid4().hex
        with state_lock:
            jobs[job_id] = {
                "id": job_id,
                "status": "queued",
                "progress": 0.0,
                "message": "等待下载",
                "output_path": None,
                "output_name": None,
                "error": None,
            }
        threading.Thread(target=_run_video_download_job, args=(job_id, url, quality), daemon=True).start()
        return jsonify({"job_id": job_id})

    @app.get("/api/model-settings")
    def model_settings():
        return jsonify({"default_save_dir": str(MODEL_DIR), "endpoint": HF_MIRROR_ENDPOINT})

    @app.post("/api/model-download")
    def start_model_download():
        data = request.get_json(silent=True) or {}
        try:
            repo_id = _normalize_model_repo_id(str(data.get("repo_id") or ""))
            revision = _clean_optional_text(data.get("revision")) or None
            allow_patterns = _parse_patterns(data.get("allow_patterns"))
            token = _clean_optional_text(data.get("token")) or os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN")
            local_dir = _resolve_model_save_dir(data.get("save_dir"), repo_id, revision)
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

        job_id = uuid.uuid4().hex
        with state_lock:
            model_jobs[job_id] = {
                "id": job_id,
                "status": "queued",
                "progress": 0.0,
                "message": "等待下载",
                "error": None,
                "repo_id": repo_id,
                "revision": revision or "main",
                "endpoint": HF_MIRROR_ENDPOINT,
                "local_dir": local_dir,
                "file_count": 0,
                "size": 0,
                "current_file": None,
                "current_file_index": 0,
                "current_file_progress": 0.0,
                "current_file_downloaded": 0,
                "current_file_size": 0,
                "files": [],
            }

        thread = threading.Thread(
            target=_run_model_download,
            args=(job_id, repo_id, revision, allow_patterns, local_dir, token or None),
            daemon=True,
        )
        thread.start()

        return jsonify({"job_id": job_id})

    @app.get("/api/model-downloads/<job_id>")
    def get_model_download(job_id: str):
        with state_lock:
            job = model_jobs.get(job_id)
            if not job:
                return jsonify({"error": "任务不存在。"}), 404
            payload = {
                "id": job["id"],
                "status": job["status"],
                "progress": round(float(job["progress"]), 1),
                "message": job["message"],
                "error": job["error"],
                "repo_id": job["repo_id"],
                "revision": job["revision"],
                "endpoint": job["endpoint"],
                "local_dir": str(job["local_dir"]),
                "file_count": int(job["file_count"]),
                "size": int(job["size"]),
                "current_file": job.get("current_file"),
                "current_file_index": int(job.get("current_file_index") or 0),
                "current_file_progress": round(float(job.get("current_file_progress") or 0), 1),
                "current_file_downloaded": int(job.get("current_file_downloaded") or 0),
                "current_file_size": int(job.get("current_file_size") or 0),
                "files": [dict(item) for item in job.get("files", [])],
            }
        return jsonify(payload)

    @app.get("/download/<job_id>")
    def download(job_id: str):
        with state_lock:
            job = jobs.get(job_id)
            if not job or job["status"] != "done":
                return jsonify({"error": "文件尚未生成。"}), 404
            output_path = Path(job["output_path"])
            output_name = str(job["output_name"])
        if not output_path.exists():
            return jsonify({"error": "输出文件不存在。"}), 404
        preview = request.args.get("preview") == "1"
        return send_file(output_path, as_attachment=not preview, download_name=output_name)

    return app


MAX_IMAGE_DIMENSION = 16_384


def _parse_image_dimension(value: Any, label: str) -> int | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        dimension = int(text)
    except ValueError as exc:
        raise ValueError(f"{label}必须是整数。") from exc
    if not 1 <= dimension <= MAX_IMAGE_DIMENSION:
        raise ValueError(f"{label}必须在 1 到 {MAX_IMAGE_DIMENSION} 之间。")
    return dimension


def _parse_image_scale_percent(value: Any) -> float | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        percent = float(text)
    except ValueError as exc:
        raise ValueError("缩放比例必须是数字。") from exc
    if not 1 <= percent <= 100:
        raise ValueError("缩放比例必须在 1% 到 100% 之间。")
    return percent


def _parse_image_output_format(value: Any) -> str:
    output_format = str(value or "png").strip().lower()
    if output_format not in IMAGE_OUTPUT_FORMATS:
        raise ValueError("保存格式仅支持 PNG、JPEG 或 WebP。")
    return output_format


def _parse_image_quality(value: Any) -> int:
    text = str(value or "95").strip()
    try:
        quality = int(text)
    except ValueError as exc:
        raise ValueError("图片质量必须是整数。") from exc
    if not 1 <= quality <= 100:
        raise ValueError("图片质量必须在 1 到 100 之间。")
    return quality


def _calculate_image_resize_by_percent(
    source_width: int, source_height: int, scale_percent: float
) -> tuple[int, int]:
    target_width = max(1, round(source_width * scale_percent / 100))
    target_height = max(1, round(source_height * scale_percent / 100))
    if target_width > MAX_IMAGE_DIMENSION or target_height > MAX_IMAGE_DIMENSION:
        raise ValueError(f"缩放后的尺寸不能超过 {MAX_IMAGE_DIMENSION} 像素。")
    return target_width, target_height


def _calculate_image_resize(
    source_width: int,
    source_height: int,
    width: int | None,
    height: int | None,
    keep_aspect: bool,
) -> tuple[int, int]:
    if not keep_aspect:
        assert width is not None and height is not None
        return width, height
    if width is None:
        assert height is not None
        target_width, target_height = max(1, round(source_width * height / source_height)), height
    elif height is None:
        target_width, target_height = width, max(1, round(source_height * width / source_width))
    else:
        scale = min(width / source_width, height / source_height)
        target_width = max(1, round(source_width * scale))
        target_height = max(1, round(source_height * scale))
    if target_width > MAX_IMAGE_DIMENSION or target_height > MAX_IMAGE_DIMENSION:
        raise ValueError(f"保持比例后的尺寸不能超过 {MAX_IMAGE_DIMENSION} 像素。")
    return target_width, target_height


def _run_job(job_id: str, command: list[str], expected_duration: float | None) -> None:
    def update_progress(percent: float, message: str) -> None:
        with state_lock:
            job = jobs.get(job_id)
            if job:
                job["progress"] = max(float(job["progress"]), percent)
                job["message"] = message

    with state_lock:
        jobs[job_id]["status"] = "running"
        jobs[job_id]["message"] = "开始处理"

    try:
        run_ffmpeg(command, duration=expected_duration, progress_callback=update_progress)
    except Exception as exc:
        with state_lock:
            job = jobs.get(job_id)
            if job:
                job["status"] = "failed"
                job["error"] = str(exc)
                job["message"] = "处理失败"
        return

    with state_lock:
        job = jobs.get(job_id)
        if job:
            job["status"] = "done"
            job["progress"] = 100.0
            job["message"] = "处理完成"


def _run_video_download_job(job_id: str, url: str, quality: str) -> None:
    """Download one public video with yt-dlp and expose it through the normal job API."""
    try:
        import yt_dlp
    except ImportError:
        _fail_job(job_id, "未安装 yt-dlp，请重新安装项目依赖后再试。")
        return

    started_at = time.time()
    download_dir = OUTPUT_DIR / f".yt-dlp-{job_id}"
    download_dir.mkdir(parents=True, exist_ok=True)
    format_selector = (
        "bestvideo*+bestaudio/best"
        if quality == "best"
        else f"bestvideo*[height<={quality}]+bestaudio/best[height<={quality}]"
    )

    def progress_hook(data: dict[str, Any]) -> None:
        status = data.get("status")
        if status == "downloading":
            total = data.get("total_bytes") or data.get("total_bytes_estimate") or 0
            downloaded = data.get("downloaded_bytes") or 0
            percent = min(99.0, downloaded / total * 100) if total else 0.0
            message = "正在下载视频" if total else "正在下载视频（等待服务器提供文件大小）"
            _update_job_progress(job_id, percent, message)
        elif status == "finished":
            _update_job_progress(job_id, 99.0, "正在合并音视频")

    try:
        ffmpeg_location = str(Path(find_ffmpeg()).parent)
    except Exception:
        ffmpeg_location = None

    options: dict[str, Any] = {
        "format": format_selector,
        "outtmpl": str(download_dir / "%(title).180B [%(id)s].%(ext)s"),
        "noplaylist": True,
        "restrictfilenames": True,
        "windowsfilenames": True,
        "merge_output_format": "mp4",
        "progress_hooks": [progress_hook],
        "quiet": True,
        "no_warnings": True,
        "retries": 3,
        "fragment_retries": 3,
    }
    if ffmpeg_location:
        options["ffmpeg_location"] = ffmpeg_location

    with state_lock:
        job = jobs.get(job_id)
        if job:
            job["status"] = "running"
            job["message"] = "正在读取视频信息"
    try:
        with yt_dlp.YoutubeDL(options) as downloader:
            downloader.download([url])
        candidates = [
            path for path in download_dir.iterdir()
            if path.is_file() and path.stat().st_mtime >= started_at - 1
            and path.suffix.lower() not in {".part", ".ytdl", ".json"}
        ]
        if not candidates:
            raise RuntimeError("下载完成后未找到输出文件。")
        downloaded_path = max(candidates, key=lambda path: path.stat().st_mtime)
        output_path = OUTPUT_DIR / downloaded_path.name
        downloaded_path.replace(output_path)
        download_dir.rmdir()
    except Exception as exc:
        _fail_job(job_id, str(exc))
        return

    with state_lock:
        job = jobs.get(job_id)
        if job:
            job["status"] = "done"
            job["progress"] = 100.0
            job["message"] = "下载完成"
            job["output_path"] = output_path
            job["output_name"] = output_path.name


def _update_job_progress(job_id: str, percent: float, message: str) -> None:
    with state_lock:
        job = jobs.get(job_id)
        if job:
            job["progress"] = max(float(job.get("progress") or 0), percent)
            job["message"] = message


def _fail_job(job_id: str, error: str) -> None:
    with state_lock:
        job = jobs.get(job_id)
        if job:
            job["status"] = "failed"
            job["error"] = error
            job["message"] = "下载失败"


def _run_watermark_job(
    job_id: str,
    input_path: Path,
    output_path: Path,
    adaptive_mode: str,
    max_passes: int,
) -> None:
    with state_lock:
        job = jobs.get(job_id)
        if job:
            job["status"] = "running"
            job["progress"] = 12.0
            job["message"] = "正在识别并处理图片"

    try:
        meta = remove_gemini_watermark(
            input_path,
            output_path,
            adaptive_mode=adaptive_mode,
            max_passes=max_passes,
        )
    except WatermarkProcessingError as exc:
        with state_lock:
            job = jobs.get(job_id)
            if job:
                job["status"] = "failed"
                job["error"] = str(exc)
                job["message"] = "图片处理失败"
        return
    except Exception as exc:
        with state_lock:
            job = jobs.get(job_id)
            if job:
                job["status"] = "failed"
                job["error"] = f"图片处理失败：{exc}"
                job["message"] = "图片处理失败"
        return

    with state_lock:
        job = jobs.get(job_id)
        if job:
            job["status"] = "done"
            job["progress"] = 100.0
            job["message"] = "图片处理完成"
            job["meta"] = meta


def _run_model_download(
    job_id: str,
    repo_id: str,
    revision: str | None,
    allow_patterns: list[str] | None,
    local_dir: Path,
    token: str | None,
) -> None:
    with state_lock:
        job = model_jobs[job_id]
        job["status"] = "running"
        job["progress"] = 8.0
        job["message"] = f"正在从 {HF_MIRROR_ENDPOINT} 下载"

    try:
        try:
            from huggingface_hub import HfApi
        except ImportError as exc:
            raise RuntimeError("缺少 huggingface_hub，请先运行：python -m pip install -e .") from exc

        local_dir.mkdir(parents=True, exist_ok=True)
        api = HfApi(endpoint=HF_MIRROR_ENDPOINT, token=token)
        files = api.list_repo_files(
            repo_id=repo_id,
            repo_type="model",
            revision=revision,
        )
        selected_files = _filter_model_files(files, allow_patterns)
        if not selected_files:
            raise RuntimeError("没有找到匹配的模型文件，请检查“文件筛选”。")
        _set_model_file_list(job_id, selected_files)

        for index, filename in enumerate(selected_files, start=1):
            _download_model_file(
                job_id=job_id,
                repo_id=repo_id,
                revision=revision or "main",
                filename=filename,
                local_dir=local_dir,
                token=token,
                file_index=index,
                file_count=len(selected_files),
            )
        file_count, total_size = _directory_stats(local_dir)
    except Exception as exc:
        with state_lock:
            job = model_jobs.get(job_id)
            if job:
                job["status"] = "failed"
                job["error"] = str(exc)
                job["message"] = "下载失败"
                current_file = job.get("current_file")
                if current_file:
                    for item in job.get("files", []):
                        if item["name"] == current_file:
                            item["status"] = "failed"
                            break
        return

    with state_lock:
        job = model_jobs.get(job_id)
        if job:
            job["status"] = "done"
            job["progress"] = 100.0
            job["message"] = "下载完成"
            job["file_count"] = file_count
            job["size"] = total_size


def _media_info_payload(info: Any) -> dict[str, Any]:
    payload = asdict(info)
    payload["path"] = str(payload["path"])
    payload["resolution"] = info.resolution
    return payload


def _parse_silence_segments(data: dict[str, Any]) -> list[dict[str, float]]:
    raw_segments = data.get("segments")
    if raw_segments is None:
        raw_segments = [{"insert_at": data.get("insert_at"), "duration": data.get("duration")}]
    if not isinstance(raw_segments, list) or not raw_segments:
        raise ValueError("请至少添加一段静音。")
    if len(raw_segments) > 50:
        raise ValueError("一次最多可以插入 50 段静音。")

    segments: list[dict[str, float]] = []
    for index, raw_segment in enumerate(raw_segments, start=1):
        if not isinstance(raw_segment, dict):
            raise ValueError(f"第 {index} 段静音参数格式不正确。")
        insert_at = parse_timecode(raw_segment.get("insert_at")) or 0.0
        duration = parse_timecode(raw_segment.get("duration"))
        if duration is None:
            raise ValueError(f"请输入第 {index} 段静音时长。")
        segments.append({"insert_at": insert_at, "duration": duration})
    return segments


def _restore_upload(file_id: str) -> dict[str, Any] | None:
    if not re.fullmatch(r"[0-9a-fA-F]{32}", file_id):
        return None
    matches = sorted(path for path in UPLOAD_DIR.glob(f"{file_id}_*") if path.is_file())
    if not matches:
        return None

    stored_path = matches[0]
    original_name = stored_path.name[len(file_id) + 1:] or stored_path.name
    try:
        info = probe_media(stored_path)
    except Exception:
        return None

    payload = {
        "id": file_id,
        "original_name": original_name,
        "path": stored_path,
        "info": _media_info_payload(info),
    }
    with state_lock:
        uploads[file_id] = payload
    return payload


def _thumbnail_times(start: float, end: float, count: int) -> list[float]:
    if count <= 1:
        return [(start + end) / 2]
    span = max(0.05, end - start)
    return [min(end, start + span * index / (count - 1)) for index in range(count)]


def _thumbnail_data_url(path: Path, second: float) -> str | None:
    command = [
        find_ffmpeg(),
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        f"{max(0.0, second):.3f}",
        "-i",
        str(path),
        "-frames:v",
        "1",
        "-vf",
        "scale=220:-2",
        "-f",
        "image2pipe",
        "-vcodec",
        "mjpeg",
        "pipe:1",
    ]
    result = subprocess.run(command, capture_output=True)
    if result.returncode != 0 or not result.stdout:
        return None
    encoded = base64.b64encode(result.stdout).decode("ascii")
    return f"data:image/jpeg;base64,{encoded}"


def _waveform_peaks(path: Path, count: int) -> list[float]:
    command = [
        find_ffmpeg(),
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(path),
        "-vn",
        "-ac",
        "1",
        "-ar",
        "8000",
        "-f",
        "s16le",
        "pipe:1",
    ]
    result = subprocess.run(command, capture_output=True, timeout=60)
    if result.returncode != 0 or not result.stdout:
        detail = result.stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(detail or "未能读取音频数据")

    samples = array("h")
    samples.frombytes(result.stdout)
    if sys.byteorder != "little":
        samples.byteswap()
    if not samples:
        return []

    bucket_size = max(1, math.ceil(len(samples) / count))
    peaks: list[float] = []
    for index in range(0, len(samples), bucket_size):
        bucket = samples[index:index + bucket_size]
        peaks.append(max(abs(sample) for sample in bucket) / 32768)
        if len(peaks) >= count:
            break

    if len(peaks) < count:
        peaks.extend([0.0] * (count - len(peaks)))

    loudest = max(peaks) or 1.0
    return [round(max(0.06, min(1.0, peak / loudest)), 4) for peak in peaks[:count]]


def _normalize_model_repo_id(value: str) -> str:
    text = value.strip().rstrip("/")
    if text.startswith("https://hf-mirror.com/"):
        text = text.removeprefix("https://hf-mirror.com/").strip("/")
    if text.startswith("https://huggingface.co/"):
        text = text.removeprefix("https://huggingface.co/").strip("/")
    if text.startswith("models/"):
        text = text.removeprefix("models/").strip("/")
    if not text:
        raise ValueError("请输入模型仓库 ID，例如 Qwen/Qwen3-0.6B。")
    if not MODEL_REPO_PATTERN.match(text) or ".." in text:
        raise ValueError("模型仓库 ID 格式不正确。")
    return text


def _clean_optional_text(value: object) -> str:
    return str(value or "").strip()


def _parse_patterns(value: object) -> list[str] | None:
    text = _clean_optional_text(value)
    if not text:
        return None
    patterns = [item.strip() for item in re.split(r"[\n,]+", text) if item.strip()]
    return patterns or None


def _resolve_model_save_dir(value: object, repo_id: str, revision: str | None) -> Path:
    text = _clean_optional_text(value)
    base_dir = Path(text).expanduser() if text else MODEL_DIR
    local_path = _model_local_path(repo_id, revision)
    if _path_endswith(base_dir, local_path):
        return base_dir
    return base_dir / local_path


def _filter_model_files(files: list[str], allow_patterns: list[str] | None) -> list[str]:
    if not allow_patterns:
        return [filename for filename in files if not filename.endswith("/")]
    return [
        filename
        for filename in files
        if not filename.endswith("/") and any(fnmatch.fnmatch(filename, pattern) for pattern in allow_patterns)
    ]


def _set_model_file_list(job_id: str, files: list[str]) -> None:
    with state_lock:
        job = model_jobs.get(job_id)
        if not job:
            return
        job["file_count"] = len(files)
        job["files"] = [
            {
                "name": filename,
                "status": "pending",
                "progress": 0.0,
                "downloaded": 0,
                "size": 0,
            }
            for filename in files
        ]


def _download_model_file(
    job_id: str,
    repo_id: str,
    revision: str,
    filename: str,
    local_dir: Path,
    token: str | None,
    file_index: int,
    file_count: int,
) -> None:
    target_path = local_dir / Path(filename)
    target_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = target_path.with_name(f"{target_path.name}.part")
    url = _model_file_url(repo_id, revision, filename)
    headers = {"User-Agent": "lin-tools/0.1"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    downloaded = temp_path.stat().st_size if temp_path.exists() else 0
    last_error: BaseException | None = None

    for attempt in range(1, MODEL_DOWNLOAD_RETRIES + 1):
        request_headers = dict(headers)
        if downloaded > 0:
            request_headers["Range"] = f"bytes={downloaded}-"

        request = Request(url, headers=request_headers)
        try:
            with urlopen(request, timeout=90) as response:
                response_status = getattr(response, "status", 200)
                content_length = int(response.headers.get("content-length") or 0)
                total_size = _content_range_total(response.headers.get("content-range"))
                if not total_size:
                    total_size = downloaded + content_length if downloaded and response_status == 206 else content_length

                if target_path.exists() and total_size and target_path.stat().st_size == total_size:
                    _update_model_progress(job_id, file_index, file_count, filename, 1.0, total_size, total_size, "done")
                    return

                if downloaded > 0 and response_status != 206:
                    downloaded = 0
                    temp_path.unlink(missing_ok=True)

                _update_model_progress(job_id, file_index, file_count, filename, downloaded / total_size if total_size else 0.0, downloaded, total_size, "running")
                with temp_path.open("ab" if downloaded else "wb") as output:
                    while True:
                        chunk = response.read(1024 * 1024)
                        if not chunk:
                            break
                        output.write(chunk)
                        downloaded += len(chunk)
                        file_ratio = (downloaded / total_size) if total_size else 0.0
                        _update_model_progress(job_id, file_index, file_count, filename, file_ratio, downloaded, total_size, "running")

                if total_size and downloaded < total_size:
                    raise http.client.IncompleteRead(b"", total_size - downloaded)

                temp_path.replace(target_path)
                final_size = target_path.stat().st_size
                _update_model_progress(job_id, file_index, file_count, filename, 1.0, final_size, total_size or final_size, "done")
                return
        except HTTPError as exc:
            if exc.code == 416:
                temp_path.unlink(missing_ok=True)
                downloaded = 0
                last_error = exc
                continue
            detail = exc.read().decode("utf-8", errors="replace")[:300]
            raise RuntimeError(f"下载 {filename} 失败：HTTP {exc.code} {detail}") from exc
        except (URLError, TimeoutError, OSError, http.client.HTTPException) as exc:
            last_error = exc
            downloaded = temp_path.stat().st_size if temp_path.exists() else downloaded
            if attempt >= MODEL_DOWNLOAD_RETRIES:
                break
            _mark_model_retry(job_id, file_index, file_count, filename, downloaded, attempt)
            time.sleep(min(2 * attempt, 8))

    raise RuntimeError(f"下载 {filename} 失败，已重试 {MODEL_DOWNLOAD_RETRIES} 次：{last_error}") from last_error


def _model_file_url(repo_id: str, revision: str, filename: str) -> str:
    quoted_repo = "/".join(quote(part, safe="") for part in repo_id.split("/"))
    quoted_revision = quote(revision, safe="")
    quoted_filename = "/".join(quote(part, safe="") for part in filename.split("/"))
    return f"{HF_MIRROR_ENDPOINT}/{quoted_repo}/resolve/{quoted_revision}/{quoted_filename}"


def _content_range_total(value: str | None) -> int:
    if not value or "/" not in value:
        return 0
    total = value.rsplit("/", 1)[-1]
    if total == "*":
        return 0
    try:
        return int(total)
    except ValueError:
        return 0


def _mark_model_retry(job_id: str, file_index: int, file_count: int, filename: str, downloaded: int, attempt: int) -> None:
    with state_lock:
        job = model_jobs.get(job_id)
        if job:
            job["message"] = f"连接中断，正在重试 {attempt + 1}/{MODEL_DOWNLOAD_RETRIES}: {filename}"
            job["current_file"] = filename
            job["current_file_index"] = file_index
            for item in job.get("files", []):
                if item["name"] == filename:
                    item["status"] = "running"
                    item["downloaded"] = downloaded
                    break


def _update_model_progress(
    job_id: str,
    file_index: int,
    file_count: int,
    filename: str,
    file_ratio: float,
    downloaded: int,
    total_size: int,
    status: str,
) -> None:
    completed = max(0, file_index - 1)
    ratio = (completed + max(0.0, min(1.0, file_ratio))) / max(1, file_count)
    percent = 8.0 + min(90.0, ratio * 90.0)
    with state_lock:
        job = model_jobs.get(job_id)
        if job:
            job["progress"] = max(float(job["progress"]), percent)
            job["message"] = f"正在下载 {file_index}/{file_count}: {filename}"
            job["current_file"] = filename
            job["current_file_index"] = file_index
            job["current_file_progress"] = max(0.0, min(100.0, file_ratio * 100.0))
            job["current_file_downloaded"] = downloaded
            job["current_file_size"] = total_size
            for item in job.get("files", []):
                if item["name"] == filename:
                    item["status"] = status
                    item["progress"] = round(max(0.0, min(100.0, file_ratio * 100.0)), 1)
                    item["downloaded"] = downloaded
                    item["size"] = total_size
                    break


def _model_local_path(repo_id: str, revision: str | None) -> Path:
    parts = [secure_filename(part) or "model" for part in repo_id.split("/")]
    if revision:
        safe_revision = secure_filename(revision) or "revision"
        parts[-1] = f"{parts[-1]}@{safe_revision}"
    return Path(*parts)


def _path_endswith(path: Path, suffix: Path) -> bool:
    path_parts = [part.lower() for part in path.parts]
    suffix_parts = [part.lower() for part in suffix.parts]
    if len(path_parts) < len(suffix_parts):
        return False
    return path_parts[-len(suffix_parts):] == suffix_parts


def _directory_stats(path: Path) -> tuple[int, int]:
    file_count = 0
    total_size = 0
    for item in path.rglob("*"):
        if item.is_file():
            file_count += 1
            total_size += item.stat().st_size
    return file_count, total_size


def _clamp_float(value: object, minimum: float, maximum: float, fallback: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        number = fallback
    return min(maximum, max(minimum, number))


def _clamp_int(value: object, minimum: int, maximum: int, fallback: int) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        number = fallback
    return min(maximum, max(minimum, number))


def main() -> None:
    app = create_app()
    host = os.environ.get("LIN_TOOLS_HOST", "127.0.0.1")
    port = int(os.environ.get("LIN_TOOLS_PORT", "5000"))
    app.run(host=host, port=port, debug=False, threaded=True)


if __name__ == "__main__":
    main()
