import type { PlaygroundPreset } from './presets';

export type PlaygroundProjectFile = {
  uri: string;
  text: string;
};

export type PlaygroundProject = {
  presetId: string | null;
  entryUri: string;
  activeFileUri: string;
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
  version: 2;
  project: PlaygroundProject;
  routePreview: PlaygroundRoutePreview;
  consoleOutput: string;
};

const normalizeRoutePart = (value: string, prefix: string): string => {
  if (!value) return '';
  return value.startsWith(prefix) ? value : `${prefix}${value}`;
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
  entryUri: preset.entryUri,
  activeFileUri: preset.entryUri,
  files: preset.files.map((file) => ({ uri: file.uri, text: file.source })),
});

export const cloneProject = (project: PlaygroundProject): PlaygroundProject => ({
  presetId: project.presetId,
  entryUri: project.entryUri,
  activeFileUri: project.activeFileUri,
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

export const setActiveProjectFile = (
  project: PlaygroundProject,
  uri: string
): PlaygroundProject => (getProjectFile(project, uri) ? { ...project, activeFileUri: uri } : project);

export const addProjectFile = (
  project: PlaygroundProject,
  uri: string,
  text: string
): PlaygroundProject => ({
  ...project,
  presetId: null,
  activeFileUri: uri,
  files: [...project.files, { uri, text }],
});

export const removeProjectFile = (project: PlaygroundProject, uri: string): PlaygroundProject => {
  if (uri === project.entryUri) return project;
  const nextFiles = project.files.filter((file) => file.uri !== uri);
  if (nextFiles.length === project.files.length) return project;
  const nextActive =
    project.activeFileUri === uri ? nextFiles[0]?.uri ?? project.entryUri : project.activeFileUri;
  return {
    ...project,
    presetId: null,
    activeFileUri: nextActive,
    files: nextFiles,
  };
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

export const sanitizeProject = (project: PlaygroundProject): PlaygroundProject => {
  const files = project.files
    .filter((file) => file.uri.trim().length > 0)
    .map((file) => ({ uri: file.uri.replace(/\\/g, '/'), text: file.text }));
  const entryUri = files.some((file) => file.uri === project.entryUri)
    ? project.entryUri
    : files[0]?.uri ?? 'main.lm';
  const activeFileUri = files.some((file) => file.uri === project.activeFileUri)
    ? project.activeFileUri
    : entryUri;
  return {
    presetId: project.presetId,
    entryUri,
    activeFileUri,
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
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as PersistedPlaygroundState;
    return parsed?.version === 2 ? parsed : null;
  } catch {
    return null;
  }
};

export const sanitizePersistedState = (state: PersistedPlaygroundState): PersistedPlaygroundState => ({
  version: 2,
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
