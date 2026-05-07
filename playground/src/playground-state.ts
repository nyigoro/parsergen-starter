import type { PlaygroundPreset } from './presets';

export type PlaygroundProjectFile = {
  uri: string;
  text: string;
};

export type PlaygroundProject = {
  presetId: string | null;
  sourcePresetId: string | null;
  entryUri: string;
  activeFileUri: string;
  openFileUris: string[];
  files: PlaygroundProjectFile[];
};

export type PlaygroundRouteLocation = {
  pathname: string;
  search: string;
  hash: string;
};

export type PlaygroundRoutePreview = {
  entries: PlaygroundRouteLocation[];
  index: number;
};

export type PersistedPlaygroundState = {
  version: 3;
  project: PlaygroundProject;
  routePreview: PlaygroundRoutePreview;
  consoleOutput: string;
};

export type LegacyPersistedPlaygroundState = {
  version: 2;
  project: Omit<PlaygroundProject, 'openFileUris'> & {
    openFileUris?: string[];
  };
  routePreview: PlaygroundRoutePreview;
  consoleOutput: string;
};

export type PlaygroundWorkspaceSnapshot = {
  id: string;
  name: string;
  savedAt: number;
  state: PersistedPlaygroundState;
};

export type PlaygroundWorkspaceCollection = {
  version: 1;
  activeWorkspaceId: string | null;
  recentWorkspaceIds: string[];
  items: PlaygroundWorkspaceSnapshot[];
};

export type PlaygroundWorkspaceExport = {
  version: 1;
  name: string;
  state: PersistedPlaygroundState;
};

const normalizeRoutePart = (value: string, prefix: string): string => {
  if (!value) return '';
  return value.startsWith(prefix) ? value : `${prefix}${value}`;
};

const dedupe = (values: string[]): string[] => Array.from(new Set(values));

const basename = (uri: string): string => {
  const parts = uri.split('/');
  return parts[parts.length - 1] || uri;
};

const extname = (uri: string): string => {
  const fileName = basename(uri);
  const dot = fileName.lastIndexOf('.');
  return dot >= 0 ? fileName.slice(dot) : '';
};

const stemname = (uri: string): string => {
  const fileName = basename(uri);
  const extension = extname(uri);
  return extension ? fileName.slice(0, -extension.length) : fileName;
};

const dirname = (uri: string): string => {
  const parts = uri.split('/');
  parts.pop();
  return parts.join('/');
};

export const normalizeProjectUri = (uri: string): string =>
  uri
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/\/{2,}/g, '/');

const nextExistingFileUri = (
  project: PlaygroundProject,
  preferredUri: string,
  fallbackUri: string
): string => {
  if (project.files.some((file) => file.uri === preferredUri)) return preferredUri;
  if (project.files.some((file) => file.uri === fallbackUri)) return fallbackUri;
  return project.files[0]?.uri ?? fallbackUri;
};

export const normalizeRouteLocation = (
  value: Partial<PlaygroundRouteLocation> | PlaygroundRouteLocation
): PlaygroundRouteLocation => {
  const pathname = value.pathname && value.pathname.trim().length > 0 ? value.pathname : '/';
  return {
    pathname: pathname.startsWith('/') ? pathname : `/${pathname}`,
    search: normalizeRoutePart(value.search ?? '', '?'),
    hash: normalizeRoutePart(value.hash ?? '', '#'),
  };
};

export const routeLocationFromHref = (href: string, baseHref: string): PlaygroundRouteLocation => {
  const url = new URL(href, baseHref);
  return normalizeRouteLocation({
    pathname: url.pathname,
    search: url.search,
    hash: url.hash,
  });
};

export const routeHrefFromLocation = (
  location: PlaygroundRouteLocation,
  baseHref: string
): string => {
  const url = new URL(baseHref);
  const normalized = normalizeRouteLocation(location);
  url.pathname = normalized.pathname;
  url.search = normalized.search;
  url.hash = normalized.hash;
  return url.toString();
};

export const createRoutePreview = (initialHref: string, baseHref: string): PlaygroundRoutePreview => ({
  entries: [routeLocationFromHref(initialHref, baseHref)],
  index: 0,
});

export const currentRouteLocation = (preview: PlaygroundRoutePreview): PlaygroundRouteLocation =>
  preview.entries[preview.index] ?? preview.entries[0] ?? normalizeRouteLocation({ pathname: '/' });

