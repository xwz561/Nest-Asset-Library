import unittest
import tkinter as tk

from app import choose_dropped_video, parse_drop_data


class ChooseDroppedVideoTests(unittest.TestCase):
    def test_accepts_one_supported_video(self):
        path = r"C:\素材目录\测试 视频.mp4"
        self.assertEqual(choose_dropped_video([path]), path)

    def test_rejects_more_than_one_file(self):
        with self.assertRaisesRegex(ValueError, "一次只能拖入一个视频"):
            choose_dropped_video([r"C:\a.mp4", r"C:\b.mov"])

    def test_rejects_unsupported_file_type(self):
        with self.assertRaisesRegex(ValueError, "不支持的文件格式"):
            choose_dropped_video([r"C:\notes.txt"])

    def test_parses_a_braced_path_with_spaces(self):
        tcl = tk.Tcl()
        data = r"{C:\素材目录\测试 视频.mp4}"
        self.assertEqual(parse_drop_data(data, tcl.splitlist), r"C:\素材目录\测试 视频.mp4")


if __name__ == "__main__":
    unittest.main()
