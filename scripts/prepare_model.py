"""Download and validate the checkpoint used by the offline Windows bundle."""

from importlib.metadata import distribution
from pathlib import Path
import shutil

import torch
from beat_this.inference import CHECKPOINT_URL, load_model


if __name__ == "__main__":
    target = Path("build/models/small0.ckpt")
    target.parent.mkdir(parents=True, exist_ok=True)
    torch.hub.download_url_to_file(f"{CHECKPOINT_URL}/small0.ckpt", str(target))
    load_model(str(target), device="cpu")
    for name in ("beat-this", "madmom"):
        package = distribution(name)
        license_file = next(file for file in package.files if file.name == "LICENSE" and ".dist-info" in str(file))
        shutil.copyfile(package.locate_file(license_file), target.parent / f"{name}-LICENSE.txt")
