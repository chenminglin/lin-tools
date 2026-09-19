from lin_tools import web_app


def test_frontend_public_tool_icons_are_served() -> None:
    app = web_app.create_app()

    response = app.test_client().get("/icons/tools/video-clip.png")

    assert response.status_code == 200
    assert response.mimetype == "image/png"


def test_frontend_app_icon_and_manifest_are_served() -> None:
    app = web_app.create_app()
    client = app.test_client()

    icon_response = client.get("/icons/app/favicon.ico")
    manifest_response = client.get("/site.webmanifest")

    assert icon_response.status_code == 200
    assert icon_response.mimetype == "image/x-icon"
    assert manifest_response.status_code == 200
    assert manifest_response.mimetype == "application/manifest+json"