export const pushRouteLocation = (
  preview: PlaygroundRoutePreview,
  location: PlaygroundRouteLocation
): PlaygroundRoutePreview => {
  const normalized = normalizeRouteLocation(location);
  const nextEntries = preview.entries.slice(0, preview.index + 1);
  nextEntries.push(normalized);
  return { entries: nextEntries, index: nextEntries.length - 1 };
};

export const replaceRouteLocation = (
  preview: PlaygroundRoutePreview,
  location: PlaygroundRouteLocation
): PlaygroundRoutePreview => {
  const normalized = normalizeRouteLocation(location);
  const nextEntries = preview.entries.slice();
  if (nextEntries.length === 0) nextEntries.push(normalized);
  else nextEntries[preview.index] = normalized;
  return { entries: nextEntries, index: Math.min(preview.index, nextEntries.length - 1) };
};

export const stepRoutePreview = (
  preview: PlaygroundRoutePreview,
  delta: -1 | 1
): PlaygroundRoutePreview => {
  const nextIndex = Math.max(0, Math.min(preview.entries.length - 1, preview.index + delta));
  return nextIndex === preview.index ? preview : { entries: preview.entries.slice(), index: nextIndex };
};

export const routePreviewCanGoBack = (preview: PlaygroundRoutePreview): boolean => preview.index > 0;

export const routePreviewCanGoForward = (preview: PlaygroundRoutePreview): boolean =>
  preview.index < preview.entries.length - 1;

export const projectFromPreset = (preset: PlaygroundPreset): PlaygroundProject => ({
  presetId: preset.id,
  sourcePresetId: preset.id,
  entryUri: preset.entryUri,
  activeFileUri: preset.entryUri,
  openFileUris: [preset.entryUri],
  files: preset.files.map((file) => ({ uri: file.uri, text: file.source })),
});

export const cloneProject = (project: PlaygroundProject): PlaygroundProject => ({
  presetId: project.presetId,
  sourcePresetId: project.sourcePresetId,
  entryUri: project.entryUri,
  activeFileUri: project.activeFileUri,
  openFileUris: project.openFileUris.slice(),
  files: project.files.map((file) => ({ ...file })),
});

export const getProjectFile = (
  project: PlaygroundProject,
  uri: string
): PlaygroundProjectFile | undefined => project.files.find((file) => file.uri === uri);

export const updateProjectFileText = (
  project: PlaygroundProject,
  uri: string,
  text: string
): PlaygroundProject => ({
  ...project,
  files: project.files.map((file) => (file.uri === uri ? { ...file, text } : file)),
});

export const setActiveProjectFile = (project: PlaygroundProject, uri: string): PlaygroundProject => {
  if (!getProjectFile(project, uri)) return project;
  return {
    ...project,
    activeFileUri: uri,
    openFileUris: dedupe([...project.openFileUris, uri]),
  };
};

export const openProjectFile = (project: PlaygroundProject, uri: string): PlaygroundProject =>
  setActiveProjectFile(project, uri);

export const closeProjectFile = (project: PlaygroundProject, uri: string): PlaygroundProject => {
  if (!project.openFileUris.includes(uri)) return project;
  const remaining = project.openFileUris.filter((entry) => entry !== uri);
  const nextOpen =
    remaining.length > 0
      ? remaining
      : dedupe([project.entryUri, project.activeFileUri]).filter((entry) => entry !== uri);
  const nextActive =
    project.activeFileUri === uri
      ? nextExistingFileUri(project, nextOpen[nextOpen.length - 1] ?? project.entryUri, project.entryUri)
      : project.activeFileUri;
  return {
    ...project,
    activeFileUri: nextActive,
    openFileUris: dedupe([...nextOpen, nextActive]),
  };
};

export const setProjectEntryFile = (project: PlaygroundProject, uri: string): PlaygroundProject => {
  if (!getProjectFile(project, uri)) return project;
  return {
    ...project,
    entryUri: uri,
    activeFileUri: uri,
    openFileUris: dedupe([...project.openFileUris, uri]),
  };
};

export const addProjectFile = (
  project: PlaygroundProject,
  uri: string,
  text: string
): PlaygroundProject => {
  const normalized = normalizeProjectUri(uri);
  return {
    ...project,
    presetId: null,
    activeFileUri: normalized,
    openFileUris: dedupe([...project.openFileUris, normalized]),
    files: [...project.files, { uri: normalized, text }],
  };
};

