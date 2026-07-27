from __future__ import annotations

import queue
import threading
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

from .ffmpeg_tools import build_clip_command, default_output_path, probe_media, run_ffmpeg
from .timecode import format_timecode, parse_timecode
from .video_formats import OUTPUT_FORMATS, input_filetypes


class VideoClipperApp(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("Lin Video Clipper")
        self.geometry("760x560")
        self.minsize(720, 520)

        self.input_path = tk.StringVar()
        self.output_path = tk.StringVar()
        self.start_time = tk.StringVar(value="00:00.000")
        self.end_time = tk.StringVar(value="")
        self.output_format = tk.StringVar(value="mp4")
        self.scale = tk.StringVar(value="1.0")
        self.include_audio = tk.BooleanVar(value=True)
        self.status = tk.StringVar(value="请选择一个视频文件")
        self.media_duration: float | None = None
        self.message_queue: queue.Queue[tuple[str, object]] = queue.Queue()

        self._build_ui()
        self.after(100, self._drain_queue)

    def _build_ui(self) -> None:
        root = ttk.Frame(self, padding=18)
        root.pack(fill=tk.BOTH, expand=True)
        root.columnconfigure(1, weight=1)

        title = ttk.Label(root, text="本地视频裁剪工具", font=("Microsoft YaHei UI", 18, "bold"))
        title.grid(row=0, column=0, columnspan=3, sticky="w", pady=(0, 14))

        ttk.Label(root, text="输入视频").grid(row=1, column=0, sticky="w", pady=6)
        ttk.Entry(root, textvariable=self.input_path).grid(row=1, column=1, sticky="ew", padx=8)
        ttk.Button(root, text="选择", command=self.select_input).grid(row=1, column=2, sticky="ew")

        ttk.Label(root, text="输出文件").grid(row=2, column=0, sticky="w", pady=6)
        ttk.Entry(root, textvariable=self.output_path).grid(row=2, column=1, sticky="ew", padx=8)
        ttk.Button(root, text="另存为", command=self.select_output).grid(row=2, column=2, sticky="ew")

        settings = ttk.LabelFrame(root, text="裁剪与格式", padding=12)
        settings.grid(row=3, column=0, columnspan=3, sticky="ew", pady=12)
        settings.columnconfigure((1, 3), weight=1)

        ttk.Label(settings, text="开始时间").grid(row=0, column=0, sticky="w", padx=(0, 8), pady=6)
        ttk.Entry(settings, textvariable=self.start_time, width=16).grid(row=0, column=1, sticky="w", pady=6)
        ttk.Label(settings, text="结束时间").grid(row=0, column=2, sticky="w", padx=(20, 8), pady=6)
        ttk.Entry(settings, textvariable=self.end_time, width=16).grid(row=0, column=3, sticky="w", pady=6)

        ttk.Label(settings, text="导出格式").grid(row=1, column=0, sticky="w", padx=(0, 8), pady=6)
        format_box = ttk.Combobox(
            settings,
            textvariable=self.output_format,
            values=list(OUTPUT_FORMATS.keys()),
            state="readonly",
            width=14,
        )
        format_box.grid(row=1, column=1, sticky="w", pady=6)
        format_box.bind("<<ComboboxSelected>>", lambda _event: self.refresh_output_name())

        ttk.Label(settings, text="缩放比例").grid(row=1, column=2, sticky="w", padx=(20, 8), pady=6)
        ttk.Combobox(
            settings,
            textvariable=self.scale,
            values=["1.0", "0.75", "0.5", "0.25"],
            state="readonly",
            width=14,
        ).grid(row=1, column=3, sticky="w", pady=6)

        ttk.Checkbutton(settings, text="包含音频（GIF/音频格式会自动调整）", variable=self.include_audio).grid(
            row=2, column=0, columnspan=4, sticky="w", pady=(6, 0)
        )

        supported = ", ".join(fmt.label for fmt in OUTPUT_FORMATS.values())
        ttk.Label(settings, text=f"可选格式：{supported}", wraplength=680, foreground="#555").grid(
            row=3, column=0, columnspan=4, sticky="w", pady=(10, 0)
        )

        info_frame = ttk.LabelFrame(root, text="视频信息", padding=12)
        info_frame.grid(row=4, column=0, columnspan=3, sticky="nsew", pady=(0, 12))
        root.rowconfigure(4, weight=1)

        self.info_text = tk.Text(info_frame, height=8, wrap="word", state="disabled")
        self.info_text.pack(fill=tk.BOTH, expand=True)

        progress_frame = ttk.Frame(root)
        progress_frame.grid(row=5, column=0, columnspan=3, sticky="ew")
        progress_frame.columnconfigure(0, weight=1)
        self.progress = ttk.Progressbar(progress_frame, mode="determinate", maximum=100)
        self.progress.grid(row=0, column=0, sticky="ew", padx=(0, 10))
        self.run_button = ttk.Button(progress_frame, text="开始裁剪/转换", command=self.start_export)
        self.run_button.grid(row=0, column=1)

        ttk.Label(root, textvariable=self.status, foreground="#444").grid(row=6, column=0, columnspan=3, sticky="w", pady=(10, 0))

    def select_input(self) -> None:
        filename = filedialog.askopenfilename(title="选择视频文件", filetypes=input_filetypes())
        if not filename:
            return
        self.input_path.set(filename)
        self.status.set("正在读取视频信息...")
        self._set_info("正在读取视频信息，请稍候...")

        def worker() -> None:
            try:
                info = probe_media(filename)
                self.message_queue.put(("probe_done", info))
            except Exception as exc:
                self.message_queue.put(("error", f"读取视频信息失败：{exc}"))

        threading.Thread(target=worker, daemon=True).start()

    def select_output(self) -> None:
        fmt = OUTPUT_FORMATS[self.output_format.get()]
        filename = filedialog.asksaveasfilename(
            title="保存输出文件",
            defaultextension=fmt.extension,
            filetypes=[(fmt.label, f"*{fmt.extension}"), ("All files", "*.*")],
            initialfile=Path(self.output_path.get()).name if self.output_path.get() else None,
        )
        if filename:
            self.output_path.set(filename)

    def refresh_output_name(self) -> None:
        if not self.input_path.get():
            return
        try:
            start = parse_timecode(self.start_time.get()) or 0.0
            end = parse_timecode(self.end_time.get())
            self.output_path.set(str(default_output_path(self.input_path.get(), self.output_format.get(), start, end)))
        except Exception:
            pass

    def start_export(self) -> None:
        if not self.input_path.get():
            messagebox.showwarning("缺少输入", "请先选择一个视频文件。")
            return
        try:
            start = parse_timecode(self.start_time.get()) or 0.0
            end = parse_timecode(self.end_time.get())
            scale = float(self.scale.get())
        except ValueError as exc:
            messagebox.showerror("参数错误", f"时间或缩放比例格式不正确：{exc}")
            return

        if not self.output_path.get():
            self.refresh_output_name()
        output = self.output_path.get()
        if not output:
            messagebox.showwarning("缺少输出", "请先选择输出文件。")
            return

        expected_duration = (end - start) if end is not None else (self.media_duration - start if self.media_duration else None)
        if expected_duration is not None and expected_duration <= 0:
            messagebox.showerror("参数错误", "结束时间必须大于开始时间。")
            return

        try:
            command = build_clip_command(
                input_path=self.input_path.get(),
                output_path=output,
                output_format=self.output_format.get(),
                start=start,
                end=end,
                include_audio=self.include_audio.get(),
                scale=scale,
            )
        except Exception as exc:
            messagebox.showerror("命令生成失败", str(exc))
            return

        self.run_button.configure(state="disabled")
        self.progress.configure(value=0)
        self.status.set("正在处理视频...")

        def worker() -> None:
            try:
                run_ffmpeg(
                    command,
                    duration=expected_duration,
                    progress_callback=lambda percent, message: self.message_queue.put(("progress", (percent, message))),
                )
                self.message_queue.put(("done", output))
            except Exception as exc:
                self.message_queue.put(("error", str(exc)))

        threading.Thread(target=worker, daemon=True).start()

    def _drain_queue(self) -> None:
        try:
            while True:
                kind, payload = self.message_queue.get_nowait()
                if kind == "probe_done":
                    self._handle_probe_done(payload)
                elif kind == "progress":
                    percent, message = payload
                    self.progress.configure(value=percent)
                    self.status.set(f"正在处理：{message}")
                elif kind == "done":
                    self.progress.configure(value=100)
                    self.run_button.configure(state="normal")
                    self.status.set(f"完成：{payload}")
                    messagebox.showinfo("完成", f"视频已导出：\n{payload}")
                elif kind == "error":
                    self.run_button.configure(state="normal")
                    self.status.set("处理失败")
                    messagebox.showerror("错误", str(payload))
        except queue.Empty:
            pass
        self.after(100, self._drain_queue)

    def _handle_probe_done(self, info: object) -> None:
        self.media_duration = getattr(info, "duration", None)
        duration = format_timecode(self.media_duration) if self.media_duration else ""
        if duration:
            self.end_time.set(duration)
        self.refresh_output_name()
        self.status.set("视频信息读取完成")
        lines = [
            f"文件：{getattr(info, 'path', '')}",
            f"时长：{duration or 'unknown'}",
            f"分辨率：{getattr(info, 'resolution', 'unknown')}",
            f"视频编码：{getattr(info, 'video_codec', None) or 'unknown'}",
            f"音频编码：{getattr(info, 'audio_codec', None) or 'none/unknown'}",
            f"容器格式：{getattr(info, 'format_name', None) or 'unknown'}",
        ]
        self._set_info("\n".join(lines))

    def _set_info(self, text: str) -> None:
        self.info_text.configure(state="normal")
        self.info_text.delete("1.0", tk.END)
        self.info_text.insert("1.0", text)
        self.info_text.configure(state="disabled")


def main() -> None:
    app = VideoClipperApp()
    app.mainloop()


if __name__ == "__main__":
    main()
