import { Button } from "../ready-ui.jsx";
import { Trash2, HardDrive, Heart } from "lucide-react";
import { fmtCapacity, APP_VERSION } from "../lib/app-config.js";

export function SidebarFooter({ info, recycleBinName, openRecycle, openSupport }) {
  const usedPercent = info?.total
      ? Math.min(
          100,
          Math.max(0, (Number(info.used) / Number(info.total)) * 100),
        )
      : 0,
    root = String(info?.root || "").replace(/[\\/]+$/, ""),
    diskLabel = `本地磁盘 (${root || "—"})`;
  return (
    <div className="sidebar-fixed-footer">
      <Button className="sidebar-recycle" onClick={openRecycle}>
        <Trash2 size={16} />
        <span>{recycleBinName}</span>
      </Button>
      <div
        className="sidebar-disk"
        title={
          info
            ? `${diskLabel} · 剩余 ${fmtCapacity(info.free)} / 共 ${fmtCapacity(info.total)}`
            : "正在读取磁盘容量"
        }
      >
        <HardDrive size={19} />
        <span>
          <b>{diskLabel}</b>
          <small>
            {info
              ? `剩余 ${fmtCapacity(info.free)} / 共 ${fmtCapacity(info.total)}`
              : "正在读取磁盘容量…"}
          </small>
          <i>
            <em style={{ width: `${usedPercent}%` }} />
          </i>
        </span>
      </div>
      <Button
        type="button"
        className="sidebar-version"
        title="打开社区支持"
        onClick={openSupport}
      >
        <Heart size={11} />
        <span className="version-number">v{APP_VERSION}</span>
      </Button>
    </div>
  );
}
