from lin_tools import web_app


def test_frontend_public_tool_icons_are_served() -> None:
    app = web_app.create_app()

    response = app.test_client().get("/icons/tools/video-clip.png")

    assert response.status_code == 200
    assert response.mimetype == "image/png"