export const removeProjectFile = (project: PlaygroundProject, uri: string): PlaygroundProject => {
  if (uri === project.entryUri) return project;
  const nextFiles = project.files.filter((file) => file.uri !== uri);
  if (nextFiles.length === project.files.length) return project;
  const remainingOpen = project.openFileUris.filter((entry) => entry !== uri);
  const nextActive =
    project.activeFileUri === uri
      ? nextExistingFileUri(
          { ...project, files: nextFiles, openFileUris: remainingOpen },
          remainingOpen[remainingOpen.length - 1] ?? project.entryUri,
          project.entryUri
        )
      : project.activeFileUri;
  return {
    ...project,
    presetId: null,
    activeFileUri: nextActive,
    openFileUris: dedupe([...remainingOpen, nextActive]),
    files: nextFiles,
  };
};

export const renameProjectFile = (
  project: PlaygroundProject,
  currentUri: string,
  nextUri: string
): PlaygroundProject => {
  if (!getProjectFile(project, currentUri)) return project;
  const normalized = normalizeProjectUri(nextUri);
  if (!normalized || (normalized !== currentUri && getProjectFile(project, normalized))) return project;
  return {
    ...project,
    presetId: null,
    entryUri: project.entryUri === currentUri ? normalized : project.entryUri,
    activeFileUri: project.activeFileUri === currentUri ? normalized : project.activeFileUri,
    openFileUris: project.openFileUris.map((uri) => (uri === currentUri ? normalized : uri)),
    files: project.files.map((file) =>
      file.uri === currentUri
        ? {
            ...file,
            uri: normalized,
          }
        : file
    ),
  };
};

export const duplicateProjectFile = (
  project: PlaygroundProject,
  uri: string,
  nextUri: string
): PlaygroundProject => {
  const file = getProjectFile(project, uri);
  const normalized = normalizeProjectUri(nextUri);
  if (!file || !normalized || getProjectFile(project, normalized)) return project;
  return addProjectFile(project, normalized, file.text);
};

export const nextUntitledFileUri = (project: PlaygroundProject): string => {
  const names = new Set(project.files.map((file) => file.uri));
  let counter = 1;
  while (true) {
    const next = counter === 1 ? 'notes.lm' : `notes-${counter}.lm`;
    if (!names.has(next)) return next;
    counter += 1;
  }
};

export const nextDuplicateFileUri = (project: PlaygroundProject, uri: string): string => {
  const names = new Set(project.files.map((file) => file.uri));
  const folder = dirname(uri);
  const extension = extname(uri);
  const stem = stemname(uri);
  let counter = 1;
  while (true) {
    const name = counter === 1 ? `${stem}-copy${extension}` : `${stem}-copy-${counter}${extension}`;
    const next = folder ? `${folder}/${name}` : name;
    if (!names.has(next)) return next;
    counter += 1;
  }
};

export const sanitizeProject = (project: PlaygroundProject | LegacyPersistedPlaygroundState['project']): PlaygroundProject => {
  const seen = new Set<string>();
  const files = project.files
    .map((file) => ({ uri: normalizeProjectUri(file.uri), text: file.text }))
    .filter((file) => file.uri.length > 0)
    .filter((file) => {
      if (seen.has(file.uri)) return false;
      seen.add(file.uri);
      return true;
    });
  const entryUri = files.some((file) => file.uri === normalizeProjectUri(project.entryUri))
    ? normalizeProjectUri(project.entryUri)
    : files[0]?.uri ?? 'main.lm';
  const activeFileUri = files.some((file) => file.uri === normalizeProjectUri(project.activeFileUri))
    ? normalizeProjectUri(project.activeFileUri)
    : entryUri;
  const requestedOpen =
    'openFileUris' in project && Array.isArray(project.openFileUris)
      ? project.openFileUris.map((uri) => normalizeProjectUri(uri))
      : [activeFileUri, entryUri];
  const openFileUris = dedupe(
    requestedOpen.filter((uri) => files.some((file) => file.uri === uri)).concat([activeFileUri, entryUri])
  );
  return {
    presetId: project.presetId,
    sourcePresetId: 'sourcePresetId' in project ? project.sourcePresetId ?? project.presetId : project.presetId,
    entryUri,
    activeFileUri,
    openFileUris,
    files,
  };
};

export const encodeSharedState = (state: PersistedPlaygroundState): string => {
  const json = JSON.stringify(state);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
};

