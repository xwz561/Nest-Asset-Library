import { X } from "lucide-react";
import { ASSET_COLORS } from "../asset-colors.js";

// 一排色点：点一个标上颜色，再点同一个或点 × 清除。右键菜单和详情面板共用。
export function AssetColorPicker({ value = "", onChange, disabled = false }) {
  return (
    <div className="asset-color-picker" role="radiogroup" aria-label="颜色标记">
      {ASSET_COLORS.map((color) => (
        <button
          type="button"
          key={color.id}
          role="radio"
          aria-checked={value === color.id}
          aria-label={`${color.label}色`}
          title={value === color.id ? `取消${color.label}色` : `标为${color.label}色`}
          className={value === color.id ? "on" : ""}
          style={{ "--swatch": color.value }}
          disabled={disabled}
          onClick={() => onChange(value === color.id ? "" : color.id)}
        />
      ))}
      <button
        type="button"
        className="asset-color-none"
        aria-label="清除颜色"
        title="清除颜色"
        disabled={disabled || !value}
        onClick={() => onChange("")}
      >
        <X size={11} />
      </button>
    </div>
  );
}
