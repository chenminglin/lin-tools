from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from PIL import Image, ImageOps


class WatermarkProcessingError(RuntimeError):
    """Raised when the watermark backend cannot process an image."""


WATERMARK_CORE_DIR = Path(__file__).resolve().parent / "watermark_core"
WATERMARK_RUNNER = WATERMARK_CORE_DIR / "runner.mjs"


def remove_gemini_watermark(
    input_path: Path,
    output_path: Path,
    *,
    adaptive_mode: str = "auto",
    max_passes: int = 4,
    timeout: float | None = None,
) -> dict[str, Any] | None:
    """Run the Gemini watermark remover on an image and save a PNG result."""

    node_path = shutil.which("node")
    if not node_path:
        raise WatermarkProcessingError("未找到 Node.js，请先安装 Node.js 后再使用图片去水印。")
    if not WATERMARK_RUNNER.exists():
        raise WatermarkProcessingError("图片去水印后端脚本缺失。")

    try:
        with Image.open(input_path) as source:
            image = ImageOps.exif_transpose(source).convert("RGBA")
    except Exception as exc:
        raise WatermarkProcessingError(f"读取图片失败：{exc}") from exc

    width, height = image.size
    if width <= 0 or height <= 0:
        raise WatermarkProcessingError("图片尺寸无效。")

    pixel_count = width * height
    if timeout is None:
        timeout = max(120.0, min(600.0, pixel_count / 30000.0))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    safe_max_passes = max(1, min(8, int(max_passes or 4)))
    safe_adaptive_mode = adaptive_mode if adaptive_mode in {"auto", "always", "never", "off"} else "auto"

    with tempfile.TemporaryDirectory(prefix="lin_tools_watermark_") as temp_dir_text:
        temp_dir = Path(temp_dir_text)
        input_raw_path = temp_dir / "input.rgba"
        output_raw_path = temp_dir / "output.rgba"
        meta_path = temp_dir / "meta.json"
        input_raw_path.write_bytes(image.tobytes())

        command = [
            node_path,
            str(WATERMARK_RUNNER),
            "--input-raw",
            str(input_raw_path),
            "--output-raw",
            str(output_raw_path),
            "--meta",
            str(meta_path),
            "--width",
            str(width),
            "--height",
            str(height),
            "--adaptive-mode",
            safe_adaptive_mode,
            "--max-passes",
            str(safe_max_passes),
        ]

        try:
            result = subprocess.run(
                command,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=timeout,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise WatermarkProcessingError("图片处理超时，请尝试较小分辨率的图片。") from exc
        except OSError as exc:
            raise WatermarkProcessingError(f"启动图片处理后端失败：{exc}") from exc

        if result.returncode != 0:
            detail = (result.stderr or result.stdout or "").strip()
            raise WatermarkProcessingError(detail or "图片处理失败。")

        try:
            processed_bytes = output_raw_path.read_bytes()
        except OSError as exc:
            raise WatermarkProcessingError("图片处理完成但没有生成像素结果。") from exc

        expected_length = width * height * 4
        if len(processed_bytes) != expected_length:
            raise WatermarkProcessingError(
                f"图片处理结果尺寸不匹配：应为 {expected_length} 字节，实际 {len(processed_bytes)} 字节。"
            )

        result_image = Image.frombytes("RGBA", (width, height), processed_bytes)
        result_image.save(output_path, format="PNG")

        if not meta_path.exists():
            return None
        try:
            return json.loads(meta_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None
