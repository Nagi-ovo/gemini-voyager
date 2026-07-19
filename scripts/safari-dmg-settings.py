from pathlib import Path


source_dir = Path(defines["source"])  # noqa: F821
background_path = Path(defines["background"])  # noqa: F821

format = "UDZO"
filesystem = "HFS+"

files = [
    str(source_dir / "Voyager.app"),
    str(source_dir / "READ ME — Safari Upgrade.html"),
]
symlinks = {"Applications": "/Applications"}
hide_extensions = ["Voyager.app"]

background = str(background_path)
show_status_bar = False
show_tab_view = False
show_toolbar = False
show_pathbar = False
show_sidebar = False
window_rect = ((160, 120), (840, 460))
default_view = "icon-view"
show_icon_preview = False
include_icon_view_settings = True

arrange_by = None
scroll_position = (0, 0)
label_pos = "bottom"
text_size = 13
icon_size = 96
icon_locations = {
    "Voyager.app": (174, 255),
    "Applications": (665, 215),
    "READ ME — Safari Upgrade.html": (426, 330),
}
