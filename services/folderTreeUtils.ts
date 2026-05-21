import { Folder, INBOX_FOLDER_ID } from '../types';

export interface FolderTreeNode {
  folder: Folder;
  depth: number;
  children: FolderTreeNode[];
}

export const getFolderById = (folders: Folder[], folderId: string): Folder | undefined =>
  folders.find((f) => f.id === folderId);

/** Ancestors from root → parent (excludes `folderId` itself). */
export const getFolderAncestors = (folders: Folder[], folderId: string): Folder[] => {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const chain: Folder[] = [];
  const visited = new Set<string>();
  let current = byId.get(folderId);
  while (current?.parentId) {
    if (visited.has(current.parentId)) break;
    visited.add(current.parentId);
    const parent = byId.get(current.parentId);
    if (!parent) break;
    chain.unshift(parent);
    current = parent;
  }
  return chain;
};

/** Merged folder instructions for AI calls (ancestor order, then leaf). */
export const getEffectiveFolderInstructions = (folders: Folder[], folderId: string): string => {
  const leaf = getFolderById(folders, folderId);
  if (!leaf) return '';
  const parts = [...getFolderAncestors(folders, folderId), leaf]
    .map((f) => (typeof f.customInstructions === 'string' ? f.customInstructions.trim() : ''))
    .filter((text) => text.length > 0);
  return parts.join('\n\n');
};

export const mergeFolderInstructionsWithSystemPrompt = (
  folders: Folder[],
  folderId: string | undefined,
  systemPrompt: string | undefined
): string | undefined => {
  const base = systemPrompt?.trim() || '';
  const folderBlock =
    folderId && folderId.length > 0 ? getEffectiveFolderInstructions(folders, folderId).trim() : '';
  if (!base && !folderBlock) return undefined;
  if (!folderBlock) return base || undefined;
  if (!base) return folderBlock;
  return `${base}\n\n${folderBlock}`;
};

export const getChildFolders = (folders: Folder[], parentId: string | undefined): Folder[] =>
  folders
    .filter((f) => {
      const pid = f.parentId;
      if (!parentId) return !pid || pid.length === 0;
      return pid === parentId;
    })
    .sort((a, b) => a.createdAt - b.createdAt);

export const getDescendantFolderIds = (folders: Folder[], folderId: string): Set<string> => {
  const out = new Set<string>();
  const walk = (parentId: string) => {
    for (const child of getChildFolders(folders, parentId)) {
      if (out.has(child.id)) continue;
      out.add(child.id);
      walk(child.id);
    }
  };
  walk(folderId);
  return out;
};

/** True if moving `folderId` under `newParentId` would create a cycle. */
export const wouldCreateFolderCycle = (
  folders: Folder[],
  folderId: string,
  newParentId: string | null | undefined
): boolean => {
  if (!newParentId || newParentId.length === 0) return false;
  if (newParentId === folderId) return true;
  const descendants = getDescendantFolderIds(folders, folderId);
  return descendants.has(newParentId);
};

export const buildFolderTree = (folders: Folder[]): FolderTreeNode[] => {
  const roots = getChildFolders(folders, undefined);
  const inbox = folders.find((f) => f.id === INBOX_FOLDER_ID);
  const orderedRoots = inbox
    ? [inbox, ...roots.filter((f) => f.id !== INBOX_FOLDER_ID)]
    : roots;

  const buildNode = (folder: Folder, depth: number): FolderTreeNode => ({
    folder,
    depth,
    children: getChildFolders(folders, folder.id).map((child) => buildNode(child, depth + 1)),
  });

  return orderedRoots.map((f) => buildNode(f, 0));
};

/** Depth-first flat list for menus (includes depth for indentation). */
export const flattenFolderTree = (nodes: FolderTreeNode[]): { folder: Folder; depth: number }[] => {
  const out: { folder: Folder; depth: number }[] = [];
  const walk = (list: FolderTreeNode[]) => {
    for (const node of list) {
      out.push({ folder: node.folder, depth: node.depth });
      walk(node.children);
    }
  };
  walk(nodes);
  return out;
};

export interface VisibleFolderRow {
  folder: Folder;
  depth: number;
  hasChildren: boolean;
  isCollapsed: boolean;
}

/** Depth-first list respecting collapsed nodes (children hidden when collapsed). */
export const flattenVisibleFolderTree = (
  nodes: FolderTreeNode[],
  collapsedIds: ReadonlySet<string>
): VisibleFolderRow[] => {
  const out: VisibleFolderRow[] = [];
  const walk = (list: FolderTreeNode[]) => {
    for (const node of list) {
      const hasChildren = node.children.length > 0;
      const isCollapsed = collapsedIds.has(node.folder.id);
      out.push({ folder: node.folder, depth: node.depth, hasChildren, isCollapsed });
      if (hasChildren && !isCollapsed) walk(node.children);
    }
  };
  walk(nodes);
  return out;
};

export const sanitizeFolderParentId = (
  rawParentId: string | undefined,
  folderId: string,
  folders: Folder[]
): string | undefined => {
  if (!rawParentId || rawParentId.length === 0) return undefined;
  if (rawParentId === folderId) return undefined;
  if (!folders.some((f) => f.id === rawParentId)) return undefined;
  return rawParentId;
};
