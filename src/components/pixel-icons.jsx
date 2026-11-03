

export function PixelImportIcon({ size = 16 }) {
  return (
    <svg
      className="pixel-icon pixel-icon--grass"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
      shapeRendering="crispEdges"
    >
      <rect x="1" y="1" width="14" height="14" fill="#10291d" />
      <rect x="2" y="2" width="12" height="4" fill="#51c878" />
      <rect x="2" y="5" width="12" height="2" fill="#287347" />
      <rect x="2" y="7" width="12" height="7" fill="#70442b" />
      <rect x="3" y="8" width="3" height="2" fill="#925c3b" />
      <rect x="10" y="10" width="3" height="2" fill="#542f22" />
      <path d="M7 4h2v4h2v2H9v2H7v-2H5V8h2z" fill="#effff5" />
    </svg>
  );
}

export function PixelChestIcon({ size = 20 }) {
  return (
    <svg
      className="pixel-icon pixel-icon--chest"
      width={size}
      height={size}
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
      shapeRendering="crispEdges"
    >
      <rect x="2" y="6" width="16" height="11" fill="#0a0d0d" />
      <rect x="3" y="5" width="14" height="5" fill="#5b341c" />
      <rect x="4" y="4" width="12" height="1" fill="#754820" />
      <rect x="4" y="5" width="12" height="3" fill="#ba7837" />
      <rect x="5" y="5" width="7" height="1" fill="#efb665" />
      <rect x="12" y="5" width="3" height="2" fill="#895321" />
      <rect x="4" y="8" width="12" height="1" fill="#815022" />
      <rect x="3" y="9" width="14" height="7" fill="#8f4f25" />
      <rect x="4" y="10" width="3" height="5" fill="#bc7135" />
      <rect x="7" y="10" width="6" height="5" fill="#9d5929" />
      <rect x="13" y="10" width="3" height="5" fill="#5c3019" />
      <rect x="3" y="15" width="14" height="1" fill="#482415" />
      <rect x="8" y="8" width="4" height="5" fill="#17120d" />
      <rect x="9" y="9" width="2" height="3" fill="#f1cf67" />
      <rect x="9" y="9" width="1" height="1" fill="#fff1a1" />
      <rect x="9" y="11" width="2" height="1" fill="#a76924" />
    </svg>
  );
}

export function PixelPortalIcon({ size = 16 }) {
  return (
    <svg
      className="pixel-icon pixel-icon--portal"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
      shapeRendering="crispEdges"
    >
      <rect x="1" y="1" width="14" height="14" fill="#160b2a" />
      <rect x="2" y="2" width="12" height="12" fill="#392153" />
      <rect x="3" y="3" width="10" height="10" fill="#6e3ca1" />
      <rect x="4" y="4" width="8" height="8" fill="#8d54c9" />
      <rect x="5" y="4" width="3" height="2" fill="#d5adff" />
      <rect x="8" y="7" width="3" height="2" fill="#562a86" />
      <rect x="5" y="10" width="4" height="1" fill="#c088ff" />
      <rect x="10" y="3" width="2" height="2" fill="#f1e2ff" />
    </svg>
  );
}

export function PixelNavIcon({ kind, size = 17 }) {
  return (
    <svg
      className={`pixel-nav-icon pixel-nav-icon--${kind}`}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
      shapeRendering="crispEdges"
    >
      {kind === "all" && (
        <>
          <rect x="1" y="1" width="6" height="6" fill="#21423f" />
          <rect x="2" y="2" width="3" height="3" fill="#63d9c2" />
          <rect x="9" y="1" width="6" height="6" fill="#21423f" />
          <rect x="10" y="2" width="3" height="3" fill="#36a98d" />
          <rect x="1" y="9" width="6" height="6" fill="#21423f" />
          <rect x="2" y="10" width="3" height="3" fill="#36a98d" />
          <rect x="9" y="9" width="6" height="6" fill="#21423f" />
          <rect x="10" y="10" width="3" height="3" fill="#8ff5dd" />
        </>
      )}
      {kind === "unclassified" && (
        <>
          <rect x="2" y="3" width="12" height="11" fill="#1a2020" />
          <rect x="3" y="4" width="10" height="8" fill="#72837c" />
          <rect x="3" y="4" width="10" height="2" fill="#a7b6ae" />
          <rect x="4" y="7" width="8" height="1" fill="#44524d" />
          <rect x="5" y="9" width="6" height="2" fill="#52635d" />
        </>
      )}
      {kind === "favorite" && (
        <path
          d="M2 4h3v1h1V4h4v1h1V4h3v2h1v4h-1v1h-1v1h-1v1h-1v1H7v-1H6v-1H5v-1H4v-1H3V6H2z"
          fill="#e07587"
        />
      )}
      {kind === "recent" && (
        <>
          <path d="M5 1h6v1h2v2h1v8h-1v2h-2v1H5v-1H3v-2H2V4h1V2h2z" fill="#5e4c26" />
          <rect x="5" y="3" width="6" height="1" fill="#f0d274" />
          <rect x="4" y="5" width="8" height="7" fill="#c79b42" />
          <rect x="7" y="6" width="2" height="4" fill="#fff0a4" />
          <rect x="9" y="9" width="2" height="2" fill="#fff0a4" />
        </>
      )}
      {kind === "image" && (
        <>
          <rect x="1" y="2" width="14" height="12" fill="#392618" />
          <rect x="2" y="3" width="12" height="10" fill="#9bd8f0" />
          <rect x="3" y="4" width="2" height="2" fill="#fff3a2" />
          <path d="M2 11h3v-2h2v1h2V8h2v2h3v3H2z" fill="#36a878" />
          <rect x="2" y="12" width="12" height="1" fill="#1d6a52" />
        </>
      )}
      {kind === "video" && (
        <>
          <rect x="1" y="3" width="14" height="11" fill="#12191e" />
          <rect x="2" y="4" width="12" height="8" fill="#405563" />
          <rect x="2" y="2" width="12" height="2" fill="#77909b" />
          <rect x="4" y="2" width="2" height="2" fill="#15252b" />
          <rect x="8" y="2" width="2" height="2" fill="#15252b" />
          <path d="M7 6h2v1h1v2H9v1H7z" fill="#8bffd0" />
        </>
      )}
      {kind === "audio" && (
        <>
          <rect x="8" y="2" width="2" height="9" fill="#69d4bb" />
          <rect x="10" y="2" width="4" height="2" fill="#9bf4dd" />
          <rect x="3" y="10" width="5" height="4" fill="#2f7d6b" />
          <rect x="4" y="9" width="4" height="4" fill="#6ad5bc" />
          <rect x="8" y="11" width="5" height="3" fill="#2f7d6b" />
          <rect x="9" y="10" width="4" height="3" fill="#8fe5d0" />
        </>
      )}
      {kind === "script" && (
        <>
          <rect x="3" y="1" width="10" height="14" fill="#4a351e" />
          <rect x="4" y="2" width="8" height="12" fill="#e8d09a" />
          <rect x="5" y="4" width="5" height="1" fill="#946e3e" />
          <rect x="5" y="7" width="6" height="1" fill="#946e3e" />
          <rect x="5" y="10" width="4" height="1" fill="#946e3e" />
          <rect x="10" y="12" width="2" height="2" fill="#c29352" />
        </>
      )}
    </svg>
  );
}
