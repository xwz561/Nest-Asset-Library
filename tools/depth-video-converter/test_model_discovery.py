import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import model_discovery


class ModelDiscoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.app_dir = Path(self.temp.name) / "程序目录"
        self.app_dir.mkdir()
        self.cwd = Path(self.temp.name) / "another-working-directory"
        self.cwd.mkdir()
        for context in (
            patch.object(model_discovery.sys, "frozen", True, create=True),
            patch.object(model_discovery.sys, "executable", str(self.app_dir / "converter.exe")),
            patch.object(model_discovery.sys, "_MEIPASS", None, create=True),
            patch.object(model_discovery.Path, "cwd", return_value=self.cwd),
        ):
            context.start()
            self.addCleanup(context.stop)

    def test_executable_directory_wins_over_unrelated_working_directory(self):
        expected = self.app_dir / model_discovery.DEFAULT_MODEL_NAME
        expected.touch()
        (self.cwd / model_discovery.DEFAULT_MODEL_NAME).touch()
        self.assertEqual(model_discovery.find_default_model(), str(expected))

    def test_recommended_model_wins_over_other_models(self):
        expected = self.app_dir / model_discovery.DEFAULT_MODEL_NAME
        expected.touch()
        (self.app_dir / "other.onnx").touch()
        self.assertEqual(model_discovery.find_default_model(), str(expected))

    def test_single_alternative_model_is_selected(self):
        expected = self.app_dir / "custom.onnx"
        expected.touch()
        self.assertEqual(model_discovery.find_default_model(), str(expected))

    def test_multiple_alternative_models_require_manual_selection(self):
        (self.app_dir / "one.onnx").touch()
        (self.app_dir / "two.onnx").touch()
        self.assertEqual(model_discovery.find_default_model(), "")

    def test_missing_model_leaves_field_empty(self):
        self.assertEqual(model_discovery.find_default_model(), "")

    def test_embedded_resource_directory_is_supported(self):
        expected = self.cwd / model_discovery.DEFAULT_MODEL_NAME
        expected.touch()
        with patch.object(model_discovery.sys, "_MEIPASS", str(self.cwd)):
            self.assertEqual(model_discovery.find_default_model(), str(expected))


if __name__ == "__main__":
    unittest.main()
