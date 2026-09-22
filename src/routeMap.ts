import { generatePath } from 'react-router-dom'

const routes = {
  home: '/',
  recorder: '/recorder',
  controller: '/controller',
  analysis: '/analysis',
  analysisProject: '/analysis/:project',
  controllerFile: '/controller/:filePath',
  file: '/file/:filePath',
}

export type RouteName = keyof typeof routes

function getRoute(name: RouteName) {
  return routes[name]
}

export function getRoutePath(
  name: RouteName,
  params?: Record<string, string> | 0 | false | null
) {
  return params ? generatePath(getRoute(name), params) : getRoute(name)
}

export const routeMap = {
  home: getRoutePath('home'),
  recorder: getRoutePath('recorder'),
  controller: getRoutePath('controller'),
  analysis: getRoutePath('analysis'),
  analysisProject: getRoutePath('analysisProject'),
  controllerFile: getRoutePath('controllerFile'),
  file: getRoutePath('file'),
}

export function getViewPath(filePath: string) {
  // generatePath encodes params itself as of react-router v7, so pre-encoding
  // here would double-encode the path and leave `%20` in it once useParams
  // decodes a single level.
  return getRoutePath('file', { filePath })
}

/** Where clicking a saved-run project in the sidebar goes. */
export function getAnalysisPath(project: string) {
  return getRoutePath('analysisProject', {
    project: encodeURIComponent(project),
  })
}

export function getControllerPath(filePath: string) {
  const encodedFilePath = encodeURIComponent(filePath)

  return getRoutePath('controllerFile', { filePath: encodedFilePath })
}
