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
    package = distribution("beat-this")
    license_file = next(file for file in package.files if file.name == "LICENSE" and ".dist-info" in str(file))
    shutil.copyfile(package.locate_file(license_file), target.parent / "beat-this-LICENSE.txt")
    # Remove a stale notice left by earlier builds; madmom is no longer bundled.
    (target.parent / "madmom-LICENSE.txt").unlink(missing_ok=True)
