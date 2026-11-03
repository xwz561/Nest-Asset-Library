import { useState } from "react";
import { loadTheme } from "../theme-utils.js";

export function usePanelState() {
  const [dialogState, setDialogState] = useState(null);
  const [theme, setTheme] = useState(loadTheme);
  const [sortPanel, setSortPanel] = useState(false);
  const [filterPanel, setFilterPanel] = useState(false);
  const [quickTypes, setQuickTypes] = useState([]);
  const [quickFormats, setQuickFormats] = useState([]);
  const [contextMenu, setContextMenu] = useState(null);
  const [appMenuOpen, setAppMenuOpen] = useState(false);
  const [recentLibraries, setRecentLibraries] = useState([]);
  const [appMenuPosition, setAppMenuPosition] = useState({ left: 12, top: 52 });
  const [settingsInitialTab, setSettingsInitialTab] = useState("通用");
  const [aboutPanel, setAboutPanel] = useState(false);
  const [batchRenamePanel, setBatchRenamePanel] = useState(false);
  const [extensionPanel, setExtensionPanel] = useState(false);
  const [extensionResult, setExtensionResult] = useState(null);
  const [extensionBusy, setExtensionBusy] = useState(false);
  const [plugins, setPlugins] = useState([]);
  const [mcpConfig, setMcpConfig] = useState(null);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [updatePanel, setUpdatePanel] = useState(false);
  const [updateChecking, setUpdateChecking] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(null);
  const [updateFile, setUpdateFile] = useState("");
  const [updateError, setUpdateError] = useState("");
  const [supportPanel, setSupportPanel] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [friendToolsOpen, setFriendToolsOpen] = useState(false);
  const [friendToolBusy, setFriendToolBusy] = useState(false);
  const [friendToolError, setFriendToolError] = useState("");
  const [aiPanel, setAiPanel] = useState(false);
  const [aiSettingsPanel, setAiSettingsPanel] = useState(false);
  const [aiResultIds, setAiResultIds] = useState(null);
  const [activeModule, setActiveModule] = useState("library");
  const [directorPrankPlaying, setDirectorPrankPlaying] = useState(false);
  const [tetrisPasswordOpen, setTetrisPasswordOpen] = useState(false);
  const [tetrisPassword, setTetrisPassword] = useState("");
  const [tetrisPasswordError, setTetrisPasswordError] = useState("");
  const [teamPanel, setTeamPanel] = useState(false);
  const [inspectorFrame, setInspectorFrame] = useState({ ready: false, overlayWidth: 0, lockWidth: 0 });

  return { dialogState, setDialogState, theme, setTheme, sortPanel, setSortPanel, filterPanel, setFilterPanel, quickTypes, setQuickTypes, quickFormats, setQuickFormats, contextMenu, setContextMenu, appMenuOpen, setAppMenuOpen, recentLibraries, setRecentLibraries, appMenuPosition, setAppMenuPosition, settingsInitialTab, setSettingsInitialTab, aboutPanel, setAboutPanel, batchRenamePanel, setBatchRenamePanel, extensionPanel, setExtensionPanel, extensionResult, setExtensionResult, extensionBusy, setExtensionBusy, plugins, setPlugins, mcpConfig, setMcpConfig, updateInfo, setUpdateInfo, updatePanel, setUpdatePanel, updateChecking, setUpdateChecking, updateProgress, setUpdateProgress, updateFile, setUpdateFile, updateError, setUpdateError, supportPanel, setSupportPanel, onboardingOpen, setOnboardingOpen, friendToolsOpen, setFriendToolsOpen, friendToolBusy, setFriendToolBusy, friendToolError, setFriendToolError, aiPanel, setAiPanel, aiSettingsPanel, setAiSettingsPanel, aiResultIds, setAiResultIds, activeModule, setActiveModule, directorPrankPlaying, setDirectorPrankPlaying, tetrisPasswordOpen, setTetrisPasswordOpen, tetrisPassword, setTetrisPassword, tetrisPasswordError, setTetrisPasswordError, teamPanel, setTeamPanel, inspectorFrame, setInspectorFrame };
}
