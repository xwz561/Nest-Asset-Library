import { useMemo } from "react";
import { collectFolderSubtreeIds } from "../folder-tree.js";
import { NAME_COLLATOR, assetFormat } from "../lib/app-config.js";
import { assetMatchesTag } from "../tag-tree.js";

export function useLibraryView({ activeFolder, library, selectedIds, aiResultIds, assets, sortOrder, query, currentTag, filter, quickTypes, quickFormats }) {
  const activeFolderIds = useMemo(() => activeFolder ? collectFolderSubtreeIds(library?.folders || [], activeFolder) : null, [library?.folders, activeFolder]);
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const aiResultIdSet = useMemo(() => aiResultIds ? new Set(aiResultIds) : null, [aiResultIds]);
  const sortedAssets = useMemo(() => {
    const compareName = NAME_COLLATOR.compare;
    return [...assets].sort((a, b) =>
      sortOrder === "oldest" ? a.createdAt - b.createdAt
        : sortOrder === "nameAsc" ? compareName(a.name, b.name)
          : sortOrder === "nameDesc" ? compareName(b.name, a.name)
            : sortOrder === "sizeDesc" ? b.size - a.size
              : sortOrder === "sizeAsc" ? a.size - b.size
                : b.createdAt - a.createdAt);
  }, [assets, sortOrder]);
  const normalizedQuery = query.toLowerCase();
  const shown = useMemo(
    () =>
      sortedAssets
        .filter((a) => {
          const q = normalizedQuery;
          const match =
            !q ||
            a.name.toLowerCase().includes(q) ||
            (a.tags || []).some((t) => t.toLowerCase().includes(q)) ||
            (a.documentText || "").toLowerCase().includes(q);
          const tagMatch = assetMatchesTag(a.tags, currentTag);
          const f =
            filter === "全部素材" ||
            (filter === "收藏夹" && a.favorite) ||
            (filter === "图片" && a.type.startsWith("image")) ||
            (filter === "视频" && a.type.startsWith("video")) ||
            (filter === "音频" && a.type.startsWith("audio")) ||
            (filter === "剧本" && (a.type.startsWith("text") || a.type === "application/pdf" || a.documentFormat === "DOCX")) ||
            (filter === "未分类" && !a.folderId) ||
            (filter === "最近" && Date.now() - a.createdAt < 7 * 86400000);
          const quickType =
            !quickTypes.length ||
            quickTypes.some((type) => a.type.startsWith(type));
          const quickFormat =
            !quickFormats.length || quickFormats.includes(assetFormat(a));
          return (
            (!aiResultIdSet || aiResultIdSet.has(a.id)) &&
            match &&
            tagMatch &&
            f &&
            quickType &&
            quickFormat &&
            (!activeFolderIds || activeFolderIds.has(a.folderId))
          );
        }),
    [
      sortedAssets,
      normalizedQuery,
      currentTag,
      filter,
      activeFolderIds,
      sortOrder,
      quickTypes,
      quickFormats,
      aiResultIdSet,
    ],
  );

  return { activeFolderIds, selectedIdSet, aiResultIdSet, sortedAssets, normalizedQuery, shown };
}
