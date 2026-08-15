from io import BytesIO

from PIL import Image

from lin_tools import web_app


def test_image_resize_accepts_percentage_scale(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(web_app, "RUNTIME_DIR", tmp_path)
    monkeypatch.setattr(web_app, "UPLOAD_DIR", tmp_path / "uploads")
    monkeypatch.setattr(web_app, "OUTPUT_DIR", tmp_path / "outputs")
    monkeypatch.setattr(web_app, "MODEL_DIR", tmp_path / "models")
    app = web_app.create_app()

    image_data = BytesIO()
    Image.new("RGB", (200, 100), "red").save(image_data, format="PNG")
    image_data.seek(0)

    response = app.test_client().post(
        "/api/image-resize",
        data={
            "image": (image_data, "sample.png"),
            "scale_percent": "50",
            "keep_aspect": "true",
        },
    )

    assert response.status_code == 200
    assert response.get_json()["width"] == 100
    assert response.get_json()["height"] == 50


def test_image_resize_rejects_percentage_above_original_size(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(web_app, "RUNTIME_DIR", tmp_path)
    monkeypatch.setattr(web_app, "UPLOAD_DIR", tmp_path / "uploads")
    monkeypatch.setattr(web_app, "OUTPUT_DIR", tmp_path / "outputs")
    monkeypatch.setattr(web_app, "MODEL_DIR", tmp_path / "models")
    app = web_app.create_app()

    image_data = BytesIO()
    Image.new("RGB", (200, 100), "red").save(image_data, format="PNG")
    image_data.seek(0)

    response = app.test_client().post(
        "/api/image-resize",
        data={"image": (image_data, "sample.png"), "scale_percent": "101"},
    )

    assert response.status_code == 400
    assert "1% 到 100%" in response.get_json()["error"]


def test_image_resize_saves_requested_format_with_quality(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(web_app, "RUNTIME_DIR", tmp_path)
    monkeypatch.setattr(web_app, "UPLOAD_DIR", tmp_path / "uploads")
    monkeypatch.setattr(web_app, "OUTPUT_DIR", tmp_path / "outputs")
    monkeypatch.setattr(web_app, "MODEL_DIR", tmp_path / "models")
    app = web_app.create_app()

    image_data = BytesIO()
    Image.new("RGBA", (200, 100), (255, 0, 0, 128)).save(image_data, format="PNG")
    image_data.seek(0)

    response = app.test_client().post(
        "/api/image-resize",
        data={
            "image": (image_data, "sample.png"),
            "scale_percent": "50",
            "output_format": "jpeg",
            "quality": "72",
        },
    )

    assert response.status_code == 200
    output_name = response.get_json()["output_name"]
    assert output_name.endswith(".jpg")
    with Image.open(tmp_path / "outputs" / output_name) as output:
        assert output.format == "JPEG"
        assert output.mode == "RGB"
