"""Entry point for the bundled analysis worker."""

import multiprocessing
import os
import runpy
import sys


if __name__ == "__main__":
    multiprocessing.freeze_support()
    if getattr(sys, "frozen", False):
        os.environ["PATH"] = sys._MEIPASS + os.pathsep + os.environ.get("PATH", "")
    runpy.run_module("src.analysis_worker", run_name="__main__")