export const decodeSharedState = (value: string): PersistedPlaygroundState | null => {
  try {
    const padded = value
      .replaceAll('-', '+')
      .replaceAll('_', '/')
      .padEnd(Math.ceil(value.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as
      | PersistedPlaygroundState
      | LegacyPersistedPlaygroundState;
    return sanitizePersistedState(parsed);
  } catch {
    return null;
  }
};

export const sanitizePersistedState = (
  state: PersistedPlaygroundState | LegacyPersistedPlaygroundState
): PersistedPlaygroundState => ({
  version: 3,
  project: sanitizeProject(state.project),
  routePreview:
    state.routePreview.entries.length > 0
      ? {
          entries: state.routePreview.entries.map((entry) => normalizeRouteLocation(entry)),
          index: Math.max(0, Math.min(state.routePreview.entries.length - 1, state.routePreview.index)),
        }
      : createRoutePreview('/', 'https://example.invalid/'),
  consoleOutput: state.consoleOutput ?? '',
});

export const createWorkspaceId = (): string =>
  `workspace-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const createWorkspaceSnapshot = (
  name: string,
  state: PersistedPlaygroundState,
  id: string = createWorkspaceId(),
  savedAt: number = Date.now()
): PlaygroundWorkspaceSnapshot => ({
  id,
  name: name.trim() || 'Untitled workspace',
  savedAt,
  state: sanitizePersistedState(state),
});

export const sanitizeWorkspaceCollection = (
  value:
    | PlaygroundWorkspaceCollection
    | Partial<PlaygroundWorkspaceCollection>
    | null
    | undefined
): PlaygroundWorkspaceCollection => {
  const items = Array.isArray(value?.items)
    ? value.items
        .filter((item): item is PlaygroundWorkspaceSnapshot => Boolean(item?.id && item?.name && item?.state))
        .map((item) => ({
          id: item.id,
          name: item.name.trim() || 'Untitled workspace',
          savedAt: typeof item.savedAt === 'number' ? item.savedAt : Date.now(),
          state: sanitizePersistedState(item.state),
        }))
    : [];
  const knownIds = new Set(items.map((item) => item.id));
  const recentWorkspaceIds = Array.isArray(value?.recentWorkspaceIds)
    ? dedupe(value.recentWorkspaceIds.filter((id): id is string => typeof id === 'string').filter((id) => knownIds.has(id)))
    : [];
  const activeWorkspaceId =
    typeof value?.activeWorkspaceId === 'string' && knownIds.has(value.activeWorkspaceId)
      ? value.activeWorkspaceId
      : recentWorkspaceIds[0] ?? items[0]?.id ?? null;
  return {
    version: 1,
    activeWorkspaceId,
    recentWorkspaceIds,
    items: items.sort((left, right) => right.savedAt - left.savedAt),
  };
};

export const getWorkspaceSnapshot = (
  store: PlaygroundWorkspaceCollection,
  id: string
): PlaygroundWorkspaceSnapshot | undefined => store.items.find((item) => item.id === id);

export const upsertWorkspaceSnapshot = (
  store: PlaygroundWorkspaceCollection,
  snapshot: PlaygroundWorkspaceSnapshot
): PlaygroundWorkspaceCollection => {
  const filtered = store.items.filter((item) => item.id !== snapshot.id);
  const next = sanitizeWorkspaceCollection({
    version: 1,
    activeWorkspaceId: snapshot.id,
    recentWorkspaceIds: [snapshot.id, ...store.recentWorkspaceIds],
    items: [snapshot, ...filtered],
  });
  return next;
};

export const removeWorkspaceSnapshot = (
  store: PlaygroundWorkspaceCollection,
  id: string
): PlaygroundWorkspaceCollection =>
  sanitizeWorkspaceCollection({
    version: 1,
    activeWorkspaceId:
      store.activeWorkspaceId === id ? store.items.find((item) => item.id !== id)?.id ?? null : store.activeWorkspaceId,
    recentWorkspaceIds: store.recentWorkspaceIds.filter((entry) => entry !== id),
    items: store.items.filter((item) => item.id !== id),
  });

export const serializeWorkspaceExport = (
  name: string,
  state: PersistedPlaygroundState
): string =>
  JSON.stringify(
    {
      version: 1,
      name: name.trim() || 'Untitled workspace',
      state: sanitizePersistedState(state),
    } satisfies PlaygroundWorkspaceExport,
    null,
    2
  );

export const parseWorkspaceExport = (value: string): PlaygroundWorkspaceExport | null => {
  try {
    const parsed = JSON.parse(value) as PlaygroundWorkspaceExport;
    if (parsed?.version !== 1 || typeof parsed.name !== 'string' || !parsed.state) return null;
    return {
      version: 1,
      name: parsed.name.trim() || 'Untitled workspace',
      state: sanitizePersistedState(parsed.state),
    };
  } catch {
    return null;
  }
};
